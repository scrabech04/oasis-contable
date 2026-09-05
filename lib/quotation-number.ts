export const QUOTATION_NUMBER_PAD = 4;

/**
 * La serie real del negocio va en el numero ("0617", "0629"), no en el id de la fila. Solo
 * interesa la cola numerica, porque conviven formatos: los numeros viejos entraron como
 * "0617" y los que genero la app antes salieron como "COT-0002".
 *
 * Las copias ("0629-COPIA-4821") quedan fuera a proposito: su sufijo es un timestamp, y
 * tomarlo por numero de serie dispararia la numeracion a los miles en cuanto se duplique
 * una cotizacion.
 */
export function parseQuotationNumber(value: string | null | undefined) {
  const raw = String(value ?? "");
  if (/copia/i.test(raw)) return null;
  const match = raw.match(/(\d+)\s*$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatQuotationNumber(prefix: string, value: number) {
  return `${prefix ?? ""}${String(value).padStart(QUOTATION_NUMBER_PAD, "0")}`;
}

/** "COT-0002" y "0630" se ven igual en el nombre del PDF: "0002" y "0630". */
export function quotationNumberLabel(value: string | null | undefined) {
  const parsed = parseQuotationNumber(value);
  return parsed === null ? String(value ?? "").trim() : formatQuotationNumber("", parsed);
}
