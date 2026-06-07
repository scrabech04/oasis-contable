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

type CropPoint = {
    x: number;
    y: number;
};

type CropQuad = {
    tl: CropPoint;
    tr: CropPoint;
    br: CropPoint;
    bl: CropPoint;
};

type DragState = {
    mode: "move" | keyof CropQuad;
    startX: number;
    startY: number;
    startQuad: CropQuad;
};

const defaultCrop: CropRect = { x: 8, y: 8, width: 84, height: 84 };
const defaultQuad: CropQuad = rectToQuad(defaultCrop);
const minCropSize = 14;
const detectionCanvasMaxSize = 900;

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

function rectToQuad(rect: CropRect): CropQuad {
    const normalized = normalizeCrop(rect);
    return {
        tl: { x: normalized.x, y: normalized.y },
        tr: { x: normalized.x + normalized.width, y: normalized.y },
        br: { x: normalized.x + normalized.width, y: normalized.y + normalized.height },
        bl: { x: normalized.x, y: normalized.y + normalized.height },
    };
}

function quadToBoundingRect(quad: CropQuad): CropRect {
    const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x];
    const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return normalizeCrop({ x, y, width, height });
}

function normalizeQuad(quad: CropQuad): CropQuad {
    return {
        tl: { x: clamp(quad.tl.x, 0, 100), y: clamp(quad.tl.y, 0, 100) },
        tr: { x: clamp(quad.tr.x, 0, 100), y: clamp(quad.tr.y, 0, 100) },
        br: { x: clamp(quad.br.x, 0, 100), y: clamp(quad.br.y, 0, 100) },
        bl: { x: clamp(quad.bl.x, 0, 100), y: clamp(quad.bl.y, 0, 100) },
    };
}

function moveQuad(quad: CropQuad, dx: number, dy: number): CropQuad {
    const rect = quadToBoundingRect(quad);
    const clampedDx = clamp(dx, -rect.x, 100 - rect.x - rect.width);
    const clampedDy = clamp(dy, -rect.y, 100 - rect.y - rect.height);
    return {
        tl: { x: quad.tl.x + clampedDx, y: quad.tl.y + clampedDy },
        tr: { x: quad.tr.x + clampedDx, y: quad.tr.y + clampedDy },
        br: { x: quad.br.x + clampedDx, y: quad.br.y + clampedDy },
        bl: { x: quad.bl.x + clampedDx, y: quad.bl.y + clampedDy },
    };
}

function quadFromDrag(mode: DragState["mode"], start: CropQuad, dx: number, dy: number) {
    if (mode === "move") {
        return normalizeQuad(moveQuad(start, dx, dy));
    }

    return normalizeQuad({
        ...start,
        [mode]: {
            x: start[mode].x + dx,
            y: start[mode].y + dy,
        },
    });
}

function average(values: number[]) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
    if (values.length === 0) return 0;
    const avg = average(values);
    return Math.sqrt(average(values.map((value) => (value - avg) ** 2)));
}

function rgbToSaturation(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
}

function isLikelyPaperPixel(r: number, g: number, b: number, borderBrightness: number, borderDeviation: number) {
    const brightness = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const saturation = rgbToSaturation(r, g, b);
    const brighterThanBorder = brightness - borderBrightness;

    return (
        (brightness > 188 && saturation < 0.35) ||
        (brightness > 218 && saturation < 0.55) ||
        (brightness > 138 && spread < 72 && brighterThanBorder > Math.max(18, borderDeviation * 0.35))
    );
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius = 1) {
    const output = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let active = false;
            for (let dy = -radius; dy <= radius && !active; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) {
                        active = true;
                        break;
                    }
                }
            }
            output[y * width + x] = active ? 1 : 0;
        }
    }
    return output;
}

function erodeMask(mask: Uint8Array, width: number, height: number, radius = 1) {
    const output = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let active = true;
            for (let dy = -radius; dy <= radius && active; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) {
                        active = false;
                        break;
                    }
                }
            }
            output[y * width + x] = active ? 1 : 0;
        }
    }
    return output;
}

function closeMask(mask: Uint8Array, width: number, height: number) {
    return erodeMask(dilateMask(mask, width, height, 2), width, height, 1);
}

type Component = {
    pixels: number[];
    area: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

function connectedComponents(mask: Uint8Array, width: number, height: number) {
    const visited = new Uint8Array(mask.length);
    const components: Component[] = [];
    const queue: number[] = [];

    for (let start = 0; start < mask.length; start += 1) {
        if (!mask[start] || visited[start]) continue;

        visited[start] = 1;
        queue.length = 0;
        queue.push(start);
        const pixels: number[] = [];
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;

        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const index = queue[cursor];
            pixels.push(index);
            const x = index % width;
            const y = Math.floor(index / width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);

            const neighbors = [index - 1, index + 1, index - width, index + width];
            for (const next of neighbors) {
                if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
                const nx = next % width;
                if ((next === index - 1 && nx > x) || (next === index + 1 && nx < x)) continue;
                visited[next] = 1;
                queue.push(next);
            }
        }

        components.push({ pixels, area: pixels.length, minX, minY, maxX, maxY });
    }

    return components;
}

