"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteQuotation, convertQuotationToInvoice, convertQuotationToProject, duplicateQuotation } from "@/app/actions";
import { useRouter } from "next/navigation";
import clsx from "clsx";

function quotationStatusLabel(status: string) {
    return status === "SENT" ? "Enviada" :
        status === "WAITING" ? "En Espera" :
            status === "ACCEPTED" ? "Aprobada" :
                status === "INVOICED" ? "Facturada" :
                    status === "REJECTED" ? "Rechazada" : "Borrador";
}

function quotationStatusClass(status: string) {
    return clsx(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-widest",
        {
            "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/40 dark:text-blue-300": status === "SENT",
            "bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-300": status === "WAITING",
            "bg-green-50 text-green-700 border-green-100 dark:bg-green-900/40 dark:text-green-300": status === "ACCEPTED",
            "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300": status === "INVOICED",
            "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/40 dark:text-red-300": status === "REJECTED",
            "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800": status === "DRAFT" || !status,
        }
    );
}

export function QuotationsTable({ quotations }: { quotations: any[] }) {
    const router = useRouter();
    const [submittingInvoice, setSubmittingInvoice] = useState<number | null>(null);
    const [submittingProject, setSubmittingProject] = useState<number | null>(null);
    const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

    const handleDuplicate = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (duplicatingId) return;

        if (!confirm("¿Deseas duplicar esta cotización? Se creará una nueva copia en estado Borrador.")) return;

        setDuplicatingId(id);
        try {
            const result = await duplicateQuotation(id);
            if (result.success) {
                router.push(`/quotations/${result.newId}/edit`);
            } else {
                alert(result.error || "Error al duplicar la cotización");
            }
        } catch (error) {
            console.error("Error duplicating quotation:", error);
            alert("Error inesperado al duplicar");
        } finally {
            setDuplicatingId(null);
        }
    };

    const handleConvertInvoice = async (id: number) => {
        if (!confirm("¿Estás seguro de convertir esta cotización en una factura?")) return;

        setSubmittingInvoice(id);
        try {
            const result = await convertQuotationToInvoice(id);
            if (result.success) {
                router.push(`/invoices/${result.invoiceId}/edit`);
            } else {
                alert(result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Error al convertir a factura");
        } finally {
            setSubmittingInvoice(null);
        }
    };

    const handleConvertProject = async (id: number) => {
        if (!confirm("Esta cotización se marcará como Aceptada y se creará un nuevo Proyecto con el presupuesto correspondiente. ¿Continuar?")) return;

        setSubmittingProject(id);
        try {
            const result = await convertQuotationToProject(id);
            if (result.success) {
                router.push(`/projects/${result.projectId}/edit`);
            } else {
                alert(result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Error al crear el proyecto");
        } finally {
            setSubmittingProject(null);
        }
    };

    if (quotations.length === 0) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-20">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300 dark:bg-slate-950">
                    <span className="material-icons-round text-4xl">request_quote</span>
                </div>
                <p className="font-bold text-slate-900 dark:text-white">No hay cotizaciones</p>
                <p className="mt-1 text-xs text-slate-500">Comienza creando una nueva oferta para tus clientes.</p>
                <Link href="/quotations/new">
                    <button className="mt-6 rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                        Nueva Cotización
                    </button>
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="space-y-3 md:hidden">
                {quotations.map((quote) => (
                    <article
                        key={quote.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                        onClick={() => router.push(`/quotations/${quote.id}`)}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-mono text-sm font-black uppercase text-slate-900 dark:text-white">#{quote.number}</p>
                                <p className="mt-1 truncate text-xs font-medium text-slate-500">{quote.contact?.name ?? "Sin cliente"}</p>
                                <p className="mt-1 text-[10px] text-slate-400">{new Date(quote.date).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-mono text-sm font-black text-slate-900 dark:text-white">RD${formatCurrency(quote.total)}</p>
                                <span className={clsx("mt-2", quotationStatusClass(quote.status))}>
                                    {quotationStatusLabel(quote.status)}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-1 border-t border-slate-100 pt-3 text-slate-400 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                            <a href={`/api/quotations/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800" title="Exportar PDF">
                                <span className="material-icons-round text-[20px]">picture_as_pdf</span>
                            </a>
                            {quote.status !== "INVOICED" && (
                                <button className="rounded-lg p-2 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30" onClick={() => handleConvertInvoice(quote.id)} disabled={submittingInvoice === quote.id} title="Convertir a Factura">
                                    <span className={clsx("material-icons-round text-[20px]", { "animate-spin": submittingInvoice === quote.id })}>
                                        {submittingInvoice === quote.id ? "sync" : "receipt_long"}
                                    </span>
                                </button>
                            )}
                            {quote.status === "ACCEPTED" && (
                                <button className="rounded-lg p-2 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30" onClick={() => handleConvertProject(quote.id)} disabled={submittingProject === quote.id} title="Crear Proyecto">
                                    <span className={clsx("material-icons-round text-[20px]", { "animate-spin": submittingProject === quote.id })}>
                                        {submittingProject === quote.id ? "sync" : "folder_special"}
                                    </span>
                                </button>
                            )}
                            <button className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" onClick={(e) => handleDuplicate(e, quote.id)} disabled={duplicatingId === quote.id} title="Duplicar">
                                <span className={clsx("material-icons-round text-[20px]", { "animate-spin": duplicatingId === quote.id })}>
                                    {duplicatingId === quote.id ? "sync" : "content_copy"}
                                </span>
                            </button>
                            <Link href={`/quotations/${quote.id}/edit`} className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" title="Editar">
                                <span className="material-icons-round text-[20px]">edit</span>
                            </Link>
                            <DeleteButton id={quote.id} action={deleteQuotation} variant="ghost_icon" />
                        </div>
                    </article>
                ))}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 md:block">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                            <th className="px-6 py-4">Referencia</th>
                            <th className="px-6 py-4">Cliente</th>
                            <th className="px-6 py-4 text-center hidden md:table-cell">Emisión</th>
                            <th className="px-6 py-4 text-center hidden sm:table-cell">Estado</th>
                            <th className="px-6 py-4 text-right">Monto Total</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {quotations.map((quote) => (
                            <tr key={quote.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => router.push(`/quotations/${quote.id}`)}>
                                <td className="px-6 py-5">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white font-mono uppercase">#{quote.number}</span>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="flex w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 items-center justify-center text-[10px] font-black uppercase">
                                            {quote.contact?.name?.substring(0, 2) ?? "??"}
                                        </div>
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{quote.contact?.name ?? "Sin cliente"}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-center hidden md:table-cell">
                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">{new Date(quote.date).toLocaleDateString()}</span>
                                </td>
                                <td className="px-6 py-5 text-center hidden sm:table-cell">
                                    <span className={quotationStatusClass(quote.status)}>
                                        {quotationStatusLabel(quote.status)}
                                    </span>
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <span className="text-sm font-black text-slate-900 dark:text-white font-mono tabular-nums">RD${formatCurrency(quote.total)}</span>
                                </td>
                                <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1 text-slate-400">
                                        <a href={`/api/quotations/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600 rounded-lg transition-all" title="Exportar PDF">
                                            <span className="material-icons-round text-lg">picture_as_pdf</span>
                                        </a>
                                        {quote.status !== "INVOICED" && (
                                            <button className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 rounded-lg transition-all" onClick={() => handleConvertInvoice(quote.id)} disabled={submittingInvoice === quote.id} title="Convertir a Factura">
                                                <span className={clsx("material-icons-round text-lg", { "animate-spin": submittingInvoice === quote.id })}>
                                                    {submittingInvoice === quote.id ? "sync" : "receipt_long"}
                                                </span>
                                            </button>
                                        )}
                                        {quote.status === "ACCEPTED" && (
                                            <button className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 rounded-lg transition-all" onClick={() => handleConvertProject(quote.id)} disabled={submittingProject === quote.id} title="Crear Proyecto">
                                                <span className={clsx("material-icons-round text-lg", { "animate-spin": submittingProject === quote.id })}>
                                                    {submittingProject === quote.id ? "sync" : "folder_special"}
                                                </span>
                                            </button>
                                        )}
                                        <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all" onClick={(e) => handleDuplicate(e, quote.id)} disabled={duplicatingId === quote.id} title="Duplicar">
                                            <span className={clsx("material-icons-round text-lg", { "animate-spin": duplicatingId === quote.id })}>
                                                {duplicatingId === quote.id ? "sync" : "content_copy"}
                                            </span>
                                        </button>
                                        <Link href={`/quotations/${quote.id}/edit`} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all" title="Editar">
                                            <span className="material-icons-round text-lg">edit</span>
                                        </Link>
                                        <DeleteButton id={quote.id} action={deleteQuotation} variant="ghost_icon" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
