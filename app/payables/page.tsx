"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPayables } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { PaymentDialog } from "@/components/payments/PaymentDialog";

const months = [
    ["1", "Ene"],
    ["2", "Feb"],
    ["3", "Mar"],
    ["4", "Abr"],
    ["5", "May"],
    ["6", "Jun"],
    ["7", "Jul"],
    ["8", "Ago"],
    ["9", "Sep"],
    ["10", "Oct"],
    ["11", "Nov"],
    ["12", "Dic"],
];

export default function PayablesPage() {
    const [payables, setPayables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
    const [yearFilter, setYearFilter] = useState("");
    const [monthFilter, setMonthFilter] = useState("");
    const currentYear = new Date().getFullYear();

    function selectedPeriod() {
        const month = monthFilter ? Number(monthFilter) : undefined;
        const year = yearFilter ? Number(yearFilter) : month ? currentYear : undefined;
        return { month, year };
    }

    useEffect(() => {
        loadPayables();
    }, [yearFilter, monthFilter]);

    async function loadPayables() {
        setLoading(true);
        try {
            const data = await getPayables(selectedPeriod());
            setPayables(data);
        } catch (error) {
            console.error("Error loading payables:", error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    );

    const years = Array.from({ length: 8 }, (_, index) => String(currentYear + 1 - index));
    const filteredPayables = payables;
    const totalPending = filteredPayables.reduce((acc, curr) => acc + (curr.total - curr.paidAmount), 0);

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Cuentas por Pagar</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Gestión de obligaciones con proveedores y gastos pendientes.</p>
                </div>
                <div className="bg-white dark:bg-slate-900 px-6 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                        <span className="material-icons-round">payments</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pendiente</p>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white font-numeric">RD${formatCurrency(totalPending)}</h2>
                    </div>
                </div>
            </header>

            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 px-1">
                    <span className="material-icons-round text-lg text-slate-400">filter_list</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                        {filteredPayables.length} {filteredPayables.length === 1 ? "cuenta por pagar" : "cuentas por pagar"}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <option value="">Todos los anos</option>
                        {years.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <option value="">Todos los meses</option>
                        {months.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    {(yearFilter || monthFilter) && (
                        <button type="button" onClick={() => { setYearFilter(""); setMonthFilter(""); }} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-3 md:hidden">
                {filteredPayables.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-900/30">
                            <span className="material-icons-round">payments</span>
                        </div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">No hay cuentas por pagar</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No encontramos obligaciones pendientes con esos filtros.</p>
                    </div>
                ) : (
                    filteredPayables.map((p) => {
                        const supplierName = p.contact?.name || p.supplierName || "Proveedor Informal";
                        const pendingAmount = p.total - p.paidAmount;

                        return (
                            <article
                                key={p.id}
                                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
                                                <span className="material-icons-round text-[20px]">storefront</span>
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{supplierName}</p>
                                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                    {p.number || "Compra"} · {p.ncf || "SIN NCF"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                            <span className="inline-flex items-center gap-1">
                                                <span className="material-icons-round text-sm">calendar_today</span>
                                                {new Date(p.date).toLocaleDateString()}
                                            </span>
                                            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500 dark:bg-slate-800">
                                                {p.status === "PAID" ? "Saldada" : p.status === "PARTIAL" ? "Parcial" : "Pendiente"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pendiente</p>
                                        <p className="font-mono text-base font-black text-orange-600 dark:text-orange-300">RD${formatCurrency(pendingAmount)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                                    <div>
                                        <p className="text-[9px] font-black uppercase text-slate-400">Total</p>
                                        <p className="mt-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">RD${formatCurrency(p.total)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase text-slate-400">Pagado</p>
                                        <p className="mt-1 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">RD${formatCurrency(p.paidAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase text-slate-400">Resta</p>
                                        <p className="mt-1 font-mono text-xs font-bold text-slate-900 dark:text-white">RD${formatCurrency(pendingAmount)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                                    <Link href={`/purchases/${p.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                                        <span className="material-icons-round text-[18px]">open_in_new</span>
                                        Ver compra
                                    </Link>
                                    <button
                                        onClick={() => setSelectedPurchase(p)}
                                        className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-orange-500/20"
                                    >
                                        Pagar
                                    </button>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>

            <div className="hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Factura / NCF</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Proveedor</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Fecha</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Total</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Pagado</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Pendiente</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right w-[100px]">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredPayables.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">
                                        No hay cuentas por pagar pendientes.
                                    </td>
                                </tr>
                            ) : (
                                filteredPayables.map((p) => {
                                    const supplierName = p.contact?.name || p.supplierName;

                                    return (
                                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 dark:text-white">{p.number || "Gasto/Compra"}</div>
                                            <div className="text-[11px] text-slate-400 font-numeric mt-0.5 tracking-wider">{p.ncf || "SIN NCF"}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                <span className="material-icons-round text-slate-400 text-sm">storefront</span>
                                                {supplierName || "Proveedor Informal"}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                <span className="material-icons-round text-slate-400 text-sm">calendar_today</span>
                                                <span className="text-xs font-numeric">
                                                    {new Date(p.date).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-numeric text-slate-600 dark:text-slate-400">
                                            RD${formatCurrency(p.total)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-numeric text-emerald-600 dark:text-emerald-400">
                                            RD${formatCurrency(p.paidAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold font-numeric text-slate-900 dark:text-white">
                                            RD${formatCurrency(p.total - p.paidAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedPurchase(p)}
                                                className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white text-xs font-bold transition-all border border-orange-100 dark:bg-orange-900/20 dark:border-orange-900/40"
                                            >
                                                PAGAR
                                            </button>
                                        </td>
                                    </tr>
                                )})
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedPurchase && (
                <PaymentDialog
                    isOpen={!!selectedPurchase}
                    onClose={() => setSelectedPurchase(null)}
                    targetId={selectedPurchase.id}
                    targetType="PURCHASE"
                    total={selectedPurchase.total}
                    subtotal={selectedPurchase.subtotal}
                    tax={selectedPurchase.tax}
                    paidAmount={selectedPurchase.paidAmount}
                    number={selectedPurchase.number || "Compra #" + selectedPurchase.id}
                    entityName={selectedPurchase.contact?.name || selectedPurchase.supplierName || "Proveedor Informal"}
                    onSuccess={() => loadPayables()}
                />
            )}
        </div>
    );
}
