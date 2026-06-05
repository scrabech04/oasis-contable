"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProforma } from "@/app/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { formatCurrency } from "@/lib/format";

const labels: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  CONVERTED: "Convertida",
  CANCELLED: "Cancelada",
};

function statusClass(status: string) {
  return clsx("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", {
    "border-slate-200 bg-slate-50 text-slate-500 dark:bg-slate-800": status === "DRAFT",
    "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300": status === "SENT",
    "border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300": status === "PARTIAL",
    "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300": status === "PAID" || status === "CONVERTED",
    "border-red-100 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300": status === "CANCELLED",
  });
}

export function ProformasTable({ proformas }: { proformas: any[] }) {
  const router = useRouter();

  return (
    <div>
      <div className="space-y-3 md:hidden">
        {proformas.map((proforma) => (
          <article key={proforma.id} onClick={() => router.push(`/proformas/${proforma.id}`)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white">{proforma.number}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">{proforma.contact?.name || "Sin cliente"}</p>
                <span className={clsx("mt-2", statusClass(proforma.status))}>{labels[proforma.status] || proforma.status}</span>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-black text-slate-900 dark:text-white">RD$ {formatCurrency(proforma.total)}</p>
                {proforma.paidAmount > 0 && <p className="mt-1 text-[10px] font-bold text-emerald-600">Anticipo RD$ {formatCurrency(proforma.paidAmount)}</p>}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-xs text-slate-500">{new Date(proforma.date).toLocaleDateString("es-DO")}</span>
              <div onClick={(event) => event.stopPropagation()} className="flex items-center gap-1 text-slate-400">
                <Link href={`/proformas/${proforma.id}`} className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800">
                  <span className="material-icons-round text-[20px]">visibility</span>
                </Link>
                {proforma.status !== "CONVERTED" && (
                  <Link href={`/proformas/${proforma.id}/edit`} className="rounded-lg p-2 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30">
                    <span className="material-icons-round text-[20px]">edit</span>
                  </Link>
                )}
                {proforma.status !== "CONVERTED" && <DeleteButton id={proforma.id} action={deleteProforma} variant="ghost_icon" />}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="px-6 py-4">Prefactura</th>
              <th className="px-6 py-4">Cliente</th>
              <th className="px-6 py-4">Fecha</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {proformas.map((proforma) => (
              <tr key={proforma.id} onClick={() => router.push(`/proformas/${proforma.id}`)} className="cursor-pointer transition hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                <td className="px-6 py-5 font-black text-slate-900 dark:text-white">{proforma.number}</td>
                <td className="px-6 py-5 text-slate-600 dark:text-slate-300">{proforma.contact?.name || "Sin cliente"}</td>
                <td className="px-6 py-5 text-slate-500">{new Date(proforma.date).toLocaleDateString("es-DO")}</td>
                <td className="px-6 py-5"><span className={statusClass(proforma.status)}>{labels[proforma.status] || proforma.status}</span></td>
                <td className="px-6 py-5 text-right">
                  <p className="font-mono font-black text-slate-900 dark:text-white">RD$ {formatCurrency(proforma.total)}</p>
                  {proforma.paidAmount > 0 && <p className="text-[10px] font-bold text-emerald-600">Anticipo RD$ {formatCurrency(proforma.paidAmount)}</p>}
                </td>
                <td className="px-6 py-5 text-right" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end gap-1 text-slate-400">
                    <Link href={`/proformas/${proforma.id}`} className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800">
                      <span className="material-icons-round text-[20px]">visibility</span>
                    </Link>
                    {proforma.status !== "CONVERTED" && (
                      <Link href={`/proformas/${proforma.id}/edit`} className="rounded-lg p-2 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30">
                        <span className="material-icons-round text-[20px]">edit</span>
                      </Link>
                    )}
                    {proforma.status !== "CONVERTED" && <DeleteButton id={proforma.id} action={deleteProforma} variant="ghost_icon" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
