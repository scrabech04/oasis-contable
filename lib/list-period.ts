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

export function getPeriodDateRange(period: PeriodParams) {
  if (!period.year) return {};

  const start = period.month
    ? new Date(period.year, period.month - 1, 1)
    : new Date(period.year, 0, 1);
  const end = period.month
    ? new Date(period.year, period.month, 1)
    : new Date(period.year + 1, 0, 1);

  return { gte: start, lt: end };
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
