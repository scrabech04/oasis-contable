"use client";

import { useState } from "react";
import { Upload, FileText, Loader2, AlertCircle, Camera } from "lucide-react";
import { processInvoiceAction } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";

interface InvoiceUploaderProps {
    onDataExtracted: (data: any[]) => void;
}

async function imageToUploadJpeg(file: File) {
    const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
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

export function InvoiceUploader({ onDataExtracted }: InvoiceUploaderProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const processSelectedFile = async (file: File | undefined) => {
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
