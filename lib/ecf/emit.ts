/**
 * Emision de una factura de OFlow como e-CF, de punta a punta:
 *
 *   1. Arma el XML, lo firma y lo valida contra el XSD oficial.
 *   2. Lo guarda como FIRMADO antes de enviarlo. Si la red falla despues, el XML firmado no
 *      se pierde: se puede reenviar o anular su e-NCF (un e-CF firmado y no enviado se anula
 *      con ANECF).
 *   3. Lo envia a la DGII: el e-CF completo, o el resumen RFCE si es consumo < RD$250,000.
 *   4. Consulta el resultado (la DGII valida en ~200 ms, pero puede quedar "En Proceso").
 *   5. Si fue aceptado y el comprador es emisor electronico, se lo entrega y guarda su acuse.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildEcf, buildRfce, ecfFileName, EcfValidationError } from "./build";
import { loadProfileCertificate } from "./certificate-store";
import { dgiiClient, DgiiServiceError, statusFromResultCode, type DgiiMessage } from "./dgii-client";
import { deliverToReceiver } from "./deliver";
import { invoiceToEcf } from "./from-invoice";
import { securityCodeOf, signXml } from "./sign";
import { isEcfEnvironment, type EcfEnvironment } from "./types";
import { validateAgainstXsd, xsdForEcfType } from "./xsd-validate";

export class EcfEmissionError extends Error {
  constructor(message: string, public readonly details: string[] = []) {
    super(message);
  }
}

const FINAL_OK = ["ACEPTADO", "ACEPTADO_CONDICIONAL"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function logEvent(profileId: number, environment: string, kind: string, encf: string | null, detail: unknown) {
  await prisma.ecfEvent
    .create({ data: { profileId, environment, kind, encf, detail: (detail ?? null) as Prisma.InputJsonValue } })
    .catch(() => undefined);
}

function messagesText(messages: DgiiMessage[] | undefined | null) {
  return (messages || []).map((m) => [m.codigo, m.valor].filter(Boolean).join(": ")).filter(Boolean);
}

/** Fecha de vencimiento de la secuencia, tomada de la serie E de Configuracion > Numeracion. */
async function sequenceExpiryFor(profileId: number, encf: string) {
  const sequence = await prisma.numberingSequence.findFirst({
    where: { profileId, prefix: { equals: encf.slice(0, 3), mode: "insensitive" } },
    orderBy: [{ isPreferred: "desc" }, { updatedAt: "desc" }],
    select: { expiryDate: true },
  });
  return sequence?.expiryDate ?? null;
}

/**
 * Nombre, direccion, telefono y correo del emisor: los mismos que imprime el PDF (la
 * identidad por defecto, si no los ajustes del perfil), para que XML y RI coincidan.
 */
