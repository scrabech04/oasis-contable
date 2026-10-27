"use client";

/**
 * Estado de la factura ante la DGII y los botones para enviarla o consultar.
 * Solo se muestra cuando la factura tiene un e-NCF (serie E).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { RefreshCw, Send, ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { emitInvoiceEcf, refreshInvoiceEcf, type InvoiceEcfStatus } from "@/app/ecf-actions";

const STATUS_LABELS: Record<string, string> = {
  FIRMADO: "Firmado, sin enviar",
  EN_PROCESO: "En proceso en la DGII",
  ACEPTADO: "Aceptado por la DGII",
  ACEPTADO_CONDICIONAL: "Aceptado condicional",
  RECHAZADO: "Rechazado por la DGII",
  ERROR_ENVIO: "No se pudo enviar",
};

const RECEIVER_LABELS: Record<string, string> = {
  ACUSE_RECIBIDO: "El comprador acuso recibo",
  NO_RECIBIDO: "El comprador lo rechazo al recibirlo",
  NO_ELECTRONICO: "El comprador no es emisor electronico: entregale el PDF",
  ERROR: "No se pudo entregar al comprador",
};

const ENV_LABELS: Record<string, string> = {
  TesteCF: "Pruebas (TesteCF)",
  CerteCF: "Certificacion (CerteCF)",
  eCF: "Produccion",
};

export function EcfInvoicePanel({ invoiceId, state }: { invoiceId: number; state: InvoiceEcfStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"emit" | "refresh" | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  if (!state.applicable) return null;
  const emission = state.emission;
  const status = emission?.status;
  const ok = status === "ACEPTADO" || status === "ACEPTADO_CONDICIONAL";
  const canEmit =
    Boolean(state.environment) &&
    (!emission || status === "FIRMADO" || status === "ERROR_ENVIO" || (status === "RECHAZADO" && emission.sequenceUsed === false));

  const run = async (kind: "emit" | "refresh") => {
    if (busy) return;
    if (kind === "emit" && state.environment === "eCF") {
      if (!confirm("Se enviara a la DGII en PRODUCCION, con validez fiscal. ¿Continuar?")) return;
    }
    setBusy(kind);
    setDetails([]);
    try {
      const result = kind === "emit" ? await emitInvoiceEcf(invoiceId) : await refreshInvoiceEcf(invoiceId);
      if (result.success) {
        toast.success(STATUS_LABELS[result.status] || result.status);
      } else {
        toast.error(result.error);
        setDetails(result.details || []);
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo completar", "Revisa tu conexion e intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="no-print rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={clsx("p-2 rounded-lg", {
              "bg-emerald-100 text-emerald-700": ok,
              "bg-red-100 text-red-700": status === "RECHAZADO" || status === "ERROR_ENVIO",
              "bg-amber-100 text-amber-700": status === "EN_PROCESO" || status === "FIRMADO",
              "bg-slate-100 text-slate-600": !status,
            })}
          >
            {ok ? <ShieldCheck className="h-5 w-5" /> : status === "EN_PROCESO" ? <Clock className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Facturacion electronica: {status ? STATUS_LABELS[status] || status : "pendiente de enviar"}
            </p>
            <p className="text-xs text-slate-500">
              {state.environment ? ENV_LABELS[state.environment] : "La facturacion electronica no esta activada en este perfil (Configuracion)."}
              {emission ? ` · Codigo de seguridad ${emission.securityCode}` : ""}
              {emission?.trackId ? ` · TrackId ${emission.trackId}` : ""}
              {emission?.isSummary ? " · Enviado como resumen (consumo < RD$250,000)" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {emission && emission.status !== "FIRMADO" ? (
            <Button variant="outline" size="sm" className="gap-2" disabled={busy !== null} onClick={() => run("refresh")}>
              <RefreshCw className={clsx("h-4 w-4", busy === "refresh" && "animate-spin")} /> Consultar estado
            </Button>
          ) : null}
          {canEmit ? (
            <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" disabled={busy !== null} onClick={() => run("emit")}>
              <Send className={clsx("h-4 w-4", busy === "emit" && "animate-pulse")} />
              {emission ? "Reenviar a la DGII" : "Enviar a la DGII"}
            </Button>
          ) : null}
        </div>
      </div>

      {emission?.messages.length ? (
        <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
          {emission.messages.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      ) : null}
      {details.length ? (
        <ul className="text-xs text-red-700 list-disc pl-5 space-y-1">
          {details.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      ) : null}
      {status === "RECHAZADO" && emission?.sequenceUsed !== false ? (
        <p className="text-xs text-red-700">
          El e-NCF de esta factura ya quedo usado. Para corregirla emite otra factura con un e-NCF nuevo.
        </p>
      ) : null}
      {emission?.receiverStatus ? (
        <p className="text-xs text-slate-500">
          {RECEIVER_LABELS[emission.receiverStatus] || emission.receiverStatus}
          {emission.receiverMessage ? ` — ${emission.receiverMessage}` : ""}
        </p>
      ) : null}
      {emission?.commercialStatus ? (
        <p className={clsx("text-xs", emission.commercialStatus === "APROBADO" ? "text-emerald-700" : "text-red-700")}>
          Aprobacion comercial del comprador: {emission.commercialStatus === "APROBADO" ? "aprobada" : "rechazada"}
          {emission.commercialReason ? ` — ${emission.commercialReason}` : ""}
        </p>
      ) : null}
    </section>
  );
}
