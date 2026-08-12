"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, Paperclip, QrCode, ShieldCheck, Trash2, Upload } from "lucide-react";
import { attachDgiiConstancia, deletePurchaseAttachment, replacePurchaseAttachment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { QRScannerDialog } from "./QRScannerDialog";

const DGII_CONSTANCIA_TYPE = "DGII_VERIFICATION";

interface PurchaseAttachmentManagerProps {
  purchaseId: number;
  attachments: Array<{
    id: number;
    fileName: string;
    fileSize: number;
    isInline: boolean;
    type?: string;
  }>;
}

function fileSizeLabel(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function PurchaseAttachmentManager({ purchaseId, attachments }: PurchaseAttachmentManagerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showTimbreInput, setShowTimbreInput] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [timbreUrl, setTimbreUrl] = useState("");
  const [isVerifying, startVerifying] = useTransition();
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const hasLegacyAttachment = attachments.some((attachment) => !attachment.isInline);
  const hasConstancia = attachments.some((attachment) => attachment.type === DGII_CONSTANCIA_TYPE);

  const runConstancia = (url: string, onDone?: () => void) =>
    startVerifying(async () => {
      const result = await attachDgiiConstancia(purchaseId, url);
      if (result.success) {
        setMessage("Constancia de la DGII adjuntada correctamente.");
        setTimbreUrl("");
        setShowTimbreInput(false);
        onDone?.();
        return;
      }
      setMessage(result.error);
      onDone?.();
    });

  const handleConstancia = () => {
    const url = timbreUrl.trim();
    if (!url) {
      setMessage("Pega el enlace del timbre que trae el QR de la factura.");
      return;
    }

    setMessage(null);
    runConstancia(url);
  };

  const handleScanned = (data: { timbreUrl?: string }) => {
    setMessage(null);
    setIsScannerOpen(false);
    runConstancia(String(data?.timbreUrl || ""));
  };

  const handleRemove = async (attachmentId: number, fileName: string) => {
    if (!confirm(`Se quitará "${fileName}" de esta compra. Esta acción no se puede deshacer. ¿Continuar?`)) {
      return;
    }

    setMessage(null);
    setIsRemoving(attachmentId);

    try {
      const result = await deletePurchaseAttachment(attachmentId);
      setMessage(result.success ? "Adjunto eliminado correctamente." : result.error);
    } catch {
      setMessage("No fue posible eliminar el adjunto.");
    } finally {
      setIsRemoving(null);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setMessage(null);
    const formData = new FormData();
    formData.append("attachment", file);

    startTransition(async () => {
      const result = await replacePurchaseAttachment(purchaseId, formData);
      if (result.success) {
        setMessage("Soporte actualizado correctamente.");
        return;
      }
      setMessage(result.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Adjuntos</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          className="h-9 gap-2 rounded-xl text-xs font-black"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {attachments.length > 0 ? "Reemplazar" : "Subir soporte"}
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck
              className={`h-4 w-4 shrink-0 ${hasConstancia ? "text-emerald-600" : "text-slate-400"}`}
            />
            <p className="min-w-0 text-xs font-bold text-slate-600 dark:text-slate-300">
              {hasConstancia
                ? "Constancia de la DGII adjuntada"
                : "Sin constancia de verificacion de la DGII"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isVerifying}
              className="h-8 gap-1.5 rounded-lg text-[11px] font-black"
              onClick={() => setIsScannerOpen(true)}
            >
              <QrCode className="h-3.5 w-3.5" />
              {isVerifying ? "Consultando..." : "Escanear QR"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isVerifying}
              className="h-8 rounded-lg text-[11px] font-black"
              onClick={() => setShowTimbreInput((current) => !current)}
            >
              Pegar enlace
            </Button>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {hasConstancia
            ? "Puedes volver a escanear el QR de la factura para regenerarla con los datos actuales de la DGII."
            : "Escanea el codigo QR de la factura para consultar la DGII y adjuntar el PDF de constancia."}
        </p>

        {showTimbreInput && (
          <div className="mt-3 space-y-2">
            <input
              type="url"
              value={timbreUrl}
              onChange={(event) => setTimbreUrl(event.target.value)}
              placeholder="https://ecf.dgii.gov.do/ecf/ConsultaTimbre?..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Es el enlace al que apunta el codigo QR. Util si tienes la factura en pantalla, o si
              el QR no se deja escanear. Si la factura no trae QR, usa Reconstruir e-NCF.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={isVerifying}
              className="h-9 rounded-lg text-xs font-black"
              onClick={handleConstancia}
            >
              {isVerifying ? "Consultando DGII..." : "Consultar y adjuntar"}
            </Button>
          </div>
        )}
      </div>

      <QRScannerDialog
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSuccess={handleScanned}
        rawText
        title="Escanear QR de la factura"
        description="Apunta la camara al codigo QR para consultar la DGII y adjuntar la constancia a esta compra."
      />

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
      />

      {hasLegacyAttachment && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Este soporte fue guardado en almacenamiento temporal antiguo. Si no abre, vuelve a subir aqui el PDF o la foto para dejarlo persistente.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-1 rounded-xl border border-slate-200 pr-1 dark:border-slate-800"
          >
            <Link
              href={`/api/purchases/attachments/${attachment.id}`}
              target="_blank"
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-l-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="flex min-w-0 items-center gap-2">
                {attachment.type === DGII_CONSTANCIA_TYPE ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="min-w-0 truncate">{attachment.fileName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                {fileSizeLabel(attachment.fileSize)}
                <ExternalLink className="h-4 w-4" />
              </span>
            </Link>
            <button
              type="button"
              title="Quitar adjunto"
              aria-label={`Quitar ${attachment.fileName}`}
              disabled={isRemoving === attachment.id}
              onClick={() => handleRemove(attachment.id, attachment.fileName)}
              className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {attachments.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400 dark:border-slate-800">
            No hay archivos adjuntos.
          </p>
        )}
      </div>

      {message && (
        <p className={`rounded-xl px-3 py-2 text-xs font-bold ${message.includes("correctamente") ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
