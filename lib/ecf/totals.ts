/**
 * Totales de un e-CF calculados como los valida la DGII.
 *
 * Cada linea se redondea a dos decimales y los totales salen de sumar esas lineas ya
 * redondeadas: asi el XML cuadra solo, sin depender de la regla de tolerancia (±1 por linea).
 *
 * El descuento global de OFlow (que reduce la base antes del ITBIS) se reparte entre las
 * lineas facturables en proporcion a su monto y se escribe como descuento de cada linea. Es
 * la forma que no deja dudas: el MontoItem ya trae el descuento restado y el ITBIS se
 * calcula sobre lo que queda.
 */
import { round2 } from "./format";
import type { BillingIndicator, EcfComputedLine, EcfLineInput, EcfTotals } from "./types";

export const ITBIS_RATES: Record<1 | 2 | 3, number> = { 1: 18, 2: 16, 3: 0 };

/** 18 -> 1, 16 -> 2, 0 -> 4 (exento). La tasa cero (3) hay que pedirla de forma explicita. */
export function billingIndicatorFor(line: Pick<EcfLineInput, "taxRate" | "billingIndicator">): BillingIndicator {
  if (line.billingIndicator !== undefined) return line.billingIndicator;
  const rate = Number(line.taxRate) || 0;
  const pct = rate > 0 && rate <= 1 ? rate * 100 : rate;
  if (Math.abs(pct - 18) < 0.001) return 1;
  if (Math.abs(pct - 16) < 0.001) return 2;
  if (pct === 0) return 4;
  throw new Error(`La tasa de ITBIS ${pct}% no existe en el formato e-CF (solo 18%, 16% y 0%).`);
}

/** Reparte un monto entre pesos proporcionales; el centavo que sobra va a la linea mayor. */
function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => round2((total * w) / sum));
  const diff = round2(total - shares.reduce((a, b) => a + b, 0));
  if (diff !== 0) {
    let biggest = 0;
    weights.forEach((w, i) => {
      if (w > weights[biggest]) biggest = i;
    });
    shares[biggest] = round2(shares[biggest] + diff);
  }
  return shares;
}

export function computeLines(lines: EcfLineInput[], globalDiscount = 0): EcfComputedLine[] {
  if (lines.length === 0) throw new Error("El comprobante no tiene lineas.");
  if (lines.length > 10000) throw new Error("El formato admite como maximo 10,000 lineas.");

  const gross = lines.map((line) => round2(line.quantity * line.unitPrice));
  const billable = lines.map((line, i) => (billingIndicatorFor(line) === 0 ? 0 : Math.max(gross[i] - (line.discount || 0), 0)));
  const billableTotal = billable.reduce((a, b) => a + b, 0);
  const global = Math.min(Math.max(round2(globalDiscount), 0), round2(billableTotal));
  const extra = allocate(global, billable);

  return lines.map((line, i) => {
    if (!(line.quantity > 0)) throw new Error(`La linea ${i + 1} tiene una cantidad que no es positiva.`);
    if (line.unitPrice < 0) throw new Error(`La linea ${i + 1} tiene un precio negativo.`);
    const discount = round2((line.discount || 0) + extra[i]);
    const amount = round2(gross[i] - discount);
    if (amount < 0) throw new Error(`El descuento de la linea ${i + 1} es mayor que su monto.`);
    return {
      lineNumber: i + 1,
      name: line.name,
      description: line.description ?? null,
      billingIndicator: billingIndicatorFor(line),
      goodOrService: line.goodOrService,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount,
      amount,
    };
  });
}

export function computeTotals(lines: EcfComputedLine[]): EcfTotals {
  const sumOf = (indicator: BillingIndicator) =>
    round2(lines.filter((l) => l.billingIndicator === indicator).reduce((acc, l) => acc + l.amount, 0));
  const has = (indicator: BillingIndicator) => lines.some((l) => l.billingIndicator === indicator);

  const montoGravadoI1 = sumOf(1);
  const montoGravadoI2 = sumOf(2);
  const montoGravadoI3 = sumOf(3);
  const montoExento = sumOf(4);
  const montoNoFacturable = sumOf(0);
  const totalItbis1 = round2((montoGravadoI1 * ITBIS_RATES[1]) / 100);
  const totalItbis2 = round2((montoGravadoI2 * ITBIS_RATES[2]) / 100);
  const totalItbis3 = 0;
  const montoGravadoTotal = round2(montoGravadoI1 + montoGravadoI2 + montoGravadoI3);
  const totalItbis = round2(totalItbis1 + totalItbis2 + totalItbis3);

  return {
    montoGravadoTotal,
    montoGravadoI1,
    montoGravadoI2,
    montoGravadoI3,
    montoExento,
    totalItbis,
    totalItbis1,
    totalItbis2,
    totalItbis3,
    montoNoFacturable,
    montoTotal: round2(montoGravadoTotal + montoExento + totalItbis),
    hasI1: has(1),
    hasI2: has(2),
    hasI3: has(3),
    hasExento: has(4),
    hasNoFacturable: has(0),
  };
}
