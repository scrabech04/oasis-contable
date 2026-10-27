/**
 * Entrega de un e-CF aceptado al comprador, cuando el comprador tambien es emisor
 * electronico. Sus direcciones salen del directorio de la DGII. Si el comprador pide
 * autenticacion (urlOpcional), primero se firma su semilla para obtener un token.
 *
 * Si el comprador no es electronico no hay nada que entregar: recibe la representacion
 * impresa (el PDF) como siempre.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ecfFileName } from "./build";
import { dgiiClient } from "./dgii-client";
import { readIncomingEcf } from "./parse";
import { signXml, verifyXmlSignature, type SigningCertificate } from "./sign";
import type { EcfEnvironment } from "./types";

const TIMEOUT_MS = 30_000;

/** Junta la URL del directorio con la ruta estandar, sin duplicarla si ya viene completa. */
function serviceUrl(base: string, suffix: string) {
  const clean = base.trim().replace(/\/+$/, "");
  return clean.toLowerCase().endsWith(suffix.toLowerCase()) ? clean : `${clean}${suffix}`;
}

async function fetchText(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

function xmlForm(xml: string, fileName: string) {
  const form = new FormData();
  form.append("xml", new Blob([xml], { type: "text/xml" }), fileName);
  return form;
}

async function receiverToken(authBase: string, cert: SigningCertificate) {
  const seed = await fetchText(serviceUrl(authBase, "/fe/autenticacion/api/semilla"), { method: "GET" });
  if (!seed.ok) throw new Error(`La semilla del comprador respondio ${seed.status}.`);
  const signed = signXml(seed.text, cert);
  const res = await fetchText(serviceUrl(authBase, "/fe/autenticacion/api/validacioncertificado"), {
    method: "POST",
    headers: { accept: "application/json" },
    body: xmlForm(signed, "semilla.xml"),
  });
  if (!res.ok) throw new Error(`La autenticacion del comprador respondio ${res.status}.`);
  try {
    return (JSON.parse(res.text) as { token?: string }).token || null;
  } catch {
    return /<token>([^<]+)<\/token>/i.exec(res.text)?.[1] ?? null;
  }
}

export async function deliverToReceiver(emissionId: number, cert: SigningCertificate) {
  const emission = await prisma.ecfEmission.findUniqueOrThrow({ where: { id: emissionId } });
  const env = emission.environment as EcfEnvironment;
  const doc = readIncomingEcf(emission.signedXml);
  const buyerRnc = doc?.rncComprador;
  if (!buyerRnc || !doc?.rncEmisor) {
    return prisma.ecfEmission.update({ where: { id: emission.id }, data: { receiverStatus: "NO_ELECTRONICO" } });
  }

  const save = (data: Prisma.EcfEmissionUpdateInput) => prisma.ecfEmission.update({ where: { id: emission.id }, data });
  try {
    const entry = await dgiiClient(env, cert).getDirectory(buyerRnc);
    if (!entry?.urlRecepcion) {
      return save({ receiverStatus: "NO_ELECTRONICO", receiverMessage: "El comprador no es emisor electronico." });
    }

    const headers: Record<string, string> = { accept: "application/xml" };
    if (entry.urlOpcional) {
      const token = await receiverToken(entry.urlOpcional, cert);
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetchText(serviceUrl(entry.urlRecepcion, "/fe/recepcion/api/ecf"), {
      method: "POST",
      headers,
      body: xmlForm(emission.signedXml, ecfFileName(doc.rncEmisor, emission.encf)),
    });
    await prisma.ecfEvent.create({
      data: {
        profileId: emission.profileId,
        environment: env,
        kind: "ENTREGA",
        encf: emission.encf,
        detail: { url: entry.urlRecepcion, status: res.status, body: res.text.slice(0, 4000) },
      },
    });
    if (!res.ok) return save({ receiverStatus: "ERROR", receiverMessage: `El comprador respondio ${res.status}.` });

    const ack = res.text.trim();
    const estado = /<Estado>\s*(\d)\s*<\/Estado>/.exec(ack)?.[1];
    const signature = ack.includes("Signature") ? verifyXmlSignature(ack) : null;
    return save({
      receiverStatus: estado === "0" ? "ACUSE_RECIBIDO" : estado === "1" ? "NO_RECIBIDO" : "ERROR",
      receiverMessage:
        estado === "1"
          ? `El comprador no lo recibio (motivo ${/<CodigoMotivoNoRecibido>(\d)/.exec(ack)?.[1] ?? "?"}).`
          : signature && !signature.valid
            ? "El acuse llego con una firma que no valida."
            : null,
      receiverAckXml: ack.slice(0, 20000),
    });
  } catch (error) {
    return save({ receiverStatus: "ERROR", receiverMessage: error instanceof Error ? error.message : "Error de entrega." });
  }
}
