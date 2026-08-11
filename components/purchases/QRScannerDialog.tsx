"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, AlertCircle, ScanLine, FileWarning, ShieldCheck, ExternalLink } from "lucide-react";
import { attachDgiiConstancia, processDGIIQR, setActiveProfile } from "@/app/actions";

/**
 * Compra ya registrada que la DGII identifico a partir del mismo QR. Como ese QR es el
 * enlace del timbre, desde aqui se puede completar su constancia sin volver a escanear.
 */
type DuplicatePurchase = {
    purchaseId: number;
    profileId: number;
    profileName: string | null;
    supplierName: string;
    ncf: string;
    total: number;
    hasConstancia: boolean;
    timbreUrl: string;
};

const money = new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

interface QRScannerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (data: any) => Promise<void> | void;
    processingMessage?: string | null;
    /**
     * Entrega el texto crudo del QR como { timbreUrl } sin pasar por processDGIIQR.
     * Necesario al adjuntar la constancia a una compra ya registrada, porque
     * processDGIIQR rechaza el QR por duplicado justamente cuando la compra existe.
     */
    rawText?: boolean;
    title?: string;
    description?: string;
}

export function QRScannerDialog({
    isOpen,
    onClose,
    onSuccess,
    processingMessage,
    rawText = false,
    title = "Escanear Factura Electrónica",
    description = "Apunta la cámara al código QR de la factura para extraer los datos fiscales automáticamente.",
}: QRScannerDialogProps) {
    const [isScanning, setIsScanning] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [duplicate, setDuplicate] = useState<DuplicatePurchase | null>(null);
    const [recovery, setRecovery] = useState<{ ok: boolean; text: string } | null>(null);
    const [isRecovering, setIsRecovering] = useState(false);
    const router = useRouter();
    const isBusy = isLoading || Boolean(processingMessage);

    // Al reabrir el modal se empieza limpio: si no, queda el resultado del escaneo anterior.
    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setDuplicate(null);
        setRecovery(null);
        setIsScanning(true);
    }, [isOpen]);

    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        let enhanceInterval: ReturnType<typeof setInterval> | null = null;

        if (isOpen && isScanning) {
            // Give the DOM a moment to render the reader div
            const timer = setTimeout(() => {
                scanner = new Html5QrcodeScanner(
                    "qr-reader",
                    {
                        fps: 20,
                        qrbox: { width: 280, height: 280 },
                        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                        showTorchButtonIfSupported: true,
                        experimentalFeatures: {
                            useBarCodeDetectorIfSupported: true
                        },
                        rememberLastUsedCamera: true,
                        aspectRatio: 1.0
                    },
                    /* verbose= */ false
                );

                const enhanceScannerUi = () => {
                    const root = document.getElementById("qr-reader");
                    if (!root) return;

                    root.querySelectorAll("button").forEach((button) => {
                        button.classList.add(
                            "rounded-lg",
                            "border",
                            "border-slate-200",
                            "bg-white",
                            "px-3",
                            "py-2",
                            "text-sm",
                            "font-semibold",
                            "text-slate-700",
                            "shadow-sm",
                            "transition-colors",
                            "hover:bg-slate-50"
                        );

                        const label = button.textContent?.trim();
                        if (label === "Start Scanning") button.textContent = "Iniciar escaneo";
                        if (label === "Stop Scanning") button.textContent = "Detener escaneo";
                        if (label === "Request Camera Permissions") button.textContent = "Permitir cámara";
                        if (label === "Scan an Image File") button.textContent = "Escanear desde imagen";
                    });

                    root.querySelectorAll("select").forEach((select) => {
                        select.classList.add(
                            "rounded-lg",
                            "border",
                            "border-slate-200",
                            "bg-white",
                            "px-3",
                            "py-2",
                            "text-sm",
                            "font-medium",
                            "text-slate-700",
                            "shadow-sm"
                        );
                    });

                    root.querySelectorAll("span, div").forEach((node) => {
                        if (node.childElementCount > 0) return;
                        const text = node.textContent?.trim();
                        if (text === "Camera based scan") node.textContent = "Escaneo con cámara";
                        if (text === "File based scan") node.textContent = "Escaneo desde archivo";
                    });
                };

                scanner.render(
                    async (decodedText) => {
                        setIsScanning(false);
                        setIsLoading(true);
                        setError(null);

                        try {
                            if (scanner) {
                                await scanner.clear();
                            }
                        } catch (e) {
                            console.error("Error clearing scanner:", e);
                        }

                        try {
                            if (rawText) {
                                await onSuccess({ timbreUrl: decodedText });
                                return;
                            }

                            const result = await processDGIIQR(decodedText);
                            if (result.success) {
                                await onSuccess(result.data);
                                // The onSuccess callback will handle navigation or form population
                            } else {
                                setError(result.error || "Error desconocido al procesar el QR");
                                setDuplicate(result.duplicate || null);
                                setIsScanning(false); // Stop scanning to show error
                            }
                        } catch (e: any) {
                            setError("Error de conexión al procesar el QR de la DGII");
                            setIsScanning(false);
                        } finally {
                            setIsLoading(false);
                        }
                    },
                    (err) => {
                        // Just ignore scan errors while looking for QR
                    }
                );
                enhanceScannerUi();
                enhanceInterval = setInterval(enhanceScannerUi, 500);
            }, 100);

            return () => {
                clearTimeout(timer);
                if (enhanceInterval) {
                    clearInterval(enhanceInterval);
                }
                if (scanner) {
                    scanner.clear().catch(err => console.log("Error cleanup scanner", err));
                }
            };
        }
    }, [isOpen, isScanning, onSuccess, rawText]);

    const handleRetry = () => {
        setError(null);
        setDuplicate(null);
        setRecovery(null);
        setIsScanning(true);
    };

    // La compra ya existe, asi que solo falta su constancia: se adjunta con el enlace del
    // timbre que trae este mismo QR.
    const handleAttachConstancia = async () => {
        if (!duplicate?.timbreUrl) return;

        setIsRecovering(true);
        setRecovery(null);

        try {
            const result = await attachDgiiConstancia(
                duplicate.purchaseId,
                duplicate.timbreUrl,
                duplicate.profileId,
            );

            if (result.success) {
                setDuplicate({ ...duplicate, hasConstancia: true });
                setRecovery({ ok: true, text: "Constancia de la DGII adjuntada a la compra." });
                return;
            }

            setRecovery({ ok: false, text: result.error });
        } catch {
            setRecovery({ ok: false, text: "No fue posible conectar con la DGII." });
        } finally {
            setIsRecovering(false);
        }
    };

    // La compra puede vivir en otro perfil, asi que se cambia antes de abrirla.
    const handleOpenPurchase = async () => {
        if (!duplicate) return;

        setIsRecovering(true);
        await setActiveProfile(duplicate.profileId);
        router.push(`/purchases/${duplicate.purchaseId}`);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isBusy && onClose()}>
            <DialogContent className="sm:max-w-md border-slate-200 shadow-xl">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                        <Camera className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 dark:text-slate-400">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <div className="relative mt-2">
                    {isBusy ? (
                        <div className="flex flex-col items-center justify-center p-16 space-y-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                            <div className="text-center">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                    {processingMessage || "Verificando en DGII"}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {processingMessage ? "Preparando el formulario de compra..." : "Conectando con el servidor de validación..."}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className={`grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center ${duplicate ? "hidden" : ""}`}>
                                <div className="rounded-xl bg-white px-2 py-3 shadow-sm">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paso 1</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700">Elige cámara</p>
                                </div>
                                <div className="rounded-xl bg-white px-2 py-3 shadow-sm">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paso 2</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700">Inicia escaneo</p>
                                </div>
                                <div className="rounded-xl bg-white px-2 py-3 shadow-sm">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paso 3</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700">Apunta al QR</p>
                                </div>
                            </div>

                            {isScanning ? (
                                <div className="overflow-hidden rounded-2xl border-2 border-slate-100 bg-white shadow-sm">
                                    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                                        <ScanLine className="h-4 w-4 text-indigo-600" />
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">Lector QR</p>
                                            <p className="text-[11px] text-slate-500">Usa el selector para escoger la cámara correcta antes de iniciar.</p>
                                        </div>
                                    </div>
                                    <div id="qr-reader" className="w-full overflow-hidden bg-black min-h-[300px]" />
                                </div>
                            ) : duplicate ? (
                                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/30 dark:bg-amber-950/20">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                                            <FileWarning className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                                                Esta factura ya está registrada
                                            </p>
                                            <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                                                No se abrirá el formulario para no duplicarla
                                                {duplicate.profileName ? ` en ${duplicate.profileName}` : ""}.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-900/40">
                                        {duplicate.supplierName && (
                                            <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                                                {duplicate.supplierName}
                                            </p>
                                        )}
                                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                            {duplicate.ncf} · RD$ {money.format(duplicate.total)}
                                        </p>
                                        <p
                                            className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-bold ${duplicate.hasConstancia ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
                                        >
                                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                            {duplicate.hasConstancia
                                                ? "Ya tiene la constancia de la DGII"
                                                : "Le falta la constancia de la DGII"}
                                        </p>
                                    </div>

                                    {recovery && (
                                        <p
                                            className={`rounded-xl px-3 py-2 text-[11px] font-bold ${recovery.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}
                                        >
                                            {recovery.text}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        {!duplicate.hasConstancia && duplicate.timbreUrl && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={isRecovering}
                                                onClick={handleAttachConstancia}
                                                className="h-9 gap-1.5 rounded-lg text-[11px] font-black"
                                            >
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                {isRecovering ? "Consultando DGII..." : "Adjuntar constancia"}
                                            </Button>
                                        )}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={isRecovering}
                                            onClick={handleOpenPurchase}
                                            className="h-9 gap-1.5 rounded-lg text-[11px] font-black"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Ver la compra
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={isRecovering}
                                            onClick={handleRetry}
                                            className="h-9 rounded-lg text-[11px] font-black text-slate-500"
                                        >
                                            Escanear otra
                                        </Button>
                                    </div>

                                    {!duplicate.hasConstancia && !duplicate.timbreUrl && (
                                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                                            El QR no apunta al portal de la DGII, así que la constancia hay que
                                            adjuntarla desde el detalle de la compra.
                                        </p>
                                    )}
                                </div>
                            ) : error ? (
                                <div className="p-6 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 flex flex-col items-center text-center space-y-3">
                                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-red-900 dark:text-white">Error de Validación</p>
                                        <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
                                    </div>
                                    <Button
                                        onClick={handleRetry}
                                        variant="outline"
                                        className="mt-2 border-red-200 hover:bg-red-100 text-red-700"
                                    >
                                        Intentar de nuevo
                                    </Button>
                                </div>
                            ) : null}

                            <div className={`flex items-center gap-3 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100/50 dark:border-blue-800/20 ${duplicate ? "hidden" : ""}`}>
                                <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                                    <Camera className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-normal font-bold">
                                        ¿QR Muy Pequeño?
                                    </p>
                                    <p className="text-[10px] text-blue-800/60 dark:text-blue-300/60 leading-normal italic">
                                        Acerca tu celular lentamente hasta que los puntos del código sean nítidos.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    {!isBusy && (
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="text-slate-500 hover:text-slate-700"
                        >
                            Cancelar
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
