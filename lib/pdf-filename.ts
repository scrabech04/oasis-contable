import { quotationNumberLabel } from "@/lib/quotation-number";

// Windows y macOS rechazan estos caracteres en un nombre de archivo, y el navegador guarda
// el PDF con el nombre que le mandamos tal cual, asi que se limpian aqui.
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const FIRST_PRINTABLE_CHAR = 32;
const LAST_ASCII_CHAR = 126;

/** Quita lo que el sistema de archivos no acepta, sin tocar el espaciado. */
function stripIllegalChars(value: string | null | undefined) {
  return Array.from(String(value ?? "").replace(ILLEGAL_FILENAME_CHARS, " "))
    .filter((char) => char.charCodeAt(0) >= FIRST_PRINTABLE_CHAR)
    .join("")
    .trim();
}

/** Para cada trozo suelto del nombre, donde los espacios de sobra si estorban. */
export function sanitizeFilenamePart(value: string | null | undefined) {
  return stripIllegalChars(value).replace(/\s+/g, " ").trim();
}

/**
 * "OASIS GATE  COT 0629 - MINISTERIO DE ENERGIA Y MINAS - FERIA DEL LIBRO ESTACIONES VR"
 *
 * Emisor y numero van pegados por dos espacios, como en los PDF que ya circulan; el cliente
 * y el asunto (el proyecto, o el titulo si la cotizacion no tiene proyecto) cuelgan con
 * " - ". Las partes vacias no dejan separadores sueltos.
 */
export function buildQuotationPdfFilename(parts: {
  emitter?: string | null;
  number?: string | null;
  client?: string | null;
  subject?: string | null;
  fallback: string;
}) {
  const emitter = sanitizeFilenamePart(parts.emitter);
  const number = sanitizeFilenamePart(quotationNumberLabel(parts.number));
  const head = [emitter, number ? `COT ${number}` : ""].filter(Boolean).join("  ");
  const name = [head, sanitizeFilenamePart(parts.client), sanitizeFilenamePart(parts.subject)]
    .filter(Boolean)
    .join(" - ");
  return name || sanitizeFilenamePart(parts.fallback) || "documento";
}

/**
 * Un nombre con tildes ("ENERGIA" acentuada) no cabe en el filename= plano, que viaja en
 * latin-1: el navegador lo corta o lo escribe mal. RFC 5987 pide mandar las dos formas, y
 * el filename* en UTF-8 es el que gana en los navegadores actuales.
 */
export function inlinePdfDisposition(filename: string) {
  // Sin colapsar espacios: el doble espacio entre emisor y numero es parte del formato.
  const clean = stripIllegalChars(filename) || "documento";
  const withExt = clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
  const ascii = Array.from(withExt)
    .map((char) => (char.charCodeAt(0) <= LAST_ASCII_CHAR ? char : "_"))
    .join("");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(withExt)}`;
}
