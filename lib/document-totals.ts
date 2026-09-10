/**
 * La aritmetica de los totales de un documento de venta, en un solo sitio.
 *
 * Vive aparte porque la calculaban por duplicado el servidor (`totals` en app/actions) y
 * cada formulario por su cuenta, y dos copias de una formula acaban divergiendo: el dia que
 * el descuento paso a restar de la base imponible, la pantalla y lo guardado habrian dicho
 * cosas distintas.
 */

export type TotalsItem = {
  itemType?: string | null;
  quantity: number | string;
  price: number | string;
  taxRate?: number | string | null;
};

export type DocumentTotals = {
  /** Base antes del descuento. */
  gross: number;
  /** Descuento realmente aplicado, ya acotado a la base. */
  discount: number;
  /** Base imponible: lo que queda tras el descuento. */
  subtotal: number;
  tax: number;
  total: number;
};

/** Acepta el 18 y el 0.18 como la misma tasa; cualquier otra cosa es 0. */
export function normalizeTaxRate(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function lineAmount(item: TotalsItem) {
  return (Number(item.quantity) || 0) * (Number(item.price) || 0);
}

function isBillable(item: TotalsItem) {
  return !item.itemType || item.itemType === "ITEM";
}

/** La base antes de descuento: los encabezados y subtitulos no suman. */
export function grossSubtotal(items: TotalsItem[]) {
  return items.reduce((sum, item) => (isBillable(item) ? sum + lineAmount(item) : sum), 0);
}

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** El importe que representa un porcentaje de descuento sobre la base. */
export function discountFromRate(gross: number, rate: number) {
  const safeRate = Math.min(Math.max(Number(rate) || 0, 0), 100);
  return roundMoney((Math.max(gross, 0) * safeRate) / 100);
}

/**
 * Totales con el descuento aplicado ANTES del impuesto.
 *
 * Un descuento comercial reduce la base imponible: 240,000 con un 5% pagan ITBIS sobre
 * 228,000, no sobre 240,000. El descuento se reparte proporcionalmente entre las lineas,
 * que es lo unico que tiene sentido cuando conviven varias tasas — cada una se rebaja en la
 * misma proporcion.
 */
export function documentTotals(items: TotalsItem[], discount = 0): DocumentTotals {
  const gross = grossSubtotal(items);
  const applied = Math.min(Math.max(Number(discount) || 0, 0), Math.max(gross, 0));
  const factor = gross > 0 ? (gross - applied) / gross : 1;
  const subtotal = gross - applied;
  const tax = items.reduce((sum, item) => {
    if (!isBillable(item)) return sum;
    return sum + lineAmount(item) * (normalizeTaxRate(item.taxRate) / 100) * factor;
  }, 0);

  return { gross, discount: applied, subtotal, tax, total: subtotal + tax };
}
