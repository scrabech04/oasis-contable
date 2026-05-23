"use client";

import clsx from "clsx";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteInvoice, duplicateInvoice } from "@/app/actions";
import { PaymentDialog } from "@/components/payments/PaymentDialog";

export function InvoicesTable({ invoices }: { invoices: any[] }) {
    const router = useRouter();
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

    const handleDuplicate = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (duplicatingId) return;

        if (!confirm("¿Deseas duplicar esta factura? Se creará una nueva copia en estado Borrador.")) return;

        setDuplicatingId(id);
        try {
            const result = await duplicateInvoice(id);
            if (result.success) {
                router.push(`/invoices/${result.newId}/edit`);
            } else {
                alert(result.error || "Error al duplicar la factura");
            }
        } catch (error) {
            console.error("Error duplicating invoice:", error);
            alert("Error inesperado al duplicar");
        } finally {
            setDuplicatingId(null);
        }
    };

    return (
        <div>
            <div className="space-y-3 md:hidden">
                {invoices.map((invoice) => (
                    <article
                        key={invoice.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                        onClick={() => router.push(`/invoices/${invoice.id}`)}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 dark:text-white">#{invoice.number}</p>
                                <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {invoice.contact?.name || "Sin cliente"}
                                </p>
                                {invoice.ncf && (
                                    <p className="mt-1 text-[10px] font-bold tracking-tight text-slate-400">{invoice.ncf}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                    RD${formatCurrency(invoice.total)}
                                </p>
                                <span className={clsx(
                                    "mt-2 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                                    {
                                        "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300": invoice.status === "PAID",
                                        "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300": invoice.status === "PARTIAL",
                                        "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800": invoice.status === "DRAFT" || !invoice.status,
                                    }
                                )}>
                                    {invoice.status === "PAID" ? "Saldada" : invoice.status === "PARTIAL" ? "Parcial" : "Borrador"}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                            <span className="text-xs font-medium text-slate-500">
                                {new Date(invoice.date).toLocaleDateString()}
                            </span>
                            <div className="flex items-center gap-1 text-slate-400" onClick={(e) => e.stopPropagation()}>
                                <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800" title="Exportar PDF">
                                    <span className="material-icons-round text-[20px]">picture_as_pdf</span>
                                </a>
                                {invoice.status !== "PAID" && (
                                    <button className="rounded-lg p-2 hover:bg-blue-50 hover:text-primary dark:hover:bg-blue-900/30" onClick={() => setSelectedInvoice(invoice)} title="Registrar Cobro">
                                        <span className="material-icons-round text-[20px]">payments</span>
                                    </button>
                                )}
                                <button
                                    className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                                    onClick={(e) => handleDuplicate(e, invoice.id)}
                                    disabled={duplicatingId === invoice.id}
                                    title="Duplicar"
                                >
                                    <span className={clsx("material-icons-round text-[20px]", { "animate-spin": duplicatingId === invoice.id })}>
                                        {duplicatingId === invoice.id ? "sync" : "content_copy"}
                                    </span>
                                </button>
                                <Link href={`/invoices/${invoice.id}/edit`} className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" title="Editar">
                                    <span className="material-icons-round text-[20px]">edit</span>
                                </Link>
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                            <th className="px-4 md:px-6 py-4">Ref. / NCF</th>
                            <th className="px-4 md:px-6 py-4">Cliente</th>
                            <th className="px-6 py-4 text-center hidden md:table-cell">Fecha</th>
                            <th className="px-6 py-4 text-center hidden sm:table-cell">Estado</th>
                            <th className="px-4 md:px-6 py-4 text-right">Monto</th>
                            <th className="px-4 md:px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {invoices.map((invoice) => (
                            <tr
                                key={invoice.id}
                                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                                onClick={() => router.push(`/invoices/${invoice.id}`)}
                            >
                                <td className="px-4 md:px-6 py-4 md:py-5">
                                    <div className="flex flex-col">
                                        <span className="text-xs md:text-sm font-semibold text-slate-900 dark:text-white">#{invoice.number}</span>
                                        {invoice.ncf && (
                                            <span className="text-[10px] md:text-xs font-numeric font-bold text-slate-500 tracking-tighter">{invoice.ncf}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 md:px-6 py-4 md:py-5">
                                    <div className="flex items-center gap-2 md:gap-3">
                                        <div className="hidden xs:flex w-7 h-7 md:w-8 md:h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-primary items-center justify-center text-[10px] md:text-xs font-bold uppercase">
                                            {invoice.contact?.name?.substring(0, 2) || "?"}
                                        </div>
                                        <span className="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[80px] md:max-w-[150px]">{invoice.contact?.name || "Sin cliente"}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-center hidden md:table-cell">
                                    <span className="text-sm text-slate-600 dark:text-slate-400 font-numeric">{new Date(invoice.date).toLocaleDateString()}</span>
                                </td>
                                <td className="px-6 py-5 text-center hidden sm:table-cell">
                                    <span className={clsx(
                                        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider",
                                        {
                                            "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300": invoice.status === "PAID",
                                            "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300": invoice.status === "PARTIAL",
                                            "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800": invoice.status === "DRAFT" || !invoice.status,
                                        }
                                    )}>
                                        {invoice.status === "PAID" ? "Saldada" : invoice.status === "PARTIAL" ? "Parcial" : "Borrador"}
                                    </span>
                                </td>
                                <td className="px-4 md:px-6 py-4 md:py-5 text-right">
                                    <div className="flex flex-col items-end">
                                        <span className="text-sm md:text-base font-bold text-slate-900 dark:text-white font-numeric">RD${formatCurrency(invoice.total)}</span>
                                        {invoice.paidAmount > 0 && invoice.paidAmount < invoice.total && (
                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap hidden xs:block">Cobrado: RD${formatCurrency(invoice.paidAmount)}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 md:px-6 py-4 md:py-5 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-0.5 md:gap-1 text-slate-400">
                                        <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600 rounded-lg transition-all" title="Exportar PDF">
                                            <span className="material-icons-round text-[18px] md:text-[20px]">picture_as_pdf</span>
                                        </a>
                                        {invoice.status !== "PAID" && (
                                            <button className="p-1.5 md:p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-primary rounded-lg transition-all" onClick={() => setSelectedInvoice(invoice)} title="Registrar Cobro">
                                                <span className="material-icons-round text-[18px] md:text-[20px]">payments</span>
                                            </button>
                                        )}
                                        <button className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all" onClick={(e) => handleDuplicate(e, invoice.id)} disabled={duplicatingId === invoice.id} title="Duplicar">
                                            <span className={clsx("material-icons-round text-[18px] md:text-[20px]", { "animate-spin": duplicatingId === invoice.id })}>
                                                {duplicatingId === invoice.id ? "sync" : "content_copy"}
                                            </span>
                                        </button>
                                        <Link href={`/invoices/${invoice.id}/edit`} className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all" title="Editar">
                                            <span className="material-icons-round text-[18px] md:text-[20px]">edit</span>
                                        </Link>
                                        <DeleteButton id={invoice.id} action={deleteInvoice} variant="ghost_icon" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
                    entityName={selectedInvoice.contact?.name || "Sin cliente"}
                    onSuccess={() => router.refresh()}
                />
            )}
        </div>
    );
}
