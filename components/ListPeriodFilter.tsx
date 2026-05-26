import Link from "next/link";
import { compactPeriodQuery, getPeriodParams, type ListSearchParams } from "@/lib/list-period";

const months = [
  ["1", "Ene"],
  ["2", "Feb"],
  ["3", "Mar"],
  ["4", "Abr"],
  ["5", "May"],
  ["6", "Jun"],
  ["7", "Jul"],
  ["8", "Ago"],
  ["9", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dic"],
];

function clearHref(basePath: string, searchParams: ListSearchParams) {
  const query = compactPeriodQuery(searchParams);
  const serialized = query.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

function hiddenFields(searchParams: ListSearchParams) {
  return Object.entries(searchParams)
    .filter(([key]) => key !== "month" && key !== "year")
    .flatMap(([key, value]) => Array.isArray(value)
      ? value.map((item) => [key, item] as const)
      : [[key, value] as const])
    .filter(([, value]) => Boolean(value));
}

export function ListPeriodFilter({
  basePath,
  searchParams,
  total,
  itemSingular = "registro",
  itemPlural = "registros",
}: {
  basePath: string;
  searchParams: ListSearchParams;
  total: number;
  itemSingular?: string;
  itemPlural?: string;
}) {
  const period = getPeriodParams(searchParams);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, index) => currentYear + 1 - index);
  const hasPeriod = Boolean(period.month || period.year);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2 px-1">
        <span className="material-icons-round text-lg text-slate-400">filter_list</span>
        <span className="text-sm font-black text-slate-900 dark:text-white">
          {total} {total === 1 ? itemSingular : itemPlural}
        </span>
        {hasPeriod ? (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Filtrado
          </span>
        ) : null}
      </div>

      <form action={basePath} className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        {hiddenFields(searchParams).map(([key, value], index) => (
          <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
        ))}
        <select
          name="year"
          defaultValue={period.year ? String(period.year) : ""}
          className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Todos los anos</option>
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          name="month"
          defaultValue={period.month ? String(period.month) : ""}
          className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Todos los meses</option>
          {months.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-700"
        >
          Filtrar
        </button>
        {hasPeriod ? (
          <Link
            href={clearHref(basePath, searchParams)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Limpiar
          </Link>
        ) : null}
      </form>
    </div>
  );
}
