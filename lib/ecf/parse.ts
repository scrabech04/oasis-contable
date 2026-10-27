/**
 * Lectura de los datos clave de un XML que nos llega (e-CF, aprobacion comercial).
 * No interpreta el documento completo: solo lo necesario para acusar recibo y archivarlo.
 */
import { DOMParser } from "@xmldom/xmldom";
import { parseDgiiDate } from "./format";

export function parseXmlDocument(xml: string) {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(message);
    },
  }).parseFromString(xml, "text/xml");
  if (errors.length || !doc.documentElement) return null;
  return doc;
}

function firstText(doc: ReturnType<typeof parseXmlDocument>, tag: string) {
  const el = doc?.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || null;
}

export type IncomingEcf = {
  root: string;
  type: number | null;
  encf: string | null;
  rncEmisor: string | null;
  razonSocialEmisor: string | null;
  rncComprador: string | null;
  issueDate: Date | null;
  total: number | null;
  itbis: number | null;
};

export function readIncomingEcf(xml: string): IncomingEcf | null {
  const doc = parseXmlDocument(xml);
  if (!doc) return null;
  const num = (tag: string) => {
    const value = firstText(doc, tag);
    return value === null ? null : Number(value);
  };
  return {
    root: doc.documentElement!.nodeName,
    type: num("TipoeCF"),
    encf: firstText(doc, "eNCF")?.toUpperCase() || null,
    rncEmisor: firstText(doc, "RNCEmisor"),
    razonSocialEmisor: firstText(doc, "RazonSocialEmisor"),
    rncComprador: firstText(doc, "RNCComprador"),
    issueDate: parseDgiiDate(firstText(doc, "FechaEmision")),
    total: num("MontoTotal"),
    itbis: num("TotalITBIS"),
  };
}

export type IncomingApproval = {
  rncEmisor: string | null;
  rncComprador: string | null;
  encf: string | null;
  approved: boolean | null;
  reason: string | null;
  total: number | null;
};

export function readIncomingApproval(xml: string): IncomingApproval | null {
  const doc = parseXmlDocument(xml);
  if (!doc || doc.documentElement!.nodeName !== "ACECF") return null;
  const estado = firstText(doc, "Estado");
  return {
    rncEmisor: firstText(doc, "RNCEmisor"),
    rncComprador: firstText(doc, "RNCComprador"),
    encf: firstText(doc, "eNCF")?.toUpperCase() || null,
    approved: estado === "1" ? true : estado === "2" ? false : null,
    reason: firstText(doc, "DetalleMotivoRechazo"),
    total: firstText(doc, "MontoTotal") === null ? null : Number(firstText(doc, "MontoTotal")),
  };
}

/** Lee el campo "xml" de un multipart, o el cuerpo crudo si no vino como formulario. */
export async function readXmlFromRequest(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("xml") ?? [...form.values()][0];
    if (!file) return null;
    const text = typeof file === "string" ? file : await (file as Blob).text();
    return text.replace(/^\uFEFF/, "");
  }
  const text = (await request.text()).replace(/^\uFEFF/, "");
  return text.trim() ? text : null;
}
