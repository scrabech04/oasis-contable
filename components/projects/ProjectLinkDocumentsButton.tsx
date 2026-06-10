"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getProjectLinkCandidates, setProjectDocumentLink } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type Candidate = {
  id: number;
  number?: string | null;
  ncf?: string | null;
  date: Date | string;
  total: number;
  paidAmount?: number | null;
  status: string;
  projectId?: number | null;
  contact?: { name?: string | null } | null;
  supplierName?: string | null;
};

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
}

function DocumentRow({
  doc,
  type,
  projectId,
  onLinked,
}: {
  doc: Candidate;
  type: "invoice" | "purchase";
  projectId: number;
  onLinked: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const linked = doc.projectId === projectId;
  const label = doc.number || doc.ncf || `${type === "invoice" ? "Factura" : "Compra"} #${doc.id}`;
  const entity = type === "invoice" ? doc.contact?.name : doc.contact?.name || doc.supplierName;

  const toggleLink = () => {
    startTransition(async () => {
      const result = await setProjectDocumentLink(projectId, type, doc.id, !linked);
      if (!result.success) {
        alert(result.error);
        return;
      }
      onLinked();
      router.refresh();
    });
  };

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-mono text-sm font-black text-slate-950 dark:text-white">{label}</p>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${linked ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>
            {linked ? "Vinculada" : "Sin proyecto"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {formatDate(doc.date)} · {entity || "Sin contacto"} · RD$ {formatCurrency(doc.total)}
        </p>
      </div>
      <Button
        type="button"
        variant={linked ? "outline" : "primary"}
        size="sm"
        onClick={toggleLink}
        disabled={isPending}
        className={linked ? "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" : "bg-blue-700 text-white hover:bg-blue-800"}
      >
        {isPending ? "Guardando..." : linked ? "Desvincular" : "Vincular"}
      </Button>
    </div>
  );
}

export function ProjectLinkDocumentsButton({ projectId }: { projectId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"invoice" | "purchase">("invoice");
  const [data, setData] = useState<{ invoices: Candidate[]; purchases: Candidate[] } | null>(null);

  const openDialog = async () => {
    setIsOpen(true);
    if (data) return;
    setIsLoading(true);
    try {
      const result = await getProjectLinkCandidates(projectId);
      if (!result) {
        alert("No se pudo cargar el proyecto.");
        setIsOpen(false);
        return;
      }
      setData({ invoices: result.invoices, purchases: result.purchases });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = async () => {
    const result = await getProjectLinkCandidates(projectId);
    if (result) setData({ invoices: result.invoices, purchases: result.purchases });
  };

  const activeRows = useMemo(() => {
    if (!data) return [];
    return activeTab === "invoice" ? data.invoices : data.purchases;
  }, [activeTab, data]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openDialog}
        className="h-9 w-full gap-2 border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
      >
        <span className="material-icons-outlined text-[18px]">link</span>
        Vincular
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center" onClick={() => setIsOpen(false)}>
          <div className="premium-enter max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">Vincular documentos existentes</h2>
                <p className="mt-1 text-sm text-slate-500">Asocia facturas o compras ya registradas a este proyecto.</p>
              </div>
              <button className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => setIsOpen(false)} title="Cerrar">
                <span className="material-icons-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="border-b border-slate-100 px-5 pt-4 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-black transition ${activeTab === "invoice" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-500"}`}
                  onClick={() => setActiveTab("invoice")}
                >
                  Facturas {data ? `(${data.invoices.length})` : ""}
                </button>
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-black transition ${activeTab === "purchase" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-500"}`}
                  onClick={() => setActiveTab("purchase")}
                >
                  Compras {data ? `(${data.purchases.length})` : ""}
                </button>
              </div>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-5">
              {isLoading ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-800">Cargando documentos...</div>
              ) : activeRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                  <p className="font-black text-slate-600 dark:text-slate-300">No hay documentos disponibles.</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Las facturas se filtran por el cliente del proyecto; las compras muestran registros sin proyecto o ya vinculados.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeRows.map((doc) => (
                    <DocumentRow key={`${activeTab}-${doc.id}`} doc={doc} type={activeTab} projectId={projectId} onLinked={refreshData} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
