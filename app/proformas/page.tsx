import Link from "next/link";
import { getProformas } from "@/app/actions";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { ListSearchSortBar } from "@/components/listing/ListSearchSortBar";
import { ProformasTable } from "@/components/proformas/ProformasTable";
import { formatCurrency } from "@/lib/format";
import { getPeriodParams } from "@/lib/list-period";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function ProformasPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const sortBy = typeof searchParams.sortBy === "string" ? searchParams.sortBy : "date";
  const sortOrder = searchParams.sortOrder === "asc" ? "asc" : "desc";
  const period = getPeriodParams(searchParams);
  const proformas = await getProformas({ search, sortBy, sortOrder, ...period });
  const pending = proformas.filter((item) => !["CONVERTED", "CANCELLED"].includes(item.status));
  const pendingTotal = pending.reduce((sum, item) => sum + Math.max(item.total - item.paidAmount, 0), 0);
  const advances = proformas.reduce((sum, item) => sum + item.paidAmount, 0);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-blue-600">No fiscal</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Prefacturas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Solicitudes de pago sin NCF/e-NCF. No entran al 607 ni IT-1 hasta convertirlas.</p>
        </div>
        <Link href="/proformas/new" className={primaryActionClass}>
          <span className="material-icons-round text-lg">add</span>
          Nueva prefactura
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Activas" value={String(pending.length)} />
        <Metric label="Anticipos cobrados" value={`RD$ ${formatCurrency(advances)}`} tone="green" />
        <Metric label="Pendiente proforma" value={`RD$ ${formatCurrency(pendingTotal)}`} tone="blue" />
      </section>

      <ListPeriodFilter basePath="/proformas" searchParams={searchParams} total={proformas.length} itemSingular="prefactura registrada" itemPlural="prefacturas registradas" />

      <ListSearchSortBar
        basePath="/proformas"
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {proformas.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-icons-round mb-4 text-5xl opacity-20">request_quote</span>
            <p className="font-medium">No hay prefacturas registradas.</p>
          </div>
        ) : (
          <ProformasTable proformas={proformas} />
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" | "blue" }) {
  const classes = {
    slate: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300",
    blue: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300",
  }[tone];
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${classes}`}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}
