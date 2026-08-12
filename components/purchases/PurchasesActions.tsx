"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QRScannerDialog } from "./QRScannerDialog";
import { useRouter } from "next/navigation";
import { setActiveProfile } from "@/app/actions";

export function PurchasesActions({ autoOpenQR = false }: { autoOpenQR?: boolean }) {
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const [qrProcessingMessage, setQrProcessingMessage] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        if (autoOpenQR) setIsQRScannerOpen(true);
    }, [autoOpenQR]);

    const handleQRSuccess = useCallback(async (data: any) => {
        setQrProcessingMessage("Procesando la información");
        // Save data to session storage to be picked up by the PurchaseForm
        // We use a specific key and add a timestamp to ensure it's fresh
        const qrData = {
            ...data,
            scannedAt: new Date().getTime()
        };
        sessionStorage.setItem("qr_scanned_data", JSON.stringify(qrData));

        if (data?.targetProfileId) {
            setQrProcessingMessage(`Cambiando de perfil${data.targetProfileName ? ` a ${data.targetProfileName}` : ""}`);
            await setActiveProfile(Number(data.targetProfileId));
        }

        setQrProcessingMessage("Abriendo formulario de compra");
        router.push("/purchases/new?source=qr");

        // Keep the modal over the purchases list until the new route mounts.
        window.setTimeout(() => {
            setIsQRScannerOpen(false);
            setQrProcessingMessage(null);
        }, 10000);
    }, [router]);

    const compactActionClass = "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-center shadow-sm ring-offset-background transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

    return (
        <>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setIsQRScannerOpen(true)}
                    title="Registrar con QR"
                    aria-label="Registrar con QR"
                    className={`${compactActionClass} border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50`}
                >
                    <span className="material-icons-round text-[22px]">qr_code_scanner</span>
                    <span className="sr-only">Registrar con QR</span>
                </button>

                <Link
                    href="/purchases/quick"
                    title="Compra rápida"
                    aria-label="Compra rápida"
                    className={`${compactActionClass} border-sky-100 bg-sky-50 text-sky-600 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50`}
                >
                    <span className="material-icons-round text-[22px]">bolt</span>
                    <span className="sr-only">Compra rápida</span>
                </Link>

                <Link
                    href="/purchases/ai-import"
                    title="Importar con IA"
                    aria-label="Importar con IA"
                    className={`${compactActionClass} border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50`}
                >
                    <span className="material-icons-round text-[22px]">auto_awesome</span>
                    <span className="sr-only">Importar con IA</span>
                </Link>

                <Link
                    href="/purchases/rebuild-encf"
                    title="Reconstruir e-NCF / QR"
                    aria-label="Reconstruir e-NCF / QR"
                    className={`${compactActionClass} border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50`}
                >
                    <span className="material-icons-round text-[22px]">link</span>
                    <span className="sr-only">Reconstruir e-NCF / QR</span>
                </Link>
            </div>

            <QRScannerDialog
                isOpen={isQRScannerOpen}
                onClose={() => {
                    setIsQRScannerOpen(false);
                    setQrProcessingMessage(null);
                }}
                onSuccess={handleQRSuccess}
                processingMessage={qrProcessingMessage}
            />
        </>
    );
}
