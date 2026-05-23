import { getCompanySettings, getReportData } from "@/app/actions";
import { FileDown, Calendar, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/reports/ExportButton";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { formatCurrency } from "@/lib/format";

export default async function ReportsPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const today = new Date();
    const currentPeriod = today.getFullYear() + (today.getMonth() + 1).toString().padStart(2, '0');
    const period = typeof searchParams.period === 'string' ? searchParams.period : currentPeriod;
    const tab = searchParams.tab === '607' ? '607' : '606';

    const [{ purchases, invoices }, companySettings] = await Promise.all([
        getReportData(period),
        getCompanySettings()
    ]);

    const formatPeriod = (p: string) => {
        const year = p.substring(0, 4);
        const month = p.substring(4, 6);
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Reportes DGII</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Genera y exporta tus formatos 606 y 607 para el cumplimiento fiscal.</p>
                </div>

                <PeriodSelector currentPeriod={period} tab={tab} />
            </header>

            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-fit border border-slate-200 dark:border-slate-800 shadow-sm">
                <Link
                    href={`/reports?period=${period}&tab=606`}
                    className={clsx(
                        "px-8 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                        tab === '606'
                            ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-200 dark:border-slate-600"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    <span className="material-icons-round text-lg">arrow_downward</span>
                    606 - Compras
                </Link>
                <Link
                    href={`/reports?period=${period}&tab=607`}
                    className={clsx(
                        "px-8 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                        tab === '607'
                            ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-200 dark:border-slate-600"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    <span className="material-icons-round text-lg">arrow_upward</span>
                    607 - Ventas
                </Link>
            </div>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            Resumen de {tab === '606' ? 'Compras' : 'Ventas'}
                        </h3>
                        <p className="text-sm text-slate-400 tracking-wide uppercase font-semibold mt-0.5">
                            Periodo: {formatPeriod(period)}
                        </p>
                    </div>
                    <ExportButton
                        type={tab as any}
                        data={tab === '606' ? purchases : invoices}
                        period={period}
                        companyTaxId={companySettings.taxId}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                                <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">RNC/Cédula</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden sm:table-cell">{tab === '606' ? 'Tipo' : 'NCF'}</th>
                                {tab === '606' && <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden xs:table-cell">NCF</th>}
                                <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden md:table-cell">Fecha DGII</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden lg:table-cell">Estado</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Monto</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">ITBIS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {tab === '606' ? (
                                purchases.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-medium">No hay compras registradas para este periodo.</td></tr>
                                ) : (
                                    purchases.map((p) => {
                                        const purchaseTaxId = p.contact?.taxId || p.supplierTaxId;
                                        const isMissingData = !p.ncf || !purchaseTaxId || purchaseTaxId === '999999999';
                                        return (
                                            <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 md:px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-numeric text-slate-600 dark:text-slate-400">{purchaseTaxId || '999999999'}</span>
                                                        {isMissingData && <span className="material-icons-round text-amber-500 text-[14px]" title="Datos fiscales incompletos">warning</span>}
                                                    </div>
                                                </td>
                                                <td className="px-4 md:px-6 py-4 hidden sm:table-cell">
                                                    <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md text-[10px] font-black border border-blue-100 dark:border-blue-800 uppercase tracking-tighter">
                                                        {p.type === 'FORMAL' ? 'B01' : 'Inf'}
                                                    </span>
                                                </td>
                                                <td className="px-4 md:px-6 py-4 font-numeric text-[11px] text-slate-500 tracking-wider uppercase font-bold hidden xs:table-cell">{p.ncf || '-'}</td>
                                                <td className="px-4 md:px-6 py-4 font-numeric text-slate-400 text-xs hidden md:table-cell">{new Date(p.date).toLocaleDateString('en-GB').split('/').reverse().join('')}</td>
                                                <td className="px-4 md:px-6 py-4 hidden lg:table-cell">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-black border uppercase tracking-wider ${p.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                                        p.status === 'PARTIAL' ? 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300' :
                                                            'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800'
                                                        }`}>
                                                        {p.status === 'PAID' ? 'Saldada' : p.status === 'PARTIAL' ? 'Parcial' : 'Pend.'}
                                                    </span>
                                                </td>
                                                <td className="px-4 md:px-6 py-4 text-right font-numeric font-bold text-slate-700 dark:text-slate-300">RD${formatCurrency(p.subtotal)}</td>
                                                <td className="px-4 md:px-6 py-4 text-right font-numeric font-bold text-primary">RD${formatCurrency(p.tax)}</td>
                                            </tr>
                                        );
                                    })
                                )
                            ) : (
                                invoices.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-medium">No hay ventas registradas para este periodo.</td></tr>
                                ) : (
                                    invoices.map((inv) => {
                                        const invoiceTaxId = inv.contact?.taxId;
                                        const isMissingData = !inv.ncf || !invoiceTaxId || invoiceTaxId === '999999999';
                                        return (
                                            <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 md:px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-numeric text-slate-600 dark:text-slate-400">{invoiceTaxId || '999999999'}</span>
                                                        {isMissingData && <span className="material-icons-round text-amber-500 text-[14px]" title="Datos fiscales incompletos">warning</span>}
                                                    </div>
                                                </td>
                                                <td className="px-4 md:px-6 py-4 font-numeric text-[11px] text-slate-500 tracking-wider uppercase font-bold hidden sm:table-cell">{inv.ncf || '-'}</td>
                                                <td className="px-4 md:px-6 py-4 font-numeric text-slate-400 text-xs hidden md:table-cell">{new Date(inv.date).toLocaleDateString('en-GB').split('/').reverse().join('')}</td>
                                                <td className="px-4 md:px-6 py-4 hidden lg:table-cell">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-black border uppercase tracking-wider ${inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                                        inv.status === 'PARTIAL' ? 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300' :
                                                            'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800'
                                                        }`}>
                                                        {inv.status === 'PAID' ? 'Saldada' : inv.status === 'PARTIAL' ? 'Parcial' : 'Pend.'}
                                                    </span>
                                                </td>
                                                <td className="px-4 md:px-6 py-4 text-right font-numeric font-bold text-slate-700 dark:text-slate-300">RD${formatCurrency(inv.subtotal)}</td>
                                                <td className="px-4 md:px-6 py-4 text-right font-numeric font-bold text-primary">RD${formatCurrency(inv.tax)}</td>
                                            </tr>
                                        );
                                    })
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

import clsx from "clsx";
