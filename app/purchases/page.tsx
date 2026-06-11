import Link from "next/link";
import { getPurchases } from "@/app/actions";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { ListSearchSortBar } from "@/components/listing/ListSearchSortBar";
import { PurchasesActions } from "@/components/purchases/PurchasesActions";
import { PurchasesTable } from "@/components/purchases/PurchasesTable";
import { getPeriodParams } from "@/lib/list-period";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function PurchasesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const sortBy = searchParams.sortBy === "createdAt" ? "createdAt" : "date";
  const sortOrder = searchParams.sortOrder === "asc" ? "asc" : "desc";
  const autoOpenQR = searchParams.scan === "qr";
  const period = getPeriodParams(searchParams);
  const purchases = await getPurchases({ sortBy, sortOrder, ...period });

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Compras y Gastos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Historial de adquisiciones, gastos operativos e importaciones.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <PurchasesActions autoOpenQR={autoOpenQR} />
          <Link
            href="/purchases/ai-import"
            title="Importar con IA"
            aria-label="Importar con IA"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-md dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            <span className="material-icons-round text-[22px]">auto_awesome</span>
            <span className="sr-only">Importar con IA</span>
          </Link>
          <Link href="/purchases/new" className={`${primaryActionClass} min-w-[11rem] flex-1 px-5 sm:flex-none`}>
            <span className="material-icons-round text-[20px]">add</span>
            Nueva Compra
          </Link>
        </div>
      </header>

      <ListPeriodFilter basePath="/purchases" searchParams={searchParams} total={purchases.length} itemSingular="compra registrada" itemPlural="compras registradas" />

      <ListSearchSortBar
        basePath="/purchases"
        searchParams={searchParams}
        sortBy={sortBy}
        sortOrder={sortOrder}
        sortOptions={[
          { key: "date", label: "Fecha factura" },
          { key: "createdAt", label: "Recien anadida" },
        ]}
      />

      <div className="min-h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {purchases.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center p-12 text-center text-slate-400">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800/50">
              <span className="material-icons-round text-4xl opacity-20">shopping_cart</span>
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">No hay compras registradas</h3>
            <p className="max-w-[300px] text-sm leading-relaxed">Comienza registrando tus facturas de proveedores o gastos menores para tener control total.</p>
          </div>
        ) : (
          <PurchasesTable purchases={purchases} />
        )}
      </div>
    </div>
  );
}
