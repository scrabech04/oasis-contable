import { getInvoice, getCompanyIdentities, getCompanySettings } from "@/app/actions";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Edit2, ArrowLeft, DollarSign } from "lucide-react";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { InvoicePaymentsManager } from "@/components/invoices/InvoicePaymentsManager";
import { InvoiceViewer } from "@/components/invoices/InvoiceViewer";
import { ConvertToRecurringButton } from "@/components/invoices/ConvertToRecurringButton";
import { PrintableCoverPage, PrintableTermsPage } from "@/components/documents/PrintablePages";
import { AutoPrint } from "@/components/documents/AutoPrint";
import clsx from "clsx";

interface InvoiceDetailPageProps {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InvoiceDetailPage({ params, searchParams }: InvoiceDetailPageProps) {
    const { id } = await params;
    const query = searchParams ? await searchParams : {};
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
        notFound();
    }

    const [invoice, identities, companySettings] = await Promise.all([
        getInvoice(invoiceId),
        getCompanyIdentities(),
        getCompanySettings()
    ]);

    if (!invoice) {
        notFound();
    }

    const subtotal = invoice.subtotal;
    const tax = invoice.tax;
    const total = invoice.total;
    const pdfMode = query.pdf === "1" || query.pdf === "true";
    const printMode = query.print === "1" || query.print === "true";
    const includeCoverPage = query.cover === "1" || query.cover === "true";
    const includeTermsPage = query.terms === "1" || query.terms === "true";

    if (pdfMode) {
        return (
            <div className="mx-auto max-w-5xl bg-white text-slate-950 print:max-w-none">
                <AutoPrint enabled={printMode} />
                {includeCoverPage && (
                    <PrintableCoverPage document={invoice} company={companySettings} label="Factura" />
                )}
                <InvoiceViewer invoice={invoice} identities={identities} companySettings={companySettings} />
                {includeTermsPage && (
                    <PrintableTermsPage document={invoice} company={companySettings} />
                )}
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">
            {/* Header Actions */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
                <div className="flex items-center gap-4">
                    <Link href="/invoices">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            Factura {invoice.number}
                            <span className={clsx(
                                "text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-black border",
                                {
                                    "bg-emerald-50 text-emerald-600 border-emerald-100": invoice.status === "PAID",
                                    "bg-amber-50 text-amber-600 border-amber-100": invoice.status === "SENT",
                                    "bg-slate-50 text-slate-600 border-slate-100": invoice.status === "DRAFT",
                                    "bg-red-50 text-red-600 border-red-100": invoice.status === "OVERDUE",
                                }
                            )}>
                                {invoice.status}
                            </span>
                        </h1>
                        <p className="text-sm text-slate-500">Creada el {formatDate(invoice.date)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <DocumentActions
                        id={invoice.id}
                        docType="invoices"
                        includeCoverPage={invoice.includeCoverPage}
                        includeTermsPage={invoice.includeTermsPage}
                    />
                    <ConvertToRecurringButton invoiceId={invoice.id} />
                    <Link href={`/invoices/${invoice.id}/edit`}>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            <Edit2 className="h-4 w-4" /> Editar
                        </Button>
                    </Link>
                </div>
            </header>

            <InvoiceViewer invoice={invoice} identities={identities} companySettings={companySettings} />

            {/* Quick Stats/Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl flex items-center gap-4">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg text-emerald-600">
                        <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70">Pagado</p>
                        <p className="text-lg font-bold text-emerald-700 font-mono">RD$ {formatCurrency(invoice.paidAmount)}</p>
                    </div>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl flex items-center gap-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600">
                        <ArrowLeft className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/70">Balance Pendiente</p>
                        <p className="text-lg font-bold text-blue-700 font-mono">RD$ {formatCurrency(total - invoice.paidAmount)}</p>
                    </div>
                </div>
            </div>

            {/* Payments Manager Section */}
            <InvoicePaymentsManager invoice={invoice} />
        </div>
    );
}


