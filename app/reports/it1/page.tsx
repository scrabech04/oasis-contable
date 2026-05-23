import { getIT1Data } from "@/app/actions";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { formatCurrency } from "@/lib/format";
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";

export default async function IT1ReportPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const today = new Date();
    const currentPeriod = today.getFullYear() + (today.getMonth() + 1).toString().padStart(2, '0');
    const period = typeof searchParams.period === 'string' ? searchParams.period : currentPeriod;

    const data = await getIT1Data(period);

    const formatPeriod = (p: string) => {
        const year = p.substring(0, 4);
        const month = p.substring(4, 6);
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    };

    return (
        <div className="flex flex-col gap-8 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Declaración IT-1</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Resumen de ITBIS para el periodo {formatPeriod(period)}.</p>
                </div>
                <PeriodSelector currentPeriod={period} tab="IT1" />
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
                    <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <span className="material-icons-round">arrow_upward</span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ITBIS Facturado (607)</p>
                        <h3 className="text-2xl font-bold mt-0.5 font-numeric">RD${formatCurrency(data.itbisFacturado)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Impuesto cobrado a clientes</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
                    <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                        <span className="material-icons-round">arrow_downward</span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ITBIS Pagado (606)</p>
                        <h3 className="text-2xl font-bold mt-0.5 font-numeric">RD${formatCurrency(data.itbisPagado)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Impuesto deducible en compras</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
                    <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <span className="material-icons-round">account_balance_wallet</span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Retenciones ITBIS</p>
                        <h3 className="text-2xl font-bold mt-0.5 font-numeric">RD${formatCurrency(data.retencionesITBIS)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Saldos a favor del periodo</p>
                    </div>
                </div>
            </div>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">Cálculo de Liquidación</h4>
                    <p className="text-sm text-slate-400">Cifras estimadas para fines informativos.</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="p-6 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">ITBIS de Ventas</span>
                        <span className="text-primary font-bold font-numeric">RD${formatCurrency(data.itbisFacturado)}</span>
                    </div>
                    <div className="p-6 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">(-) ITBIS Deducible en Compras</span>
                        <span className="text-orange-600 font-bold font-numeric">- RD${formatCurrency(data.itbisPagado)}</span>
                    </div>
                    <div className="p-6 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">(-) Retenciones ITBIS recibidas</span>
                        <span className="text-emerald-600 font-bold font-numeric">- RD${formatCurrency(data.retencionesITBIS)}</span>
                    </div>
                    <div className={clsx(
                        "p-6 flex justify-between items-center",
                        data.balance >= 0 ? "bg-blue-50/30 dark:bg-blue-900/10" : "bg-emerald-50/30 dark:bg-emerald-900/10"
                    )}>
                        <span className="text-slate-900 dark:text-white font-bold text-lg">Saldo {data.balance >= 0 ? 'a Pagar' : 'a Favor'}</span>
                        <span className={clsx(
                            "font-black text-2xl font-numeric",
                            data.balance >= 0 ? "text-primary" : "text-emerald-600"
                        )}>
                            RD${formatCurrency(Math.abs(data.balance))}
                        </span>
                    </div>
                </div>
                <div className="p-6 bg-blue-50/50 dark:bg-blue-900/10 flex gap-4 border-t border-blue-100 dark:border-blue-900/30">
                    <span className="material-icons-round text-blue-500">info</span>
                    <div>
                        <h5 className="text-sm font-bold text-blue-700 dark:text-blue-400">Nota Informativa</h5>
                        <p className="text-sm text-blue-600 dark:text-blue-400/80 leading-relaxed mt-1">
                            Este reporte agrupa los datos registrados en el sistema. Asegúrate de que todos los pagos con retenciones y facturas del periodo estén registrados correctamente para garantizar la exactitud de los montos presentados.
                        </p>
                    </div>
                </div>
            </section>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">Retenciones ISR recibidas</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Monto retenido por clientes para fines de Impuesto Sobre la Renta.</p>
                </div>
                <div className="text-3xl font-black text-slate-900 dark:text-white font-numeric">
                    RD${formatCurrency(data.retencionesISR)}
                </div>
            </section>
        </div>
    );
}

import clsx from "clsx";
