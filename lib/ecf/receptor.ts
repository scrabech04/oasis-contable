/**
 * Servicios que OFlow publica como receptor electronico (Descripcion Tecnica Emisores
 * Electronicos). Otros contribuyentes, y la DGII en las pruebas de certificacion, llaman a:
 *
 *   GET  /ecf/{ambiente}/fe/autenticacion/api/semilla                (opcional)
 *   POST /ecf/{ambiente}/fe/autenticacion/api/validacioncertificado  (opcional)
 *   POST /ecf/{ambiente}/fe/recepcion/api/ecf             -> responde un ARECF firmado
 *   POST /ecf/{ambiente}/fe/aprobacioncomercial/api/ecf   -> 200 o 400
 *
 * {ambiente} es testecf, certecf o ecf. Los e-CF se asignan al perfil cuyo RNC coincide con
 * el RNCComprador del documento.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAuthSecret } from "@/lib/auth";
import { buildArecf } from "./build";
import { loadProfileCertificate } from "./certificate-store";
import { cleanTaxId } from "./format";
import { readIncomingApproval, readIncomingEcf } from "./parse";
import { signXml, verifyXmlSignature } from "./sign";
import type { EcfEnvironment } from "./types";
import { validateAgainstXsd, type XsdKind } from "./xsd-validate";

export function environmentFromSegment(segment: string): EcfEnvironment | null {
  const value = segment.toLowerCase();
  if (value === "testecf") return "TesteCF";
  if (value === "certecf") return "CerteCF";
  if (value === "ecf") return "eCF";
  return null;
}

// ---------------------------------------------------------------------------------------
// Autenticacion (semilla firmada -> token). Sin estado: la semilla y el token van firmados
// con HMAC, asi que no hace falta guardarlos.

function secret() {
  const value = process.env.ECF_RECEPTOR_SECRET || getAuthSecret();
  if (!value) throw new Error("Falta ECF_RECEPTOR_SECRET o AUTH_SECRET.");
  return value;
}

function hmac(data: string) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

function sealed(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

function unseal<T>(value: string): T | null {
  const [body, mac] = String(value || "").trim().split(".");
  if (!body || !mac) return null;
  const expected = hmac(body);
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function issueSeed(env: EcfEnvironment) {
  const valor = sealed({ n: crypto.randomBytes(16).toString("hex"), t: Date.now(), env });
  return `<?xml version="1.0" encoding="utf-8"?><SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><valor>${valor}</valor><fecha>${new Date().toISOString()}</fecha></SemillaModel>`;
}

const SEED_MAX_AGE_MS = 10 * 60_000;
const TOKEN_TTL_MS = 60 * 60_000;

/** Valida la semilla firmada y devuelve un token de una hora, o el motivo del rechazo. */
export function validateSignedSeed(env: EcfEnvironment, xml: string) {
  const signature = verifyXmlSignature(xml);
  if (!signature.valid) return { error: "La firma de la semilla no es valida." } as const;
  const valor = /<valor>([^<]+)<\/valor>/.exec(xml)?.[1];
  const seed = valor ? unseal<{ t: number; env: string }>(valor) : null;
  if (!seed || seed.env !== env) return { error: "La semilla no fue emitida por este servicio." } as const;
  if (Date.now() - seed.t > SEED_MAX_AGE_MS) return { error: "La semilla expiro." } as const;

  const issued = new Date();
  const expires = new Date(issued.getTime() + TOKEN_TTL_MS);
  const token = sealed({ sub: signature.signerSerial, env, exp: expires.getTime() });
  return { token, issued, expires } as const;
}

export function isValidReceptorToken(env: EcfEnvironment, authorization: string | null) {
  const token = /^Bearer\s+(.+)$/i.exec(authorization || "")?.[1];
  const payload = token ? unseal<{ env: string; exp: number }>(token) : null;
  return Boolean(payload && payload.env === env && payload.exp > Date.now());
}

/** La autenticacion es opcional en el estandar; se exige solo si ECF_RECEPTOR_REQUIRE_AUTH=1. */
export function receptorRequiresAuth() {
  return process.env.ECF_RECEPTOR_REQUIRE_AUTH === "1";
}

