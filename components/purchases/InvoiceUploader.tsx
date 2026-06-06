"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Loader2, AlertCircle, Camera, Crop, RotateCcw, Check, X } from "lucide-react";
import { processInvoiceAction } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";

interface InvoiceUploaderProps {
    onDataExtracted: (data: any[]) => void;
}

type CropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type DragState = {
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    startCrop: CropRect;
};

const defaultCrop: CropRect = { x: 8, y: 8, width: 84, height: 84 };
const minCropSize = 14;

function isImageFile(file: File) {
    return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function normalizeCrop(crop: CropRect) {
    const width = clamp(crop.width, minCropSize, 100);
    const height = clamp(crop.height, minCropSize, 100);
    return {
        x: clamp(crop.x, 0, 100 - width),
        y: clamp(crop.y, 0, 100 - height),
        width,
        height,
    };
}

function cropFromDrag(mode: DragState["mode"], start: CropRect, dx: number, dy: number) {
    if (mode === "move") {
        return normalizeCrop({ ...start, x: start.x + dx, y: start.y + dy });
    }

    let next = { ...start };
    if (mode.includes("w")) {
        next.x = start.x + dx;
        next.width = start.width - dx;
    }
    if (mode.includes("e")) {
        next.width = start.width + dx;
    }
    if (mode.includes("n")) {
        next.y = start.y + dy;
        next.height = start.height - dy;
    }
    if (mode.includes("s")) {
        next.height = start.height + dy;
    }

    if (next.width < minCropSize) {
        if (mode.includes("w")) next.x = start.x + start.width - minCropSize;
        next.width = minCropSize;
    }
    if (next.height < minCropSize) {
        if (mode.includes("n")) next.y = start.y + start.height - minCropSize;
        next.height = minCropSize;
    }

    return normalizeCrop(next);
}

async function fileToImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

async function imageToUploadJpeg(file: File) {
    const looksLikeImage = isImageFile(file);
    if (!looksLikeImage) return file;
    if (file.type === "image/gif") return file;

    const imageUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = imageUrl;
        });

        const maxSize = 1800;
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return file;

        context.drawImage(image, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (!blob) return file;

        return new File(
            [blob],
            `${file.name.replace(/\.[^.]+$/, "") || "factura-camara"}.jpg`,
            { type: "image/jpeg", lastModified: Date.now() }
        );
    } catch {
        return file;
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

async function cropImageToUploadJpeg(file: File, imageUrl: string, crop: CropRect) {
    const image = await fileToImage(imageUrl);
    const sourceX = Math.round((crop.x / 100) * image.naturalWidth);
    const sourceY = Math.round((crop.y / 100) * image.naturalHeight);
    const sourceWidth = Math.round((crop.width / 100) * image.naturalWidth);
    const sourceHeight = Math.round((crop.height / 100) * image.naturalHeight);

    const maxSize = 1800;
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return imageToUploadJpeg(file);

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return imageToUploadJpeg(file);

    return new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "") || "factura"}-recortada.jpg`,
        { type: "image/jpeg", lastModified: Date.now() }
    );
}

export function InvoiceUploader({ onDataExtracted }: InvoiceUploaderProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [pendingImageUrl, setPendingImageUrl] = useState("");
    const [crop, setCrop] = useState<CropRect>(defaultCrop);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const cropSurfaceRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        return () => {
            if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
        };
    }, [pendingImageUrl]);

    useEffect(() => {
        if (!dragState) return;

        const handlePointerMove = (event: PointerEvent) => {
            const surface = cropSurfaceRef.current;
            if (!surface) return;

            const rect = surface.getBoundingClientRect();
            const dx = ((event.clientX - dragState.startX) / rect.width) * 100;
            const dy = ((event.clientY - dragState.startY) / rect.height) * 100;
            setCrop(cropFromDrag(dragState.mode, dragState.startCrop, dx, dy));
        };

        const handlePointerUp = () => setDragState(null);
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [dragState]);

    const clearPendingCrop = () => {
        if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
        setPendingImageFile(null);
        setPendingImageUrl("");
        setCrop(defaultCrop);
        setDragState(null);
    };

    const uploadFileToAi = async (file: File | undefined) => {
        if (!file) return;

        setIsUploading(true);
        setError(null);

        const uploadFile = await imageToUploadJpeg(file);

        if (uploadFile.size > 15 * 1024 * 1024) {
            setError("El archivo supera el límite de 15 MB para importar con IA.");
            setIsUploading(false);
            return;
        }

        const formData = new FormData();
        formData.append("file", uploadFile);

        try {
            const result = await processInvoiceAction(formData);
            if (result.success && result.data && result.data.length > 0) {
                onDataExtracted(result.data);
            } else if (result.success) {
                setError("La IA respondió, pero no devolvió facturas para revisar. Intenta con una foto más nítida o un PDF.");
            } else {
                setError(result.error || "Error al procesar el archivo");
            }
        } catch (err) {
            setError("Error de conexión con el servidor");
        } finally {
            setIsUploading(false);
        }
    };

    const processSelectedFile = async (file: File | undefined) => {
        if (!file) return;

        setError(null);
        if (isImageFile(file)) {
            clearPendingCrop();
            setPendingImageFile(file);
            setPendingImageUrl(URL.createObjectURL(file));
            setCrop(defaultCrop);
            return;
        }

        await uploadFileToAi(file);
    };

    const confirmCropAndUpload = async () => {
        if (!pendingImageFile || !pendingImageUrl) return;

        try {
            const croppedFile = await cropImageToUploadJpeg(pendingImageFile, pendingImageUrl, crop);
            clearPendingCrop();
            await uploadFileToAi(croppedFile);
        } catch {
            setError("No se pudo recortar la imagen. Intenta subir la foto original.");
        }
    };

    const uploadOriginalImage = async () => {
        const file = pendingImageFile;
        clearPendingCrop();
        await uploadFileToAi(file || undefined);
    };

    const startDrag = (mode: DragState["mode"], event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setDragState({
            mode,
            startX: event.clientX,
            startY: event.clientY,
            startCrop: crop,
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        await processSelectedFile(file);
    };

    return (
        <Card className="border-dashed border-2 bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                {isUploading ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                        <div className="space-y-1">
                            <p className="font-medium">Procesando con IA...</p>
                            <p className="text-xs text-muted-foreground">Analizando facturas y extrayendo datos</p>
                        </div>
                    </div>
                ) : pendingImageUrl ? (
                    <div className="w-full max-w-3xl space-y-5 text-left">
                        <div className="flex flex-col gap-2 text-center">
                            <div className="mx-auto rounded-full bg-blue-50 p-3 text-blue-600">
                                <Crop className="h-7 w-7" />
                            </div>
                            <h3 className="text-lg font-semibold">Ajustar area de la factura</h3>
                            <p className="mx-auto max-w-md text-sm text-muted-foreground">
                                Mueve el recuadro y ajusta las esquinas para enviar solo la factura a la IA.
                            </p>
                        </div>

                        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-sm">
                            <div ref={cropSurfaceRef} className="relative mx-auto touch-none overflow-hidden rounded-xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={pendingImageUrl} alt="Factura para recortar" className="block max-h-[58vh] w-full select-none object-contain" draggable={false} />
                                <div className="pointer-events-none absolute inset-0 bg-black/45" />
                                <div
                                    className="absolute cursor-move rounded-xl border-2 border-blue-400 bg-blue-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                                    style={{
                                        left: `${crop.x}%`,
                                        top: `${crop.y}%`,
                                        width: `${crop.width}%`,
                                        height: `${crop.height}%`,
                                    }}
                                    onPointerDown={(event) => startDrag("move", event)}
                                >
                                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                                        {Array.from({ length: 9 }).map((_, index) => (
                                            <div key={index} className="border border-white/20" />
                                        ))}
                                    </div>
                                    {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                                        <button
                                            key={handle}
                                            type="button"
                                            aria-label={`Ajustar esquina ${handle}`}
                                            className={`absolute h-7 w-7 rounded-full border-2 border-white bg-blue-600 shadow-lg ${
                                                handle === "nw" ? "-left-3.5 -top-3.5 cursor-nwse-resize" :
                                                handle === "ne" ? "-right-3.5 -top-3.5 cursor-nesw-resize" :
                                                handle === "sw" ? "-bottom-3.5 -left-3.5 cursor-nesw-resize" :
                                                "-bottom-3.5 -right-3.5 cursor-nwse-resize"
                                            }`}
                                            onPointerDown={(event) => startDrag(handle, event)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                            <button
                                type="button"
                                onClick={() => setCrop(defaultCrop)}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Reiniciar
                            </button>
                            <button
                                type="button"
                                onClick={uploadOriginalImage}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                <Upload className="h-4 w-4" />
                                Usar original
                            </button>
                            <button
                                type="button"
                                onClick={clearPendingCrop}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                <X className="h-4 w-4" />
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmCropAndUpload}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700"
                            >
                                <Check className="h-4 w-4" />
                                Procesar recorte
                            </button>
                        </div>

                        {error && (
                            <div className="mx-auto flex max-w-md items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="mb-4 rounded-full bg-blue-50 p-4 text-blue-600">
                            <Upload className="h-8 w-8" />
                        </div>
                        <div className="space-y-2 mb-6">
                            <h3 className="text-lg font-semibold">Cargar Facturas con IA</h3>
                            <p className="text-sm text-muted-foreground max-w-xs">
                                Sube un PDF o imagen. La IA detectará automáticamente los datos de una o varias facturas.
                            </p>
                        </div>

                        <div className="grid w-full max-w-xs grid-cols-1 gap-3 sm:grid-cols-2">
                            <label htmlFor="purchase-ai-camera" className="cursor-pointer">
                                <div className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                    <Camera className="mr-2 h-4 w-4" />
                                    Tomar foto
                                </div>
                                <input
                                    id="purchase-ai-camera"
                                    type="file"
                                    className="hidden"
                                    accept="image/jpeg,image/png,image/webp"
                                    capture="environment"
                                    onChange={handleFileChange}
                                />
                            </label>
                            <label htmlFor="purchase-ai-file" className="cursor-pointer">
                                <div className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Galería/PDF
                                </div>
                                <input
                                    id="purchase-ai-file"
                                    type="file"
                                    className="hidden"
                                    accept="image/jpeg,image/png,image/webp,application/pdf"
                                    onChange={handleFileChange}
                                />
                            </label>
                        </div>

                        {error && (
                            <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
