import Link from "next/link";
import { getQuotations } from "@/app/actions";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { ListSearchSortBar } from "@/components/listing/ListSearchSortBar";
import { QuotationsTable } from "@/components/quotations/QuotationsTable";
import { getPeriodParams } from "@/lib/list-period";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function QuotationsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const sortBy = typeof searchParams.sortBy === "string" ? searchParams.sortBy : "date";
  const sortOrder = searchParams.sortOrder === "asc" ? "asc" : "desc";
  const period = getPeriodParams(searchParams);
  const quotations = await getQuotations({ search, sortBy, sortOrder, ...period });

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Cotizaciones</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestiona tus propuestas comerciales y conviertelas en facturas.</p>
        </div>
        <Link href="/quotations/new" className={primaryActionClass}>
          <span className="material-icons-round text-lg">add</span>
          Nueva Cotizacion
        </Link>
      </header>

      <ListPeriodFilter basePath="/quotations" searchParams={searchParams} total={quotations.length} itemSingular="cotizacion registrada" itemPlural="cotizaciones registradas" />

      <ListSearchSortBar
        basePath="/quotations"
        searchParams={searchParams}
        search={search}
        searchPlaceholder="Buscar por cliente o numero..."
        sortBy={sortBy}
        sortOrder={sortOrder}
        sortOptions={[
          { key: "date", label: "Fecha" },
          { key: "client", label: "Cliente" },
          { key: "total", label: "Monto" },
        ]}
      />

      <QuotationsTable quotations={quotations} />
    </div>
  );
}
