import { createElement } from "react";
import * as cheerio from "cheerio";
import QRCode from "qrcode";
import { pdf } from "@react-pdf/renderer";
import { DgiiConstanciaPDF, type ConstanciaField } from "@/components/pdf/DgiiConstanciaPDF";

// La URL llega de un QR escaneado, es decir de una fuente que el usuario no controla del
// todo. Restringir el host evita que un QR manipulado convierta al servidor en un proxy
// hacia direcciones internas.
const ALLOWED_HOSTS = new Set(["ecf.dgii.gov.do", "dgii.gov.do", "www.dgii.gov.do"]);

const FETCH_TIMEOUT_MS = Number(process.env.DGII_CONSTANCIA_TIMEOUT_MS || 15_000);
const MAX_FIELDS = 14;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

export class ConstanciaError extends Error {}

/** Comprador real del comprobante: el perfil dueno de la compra. */
export interface ConstanciaBuyer {
  name: string;
  taxId: string;
}

export interface ConstanciaOptions {
  companyName?: string;
  buyer?: ConstanciaBuyer;
}

export interface ConstanciaResult {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  encf: string;
  estado: string;
}

export function isDgiiTimbreUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function buildDgiiConstancia(
  timbreUrl: string,
  options: ConstanciaOptions = {}
): Promise<ConstanciaResult> {
  if (!isDgiiTimbreUrl(timbreUrl)) {
    throw new ConstanciaError("El enlace del timbre no corresponde al portal de la DGII.");
  }

  const html = await fetchTimbrePage(timbreUrl);
  return buildConstanciaFromHtml(html, timbreUrl, options);
}

// Separado de la descarga para poder renderizar (y probar) la constancia a partir de un
// HTML ya obtenido, sin volver a golpear el portal de la DGII.
export async function buildConstanciaFromHtml(
  html: string,
  timbreUrl: string,
  options: ConstanciaOptions = {}
): Promise<ConstanciaResult> {
  const { fields, encf, estado } = readConstanciaFields(html, options.buyer);

  const qrDataUrl = await QRCode.toDataURL(timbreUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 520,
  });

  const blob = await pdf(
    createElement(DgiiConstanciaPDF, {
      data: {
        encf,
        estado,
        fields,
        timbreUrl,
        qrDataUrl,
        consultedAt: formatConsultedAt(new Date()),
        companyName: options.companyName,
      },
    }) as never
  ).toBlob();

  const bytes = Buffer.from(await blob.arrayBuffer());
  const suffix = encf ? `-${encf}` : "";

  return {
    fileName: `constancia-dgii${suffix}.pdf`,
    mimeType: "application/pdf",
    fileSize: bytes.byteLength,
    storagePath: `data:application/pdf;base64,${bytes.toString("base64")}`,
    encf,
    estado,
  };
}

async function fetchTimbrePage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      // Un redirect podria sacarnos del dominio ya validado.
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-DO,es;q=0.9",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new ConstanciaError("El portal de la DGII redirigio la consulta del timbre.");
    }

    if (!response.ok) {
      throw new ConstanciaError(
        `El portal de la DGII respondio con un error ${response.status} al abrir el timbre.`
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof ConstanciaError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ConstanciaError("El portal de la DGII no respondio a tiempo.");
    }

    throw new ConstanciaError("No fue posible conectar con el portal de la DGII.");
  } finally {
    clearTimeout(timer);
  }
}

// Los datos que iran al PDF, ya resueltos. Exportado aparte del render para poder
// inspeccionarlos sin generar el PDF.
export function readConstanciaFields(html: string, buyer?: ConstanciaBuyer) {
  const parsed = parseTimbrePage(html);
  applyBuyerIdentity(parsed.fields, buyer);
  return parsed;
}

function parseTimbrePage(html: string) {
  const $ = cheerio.load(html);
  $("script, style").remove();

  const pageText = cleanText($("body").text());

  if (/No fue encontrada la factura/i.test(pageText)) {
    throw new ConstanciaError(
      "La DGII no encontro la factura con los datos del QR, asi que no hay nada que certificar."
    );
  }

  const fields = collectFields($);

  if (fields.length === 0) {
    throw new ConstanciaError(
      "La pagina de la DGII no expuso los datos del comprobante en el formato esperado."
    );
  }

  return {
    fields,
    encf: findValue(fields, /^e-?ncf$|comprobante/i),
    estado: findValue(fields, /^estado/i),
  };
}

// La DGII arma sus paneles como filas de dos celdas (etiqueta / valor). Se leen de forma
// generica en vez de buscar etiquetas concretas, para que la constancia siga saliendo
// completa aunque el portal renombre o agregue campos.
function collectFields($: cheerio.CheerioAPI): ConstanciaField[] {
  const fields: ConstanciaField[] = [];
  const seen = new Set<string>();

  const push = (rawLabel: string, rawValue: string) => {
    const label = cleanText(rawLabel).replace(/[:\s]+$/, "");
    const value = cleanText(rawValue);

    if (!label || !value || label.length > 60 || value.length > 120) return;
    if (label.toLowerCase() === value.toLowerCase()) return;

    const key = label.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    fields.push({ label, value });
  };

  $("tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length === 2) {
      push($(cells[0]).text(), $(cells[1]).text());
    }
  });

  if (fields.length === 0) {
    // Respaldo para el panel de spans con id (mismo patron que usa ncf.aspx).
    $("span[id]").each((_, span) => {
      const element = $(span);
      const id = element.attr("id") || "";
      const match = id.match(/lbl(.+)$/i);
      if (!match) return;
      push(humanizeId(match[1]), element.text());
    });
  }

  return fields.slice(0, MAX_FIELDS);
}

const BUYER_TAX_ID_LABEL = /(rnc|c[eé]dula|documento)[^a-z]*(comprador|receptor|cliente)|(comprador|receptor)[^a-z]*(rnc|c[eé]dula)/i;
const BUYER_NAME_LABEL = /(raz[oó]n\s*social|nombre)[^a-z]*(comprador|receptor|cliente)/i;

// Muchos emisores mandan "CLIENTE" (o el nombre del cajero) como razon social del
// comprador, asi que la DGII devuelve eso aunque el e-CF si venga a nombre del perfil. Se
// muestra la razon social real del perfil y se conserva lo declarado por el emisor como
// nota, para que la constancia no aparente que la DGII respondio otra cosa.
function applyBuyerIdentity(fields: ConstanciaField[], buyer?: ConstanciaBuyer) {
  const buyerTaxId = onlyDigits(buyer?.taxId);
  const buyerName = cleanText(buyer?.name || "");
  if (!buyerTaxId || !buyerName) return;

  // Sin el RNC del comprador en la pagina no hay como confirmar que el comprobante es de
  // este perfil, y sin esa confirmacion no se toca nada de lo que devolvio la DGII.
  const taxIdField = fields.find((field) => BUYER_TAX_ID_LABEL.test(field.label));
  if (!taxIdField || onlyDigits(taxIdField.value) !== buyerTaxId) return;

  const nameField = fields.find((field) => BUYER_NAME_LABEL.test(field.label));
  if (!nameField) return;

  const declared = nameField.value;
  if (comparableName(declared) === comparableName(buyerName)) return;

  nameField.value = buyerName;
  nameField.note = `El emisor declaro "${declared}"`;
}

function onlyDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function comparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function humanizeId(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function findValue(fields: ConstanciaField[], pattern: RegExp) {
  return fields.find((field) => pattern.test(field.label))?.value || "";
}

function cleanText(value: string) {
  return String(value || "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatConsultedAt(date: Date) {
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santo_Domingo",
  }).format(date);
}
