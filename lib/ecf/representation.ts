/**
 * Datos de la Representacion Impresa (RI) de un e-CF, sacados del XML firmado.
 *
 * Se leen del XML y no de la factura porque la RI tiene que decir exactamente lo que se
 * firmo y se envio: si alguien edita la factura despues, el PDF no debe contradecir al e-CF.
 *
 * Requisitos de la DGII (Informe Tecnico, seccion 18): tipo de comprobante en palabras,
 * e-NCF y vencimiento de la secuencia arriba a la derecha; QR de al menos 22x22 mm abajo a
 * la izquierda; debajo del QR el codigo de seguridad y la fecha y hora de la firma.
 */
import QRCode from "qrcode";
import type { EcfEmission } from "@prisma/client";
import { dgiiDateTime, parseDgiiDate } from "./format";
import { parseXmlDocument } from "./parse";
import { timbreUrl } from "./timbre";
import { ECF_TYPE_NAMES, type EcfEnvironment } from "./types";

export type EcfRepresentation = {
  typeName: string;
  encf: string;
  sequenceExpiry: string | null;
  securityCode: string;
  signedAtText: string;
  qrDataUrl: string;
  timbreUrl: string;
  environment: string;
  /** Lineas exentas (indicador 4), por numero de linea, para marcarlas con "E". */
  exemptLines: number[];
  totals: {
    gravado: number | null;
    exento: number | null;
    itbis: number | null;
    total: number;
  };
  reference: { ncf: string; codigo: string } | null;
};

const MODIFICATION_NAMES: Record<string, string> = {
  "1": "Anula el NCF modificado",
  "2": "Corrige texto del comprobante fiscal modificado",
  "3": "Corrige montos del NCF modificado",
  "4": "Reemplazo NCF emitido en contingencia",
  "5": "Referencia Factura de Consumo Electrónica",
};

async function qrFor(url: string) {
  // La DGII pide QR version 8. Si el enlace no cabe, se deja que la libreria elija.
  try {
    return await QRCode.toDataURL(url, { version: 8, errorCorrectionLevel: "L", margin: 0, width: 300 });
  } catch {
    return QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 0, width: 300 });
  }
}

export async function ecfRepresentation(emission: EcfEmission): Promise<EcfRepresentation | null> {
  const doc = parseXmlDocument(emission.signedXml);
  if (!doc) return null;
  const text = (tag: string, scope: Document | Element = doc as unknown as Document) =>
    (scope.getElementsByTagName(tag)[0]?.textContent || "").trim() || null;
  const num = (tag: string) => (text(tag) === null ? null : Number(text(tag)));

  const issueDate = parseDgiiDate(text("FechaEmision")) ?? new Date();
  const total = num("MontoTotal") ?? emission.totalAmount;
  const url = timbreUrl({
    environment: emission.environment as EcfEnvironment,
    summary: emission.isSummary,
    rncEmisor: text("RNCEmisor") || "",
    rncComprador: text("RNCComprador"),
    encf: emission.encf,
    issueDate,
    total,
    signedAt: emission.signedAt,
    securityCode: emission.securityCode,
  });

  const items = Array.from(doc.getElementsByTagName("Item") as unknown as ArrayLike<Element>);
  const exemptLines = items
    .filter((item) => text("IndicadorFacturacion", item) === "4")
    .map((item) => Number(text("NumeroLinea", item)));

  const refNcf = text("NCFModificado");
  return {
    typeName: ECF_TYPE_NAMES[emission.ecfType] || "Comprobante Fiscal Electrónico",
    encf: emission.encf,
    sequenceExpiry: text("FechaVencimientoSecuencia"),
    securityCode: emission.securityCode,
    signedAtText: dgiiDateTime(emission.signedAt),
    qrDataUrl: await qrFor(url),
    timbreUrl: url,
    environment: emission.environment,
    exemptLines,
    totals: { gravado: num("MontoGravadoTotal"), exento: num("MontoExento"), itbis: num("TotalITBIS"), total },
    reference: refNcf ? { ncf: refNcf, codigo: MODIFICATION_NAMES[text("CodigoModificacion") || ""] || "" } : null,
  };
}
