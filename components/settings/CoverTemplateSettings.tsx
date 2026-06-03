"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { ImageIcon, RotateCcw } from "lucide-react";

type Settings = {
  coverImageUrl?: string | null;
  coverImageFit?: string | null;
  coverImagePosition?: string | null;
  coverOverlayOpacity?: number | null;
  coverTextPosition?: string | null;
  coverTextColor?: string | null;
  coverAccentColor?: string | null;
  coverShowLogo?: boolean | null;
  coverShowClient?: boolean | null;
  coverShowDocumentNumber?: boolean | null;
  coverShowDate?: boolean | null;
  coverShowProject?: boolean | null;
};

const positions = [
  ["BOTTOM_LEFT", "Abajo izquierda"],
  ["BOTTOM_RIGHT", "Abajo derecha"],
  ["CENTER", "Centro"],
  ["TOP_LEFT", "Arriba izquierda"],
  ["TOP_RIGHT", "Arriba derecha"],
];

const imagePositions = [
  ["CENTER", "Centro"],
  ["TOP", "Arriba"],
  ["BOTTOM", "Abajo"],
  ["LEFT", "Izquierda"],
  ["RIGHT", "Derecha"],
];

function objectPosition(value?: string | null) {
  const map: Record<string, string> = {
    TOP: "center top",
    BOTTOM: "center bottom",
    LEFT: "left center",
    RIGHT: "right center",
    CENTER: "center center",
  };
  return map[value || "CENTER"] || map.CENTER;
}

function textPositionClass(value?: string | null) {
  const map: Record<string, string> = {
    TOP_LEFT: "items-start justify-start text-left",
    TOP_RIGHT: "items-end justify-start text-right",
    CENTER: "items-center justify-center text-center",
    BOTTOM_LEFT: "items-start justify-end text-left",
    BOTTOM_RIGHT: "items-end justify-end text-right",
  };
  return map[value || "BOTTOM_LEFT"] || map.BOTTOM_LEFT;
}

async function fileToOptimizedDataUrl(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function CoverTemplateSettings({ settings }: { settings: Settings }) {
  const [previewImage, setPreviewImage] = useState(settings.coverImageUrl || "");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [fit, setFit] = useState(settings.coverImageFit || "COVER");
  const [imagePosition, setImagePosition] = useState(settings.coverImagePosition || "CENTER");
  const [overlay, setOverlay] = useState(String(settings.coverOverlayOpacity ?? 0.35));
  const [textPosition, setTextPosition] = useState(settings.coverTextPosition || "BOTTOM_LEFT");
  const [textColor, setTextColor] = useState(settings.coverTextColor || "#ffffff");
  const [accentColor, setAccentColor] = useState(settings.coverAccentColor || "#2563eb");
  const [processing, setProcessing] = useState(false);

  const previewStyle = useMemo(() => ({
    color: textColor,
    "--cover-accent": accentColor,
  } as CSSProperties), [accentColor, textColor]);

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:col-span-2">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Plantilla de portada</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Esta portada se usa al marcar portada en facturas y cotizaciones.
        </p>
      </div>

      <input type="hidden" name="coverImageDataUrl" value={imageDataUrl} />
      <input type="hidden" name="removeCoverImage" value={removeImage ? "true" : "false"} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Imagen de fondo</span>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/50">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white dark:text-slate-300"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setProcessing(true);
                  try {
                    const optimized = await fileToOptimizedDataUrl(file);
                    setImageDataUrl(optimized);
                    setPreviewImage(optimized);
                    setRemoveImage(false);
                  } finally {
                    setProcessing(false);
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {processing ? "Optimizando imagen..." : "Recomendado: imagen horizontal, JPG/WebP."}
                </span>
                {previewImage && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    onClick={() => {
                      setPreviewImage("");
                      setImageDataUrl("");
                      setRemoveImage(true);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Ajuste de imagen</span>
              <select name="coverImageFit" value={fit} onChange={(e) => setFit(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <option value="COVER">Cubrir portada</option>
                <option value="CONTAIN">Contener completa</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Foco de imagen</span>
              <select name="coverImagePosition" value={imagePosition} onChange={(e) => setImagePosition(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                {imagePositions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Posicion de datos</span>
              <select name="coverTextPosition" value={textPosition} onChange={(e) => setTextPosition(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                {positions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Oscurecer fondo</span>
              <input name="coverOverlayOpacity" type="range" min="0" max="0.85" step="0.05" value={overlay} onChange={(e) => setOverlay(e.target.value)} className="h-11 w-full" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Color texto</span>
              <input name="coverTextColor" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Color acento</span>
              <input name="coverAccentColor" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["coverShowLogo", "Mostrar marca/logo", settings.coverShowLogo ?? true],
              ["coverShowClient", "Mostrar cliente", settings.coverShowClient ?? true],
              ["coverShowDocumentNumber", "Mostrar numero", settings.coverShowDocumentNumber ?? true],
              ["coverShowDate", "Mostrar fecha", settings.coverShowDate ?? true],
              ["coverShowProject", "Mostrar proyecto", settings.coverShowProject ?? true],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className={`relative aspect-[0.707/1] overflow-hidden rounded-xl bg-slate-900 p-5 ${textPositionClass(textPosition)}`} style={previewStyle}>
            {previewImage ? (
              <img
                src={previewImage}
                alt="Vista previa de portada"
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: fit === "CONTAIN" ? "contain" : "cover", objectPosition: objectPosition(imagePosition) }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-700">
                <ImageIcon className="h-16 w-16" />
              </div>
            )}
            <div className="absolute inset-0 bg-black" style={{ opacity: Number(overlay) }} />
            <div className="relative z-10 max-w-[78%]">
              <div className="mb-8 h-1 w-16 rounded-full bg-[var(--cover-accent)]" />
              <p className="text-[10px] font-black uppercase tracking-[0.35em] opacity-80">oFlow by Oasis</p>
              <h3 className="mt-3 text-2xl font-black leading-tight">COTIZACION</h3>
              <p className="mt-3 text-sm font-bold">MINISTERIO ENERGIA Y MINAS</p>
              <p className="mt-1 text-[11px] opacity-85">Documento COT-0619 · 03/06/2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