function componentToQuad(component: Component, width: number, height: number): CropQuad {
    let tl = component.pixels[0];
    let tr = component.pixels[0];
    let br = component.pixels[0];
    let bl = component.pixels[0];
    let tlScore = Infinity;
    let trScore = -Infinity;
    let brScore = -Infinity;
    let blScore = -Infinity;

    for (const index of component.pixels) {
        const x = index % width;
        const y = Math.floor(index / width);
        const sum = x + y;
        const diff = x - y;
        if (sum < tlScore) {
            tlScore = sum;
            tl = index;
        }
        if (diff > trScore) {
            trScore = diff;
            tr = index;
        }
        if (sum > brScore) {
            brScore = sum;
            br = index;
        }
        if (-diff > blScore) {
            blScore = -diff;
            bl = index;
        }
    }

    const toPoint = (index: number) => ({
        x: ((index % width) / width) * 100,
        y: (Math.floor(index / width) / height) * 100,
    });

    return normalizeQuad({
        tl: toPoint(tl),
        tr: toPoint(tr),
        br: toPoint(br),
        bl: toPoint(bl),
    });
}

function quadArea(quad: CropQuad) {
    const points = [quad.tl, quad.tr, quad.br, quad.bl];
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
}

function scoreComponent(component: Component, width: number, height: number) {
    const imageArea = width * height;
    const bboxWidth = component.maxX - component.minX + 1;
    const bboxHeight = component.maxY - component.minY + 1;
    const bboxArea = bboxWidth * bboxHeight;
    const areaRatio = component.area / imageArea;
    const bboxRatio = bboxArea / imageArea;
    const fillRatio = component.area / Math.max(1, bboxArea);
    const aspect = bboxWidth / Math.max(1, bboxHeight);
    const touchesBorder =
        (component.minX <= 2 ? 1 : 0) +
        (component.minY <= 2 ? 1 : 0) +
        (component.maxX >= width - 3 ? 1 : 0) +
        (component.maxY >= height - 3 ? 1 : 0);

    if (areaRatio < 0.025 || bboxRatio < 0.04) return 0;
    if (bboxWidth < width * 0.18 || bboxHeight < height * 0.18) return 0;
    if (aspect < 0.22 || aspect > 3.2) return 0;
    if (fillRatio < 0.18) return 0;
    if (bboxRatio > 0.92 && touchesBorder >= 2) return 0;

    const borderPenalty = touchesBorder === 0 ? 1 : touchesBorder === 1 ? 0.78 : 0.38;
    const sizePreference = bboxRatio > 0.86 ? 0.45 : bboxRatio > 0.76 ? 0.72 : 1;
    return component.area * fillRatio * borderPenalty * sizePreference;
}

