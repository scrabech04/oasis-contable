import { getQuotation, getCompanyIdentities, getCompanySettings } from "@/app/actions";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Edit2, ArrowLeft } from "lucide-react";
import { DocumentActions } from "@/components/documents/DocumentActions";
import clsx from "clsx";
import { QuotationViewer } from "@/components/quotations/QuotationViewer";

interface QuotationDetailPageProps {
    params: Promise<{ id: string }>;
}

export default async function QuotationDetailPage({ params }: QuotationDetailPageProps) {
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    if (isNaN(id)) {
        notFound();
    }

    const [quotation, identities, companySettings] = await Promise.all([
        getQuotation(id),
        getCompanyIdentities(),
        getCompanySettings()
    ]);

    if (!quotation) {
        notFound();
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">
            {/* Header Actions */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
                <div className="flex items-center gap-4">
                    <Link href="/quotations">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            Cotización {quotation.number}
                            <span className={clsx(
                                "text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-black border",
                                {
                                    "bg-blue-50 text-blue-600 border-blue-100": quotation.status === "SENT",
                                    "bg-emerald-50 text-emerald-600 border-emerald-100": quotation.status === "ACCEPTED",
                                    "bg-slate-50 text-slate-600 border-slate-100": quotation.status === "DRAFT",
                                    "bg-purple-50 text-purple-600 border-purple-100": quotation.status === "INVOICED",
                                }
                            )}>
                                {quotation.status}
                            </span>
                        </h1>
                        <p className="text-sm text-slate-500">Válida hasta {quotation.validUntil ? formatDate(quotation.validUntil) : 'N/A'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <DocumentActions
                        id={quotation.id}
                        docType="quotations"
                        includeCoverPage={quotation.includeCoverPage}
                        includeTermsPage={quotation.includeTermsPage}
                    />
                    <Link href={`/quotations/${quotation.id}/edit`}>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            <Edit2 className="h-4 w-4" /> Editar
                        </Button>
                    </Link>
                </div>
            </header>

            <QuotationViewer quotation={quotation} identities={identities} companySettings={companySettings} />
        </div>
    );
}