async function issuerFor(profileId: number) {
  const [identity, settings] = await Promise.all([
    prisma.companyIdentity.findFirst({ where: { profileId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.companySettings.findFirst({ where: { profileId } }),
  ]);
  return {
    name: identity?.name || settings?.name,
    address: identity?.address || settings?.address,
    phone: identity?.phone || settings?.phone,
    email: identity?.email || settings?.email,
  };
}

export async function emitInvoice(invoiceId: number, profileId: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, profileId },
    include: { items: { orderBy: { id: "asc" } }, contact: true, profile: true, ecfEmission: true },
  });
  if (!invoice) throw new EcfEmissionError("No se encontro la factura en este perfil.");
  const env = invoice.profile?.ecfEnvironment;
  if (!isEcfEnvironment(env)) {
    throw new EcfEmissionError("Este perfil no tiene la facturacion electronica activada (Configuracion > Facturacion electronica).");
  }

  const previous = invoice.ecfEmission;
  if (previous) {
    if (FINAL_OK.includes(previous.status)) throw new EcfEmissionError("Esta factura ya fue aceptada por la DGII.");
    if (previous.status === "EN_PROCESO") throw new EcfEmissionError("La DGII todavia esta validando esta factura. Consulta el estado.");
    if (previous.status === "RECHAZADO" && previous.sequenceUsed !== false) {
      throw new EcfEmissionError(
        "La DGII rechazo esta factura y su e-NCF ya quedo usado. Hay que emitirla de nuevo con otro e-NCF.",
      );
    }
  }

  const doc = invoiceToEcf(invoice, {
    sequenceExpiry: await sequenceExpiryFor(profileId, invoice.ncf!),
    issuer: await issuerFor(profileId),
  });
  const cert = await loadProfileCertificate(profileId);

  // 1. Armar, firmar y validar.
  const signedAt = new Date();
  let built;
  try {
    built = buildEcf(doc, signedAt);
  } catch (error) {
    if (error instanceof EcfValidationError) throw new EcfEmissionError("La factura no cumple el formato e-CF.", error.problems);
    throw error;
  }
  const signedXml = signXml(built.xml, cert);
  const securityCode = securityCodeOf(signedXml);
  const xsd = await validateAgainstXsd(signedXml, xsdForEcfType(doc.type));
  if (!xsd.valid) throw new EcfEmissionError("El XML no pasa la validacion del XSD de la DGII.", xsd.errors);

  let summaryXml: string | null = null;
  if (built.sendsSummary) {
    summaryXml = signXml(buildRfce(doc, built.totals, securityCode), cert);
    const rfceCheck = await validateAgainstXsd(summaryXml, "rfce-32");
    if (!rfceCheck.valid) throw new EcfEmissionError("El resumen RFCE no pasa la validacion del XSD.", rfceCheck.errors);
  }

  // 2. Guardar como firmado antes de enviar.
  const base = {
    profileId,
    environment: env,
    ecfType: doc.type,
    encf: doc.encf,
    status: "FIRMADO",
    isSummary: built.sendsSummary,
    trackId: null,
    securityCode,
    signedAt,
    signedXml,
    summaryXml,
    sequenceUsed: null,
    dgiiMessages: Prisma.DbNull,
    totalAmount: built.totals.montoTotal,
    itbisAmount: built.totals.totalItbis,
    receiverStatus: null,
    receiverMessage: null,
    receiverAckXml: null,
  };
  let emission = await prisma.ecfEmission.upsert({
    where: { invoiceId },
    create: { invoiceId, ...base },
    update: base,
  });

  // 3. Enviar.
  const client = dgiiClient(env, cert);
  const fileName = ecfFileName(doc.issuer.rnc, doc.encf);
  try {
    if (built.sendsSummary) {
      const response = await client.sendSummary(summaryXml!, fileName);
      const status = statusFromResultCode(null, response.estado);
      emission = await prisma.ecfEmission.update({
        where: { id: emission.id },
        data: {
          status: status === "NO_ENCONTRADO" ? "EN_PROCESO" : status,
          sequenceUsed: response.secuenciaUtilizada ?? null,
          dgiiMessages: (response.mensajes ?? []) as Prisma.InputJsonValue,
          lastCheckedAt: new Date(),
        },
      });
      await logEvent(profileId, env, "EMISION", doc.encf, { resumen: true, respuesta: response });
    } else {
      const response = await client.sendEcf(signedXml, fileName);
      await logEvent(profileId, env, "EMISION", doc.encf, { respuesta: response });
      if (!response.trackId) {
        emission = await prisma.ecfEmission.update({
          where: { id: emission.id },
          data: {
            status: "ERROR_ENVIO",
            dgiiMessages: [{ codigo: response.error, valor: response.mensaje }] as Prisma.InputJsonValue,
          },
        });
        throw new EcfEmissionError("La DGII no acepto el envio.", [response.error, response.mensaje].filter(Boolean) as string[]);
      }
      emission = await prisma.ecfEmission.update({
        where: { id: emission.id },
        data: { status: "EN_PROCESO", trackId: response.trackId },
      });
      // 4. Consultar el resultado unos segundos.
      for (let attempt = 0; attempt < 5 && emission.status === "EN_PROCESO"; attempt++) {
        await sleep(attempt === 0 ? 800 : 1500);
        emission = await refreshEmissionStatus(emission.id);
      }
    }
  } catch (error) {
    if (error instanceof EcfEmissionError) throw error;
    const message = error instanceof Error ? error.message : "Error al enviar a la DGII.";
    await prisma.ecfEmission.update({
      where: { id: emission.id },
      data: { status: "ERROR_ENVIO", dgiiMessages: [{ valor: message }] as Prisma.InputJsonValue },
    });
    await logEvent(profileId, env, "ERROR", doc.encf, {
      message,
      body: error instanceof DgiiServiceError ? error.body : null,
    });
    throw new EcfEmissionError(`No se pudo enviar a la DGII: ${message}`);
  }

  // 5. Entregar al comprador electronico.
  if (FINAL_OK.includes(emission.status) && !emission.isSummary) {
    emission = await deliverToReceiver(emission.id, cert).catch(() => emission);
  }
  return emission;
}

/** Vuelve a preguntar a la DGII por un e-CF enviado. */
export async function refreshEmissionStatus(emissionId: number) {
  const emission = await prisma.ecfEmission.findUniqueOrThrow({ where: { id: emissionId } });
  const env = emission.environment as EcfEnvironment;
  const cert = await loadProfileCertificate(emission.profileId);
  const client = dgiiClient(env, cert);

  if (emission.isSummary) {
    const rnc = (await prisma.accountProfile.findUniqueOrThrow({ where: { id: emission.profileId } })).taxId.replace(/\D/g, "");
    const result = await client.getSummaryStatus(rnc, emission.encf, emission.securityCode);
    const status = statusFromResultCode(null, result.estado);
    return prisma.ecfEmission.update({
      where: { id: emission.id },
      data: {
        status: status === "NO_ENCONTRADO" ? emission.status : status,
        dgiiMessages: (result.mensajes ?? []) as Prisma.InputJsonValue,
        lastCheckedAt: new Date(),
      },
    });
  }

  if (!emission.trackId) return emission;
  const result = await client.getResult(emission.trackId);
  const status = statusFromResultCode(result.codigo, result.estado);
  await logEvent(emission.profileId, env, "CONSULTA", emission.encf, result);
  return prisma.ecfEmission.update({
    where: { id: emission.id },
    data: {
      status: status === "NO_ENCONTRADO" ? emission.status : status,
      sequenceUsed: result.secuenciaUtilizada ?? emission.sequenceUsed,
      dgiiMessages: (result.mensajes ?? []) as Prisma.InputJsonValue,
      lastCheckedAt: new Date(),
    },
  });
}

/** Mensajes de la DGII en texto, para mostrarlos en la factura. */
export function emissionMessages(dgiiMessages: Prisma.JsonValue | null | undefined) {
  return messagesText(Array.isArray(dgiiMessages) ? (dgiiMessages as DgiiMessage[]) : []);
}
