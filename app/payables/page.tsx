"use client";

import { useEffect, useState } from "react";
import { getPayables, recordPayment } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, DollarSign, Calendar, Truck, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentDialog } from "@/components/payments/PaymentDialog";

export default function PayablesPage() {
    const [payables, setPayables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPurchase, setSelectedPurchase] = useState<any>(null);

    useEffect(() => {
        loadPayables();
    }, []);

    async function loadPayables() {
        setLoading(true);
        try {
            const data = await getPayables();
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

    const totalPending = payables.reduce((acc, curr) => acc + (curr.total - curr.paidAmount), 0);

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

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
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
                            {payables.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">
                                        No hay cuentas por pagar pendientes.
                                    </td>
                                </tr>
                            ) : (
                                payables.map((p) => {
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
