import Link from "next/link";
import { getPeriodParams, type ListSearchParams } from "@/lib/list-period";

type SortOption = {
  key: string;
  label: string;
};

function withQuery(basePath: string, searchParams: ListSearchParams, next: Record<string, string>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => item && query.append(key, item));
    } else if (value) {
      query.set(key, value);
    }
  }

  Object.entries(next).forEach(([key, value]) => query.set(key, value));
  const serialized = query.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

export function ListSearchSortBar({
  basePath,
  searchParams,
  search,
  searchPlaceholder,
  sortBy,
  sortOrder,
  sortOptions,
}: {
  basePath: string;
  searchParams: ListSearchParams;
  search?: string;
  searchPlaceholder?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  sortOptions: SortOption[];
}) {
  const period = getPeriodParams(searchParams);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
      {searchPlaceholder ? (
        <form action={basePath} className="relative w-full md:w-96">
          {period.year ? <input type="hidden" name="year" value={period.year} /> : null}
          {period.month ? <input type="hidden" name="month" value={period.month} /> : null}
          <input type="hidden" name="sortBy" value={sortBy} />
          <input type="hidden" name="sortOrder" value={sortOrder} />
          <span className="material-icons-round absolute inset-y-0 left-3 flex items-center text-lg text-slate-400">search</span>
          <input
            type="search"
            name="search"
            placeholder={searchPlaceholder}
            defaultValue={search}
            className="block h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </form>
      ) : (
        <div className="flex items-center gap-2 px-1 text-sm font-black text-slate-900 dark:text-white">
          <span className="material-icons-round text-lg text-slate-400">sort</span>
          Ordenar registros
        </div>
      )}

      <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 md:w-auto md:pb-0">
        <span className="whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Ordenar por</span>
        {sortOptions.map((option) => {
          const active = sortBy === option.key;
          const nextOrder = active && sortOrder === "desc" ? "asc" : "desc";
          return (
            <Link
              key={option.key}
              href={withQuery(basePath, searchParams, { sortBy: option.key, sortOrder: nextOrder })}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${active
                ? "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/30 dark:text-blue-300"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
            >
              {option.label}
              {active ? <span className="material-icons-round text-sm">{sortOrder === "desc" ? "arrow_downward" : "arrow_upward"}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
