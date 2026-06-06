"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, Paperclip, Upload } from "lucide-react";
import { replacePurchaseAttachment } from "@/app/actions";
import { Button } from "@/components/ui/button";

interface PurchaseAttachmentManagerProps {
  purchaseId: number;
  attachments: Array<{
    id: number;
    fileName: string;
    fileSize: number;
    isInline: boolean;
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
  const hasLegacyAttachment = attachments.some((attachment) => !attachment.isInline);

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
          <Link
            key={attachment.id}
            href={`/api/purchases/attachments/${attachment.id}`}
            target="_blank"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 truncate">{attachment.fileName}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
              {fileSizeLabel(attachment.fileSize)}
              <ExternalLink className="h-4 w-4" />
            </span>
          </Link>
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
