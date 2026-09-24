import clsx from "clsx";
import { getIT1Data } from "@/app/actions";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { formatCurrency } from "@/lib/format";
import { formatItbisPeriod } from "@/lib/itbis";

export default async function IT1ReportPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const today = new Date();
    const currentPeriod = today.getFullYear() + (today.getMonth() + 1).toString().padStart(2, '0');
    const period = typeof searchParams.period === 'string' ? searchParams.period : currentPeriod;

    const data = await getIT1Data(period);
    const aFavor = data.saldoAFavor > 0;

    return (
        <div className="flex flex-col gap-8 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Declaración IT-1</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Resumen de ITBIS para el periodo {formatItbisPeriod(data.period)}.</p>
                </div>
                <PeriodSelector currentPeriod={data.period} tab="IT1" basePath="/reports/it1" />
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard
                    icon="arrow_upward"
                    tone="blue"
                    label="ITBIS Facturado (607)"
                    value={data.itbisFacturado}
                    note="Impuesto cobrado a clientes. No cuenta borradores."
                />
                <StatCard
                    icon="arrow_downward"
                    tone="orange"
                    label="ITBIS Pagado (606)"
                    value={data.itbisPagado}
                    note="Impuesto deducible en compras"
                />
                <StatCard
                    icon="account_balance_wallet"
                    tone="emerald"
                    label="Retenciones ITBIS"
                    value={data.retencionesITBIS}
                    note="Retenido por clientes al pagarte este mes"
                />
                <StatCard
                    icon="history"
                    tone="violet"
                    label="A favor de meses anteriores"
                    value={data.saldoAFavorPrevio}
                    note="Credito que entra a este periodo"
                />
            </div>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">Cálculo de Liquidación</h4>
                    <p className="text-sm text-slate-400">Cifras estimadas para fines informativos.</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <LineItem label="ITBIS de Ventas" value={data.itbisFacturado} tone="primary" />
                    <LineItem label="(-) ITBIS Deducible en Compras" value={-data.itbisPagado} tone="orange" />
                    <LineItem label="(-) Retenciones ITBIS recibidas" value={-data.retencionesITBIS} tone="emerald" />
                    <LineItem label="Saldo del mes" value={data.balance} tone="muted" strong />
                    <LineItem
                        label="(-) Saldo a favor arrastrado"
                        value={-data.saldoAFavorPrevio}
                        tone="violet"
                        note={data.saldoAFavorPrevio > 0 ? "Sobrante de periodos anteriores, sin usar." : "No venia credito de antes."}
                    />

                    <div className={clsx(
                        "p-6 flex justify-between items-center",
                        aFavor ? "bg-emerald-50/30 dark:bg-emerald-900/10" : "bg-blue-50/30 dark:bg-blue-900/10"
                    )}>
                        <div>
                            <span className="text-slate-900 dark:text-white font-bold text-lg">
                                Saldo {aFavor ? 'a Favor' : 'a Pagar'}
                            </span>
                            {aFavor ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Se arrastra al próximo periodo, no se pierde.
                                </p>
                            ) : null}
                        </div>
                        <span className={clsx(
                            "font-black text-2xl font-numeric",
                            aFavor ? "text-emerald-600" : "text-primary"
                        )}>
                            RD${formatCurrency(aFavor ? data.saldoAFavor : data.aPagar)}
                        </span>
                    </div>
                </div>
                <div className="p-6 bg-blue-50/50 dark:bg-blue-900/10 flex gap-4 border-t border-blue-100 dark:border-blue-900/30">
                    <span className="material-icons-round text-blue-500">info</span>
                    <div>
                        <h5 className="text-sm font-bold text-blue-700 dark:text-blue-400">Nota Informativa</h5>
                        <p className="text-sm text-blue-600 dark:text-blue-400/80 leading-relaxed mt-1">
                            Este reporte agrupa los datos registrados en el sistema. El ITBIS facturado y el deducible
                            van por la fecha del documento; las retenciones, por la fecha del pago, que es cuando se
                            practican. Las facturas en borrador no suman hasta que las emitas.
                        </p>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col gap-4">
                    <div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Acumulado del año</h4>
                        <p className="text-sm text-slate-400">De enero a {formatItbisPeriod(data.period).toLowerCase()}.</p>
                    </div>
                    <dl className="flex flex-col gap-2 text-sm">
                        <SummaryRow label="Facturado" value={data.yearToDate.itbisFacturado} />
                        <SummaryRow label="Deducible" value={data.yearToDate.itbisPagado} />
                        <SummaryRow label="Retenciones ITBIS" value={data.yearToDate.retencionesITBIS} />
                        <SummaryRow label="Pagado en el año" value={data.yearToDate.aPagar} strong />
                    </dl>
                </div>

                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Cómo se llegó hasta aquí</h4>
                        <p className="text-sm text-slate-400">Los meses anteriores con movimiento y el credito que dejó cada uno.</p>
                    </div>
                    {data.history.length === 0 ? (
                        <p className="p-6 text-sm text-slate-400 italic">No hay periodos anteriores registrados.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-left">
                                    <th className="px-6 py-3 font-semibold text-slate-600 dark:text-slate-300">Periodo</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 dark:text-slate-300 text-right">Saldo del mes</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 dark:text-slate-300 text-right">Pagado</th>
                                    <th className="px-6 py-3 font-semibold text-slate-600 dark:text-slate-300 text-right">Quedó a favor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {data.history.map((row) => (
                                    <tr key={row.period} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-300">{formatItbisPeriod(row.period)}</td>
                                        <td className="px-6 py-3 text-right font-numeric text-slate-500">{formatCurrency(row.balance)}</td>
                                        <td className="px-6 py-3 text-right font-numeric font-bold text-slate-700 dark:text-slate-300">{formatCurrency(row.aPagar)}</td>
                                        <td className={clsx(
                                            "px-6 py-3 text-right font-numeric font-bold",
                                            row.saldoAFavor > 0 ? "text-emerald-600" : "text-slate-300 dark:text-slate-600"
                                        )}>
                                            {formatCurrency(row.saldoAFavor)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
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

const TONES = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    orange: "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
    emerald: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    violet: "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400",
} as const;

function StatCard({ icon, tone, label, value, note }: {
    icon: string;
    tone: keyof typeof TONES;
    label: string;
    value: number;
    note: string;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
            <div className={clsx("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", TONES[tone])}>
                <span className="material-icons-round">{icon}</span>
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                <h3 className="text-2xl font-bold mt-0.5 font-numeric">RD${formatCurrency(value)}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{note}</p>
            </div>
        </div>
    );
}

const LINE_TONES = {
    primary: "text-primary",
    orange: "text-orange-600",
    emerald: "text-emerald-600",
    violet: "text-violet-600",
    muted: "text-slate-700 dark:text-slate-200",
} as const;

function LineItem({ label, value, tone, note, strong = false }: {
    label: string;
    value: number;
    tone: keyof typeof LINE_TONES;
    note?: string;
    strong?: boolean;
}) {
    return (
        <div className="p-6 flex justify-between items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div>
                <span className={clsx("text-slate-600 dark:text-slate-300", strong ? "font-bold" : "font-medium")}>{label}</span>
                {note ? <p className="text-xs text-slate-400 mt-0.5">{note}</p> : null}
            </div>
            <span className={clsx("font-bold font-numeric shrink-0", LINE_TONES[tone])}>
                RD${formatCurrency(value)}
            </span>
        </div>
    );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
    return (
        <div className={clsx(
            "flex justify-between items-baseline gap-3",
            strong && "border-t border-slate-100 dark:border-slate-800 pt-2 mt-1"
        )}>
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={clsx("font-numeric shrink-0", strong ? "font-black text-slate-900 dark:text-white" : "font-bold text-slate-600 dark:text-slate-300")}>
                RD${formatCurrency(value)}
            </dd>
        </div>
    );
}
