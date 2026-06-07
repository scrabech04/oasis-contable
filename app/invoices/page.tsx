import Link from "next/link";
import { Repeat } from "lucide-react";
import { getInvoices, processRecurringInvoices } from "@/app/actions";
import { InvoicesTable } from "@/components/invoices/InvoicesTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { ListSearchSortBar } from "@/components/listing/ListSearchSortBar";
import { getPeriodParams } from "@/lib/list-period";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function InvoicesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const sortBy = typeof searchParams.sortBy === "string" ? searchParams.sortBy : "date";
  const sortOrder = searchParams.sortOrder === "asc" ? "asc" : "desc";
  const period = getPeriodParams(searchParams);

  const { generatedCount } = await processRecurringInvoices();
  const invoices = await getInvoices({ search, sortBy, sortOrder, ...period });

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Facturacion</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestiona y monitorea tus facturas emitidas.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap">
          <Link
            href="/invoices/ai-import"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-center text-sm font-bold text-blue-600 shadow-sm transition-all hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 sm:px-6"
          >
            <span className="material-icons-round mr-1.5 text-[20px] sm:mr-2">smart_toy</span>
            Importar con IA
          </Link>
          <Link href="/invoices/new" className={primaryActionClass}>
            <span className="material-icons-round text-lg">add</span>
            Nueva Factura
          </Link>
        </div>
      </header>

      {generatedCount > 0 ? (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <Repeat className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-300">Facturas generadas</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            Se generaron automaticamente {generatedCount} {generatedCount === 1 ? "nueva factura" : "nuevas facturas"} desde tus plantillas recurrentes.
          </AlertDescription>
        </Alert>
      ) : null}

      <ListPeriodFilter basePath="/invoices" searchParams={searchParams} total={invoices.length} itemSingular="factura registrada" itemPlural="facturas registradas" />

      <ListSearchSortBar
        basePath="/invoices"
        searchParams={searchParams}
        search={search}
        searchPlaceholder="Buscar por cliente, NCF o numero..."
        sortBy={sortBy}
        sortOrder={sortOrder}
        sortOptions={[
          { key: "date", label: "Fecha" },
          { key: "client", label: "Cliente" },
          { key: "total", label: "Monto" },
        ]}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
            <span className="material-icons-round mb-4 text-5xl opacity-20">description</span>
            <p className="font-medium">No se encontraron facturas.</p>
            <p className="mt-1 text-sm">Intenta con otro termino de busqueda o crea una nueva.</p>
          </div>
        ) : (
          <InvoicesTable invoices={invoices} />
        )}
      </div>
    </div>
  );
}
