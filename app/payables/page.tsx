import { getPayables } from "@/app/actions";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { PayablesList } from "@/components/payables/PayablesList";
import { formatCurrency } from "@/lib/format";
import { getPeriodParams } from "@/lib/list-period";

export default async function PayablesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const period = getPeriodParams(searchParams);
  const payables = await getPayables(period);
  const totalPending = payables.reduce((sum, item) => sum + Math.max(item.total - item.paidAmount, 0), 0);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Cuentas por Pagar</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestion de obligaciones con proveedores y gastos pendientes.</p>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <span className="material-icons-round">payments</span>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total pendiente</p>
            <h2 className="font-numeric text-xl font-bold text-slate-900 dark:text-white">RD${formatCurrency(totalPending)}</h2>
          </div>
        </div>
      </header>

      <ListPeriodFilter basePath="/payables" searchParams={searchParams} total={payables.length} itemSingular="cuenta por pagar" itemPlural="cuentas por pagar" />

      <PayablesList payables={payables} />
    </div>
  );
}
