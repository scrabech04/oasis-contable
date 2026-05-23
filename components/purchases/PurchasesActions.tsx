"use client";

import Link from "next/link";
import { useState } from "react";
import { QRScannerDialog } from "./QRScannerDialog";
import { useRouter } from "next/navigation";

export function PurchasesActions() {
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const router = useRouter();

    const handleQRSuccess = (data: any) => {
        // Save data to session storage to be picked up by the PurchaseForm
        // We use a specific key and add a timestamp to ensure it's fresh
        const qrData = {
            ...data,
            scannedAt: new Date().getTime()
        };
        sessionStorage.setItem("qr_scanned_data", JSON.stringify(qrData));

        // Navigate to the new purchase page with a flag
        router.push("/purchases/new?source=qr");
    };

    return (
        <>
            <div className="contents sm:flex sm:flex-wrap sm:gap-3">
                <button
                    onClick={() => setIsQRScannerOpen(true)}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 px-3 text-center text-sm font-bold text-indigo-600 shadow-sm ring-offset-background transition-all hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 sm:px-6"
                >
                    <span className="material-icons-round mr-1.5 text-[20px] sm:mr-2">qr_code_scanner</span>
                    Registrar con QR
                </button>

                <Link
                    href="/purchases/rebuild-encf"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-center text-sm font-bold text-emerald-700 shadow-sm ring-offset-background transition-all hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 sm:px-6"
                >
                    <span className="material-icons-round mr-1.5 text-[20px] sm:mr-2">link</span>
                    Reconstruir e-NCF / QR
                </Link>
            </div>

            <QRScannerDialog
                isOpen={isQRScannerOpen}
                onClose={() => setIsQRScannerOpen(false)}
                onSuccess={handleQRSuccess}
            />
        </>
    );
}
