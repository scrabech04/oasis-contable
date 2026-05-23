"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";

interface DocumentActionsProps {
    id: number;
    docType: 'invoices' | 'quotations';
    includeCoverPage?: boolean;
    includeTermsPage?: boolean;
}

export function DocumentActions({ id, docType, includeCoverPage = false, includeTermsPage = false }: DocumentActionsProps) {
    const [cover, setCover] = useState(includeCoverPage);
    const [terms, setTerms] = useState(includeTermsPage);
    const pdfUrl = useMemo(() => {
        const params = new URLSearchParams({
            cover: cover ? "1" : "0",
            terms: terms ? "1" : "0",
        });
        return `/api/${docType}/${id}/pdf?${params.toString()}`;
    }, [cover, docType, id, terms]);

    const openForPrint = () => {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3 px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <label className="flex items-center gap-1.5">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={cover}
                        onChange={(event) => setCover(event.target.checked)}
                    />
                    Portada
                </label>
                <label className="flex items-center gap-1.5">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={terms}
                        onChange={(event) => setTerms(event.target.checked)}
                    />
                    Terminos
                </label>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={openForPrint}
            >
                <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2"
            >
                <Download className="h-4 w-4" /> PDF
            </a>
        </div>
    );
}
