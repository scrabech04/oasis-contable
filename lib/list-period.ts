export type ListSearchParams = Record<string, string | string[] | undefined>;

export type PeriodParams = {
  month?: number;
  year?: number;
};

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getPeriodParams(searchParams: ListSearchParams): PeriodParams {
  const rawMonth = Number(singleParam(searchParams.month));
  const rawYear = Number(singleParam(searchParams.year));
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : undefined;
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? rawYear : undefined;

  return {
    month,
    year: month && !year ? new Date().getFullYear() : year,
  };
}

/**
 * Los limites se arman en UTC porque las fechas de negocio se guardan como medianoche UTC
 * (ver `formatDate` en lib/format).
 *
 * Con `new Date(year, month, 1)` el limite salia a medianoche local, que en Republica
 * Dominicana (UTC-4) es las 04:00 UTC del dia 1. Una factura fechada el dia 1 quedaba por
 * debajo del `gte` y desaparecia de su propio mes: INV-0008, del 1 de junio, no salia al
 * filtrar por junio.
 */
export function getPeriodDateRange(period: PeriodParams) {
  if (!period.year) return {};

  const start = period.month
    ? new Date(Date.UTC(period.year, period.month - 1, 1))
    : new Date(Date.UTC(period.year, 0, 1));
  const end = period.month
    ? new Date(Date.UTC(period.year, period.month, 1))
    : new Date(Date.UTC(period.year + 1, 0, 1));

  return { gte: start, lt: end };
}

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * El periodo anterior al elegido, para comparar contra el ("subiste un 20% respecto al mes
 * pasado"). Un mes retrocede al anterior cruzando el fin de ano; un ano suelto retrocede al
 * ano anterior; y sin periodo no hay contra que comparar.
 */
export function getPreviousPeriod(period: PeriodParams): PeriodParams | null {
  if (!period.year) return null;
  if (!period.month) return { year: period.year - 1 };

  return period.month === 1
    ? { year: period.year - 1, month: 12 }
    : { year: period.year, month: period.month - 1 };
}

export function formatPeriodLabel(period: PeriodParams, fallback = "Todo el historial") {
  if (!period.year) return fallback;
  if (!period.month) return String(period.year);

  return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
}

/** El periodo que representa el mes en curso, base de los accesos rapidos del resumen. */
export function currentMonthPeriod(): PeriodParams {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function compactPeriodQuery(searchParams: ListSearchParams) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "month" || key === "year") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => item && query.append(key, item));
    } else if (value) {
      query.set(key, value);
    }
  }

  return query;
}
