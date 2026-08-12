"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPeriodParams, type ListSearchParams } from "@/lib/list-period";

export type ListSortOption = {
  key: string;
  label: string;
};

/**
 * Filtro propio de un listado (el tipo de contacto, el estado, etc). Se dibuja como un
 * select más junto a los de año y mes para que no haga falta una segunda barra.
 */
export type ListFilter = {
  param: string;
  /** Texto de la opción vacía, por ejemplo "Todos los tipos". */
  allLabel: string;
  value?: string;
  options: { value: string; label: string }[];
};

const MONTHS = [
  ["1", "Enero"],
  ["2", "Febrero"],
  ["3", "Marzo"],
  ["4", "Abril"],
  ["5", "Mayo"],
  ["6", "Junio"],
  ["7", "Julio"],
  ["8", "Agosto"],
  ["9", "Septiembre"],
  ["10", "Octubre"],
  ["11", "Noviembre"],
  ["12", "Diciembre"],
];

const selectClass =
  "h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

const activeSelectClass =
  "h-9 shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-700 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300";

// Conserva los parámetros actuales de la URL y aplica encima los que cambian. Un valor
// vacío borra la clave, que es como se vuelve a "Todos los años" o se limpia la búsqueda.
function buildHref(
  basePath: string,
  searchParams: ListSearchParams,
  next: Record<string, string | undefined>
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key in next) continue;

    if (Array.isArray(value)) {
      value.forEach((item) => item && query.append(key, item));
    } else if (value) {
      query.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(next)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

/**
 * Barra única de los listados: búsqueda a la izquierda y, a la derecha, cuántos registros
 * hay, los filtros de año y mes, y el menú de ordenamiento. Sustituye al par de barras
 * apiladas que había antes (una de periodo y otra de búsqueda/orden).
 *
 * Omitir `searchPlaceholder` deja la barra sin buscador, y `sortOptions` vacío la deja sin
 * menú de orden: así el mismo componente sirve para listados que no soportan ambas cosas.
 */
export function ListToolbar({
  basePath,
  searchParams,
  total,
  itemSingular = "registro",
  itemPlural = "registros",
  search,
  searchPlaceholder,
  sortBy,
  sortOrder = "desc",
  sortOptions = [],
  filters = [],
}: {
  basePath: string;
  searchParams: ListSearchParams;
  total: number;
  itemSingular?: string;
  itemPlural?: string;
  search?: string;
  searchPlaceholder?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  sortOptions?: ListSortOption[];
  filters?: ListFilter[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const period = getPeriodParams(searchParams);
  const [term, setTerm] = useState(search ?? "");
  const [lastSearch, setLastSearch] = useState(search);

  // Tras navegar llegan props nuevas y el input debe reflejar lo que quedó en la URL. Se
  // ajusta durante el render (no en un efecto) para no encadenar un render de más.
  if (search !== lastSearch) {
    setLastSearch(search);
    setTerm(search ?? "");
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, index) => currentYear + 1 - index);
  const activeSort = sortOptions.find((option) => option.key === sortBy);

  const go = (next: Record<string, string | undefined>) => {
    startTransition(() => {
      router.push(buildHref(basePath, searchParams, next));
    });
  };

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-opacity dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:gap-4 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      {searchPlaceholder ? (
        <form
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            go({ search: term.trim() || undefined });
          }}
        >
          <span className="material-icons-round pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg text-slate-400">
            search
          </span>
          <input
            type="text"
            name="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {term ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => {
                setTerm("");
                go({ search: undefined });
              }}
              className="absolute inset-y-0 right-2 flex items-center rounded-md px-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            >
              <span className="material-icons-round text-lg">close</span>
            </button>
          ) : null}
        </form>
      ) : (
        <div className="hidden min-w-0 flex-1 lg:block" />
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:overflow-x-visible lg:pb-0">
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-xs font-bold text-slate-500 dark:text-slate-400">
          <span className="material-icons-round text-base text-slate-400">filter_list</span>
          {total} {total === 1 ? itemSingular : itemPlural}
        </span>

        {filters.map((filter) => (
          <select
            key={filter.param}
            aria-label={filter.allLabel}
            value={filter.value ?? ""}
            onChange={(event) => go({ [filter.param]: event.target.value || undefined })}
            className={filter.value ? activeSelectClass : selectClass}
          >
            <option value="">{filter.allLabel}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}

        <select
          aria-label="Filtrar por año"
          value={period.year ? String(period.year) : ""}
          onChange={(event) => {
            const year = event.target.value;
            // Elegir año conserva el mes; quitarlo también limpia el mes, porque un mes
            // suelto sin año no describe ningún periodo.
            go(year ? { year } : { year: undefined, month: undefined });
          }}
          className={period.year ? activeSelectClass : selectClass}
        >
          <option value="">Todos los años</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por mes"
          value={period.month ? String(period.month) : ""}
          onChange={(event) => go({ month: event.target.value || undefined })}
          className={period.month ? activeSelectClass : selectClass}
        >
          <option value="">Todos los meses</option>
          {MONTHS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {sortOptions.length > 0 ? (
          <>
            <span className="hidden h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700 sm:block" />

            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={activeSort ? `Ordenar por: ${activeSort.label}` : "Ordenar por"}
                className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                Ordenar por
                <span className="material-icons-round text-base">
                  {sortOrder === "desc" ? "arrow_downward" : "arrow_upward"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {sortOptions.map((option) => {
                  const active = option.key === sortBy;
                  // Volver a elegir el criterio activo invierte la dirección.
                  const nextOrder = active && sortOrder === "desc" ? "asc" : "desc";

                  return (
                    <DropdownMenuItem
                      key={option.key}
                      onSelect={() => go({ sortBy: option.key, sortOrder: nextOrder })}
                      className={`flex items-center justify-between gap-3 text-sm ${
                        active ? "font-bold text-blue-600 dark:text-blue-400" : ""
                      }`}
                    >
                      {option.label}
                      {active ? (
                        <span className="material-icons-round text-base">
                          {sortOrder === "desc" ? "arrow_downward" : "arrow_upward"}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    </div>
  );
}
