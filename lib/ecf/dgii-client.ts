/**
 * Cliente de los servicios web de la DGII.
 *
 * Todos los servicios piden un token que se obtiene firmando una "semilla" con el
 * certificado del emisor. El token dura una hora; se guarda en memoria por ambiente y
 * certificado y se renueva cinco minutos antes de vencer. (En Firebase corre una sola
 * instancia, asi que la memoria alcanza; si se escala, cada instancia pide el suyo.)
 */
import { dgiiEndpoints } from "./endpoints";
import { signXml, type SigningCertificate } from "./sign";
import type { EcfEnvironment } from "./types";

const TIMEOUT_MS = Number(process.env.ECF_DGII_TIMEOUT_MS || 30_000);

export class DgiiServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

async function request(url: string, init: RequestInit & { label: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const raw = await response.text();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      // Algunos servicios responden XML o texto plano; se deja tal cual.
    }
    if (!response.ok) {
      throw new DgiiServiceError(`${init.label}: la DGII respondio ${response.status}.`, response.status, body);
    }
    return body;
  } catch (error) {
    if (error instanceof DgiiServiceError) throw error;
    const reason = (error as Error)?.name === "AbortError" ? "no respondio a tiempo" : (error as Error)?.message || "error de red";
    throw new DgiiServiceError(`${init.label}: la DGII ${reason}.`, null, null);
  } finally {
    clearTimeout(timer);
  }
}

function xmlForm(xml: string, fileName: string) {
  const form = new FormData();
  form.append("xml", new Blob([xml], { type: "text/xml" }), fileName);
  return form;
}

type CachedToken = { token: string; expiresAt: number };
const tokens = new Map<string, CachedToken>();

