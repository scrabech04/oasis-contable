"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { formatCurrency } from "@/lib/format";

export function PayablesList({ payables }: { payables: any[] }) {
  const router = useRouter();
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);

  return (
    <>
      <div className="space-y-3 md:hidden">
        {payables.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-900/30">
              <span className="material-icons-round">payments</span>
            </div>
            <p className="text-sm font-black text-slate-900 dark:text-white">No hay cuentas por pagar</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No encontramos obligaciones pendientes con esos filtros.</p>
          </div>
        ) : (
          payables.map((purchase) => {
            const supplierName = purchase.contact?.name || purchase.supplierName || "Proveedor Informal";
            const pendingAmount = purchase.total - purchase.paidAmount;

            return (
              <article key={purchase.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
                        <span className="material-icons-round text-[20px]">storefront</span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-white">{supplierName}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {purchase.number || "Compra"} - {purchase.ncf || "SIN NCF"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-icons-round text-sm">calendar_today</span>
                        {new Date(purchase.date).toLocaleDateString()}
                      </span>
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500 dark:bg-slate-800">
                        {purchase.status === "PAID" ? "Saldada" : purchase.status === "PARTIAL" ? "Parcial" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pendiente</p>
                    <p className="font-mono text-base font-black text-orange-600 dark:text-orange-300">RD${formatCurrency(pendingAmount)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <AmountCell label="Total" value={purchase.total} />
                  <AmountCell label="Pagado" value={purchase.paidAmount} tone="green" />
                  <AmountCell label="Resta" value={pendingAmount} tone="strong" />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <Link href={`/purchases/${purchase.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    <span className="material-icons-round text-[18px]">open_in_new</span>
                    Ver compra
                  </Link>
                  <button
                    onClick={() => setSelectedPurchase(purchase)}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-orange-500/20"
                  >
                    Pagar
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
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Proveedor</th>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Fecha</th>
                <th className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Total</th>
                <th className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Pagado</th>
                <th className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Pendiente</th>
                <th className="w-[100px] px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-200">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {payables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center italic text-slate-500">
                    No hay cuentas por pagar pendientes.
                  </td>
                </tr>
              ) : (
                payables.map((purchase) => {
                  const supplierName = purchase.contact?.name || purchase.supplierName || "Proveedor Informal";
                  return (
                    <tr key={purchase.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white">{purchase.number || "Gasto/Compra"}</div>
                        <div className="mt-0.5 font-numeric text-[11px] tracking-wider text-slate-400">{purchase.ncf || "SIN NCF"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <span className="material-icons-round text-sm text-slate-400">storefront</span>
                          {supplierName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-numeric text-slate-600 dark:text-slate-400">{new Date(purchase.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right font-numeric text-slate-600 dark:text-slate-400">RD${formatCurrency(purchase.total)}</td>
                      <td className="px-6 py-4 text-right font-numeric text-emerald-600 dark:text-emerald-400">RD${formatCurrency(purchase.paidAmount)}</td>
                      <td className="px-6 py-4 text-right font-numeric font-bold text-slate-900 dark:text-white">RD${formatCurrency(purchase.total - purchase.paidAmount)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedPurchase(purchase)}
                          className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600 transition-all hover:bg-orange-600 hover:text-white dark:border-orange-900/40 dark:bg-orange-900/20"
                        >
                          PAGAR
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPurchase ? (
        <PaymentDialog
          isOpen={!!selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          targetId={selectedPurchase.id}
          targetType="PURCHASE"
          total={selectedPurchase.total}
          subtotal={selectedPurchase.subtotal}
          tax={selectedPurchase.tax}
          paidAmount={selectedPurchase.paidAmount}
          number={selectedPurchase.number || "Compra #" + selectedPurchase.id}
          entityName={selectedPurchase.contact?.name || selectedPurchase.supplierName || "Proveedor Informal"}
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