/** Fecha universal sin milisegundos: yyyy-MM-ddTHH:mm:ssZ. */
export function universalDate(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------------------
// Recepcion de e-CF

/** Perfil que recibe: el de RNC igual al comprador; si no hay, uno con certificado (para firmar el "no corresponde"). */
async function receivingProfile(env: EcfEnvironment, rncComprador: string | null) {
  const profiles = await prisma.accountProfile.findMany({
    where: { ecfCertificate: { isNot: null } },
    select: { id: true, taxId: true, ecfEnvironment: true },
  });
  const rnc = cleanTaxId(rncComprador);
  const match = rnc ? profiles.find((p) => cleanTaxId(p.taxId) === rnc) : undefined;
  const fallback = profiles.find((p) => p.ecfEnvironment === env) ?? profiles[0];
  return { matched: match ?? null, signer: match ?? fallback ?? null };
}

const XSD_BY_TYPE: Record<number, XsdKind> = { 31: "ecf-31", 32: "ecf-32", 33: "ecf-33", 34: "ecf-34", 45: "ecf-45" };

export type ReceptionOutcome = { status: number; body: string; contentType: string };

export async function receiveEcf(env: EcfEnvironment, xml: string): Promise<ReceptionOutcome> {
  const data = readIncomingEcf(xml);
  const rncEmisor = cleanTaxId(data?.rncEmisor);
  const rncComprador = cleanTaxId(data?.rncComprador);
  const encf = data?.encf || "";

  // Sin estos tres datos no se puede ni armar un acuse.
  if (!data || data.root !== "ECF" || !rncEmisor || !rncComprador || !/^[A-Z]\d{12}$/.test(encf)) {
    return { status: 400, body: "El archivo no es un e-CF valido.", contentType: "text/plain; charset=utf-8" };
  }

  const { matched, signer } = await receivingProfile(env, rncComprador);
  if (!signer) {
    return { status: 503, body: "El receptor no tiene certificado configurado.", contentType: "text/plain; charset=utf-8" };
  }
  const cert = await loadProfileCertificate(signer.id);
  const ack = (received: boolean, reason?: 1 | 2 | 3 | 4) =>
    signXml(buildArecf({ rncEmisor, rncComprador, encf, received, reason, at: new Date() }), cert);

  // Duplicado: si es el mismo archivo se repite el acuse (reintento del emisor); si es otro, se rechaza.
  const existing = await prisma.ecfReceivedDocument.findUnique({
    where: { environment_rncEmisor_encf: { environment: env, rncEmisor, encf } },
  });
  if (existing) {
    const body = existing.xml === xml ? existing.ackXml : ack(false, 3);
    return { status: 200, body, contentType: "application/xml; charset=utf-8" };
  }

  const signature = verifyXmlSignature(xml);
  const schema = data.type ? XSD_BY_TYPE[data.type] : undefined;
  const xsd = schema ? await validateAgainstXsd(xml, schema) : { valid: true as const };

  let reason: 1 | 2 | 3 | 4 | undefined;
  if (!matched) reason = 4;
  else if (!signature.valid) reason = 2;
  else if (!xsd.valid) reason = 1;

  const ackXml = ack(!reason, reason);
  await prisma.ecfReceivedDocument.create({
    data: {
      profileId: matched?.id ?? null,
      environment: env,
      rncEmisor,
      razonSocialEmisor: data.razonSocialEmisor,
      rncComprador,
      encf,
      ecfType: data.type,
      issueDate: data.issueDate,
      totalAmount: data.total,
      itbisAmount: data.itbis,
      xml,
      signatureValid: signature.valid,
      ackStatus: reason ? 1 : 0,
      ackReason: reason ?? null,
      ackXml,
    },
  });
  await prisma.ecfEvent.create({
    data: {
      profileId: matched?.id ?? null,
      environment: env,
      kind: "RECEPCION",
      encf,
      detail: { rncEmisor, recibido: !reason, motivo: reason ?? null, xsd: xsd.valid ? null : xsd.errors.slice(0, 5) },
    },
  });
  return { status: 200, body: ackXml, contentType: "application/xml; charset=utf-8" };
}

// ---------------------------------------------------------------------------------------
// Aprobaciones comerciales que los compradores nos envian sobre nuestros e-CF

export async function receiveCommercialApproval(env: EcfEnvironment, xml: string) {
  const data = readIncomingApproval(xml);
  if (!data?.encf || !data.rncEmisor || data.approved === null) {
    return { ok: false, message: "El archivo no es una aprobacion comercial valida." };
  }
  const signature = verifyXmlSignature(xml);
  if (!signature.valid) return { ok: false, message: "La firma de la aprobacion comercial no es valida." };

  const rncEmisor = cleanTaxId(data.rncEmisor);
  const emissions = await prisma.ecfEmission.findMany({
    where: { environment: env, encf: data.encf },
    include: { profile: { select: { taxId: true } } },
  });
  const emission = emissions.find((e) => cleanTaxId(e.profile.taxId) === rncEmisor);

  await prisma.ecfEvent.create({
    data: {
      profileId: emission?.profileId ?? null,
      environment: env,
      kind: "APROBACION_RECIBIDA",
      encf: data.encf,
      detail: { rncComprador: data.rncComprador, aprobado: data.approved, motivo: data.reason, xml: xml.slice(0, 20000) },
    },
  });
  // Bien formada y firmada se acepta aunque no la podamos asociar (por ejemplo, las que manda
  // la DGII en las pruebas de comunicacion): queda en la bitacora.
  if (!emission) return { ok: true, message: "OK" };

  await prisma.ecfEmission.update({
    where: { id: emission.id },
    data: {
      commercialStatus: data.approved ? "APROBADO" : "RECHAZADO",
      commercialReason: data.reason,
      commercialAt: new Date(),
    },
  });
  return { ok: true, message: "OK" };
}