/** Obtiene (o reutiliza) el token de la DGII para este certificado y ambiente. */
export async function getDgiiToken(env: EcfEnvironment, cert: SigningCertificate) {
  const key = `${env}:${cert.certificateBase64.slice(-32)}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;

  const urls = dgiiEndpoints(env);
  const seed = await request(urls.seed, { method: "GET", headers: { accept: "*/*" }, label: "Semilla" });
  if (typeof seed !== "string" || !seed.includes("SemillaModel")) {
    throw new DgiiServiceError("Semilla: la DGII no devolvio el XML esperado.", null, seed);
  }
  const signedSeed = signXml(seed, cert);
  const body = (await request(urls.validateSeed, {
    method: "POST",
    headers: { accept: "application/json" },
    body: xmlForm(signedSeed, "semilla.xml"),
    label: "Autenticacion",
  })) as { token?: string; expira?: string };

  if (!body?.token) throw new DgiiServiceError("Autenticacion: la DGII no devolvio token.", null, body);
  const expiresAt = body.expira ? Date.parse(body.expira) : Date.now() + 55 * 60_000;
  tokens.set(key, { token: body.token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 55 * 60_000 });
  return body.token;
}

export function forgetDgiiToken(env: EcfEnvironment, cert: SigningCertificate) {
  tokens.delete(`${env}:${cert.certificateBase64.slice(-32)}`);
}

export type DgiiMessage = { codigo?: string | number; valor?: string };

export type ReceptionResult = { trackId: string | null; error?: string; mensaje?: string };

export type ResultStatus = {
  trackId?: string;
  codigo: number;
  estado: string;
  rnc?: string;
  encf?: string;
  secuenciaUtilizada?: boolean;
  fechaRecepcion?: string;
  mensajes?: DgiiMessage[];
};

export type SummaryResult = {
  codigo: number | string;
  estado: string;
  mensajes?: DgiiMessage[];
  encf?: string;
  secuenciaUtilizada?: boolean;
};

export type DirectoryEntry = {
  nombre: string;
  rnc: string;
  urlRecepcion?: string | null;
  urlAceptacion?: string | null;
  urlOpcional?: string | null;
};

/** Cliente atado a un ambiente y un certificado. Reintenta una vez si el token caduco. */
export function dgiiClient(env: EcfEnvironment, cert: SigningCertificate) {
  const urls = dgiiEndpoints(env);

  async function authed(url: string, init: RequestInit & { label: string }) {
    const call = async () => {
      const token = await getDgiiToken(env, cert);
      return request(url, {
        ...init,
        headers: { accept: "application/json", ...(init.headers || {}), Authorization: `Bearer ${token}` },
      });
    };
    try {
      return await call();
    } catch (error) {
      if (error instanceof DgiiServiceError && error.status === 401) {
        forgetDgiiToken(env, cert);
        return call();
      }
      throw error;
    }
  }

  return {
    /** Envia un e-CF completo. Devuelve el TrackId para consultar el resultado. */
    async sendEcf(signedXml: string, fileName: string): Promise<ReceptionResult> {
      const body = (await authed(urls.reception, {
        method: "POST",
        body: xmlForm(signedXml, fileName),
        label: "Recepcion e-CF",
      })) as ReceptionResult;
      return { trackId: body?.trackId || null, error: body?.error, mensaje: body?.mensaje };
    },

    /** Envia el resumen de una factura de consumo < RD$250,000. La respuesta ya trae el estado. */
    async sendSummary(signedRfce: string, fileName: string): Promise<SummaryResult> {
      return (await authed(urls.summaryReception, {
        method: "POST",
        body: xmlForm(signedRfce, fileName),
        label: "Recepcion RFCE",
      })) as SummaryResult;
    },

    /** Estado de un e-CF enviado: 0 no encontrado, 1 aceptado, 2 rechazado, 3 en proceso, 4 aceptado condicional. */
    async getResult(trackId: string): Promise<ResultStatus> {
      return (await authed(`${urls.result}?trackid=${encodeURIComponent(trackId)}`, {
        method: "GET",
        label: "Consulta resultado",
      })) as ResultStatus;
    },

    async getTrackIds(rncEmisor: string, encf: string) {
      return authed(`${urls.trackIds}?rncemisor=${encodeURIComponent(rncEmisor)}&encf=${encodeURIComponent(encf)}`, {
        method: "GET",
        label: "Consulta TrackIds",
      });
    },

    async getStatus(params: { rncEmisor: string; encf: string; rncComprador?: string | null; securityCode?: string | null }) {
      const qs = new URLSearchParams({ rncemisor: params.rncEmisor, ncfelectronico: params.encf });
      if (params.rncComprador) qs.set("rnccomprador", params.rncComprador);
      if (params.securityCode) qs.set("codigoseguridad", params.securityCode);
      return authed(`${urls.status}?${qs}`, { method: "GET", label: "Consulta estado" });
    },

    async getSummaryStatus(rncEmisor: string, encf: string, securityCode: string) {
      const qs = new URLSearchParams({ RNC_Emisor: rncEmisor, ENCF: encf, Cod_Seguridad_eCF: securityCode });
      return authed(`${urls.summaryQuery}?${qs}`, { method: "GET", label: "Consulta RFCE" }) as Promise<SummaryResult>;
    },

    /** Copia a la DGII de una aprobacion o rechazo comercial que emitimos. */
    async sendCommercialApproval(signedAcecf: string, fileName: string) {
      return authed(urls.commercialApproval, {
        method: "POST",
        body: xmlForm(signedAcecf, fileName),
        label: "Aprobacion comercial",
      });
    },

    async annulRanges(signedAnecf: string, fileName: string) {
      return authed(urls.annulment, { method: "POST", body: xmlForm(signedAnecf, fileName), label: "Anulacion e-NCF" });
    },

    /** URLs de recepcion y aprobacion de otro contribuyente electronico, o null si no lo es. */
    async getDirectory(rnc: string): Promise<DirectoryEntry | null> {
      const body = await authed(`${urls.directory}?RNC=${encodeURIComponent(rnc)}`, {
        method: "GET",
        label: "Consulta directorio",
      });
      const list = Array.isArray(body) ? body : body ? [body] : [];
      return (list[0] as DirectoryEntry | undefined) ?? null;
    },
  };
}

export type DgiiClient = ReturnType<typeof dgiiClient>;

/** Traduce el codigo de la consulta de resultado a los estados que guarda OFlow. */
export function statusFromResultCode(code: number | string | null | undefined, estado?: string | null) {
  const n = Number(code);
  if (n === 1) return "ACEPTADO";
  if (n === 2) return "RECHAZADO";
  if (n === 3) return "EN_PROCESO";
  if (n === 4) return "ACEPTADO_CONDICIONAL";
  // El RFCE responde el estado en texto ("Aceptado", "Aceptado Condicional", "Rechazado").
  const text = String(estado || "").toLowerCase();
  if (text.includes("condicional")) return "ACEPTADO_CONDICIONAL";
  if (text.includes("aceptado")) return "ACEPTADO";
  if (text.includes("rechazado")) return "RECHAZADO";
  if (text.includes("proceso")) return "EN_PROCESO";
  return "NO_ENCONTRADO";
}
