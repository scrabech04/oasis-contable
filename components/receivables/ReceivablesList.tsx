"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { formatCurrency } from "@/lib/format";

export function ReceivablesList({ receivables }: { receivables: any[] }) {
  const router = useRouter();
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  return (
    <>
      <div className="space-y-3 md:hidden">
        {receivables.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
              <span className="material-icons-round">account_balance_wallet</span>
            </div>
            <p className="text-sm font-black text-slate-900 dark:text-white">No hay cuentas por cobrar</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No encontramos facturas pendientes con esos filtros.</p>
          </div>
        ) : (
          receivables.map((inv) => {
            const pendingAmount = inv.total - inv.paidAmount;
            const isOverdue = new Date(inv.dueDate) < new Date();

            return (
              <article
                key={inv.id}
                className={clsx(
                  "rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900",
                  isOverdue ? "border-red-200 dark:border-red-900/60" : "border-slate-200 dark:border-slate-800"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        isOverdue ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                      )}>
                        <span className="material-icons-round text-[20px]">person</span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-white">{inv.client.name}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {inv.number} - {inv.ncf || "SIN NCF"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span className={clsx("inline-flex items-center gap-1", isOverdue && "text-red-600 dark:text-red-300")}>
                        <span className="material-icons-round text-sm">calendar_today</span>
                        Vence {new Date(inv.dueDate).toLocaleDateString()}
                      </span>
                      <span className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                        isOverdue ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-slate-50 text-slate-500 dark:bg-slate-800"
                      )}>
                        {isOverdue ? "Vencida" : inv.status === "PARTIAL" ? "Parcial" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pendiente</p>
                    <p className="font-mono text-base font-black text-blue-600 dark:text-blue-300">RD${formatCurrency(pendingAmount)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <AmountCell label="Total" value={inv.total} />
                  <AmountCell label="Cobrado" value={inv.paidAmount} tone="green" />
                  <AmountCell label="Resta" value={pendingAmount} tone="strong" />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <Link href={`/invoices/${inv.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    <span className="material-icons-round text-[18px]">open_in_new</span>
                    Ver factura
                  </Link>
                  <button
                    onClick={() => setSelectedInvoice(inv)}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-blue-500/20"
                  >
                    Cobrar
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Factura / NCF</th>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Cliente</th>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Vencimiento</th>
                <th className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Total</th>
                <th className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Cobrado</th>
                <th className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Pendiente</th>
                <th className="w-[100px] px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {receivables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center italic text-slate-500">
                    No hay facturas pendientes de cobro.
                  </td>
                </tr>
              ) : (
                receivables.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">{inv.number}</div>
                      <div className="mt-0.5 font-numeric text-[11px] tracking-wider text-slate-400">{inv.ncf || "SIN NCF"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className="material-icons-round text-sm text-slate-400">person</span>
                        {inv.client.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx("text-xs font-numeric", new Date(inv.dueDate) < new Date() ? "font-bold text-red-600" : "text-slate-600 dark:text-slate-400")}>
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-numeric text-slate-600 dark:text-slate-400">RD${formatCurrency(inv.total)}</td>
                    <td className="px-6 py-4 text-right font-numeric text-emerald-600 dark:text-emerald-400">RD${formatCurrency(inv.paidAmount)}</td>
                    <td className="px-6 py-4 text-right font-numeric font-bold text-slate-900 dark:text-white">RD${formatCurrency(inv.total - inv.paidAmount)}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setSelectedInvoice(inv)} className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-white">
                        COBRAR
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedInvoice ? (
        <PaymentDialog
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          targetId={selectedInvoice.id}
          targetType="INVOICE"
          total={selectedInvoice.total}
          subtotal={selectedInvoice.subtotal}
          tax={selectedInvoice.tax}
          paidAmount={selectedInvoice.paidAmount}
          number={selectedInvoice.number}
          entityName={selectedInvoice.client.name}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function AmountCell({ label, value, tone = "muted" }: { label: string; value: number; tone?: "muted" | "green" | "strong" }) {
  const color = tone === "green" ? "text-emerald-600 dark:text-emerald-400" : tone === "strong" ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200";
  return (
    <div>
      <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-xs font-bold ${color}`}>RD${formatCurrency(value)}</p>
    </div>
  );
}
