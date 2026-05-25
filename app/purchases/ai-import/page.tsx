"use client";

import { useState } from "react";
import { InvoiceUploader } from "@/components/purchases/InvoiceUploader";
import { BatchReview } from "@/components/purchases/BatchReview";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AIImportPage() {
    const [extractedData, setExtractedData] = useState<any[] | null>(null);
    const [isOpeningForm, setIsOpeningForm] = useState(false);
    const router = useRouter();

    const handleDataExtracted = (data: any[]) => {
        if (data.length === 1) {
            setIsOpeningForm(true);
            sessionStorage.setItem("ai_imported_purchase", JSON.stringify({
                ...data[0],
                importedAt: Date.now(),
            }));
            router.push("/purchases/new");
            return;
        }

        setExtractedData(data);
    };

    const handleComplete = () => {
        router.push("/purchases");
        router.refresh();
    };

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Volver
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">Importar con IA</h1>
                </div>
            </div>

            {!extractedData ? (
                <div className="space-y-6">
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-blue-800 text-sm">
                        <p className="font-semibold mb-1">¿Cómo funciona?</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>Sube un PDF con una o varias facturas.</li>
                            <li>La IA identificará proveedores, NCF, fechas e ítems.</li>
                            <li>Podrás revisar todo antes de guardarlo definitivamente.</li>
                        </ul>
                    </div>
                    {isOpeningForm ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-blue-100 bg-blue-50/70 p-10 text-center text-blue-800">
                            <Loader2 className="mb-3 h-8 w-8 animate-spin" />
                            <p className="font-semibold">Abriendo formulario de compra...</p>
                            <p className="mt-1 text-xs opacity-80">Cargando los datos extraidos por IA</p>
                        </div>
                    ) : (
                        <InvoiceUploader onDataExtracted={handleDataExtracted} />
                    )}
                </div>
            ) : (
                <BatchReview
                    invoices={extractedData}
                    onComplete={handleComplete}
                    onCancel={() => setExtractedData(null)}
                />
            )}
        </div>
    );
}
