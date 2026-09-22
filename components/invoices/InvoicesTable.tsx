"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteInvoice, duplicateInvoice, updateInvoiceStatus } from "@/app/actions";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { ConvertToRecurringButton } from "@/components/invoices/ConvertToRecurringButton";
import { useToast } from "@/components/ui/toast";

/**
 * El rotulo era una cadena de ternarios sin rama para `OPEN`, asi que toda factura que no
 * estuviera cobrada se pintaba "Borrador" — incluso las que el servidor ya habia puesto en
 * pendiente. Cada estado tiene ahora su propio caso.
 */
function invoiceStatusLabel(status: string | null | undefined) {
    return status === "PAID" ? "Saldada" :
        status === "PARTIAL" ? "Parcial" :
            status === "OPEN" ? "Pendiente" : "Borrador";
}

function invoiceStatusClass(status: string | null | undefined) {
    return {
        "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300": status === "PAID",
        "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300": status === "PARTIAL",
        "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/40 dark:text-blue-300": status === "OPEN",
        "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800": status === "DRAFT" || !status,
    };
}

const INVOICE_MANUAL_STATUSES = ["DRAFT", "OPEN"];

/**
 * El estado se cambia desde el listado, sin abrir la factura, igual que en cotizaciones.
 *
 * Solo cuando no hay cobros: con un pago encima el estado lo manda lo cobrado, y dejar
 * elegirlo seria ofrecer algo que el proximo recalculo deshace. En ese caso se pinta el
 * badge de siempre, sin select.
 */
function InvoiceStatusSelect({ invoice, className }: {
    invoice: { id: number; status?: string | null; paidAmount?: number | null };
    className: string;
}) {
    const router = useRouter();
    const toast = useToast();
    const [status, setStatus] = useState<string>(invoice.status || "DRAFT");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setStatus(invoice.status || "DRAFT");
    }, [invoice.status]);

    if ((invoice.paidAmount || 0) > 0) {
        return (
            <span className={clsx(className, invoiceStatusClass(invoice.status))}>
                {invoiceStatusLabel(invoice.status)}
            </span>
        );
    }

    const handleChange = async (next: string) => {
        const previous = status;
        setStatus(next);
        setSaving(true);
        try {
            const result = await updateInvoiceStatus(invoice.id, next);
            if (!result.success) {
                setStatus(previous);
                toast.error("No se pudo cambiar el estado", result.error);
                return;
            }
            router.refresh();
        } catch (error) {
            console.error("Error updating invoice status:", error);
            setStatus(previous);
            toast.error("No se pudo cambiar el estado", "Revisa tu conexion e intenta de nuevo.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <span className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
            <select
                value={status}
                disabled={saving}
                onChange={(e) => handleChange(e.target.value)}
                title="Cambiar estado"
                className={clsx(
                    className,
                    invoiceStatusClass(status),
                    "cursor-pointer appearance-none pr-6 outline-none focus:ring-2 focus:ring-blue-500",
                    saving && "cursor-wait opacity-60"
                )}
            >
                {INVOICE_MANUAL_STATUSES.map((value) => (
                    <option key={value} value={value} className="font-sans text-xs normal-case tracking-normal text-slate-900">
                        {invoiceStatusLabel(value)}
                    </option>
                ))}
            </select>
            <span className="material-icons-round pointer-events-none absolute right-1 text-[12px] opacity-60">
                {saving ? "sync" : "expand_more"}
            </span>
        </span>
    );
}

export function InvoicesTable({ invoices }: { invoices: any[] }) {
    const router = useRouter();
    const toast = useToast();
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
                toast.error("No se pudo duplicar la factura", result.error);
            }
        } catch (error) {
            console.error("Error duplicating invoice:", error);
            toast.error("No se pudo duplicar la factura", "Revisa tu conexion e intenta de nuevo.");
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
                                <p className="text-sm font-black text-slate-900 dark:text-white">
                                    {invoice.ncf ? <span className="font-numeric tracking-tight">{invoice.ncf}</span> : <>#{invoice.number}</>}
                                </p>
                                {invoice.contact?.id ? (
                                    <Link
                                        href={`/contacts/${invoice.contact.id}`}
                                        onClick={(event) => event.stopPropagation()}
                                        className="mt-1 block truncate text-xs font-bold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
                                    >
                                        {invoice.contact.name}
                                    </Link>
                                ) : (
                                    <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">Sin cliente</p>
                                )}
                                {invoice.ncf && (
                                    <p className="mt-1 text-[10px] font-medium tracking-tight text-slate-400">#{invoice.number}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                    RD${formatCurrency(invoice.total)}
                                </p>
                                <span className="mt-2 inline-flex">
                                    <InvoiceStatusSelect
                                        invoice={invoice}
                                        className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                                    />
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                            <span className="text-xs font-medium text-slate-500">
                                {new Date(invoice.date).toLocaleDateString(undefined, { timeZone: "UTC" })}
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
                                <ConvertToRecurringButton invoiceId={invoice.id} mode="icon" />
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
                            <th className="px-4 md:px-6 py-4">NCF / Ref.</th>
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
                                        {invoice.ncf ? (
                                            <>
                                                <span className="text-xs md:text-sm font-numeric font-black text-slate-900 dark:text-white tracking-tight">{invoice.ncf}</span>
                                                <span className="text-[10px] md:text-xs font-medium text-slate-400">#{invoice.number}</span>
                                            </>
                                        ) : (
                                            <span className="text-xs md:text-sm font-semibold text-slate-900 dark:text-white">#{invoice.number}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 md:px-6 py-4 md:py-5">
                                    <div className="flex items-center gap-2 md:gap-3">
                                        <div className="hidden xs:flex w-7 h-7 md:w-8 md:h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-primary items-center justify-center text-[10px] md:text-xs font-bold uppercase">
                                            {invoice.contact?.name?.substring(0, 2) || "?"}
                                        </div>
                                        {invoice.contact?.id ? (
                                            <Link
                                                href={`/contacts/${invoice.contact.id}`}
                                                onClick={(event) => event.stopPropagation()}
                                                className="max-w-[80px] truncate text-xs font-bold text-slate-700 transition hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-300 md:max-w-[150px] md:text-sm"
                                            >
                                                {invoice.contact.name}
                                            </Link>
                                        ) : (
                                            <span className="max-w-[80px] truncate text-xs font-medium text-slate-700 dark:text-slate-300 md:max-w-[150px] md:text-sm">Sin cliente</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-center hidden md:table-cell">
                                    <span className="text-sm text-slate-600 dark:text-slate-400 font-numeric">{new Date(invoice.date).toLocaleDateString(undefined, { timeZone: "UTC" })}</span>
                                </td>
                                <td className="px-6 py-5 text-center hidden sm:table-cell">
                                    <InvoiceStatusSelect
                                        invoice={invoice}
                                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider"
                                    />
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
                                        <ConvertToRecurringButton invoiceId={invoice.id} mode="icon" />
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
