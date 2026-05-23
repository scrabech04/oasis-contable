"use client";

import { useState } from "react";
import { SalesInvoiceUploader } from "@/components/invoices/SalesInvoiceUploader";
import { SalesBatchReview } from "@/components/invoices/SalesBatchReview";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SalesAIImportPage() {
    const [extractedData, setExtractedData] = useState<any[] | null>(null);
    const router = useRouter();

    const handleDataExtracted = (data: any[]) => {
        setExtractedData(data);
    };

    const handleComplete = () => {
        router.push("/invoices");
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
                    <h1 className="text-3xl font-bold tracking-tight">Importar Ventas con IA</h1>
                </div>
            </div>

            {!extractedData ? (
                <div className="space-y-6">
                    <div className="bg-green-50 border border-green-100 p-4 rounded-lg text-green-800 text-sm">
                        <p className="font-semibold mb-1">¿Cómo funciona?</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>Sube un PDF o imagen de tus facturas de venta.</li>
                            <li>La IA identificará clientes, fechas e ítems automáticamente.</li>
                            <li>Podrás revisar y confirmar todo antes de guardarlo.</li>
                        </ul>
                    </div>
                    <SalesInvoiceUploader onDataExtracted={handleDataExtracted} />
                </div>
            ) : (
                <SalesBatchReview
                    invoices={extractedData}
                    onComplete={handleComplete}
                    onCancel={() => setExtractedData(null)}
                />
            )}
        </div>
    );
}