async function detectDocumentQuad(imageUrl: string): Promise<CropQuad | null> {
    const image = await fileToImage(imageUrl);
    const scale = Math.min(1, detectionCanvasMaxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const borderSamples: number[] = [];
    const sampleStep = Math.max(1, Math.round(Math.min(width, height) / 120));

    for (let x = 0; x < width; x += sampleStep) {
        for (const y of [0, height - 1]) {
            const index = (y * width + x) * 4;
            borderSamples.push((data[index] + data[index + 1] + data[index + 2]) / 3);
        }
    }
    for (let y = 0; y < height; y += sampleStep) {
        for (const x of [0, width - 1]) {
            const index = (y * width + x) * 4;
            borderSamples.push((data[index] + data[index + 1] + data[index + 2]) / 3);
        }
    }

    const borderBrightness = average(borderSamples);
    const borderDeviation = standardDeviation(borderSamples);
    let paperMask = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            if (isLikelyPaperPixel(data[index], data[index + 1], data[index + 2], borderBrightness, borderDeviation)) {
                paperMask[y * width + x] = 1;
            }
        }
    }

    paperMask = closeMask(paperMask, width, height);
    const components = connectedComponents(paperMask, width, height)
        .map((component) => ({ component, score: scoreComponent(component, width, height) }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);

    const best = components[0]?.component;
    if (!best) return null;

    const quad = componentToQuad(best, width, height);
    const bounds = quadToBoundingRect(quad);
    const area = quadArea(quad);
    if (area < 450 || area > 9000) return null;
    if (bounds.width > 96 && bounds.height > 96) return null;

    return quad;
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

function pointDistance(a: CropPoint, b: CropPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInPixels(point: CropPoint, image: HTMLImageElement): CropPoint {
    return {
        x: (point.x / 100) * image.naturalWidth,
        y: (point.y / 100) * image.naturalHeight,
    };
}

function interpolateSourcePoint(quad: CropQuad, u: number, v: number) {
    const top = {
        x: quad.tl.x + (quad.tr.x - quad.tl.x) * u,
        y: quad.tl.y + (quad.tr.y - quad.tl.y) * u,
    };
    const bottom = {
        x: quad.bl.x + (quad.br.x - quad.bl.x) * u,
        y: quad.bl.y + (quad.br.y - quad.bl.y) * u,
    };
    return {
        x: top.x + (bottom.x - top.x) * v,
        y: top.y + (bottom.y - top.y) * v,
    };
}

function samplePixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
    const clampedX = clamp(x, 0, width - 1);
    const clampedY = clamp(y, 0, height - 1);
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = clampedX - x0;
    const ty = clampedY - y0;

    const i00 = (y0 * width + x0) * 4;
    const i10 = (y0 * width + x1) * 4;
    const i01 = (y1 * width + x0) * 4;
    const i11 = (y1 * width + x1) * 4;
    const result = [0, 0, 0, 255];

    for (let channel = 0; channel < 4; channel += 1) {
        const top = data[i00 + channel] * (1 - tx) + data[i10 + channel] * tx;
        const bottom = data[i01 + channel] * (1 - tx) + data[i11 + channel] * tx;
        result[channel] = Math.round(top * (1 - ty) + bottom * ty);
    }

    return result;
}

async function straightenQuadToUploadJpeg(file: File, imageUrl: string, quadPercent: CropQuad) {
    const image = await fileToImage(imageUrl);
    const quad = {
        tl: pointInPixels(quadPercent.tl, image),
        tr: pointInPixels(quadPercent.tr, image),
        br: pointInPixels(quadPercent.br, image),
        bl: pointInPixels(quadPercent.bl, image),
    };

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return cropImageToUploadJpeg(file, imageUrl, quadToBoundingRect(quadPercent));

    sourceContext.drawImage(image, 0, 0);
    const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const rawWidth = Math.max(pointDistance(quad.tl, quad.tr), pointDistance(quad.bl, quad.br));
    const rawHeight = Math.max(pointDistance(quad.tl, quad.bl), pointDistance(quad.tr, quad.br));
    const maxSize = 1800;
    const scale = Math.min(1, maxSize / Math.max(rawWidth, rawHeight));
    const outputWidth = Math.max(1, Math.round(rawWidth * scale));
    const outputHeight = Math.max(1, Math.round(rawHeight * scale));

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) return cropImageToUploadJpeg(file, imageUrl, quadToBoundingRect(quadPercent));

    const output = outputContext.createImageData(outputWidth, outputHeight);
    for (let y = 0; y < outputHeight; y += 1) {
        const v = outputHeight <= 1 ? 0 : y / (outputHeight - 1);
        for (let x = 0; x < outputWidth; x += 1) {
            const u = outputWidth <= 1 ? 0 : x / (outputWidth - 1);
            const sourcePoint = interpolateSourcePoint(quad, u, v);
            const pixel = samplePixel(source.data, source.width, source.height, sourcePoint.x, sourcePoint.y);
            const index = (y * outputWidth + x) * 4;
            output.data[index] = pixel[0];
            output.data[index + 1] = pixel[1];
            output.data[index + 2] = pixel[2];
            output.data[index + 3] = pixel[3];
        }
    }

    outputContext.putImageData(output, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => outputCanvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return cropImageToUploadJpeg(file, imageUrl, quadToBoundingRect(quadPercent));

    return new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "") || "factura"}-enderezada.jpg`,
        { type: "image/jpeg", lastModified: Date.now() }
    );
}

export function InvoiceUploader({ onDataExtracted }: InvoiceUploaderProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [pendingImageUrl, setPendingImageUrl] = useState("");
    const [quad, setQuad] = useState<CropQuad>(defaultQuad);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [isDetectingCrop, setIsDetectingCrop] = useState(false);
    const [cropDetectionMessage, setCropDetectionMessage] = useState("");
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
            setQuad(quadFromDrag(dragState.mode, dragState.startQuad, dx, dy));
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
        setQuad(defaultQuad);
        setDragState(null);
        setIsDetectingCrop(false);
        setCropDetectionMessage("");
    };

    const detectCropFromUrl = async (imageUrl: string) => {
        setIsDetectingCrop(true);
        setCropDetectionMessage("Buscando bordes de la factura...");
        try {
            const detectedQuad = await detectDocumentQuad(imageUrl);
            if (detectedQuad) {
                setQuad(detectedQuad);
                setCropDetectionMessage("Documento detectado. Ajusta las esquinas si hace falta.");
            } else {
                setQuad(defaultQuad);
                setCropDetectionMessage("No pude detectar bordes claros. Ajusta el recuadro manualmente.");
            }
        } catch {
            setQuad(defaultQuad);
            setCropDetectionMessage("No pude detectar bordes claros. Ajusta el recuadro manualmente.");
        } finally {
            setIsDetectingCrop(false);
        }
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
            const imageUrl = URL.createObjectURL(file);
            setPendingImageFile(file);
            setPendingImageUrl(imageUrl);
            setQuad(defaultQuad);
            await detectCropFromUrl(imageUrl);
            return;
        }

        await uploadFileToAi(file);
    };

    const confirmCropAndUpload = async () => {
        if (!pendingImageFile || !pendingImageUrl) return;

        try {
            const croppedFile = await straightenQuadToUploadJpeg(pendingImageFile, pendingImageUrl, quad);
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
            startQuad: quad,
        });
    };

    const redetectCrop = async () => {
        if (!pendingImageUrl) return;
        await detectCropFromUrl(pendingImageUrl);
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
                                Mueve la hoja y ajusta sus esquinas para enderezarla antes de enviarla a la IA.
                            </p>
                            {cropDetectionMessage && (
                                <p className="mx-auto max-w-md text-xs font-medium text-blue-700">
                                    {cropDetectionMessage}
                                </p>
                            )}
                        </div>

                        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-sm">
                            <div ref={cropSurfaceRef} className="relative mx-auto touch-none overflow-hidden rounded-xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={pendingImageUrl} alt="Factura para recortar" className="block max-h-[58vh] w-full select-none object-contain" draggable={false} />
                                <div
                                    className="absolute inset-0 cursor-move"
                                    onPointerDown={(event) => startDrag("move", event)}
                                >
                                    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <defs>
                                            <mask id="invoice-crop-mask">
                                                <rect x="0" y="0" width="100" height="100" fill="white" />
                                                <polygon points={`${quad.tl.x},${quad.tl.y} ${quad.tr.x},${quad.tr.y} ${quad.br.x},${quad.br.y} ${quad.bl.x},${quad.bl.y}`} fill="black" />
                                            </mask>
                                        </defs>
                                        <rect x="0" y="0" width="100" height="100" fill="black" opacity="0.55" mask="url(#invoice-crop-mask)" />
                                        <polygon
                                            points={`${quad.tl.x},${quad.tl.y} ${quad.tr.x},${quad.tr.y} ${quad.br.x},${quad.br.y} ${quad.bl.x},${quad.bl.y}`}
                                            fill="rgba(37, 99, 235, 0.12)"
                                            stroke="rgb(96, 165, 250)"
                                            strokeWidth="0.55"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                        <line x1={quad.tl.x + (quad.tr.x - quad.tl.x) / 3} y1={quad.tl.y + (quad.tr.y - quad.tl.y) / 3} x2={quad.bl.x + (quad.br.x - quad.bl.x) / 3} y2={quad.bl.y + (quad.br.y - quad.bl.y) / 3} stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
                                        <line x1={quad.tl.x + ((quad.tr.x - quad.tl.x) * 2) / 3} y1={quad.tl.y + ((quad.tr.y - quad.tl.y) * 2) / 3} x2={quad.bl.x + ((quad.br.x - quad.bl.x) * 2) / 3} y2={quad.bl.y + ((quad.br.y - quad.bl.y) * 2) / 3} stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
                                        <line x1={quad.tl.x + (quad.bl.x - quad.tl.x) / 3} y1={quad.tl.y + (quad.bl.y - quad.tl.y) / 3} x2={quad.tr.x + (quad.br.x - quad.tr.x) / 3} y2={quad.tr.y + (quad.br.y - quad.tr.y) / 3} stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
                                        <line x1={quad.tl.x + ((quad.bl.x - quad.tl.x) * 2) / 3} y1={quad.tl.y + ((quad.bl.y - quad.tl.y) * 2) / 3} x2={quad.tr.x + ((quad.br.x - quad.tr.x) * 2) / 3} y2={quad.tr.y + ((quad.br.y - quad.tr.y) * 2) / 3} stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
                                    </svg>
                                    {(["tl", "tr", "br", "bl"] as const).map((handle) => (
                                        <button
                                            key={handle}
                                            type="button"
                                            aria-label={`Ajustar esquina ${handle}`}
                                            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow-lg"
                                            style={{ left: `${quad[handle].x}%`, top: `${quad[handle].y}%` }}
                                            onPointerDown={(event) => startDrag(handle, event)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                            <button
                                type="button"
                                onClick={redetectCrop}
                                disabled={isDetectingCrop}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                            >
                                {isDetectingCrop ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
                                Detectar bordes
                            </button>
                            <button
                                type="button"
                                onClick={() => setQuad(defaultQuad)}
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
                                Procesar enderezada
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
