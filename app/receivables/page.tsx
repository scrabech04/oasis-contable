"use client";

import { useEffect, useState } from "react";
import { getReceivables, recordPayment } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, DollarSign, Calendar, User, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default function ReceivablesPage() {
    const [receivables, setReceivables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [yearFilter, setYearFilter] = useState("");
    const [monthFilter, setMonthFilter] = useState("");

    useEffect(() => {
        loadReceivables();
    }, []);

    async function loadReceivables() {
        setLoading(true);
        try {
            const data = await getReceivables();
            setReceivables(data);
        } catch (error) {
            console.error("Error loading receivables:", error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    );

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 8 }, (_, index) => String(currentYear + 1 - index));
    const filteredReceivables = receivables.filter((item) => {
        if (!yearFilter && !monthFilter) return true;
        const date = new Date(item.dueDate || item.date);
        const selectedYear = yearFilter ? Number(yearFilter) : currentYear;
        if (date.getFullYear() !== selectedYear) return false;
        return monthFilter ? date.getMonth() + 1 === Number(monthFilter) : true;
    });
    const totalPending = filteredReceivables.reduce((acc, curr) => acc + (curr.total - curr.paidAmount), 0);

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Cuentas por Cobrar</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Gestión de facturas pendientes de cobro y seguimiento de clientes.</p>
                </div>
                <div className="bg-white dark:bg-slate-900 px-6 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <span className="material-icons-round">account_balance_wallet</span>
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
                        {filteredReceivables.length} {filteredReceivables.length === 1 ? "cuenta por cobrar" : "cuentas por cobrar"}
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

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Factura / NCF</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Cliente</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Vencimiento</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Total</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Pagado</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Pendiente</th>
                                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right w-[100px]">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredReceivables.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">
                                        No hay facturas pendientes de cobro.
                                    </td>
                                </tr>
                            ) : (
                                filteredReceivables.map((inv) => (
                                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 dark:text-white">{inv.number}</div>
                                            <div className="text-[11px] text-slate-400 font-numeric mt-0.5 tracking-wider">{inv.ncf || "SIN NCF"}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                <span className="material-icons-round text-slate-400 text-sm">person</span>
                                                {inv.client.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={clsx(
                                                    "material-icons-round text-sm",
                                                    new Date(inv.dueDate) < new Date() ? 'text-red-500' : 'text-slate-400'
                                                )}>calendar_today</span>
                                                <span className={clsx(
                                                    "text-xs",
                                                    new Date(inv.dueDate) < new Date() ? 'text-red-600 font-bold' : 'text-slate-600 dark:text-slate-400'
                                                )}>
                                                    {new Date(inv.dueDate).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-numeric text-slate-600 dark:text-slate-400">
                                            RD${formatCurrency(inv.total)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-numeric text-emerald-600 dark:text-emerald-400">
                                            RD${formatCurrency(inv.paidAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold font-numeric text-slate-900 dark:text-white">
                                            RD${formatCurrency(inv.total - inv.paidAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedInvoice(inv)}
                                                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white text-xs font-bold transition-all"
                                            >
                                                COBRAR
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedInvoice && (
                <PaymentDialog
                    isOpen={!!selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    targetId={selectedInvoice.id}
                    targetType="INVOICE"
                    total={selectedInvoice.total}
                    subtotal={selectedInvoice.subtotal}
                    tax={selectedInvoice.tax}
                    paidAmount={selectedInvoice.paidAmount}
                    number={selectedInvoice.number}
                    entityName={selectedInvoice.client.name}
                    onSuccess={() => loadReceivables()}
                />
            )}
        </div>
    );
}

import clsx from "clsx";
