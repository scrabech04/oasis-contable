"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MONTH_NAMES, type PeriodParams } from "@/lib/list-period";

const selectClass =
  "h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

const activeSelectClass =
  "h-9 shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-700 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300";

const chipClass =
  "h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function monthsAgo(offset: number): PeriodParams {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return { year: target.getFullYear(), month: target.getMonth() + 1 };
}

/**
 * Filtro de periodo del resumen. Vive en la URL (`?year=&month=`) igual que el de los
 * listados, asi que el estado sobrevive al refresco y el enlace se puede compartir tal cual.
 */
export function DashboardFilters({ period }: { period: PeriodParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const go = (next: PeriodParams) => {
    const query = new URLSearchParams();
    if (next.year) query.set("year", String(next.year));
    if (next.month) query.set("month", String(next.month));
    const serialized = query.toString();
    startTransition(() => router.push(serialized ? `/?${serialized}` : "/"));
  };

  const thisMonth = monthsAgo(0);
  const lastMonth = monthsAgo(1);
  const matches = (candidate: PeriodParams) =>
    period.year === candidate.year && period.month === candidate.month;

  const shortcuts: { label: string; target: PeriodParams; active: boolean }[] = [
    { label: "Todo", target: {}, active: !period.year },
    { label: "Este mes", target: thisMonth, active: matches(thisMonth) },
    { label: "Mes pasado", target: lastMonth, active: matches(lastMonth) },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => currentYear + 1 - index);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm transition-opacity dark:border-slate-800 dark:bg-slate-900 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <span className="material-icons-round px-1 text-lg text-slate-400">calendar_month</span>

      {shortcuts.map((shortcut) => (
        <button
          key={shortcut.label}
          type="button"
          onClick={() => go(shortcut.target)}
          className={`${chipClass} ${
            shortcut.active
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          {shortcut.label}
        </button>
      ))}

      <span className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 sm:block" />

      <select
        aria-label="Filtrar por ano"
        value={period.year ? String(period.year) : ""}
        onChange={(event) => {
          const year = event.target.value;
          // Quitar el ano tambien limpia el mes: un mes suelto no describe ningun periodo.
          go(year ? { year: Number(year), month: period.month } : {});
        }}
        className={period.year ? activeSelectClass : selectClass}
      >
        <option value="">Todos los anos</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por mes"
        value={period.month ? String(period.month) : ""}
        onChange={(event) => {
          const month = event.target.value;
          go({ year: period.year || currentYear, month: month ? Number(month) : undefined });
        }}
        className={period.month ? activeSelectClass : selectClass}
      >
        <option value="">Todos los meses</option>
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
