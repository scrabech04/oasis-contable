"use client";

import { useState } from "react";
import { CreditCard, Pencil, Trash2, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { deletePayment } from "@/app/actions";
import { useRouter } from "next/navigation";

interface Payment {
    id: number;
    amount: number;
    date: Date | string; // Handle both due to serialization
    method: string;
    withholdings: any[];
}

interface InvoicePaymentsManagerProps {
    invoice: any; // Using any for simplicity as strictly typing full Prisma objects on client can be verbose, but ideally should be typed
}

export function InvoicePaymentsManager({ invoice }: InvoicePaymentsManagerProps) {
    const router = useRouter();
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
    const payments = invoice.payments || [];

    // Calculate totals for display within this manager if needed, 
    // though the main page likely shows them. 
    // We mainly need this for the "Pagos Registrados" list.

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm no-print">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                        <CreditCard size={18} />
                    </div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pagos Registrados</h2>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setEditingPayment(null);
                        setIsPaymentDialogOpen(true);
                    }}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                    <Plus size={14} /> Registrar Pago
                </button>
            </div>

            {payments.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Método</th>
                                <th className="px-4 py-3 text-right">Monto</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {payments.map((payment: Payment) => (
                                <tr key={payment.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                                        {new Date(payment.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                                        {payment.method}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                                        RD$ {formatCurrency(payment.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingPayment(payment);
                                                    setIsPaymentDialogOpen(true);
                                                }}
                                                className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                                title="Editar pago"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (confirm("¿Estás seguro de eliminar este pago?")) {
                                                        await deletePayment(payment.id);
                                                        router.refresh();
                                                    }
                                                }}
                                                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                                title="Eliminar pago"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Total Pagado</td>
                                <td className="px-4 py-3 text-right font-black text-emerald-600">
                                    RD$ {formatCurrency(payments.reduce((acc: number, p: Payment) => acc + p.amount, 0))}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="text-center py-8 text-slate-400 text-sm italic">
                    No hay pagos registrados para esta factura.
                </div>
            )}

            <PaymentDialog
                isOpen={isPaymentDialogOpen}
                onClose={() => setIsPaymentDialogOpen(false)}
                targetId={invoice.id}
                targetType="INVOICE"
                total={invoice.total}
                subtotal={invoice.subtotal} // Using invoice subtotal
                tax={invoice.tax}
                paidAmount={payments.reduce((acc: number, p: Payment) => acc + p.amount, 0)}
                number={invoice.number}
                entityName={invoice.client?.name || ""}
                onSuccess={() => {
                    router.refresh();
                }}
                initialPaymentData={editingPayment}
            />
        </div>
    );
}
