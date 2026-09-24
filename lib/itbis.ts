/**
 * El ITBIS mes a mes, con el saldo a favor arrastrandose de un periodo al siguiente.
 *
 * Vive aparte de app/actions porque el arrastre no es un dato del mes: es el resultado de
 * todos los meses anteriores. La IT-1 y la tarjeta del resumen tienen que contar la misma
 * historia, y dos copias de esta formula acabarian divergiendo.
 *
 * Las bases no coinciden a proposito, igual que en la DGII:
 * - el ITBIS facturado y el deducible van por la FECHA DEL DOCUMENTO (se devengan al emitir);
 * - las retenciones van por la FECHA DEL PAGO, porque una retencion se acredita en el
 *   periodo en que se practica. Facturas en abril y te pagan en junio con retencion: el
 *   ITBIS es de abril y la retencion de junio. Contarla en abril obligaria a rectificar un
 *   mes ya declarado.
 */

import { roundMoney } from "./document-totals";

export type ItbisPeriodInput = {
  /** "YYYYMM". */
  period: string;
  itbisFacturado: number;
  itbisPagado: number;
  retencionesITBIS: number;
  retencionesISR: number;
};

export type ItbisPeriod = ItbisPeriodInput & {
  /** Facturado - deducible - retenciones del mes, sin contar lo que venia de antes. */
  balance: number;
  /** Credito que entra desde los meses anteriores. Nunca negativo. */
  saldoAFavorPrevio: number;
  /** Lo que toca pagar tras aplicar el arrastre. Nunca negativo. */
  aPagar: number;
  /** Credito que queda para el mes siguiente. Nunca negativo. */
  saldoAFavor: number;
};

export function emptyItbisPeriod(period: string): ItbisPeriodInput {
  return {
    period,
    itbisFacturado: 0,
    itbisPagado: 0,
    retencionesITBIS: 0,
    retencionesISR: 0,
  };
}

/**
 * El mes al que pertenece una fecha, en UTC.
 *
 * Las fechas de negocio se guardan como medianoche UTC (ver `formatDate` en lib/format), asi
 * que leerlas en hora local corre el dia 1 al mes anterior: en Republica Dominicana (UTC-4)
 * una factura del 1 de junio caeria en mayo. Es el mismo motivo por el que
 * `getPeriodDateRange` arma sus limites en UTC.
 */
export function periodKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodKeyFromParts(year: number, month: number) {
  return `${year}${String(month).padStart(2, "0")}`;
}

/** "202609" -> "Septiembre 2026". Devuelve el crudo si no es un periodo valido. */
export function formatItbisPeriod(period: string) {
  if (!/^\d{6}$/.test(period)) return period;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (month < 1 || month > 12) return period;

  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("es-ES", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Encadena los meses aplicando el arrastre: si un mes cierra a favor, ese credito baja el
 * saldo del siguiente en vez de perderse.
 *
 * Los meses sin movimiento no hacen falta en `rows` — el credito sigue vivo y aparece igual
 * en el proximo mes que si tenga movimiento. Lo que si importa es el orden, asi que se
 * ordena aqui y no se confia en como venga la consulta.
 */
export function buildItbisLedger(rows: ItbisPeriodInput[]): ItbisPeriod[] {
  const ordered = [...rows].sort((a, b) => a.period.localeCompare(b.period));
  let carry = 0;

  return ordered.map((row) => {
    const balance = roundMoney(row.itbisFacturado - row.itbisPagado - row.retencionesITBIS);
    const saldoAFavorPrevio = carry;
    const neto = roundMoney(balance - saldoAFavorPrevio);
    const aPagar = neto > 0 ? neto : 0;
    const saldoAFavor = neto < 0 ? roundMoney(-neto) : 0;
    carry = saldoAFavor;

    return {
      ...row,
      itbisFacturado: roundMoney(row.itbisFacturado),
      itbisPagado: roundMoney(row.itbisPagado),
      retencionesITBIS: roundMoney(row.retencionesITBIS),
      retencionesISR: roundMoney(row.retencionesISR),
      balance,
      saldoAFavorPrevio,
      aPagar,
      saldoAFavor,
    };
  });
}

/** El credito que estaba vivo justo antes de `period`, sin incluirlo. */
export function carryInto(ledger: ItbisPeriod[], period: string) {
  let carry = 0;
  for (const row of ledger) {
    if (row.period >= period) break;
    carry = row.saldoAFavor;
  }
  return carry;
}

/**
 * La fila de un mes concreto. Si ese mes no tuvo movimiento devuelve ceros pero conserva el
 * credito que venia de antes, que es justo lo que hay que ver: "no facturaste nada y sigues
 * teniendo 4,396.91 a favor".
 */
export function itbisPeriodOf(ledger: ItbisPeriod[], period: string): ItbisPeriod {
  const found = ledger.find((row) => row.period === period);
  if (found) return found;

  const carry = carryInto(ledger, period);
  return {
    ...emptyItbisPeriod(period),
    balance: 0,
    saldoAFavorPrevio: carry,
    aPagar: 0,
    saldoAFavor: carry,
  };
}

export type ItbisWindow = {
  itbisFacturado: number;
  itbisPagado: number;
  retencionesITBIS: number;
  retencionesISR: number;
  /** Suma de los saldos del tramo, sin arrastre. */
  balance: number;
  /** Credito que entraba al tramo. */
  saldoAFavorPrevio: number;
  /** Lo pagado a lo largo del tramo, mes a mes con su arrastre. */
  aPagar: number;
  /** Credito que queda vivo al cierre del tramo. */
  saldoAFavor: number;
  /** Cuantos meses del tramo tuvieron movimiento. */
  months: number;
};

/**
 * Agrega un tramo de meses: un mes suelto, un ano, o todo el historial.
 *
 * `aPagar` se suma mes a mes en vez de recalcularse sobre los totales del tramo, porque un
 * credito de mayo no puede rebajar lo que ya se pago en abril. Y `saldoAFavor` es el del
 * ultimo mes, no una suma: es un saldo, no un flujo.
 */
export function aggregateItbis(
  ledger: ItbisPeriod[],
  from?: string,
  to?: string,
): ItbisWindow {
  const rows = ledger.filter(
    (row) => (!from || row.period >= from) && (!to || row.period <= to),
  );

  const opening = rows.length > 0 ? rows[0].saldoAFavorPrevio : from ? carryInto(ledger, from) : 0;
  if (rows.length === 0) {
    return {
      itbisFacturado: 0,
      itbisPagado: 0,
      retencionesITBIS: 0,
      retencionesISR: 0,
      balance: 0,
      saldoAFavorPrevio: opening,
      aPagar: 0,
      saldoAFavor: opening,
      months: 0,
    };
  }

  const sum = (pick: (row: ItbisPeriod) => number) =>
    roundMoney(rows.reduce((total, row) => total + pick(row), 0));

  return {
    itbisFacturado: sum((row) => row.itbisFacturado),
    itbisPagado: sum((row) => row.itbisPagado),
    retencionesITBIS: sum((row) => row.retencionesITBIS),
    retencionesISR: sum((row) => row.retencionesISR),
    balance: sum((row) => row.balance),
    saldoAFavorPrevio: opening,
    aPagar: sum((row) => row.aPagar),
    saldoAFavor: rows[rows.length - 1].saldoAFavor,
    months: rows.length,
  };
}
