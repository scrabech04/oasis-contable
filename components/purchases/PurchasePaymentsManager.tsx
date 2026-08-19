"use client";

/**
 * Pagos de una compra, editables desde el detalle.
 *
 * El listado de compras solo deja registrar pagos mientras la compra no este saldada,
 * asi que una compra pagada de golpe se quedaba sin forma de adjuntarle el comprobante.
 * Aqui el boton esta siempre, y cada pago se puede reabrir para subirle el soporte
 * despues de registrado.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { deletePayment } from "@/app/actions";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { formatCurrency, formatDate } from "@/lib/format";

interface PurchasePaymentsManagerProps {
  purchase: any;
  paymentMethodLabels: Record<string, string>;
}

export function PurchasePaymentsManager({ purchase, paymentMethodLabels }: PurchasePaymentsManagerProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const payments = purchase.payments || [];

  const openNewPayment = () => {
    setEditingPayment(null);
    setIsDialogOpen(true);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Pagos registrados</h2>
        </div>
        <button
          type="button"
          onClick={openNewPayment}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={14} /> Registrar pago
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {payments.map((payment: any) => (
          <article key={payment.id} className="grid grid-cols-1 gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-black text-slate-900 dark:text-white">
                RD$ {formatCurrency(payment.amount)} · {paymentMethodLabels[payment.method] || payment.method}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {payment.date ? formatDate(payment.date) : "Sin fecha"}
                {payment.reference ? ` · Ref. ${payment.reference}` : ""}
              </p>
              {payment.notes && <p className="mt-2 text-sm text-slate-500">{payment.notes}</p>}
              {payment.withholdings?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {payment.withholdings.map((withholding: any) => (
                    <span
                      key={withholding.id}
                      className="rounded-full border border-orange-100 bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-700"
                    >
                      {withholding.type}: RD$ {formatCurrency(withholding.amount)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {payment.attachments?.length > 0 ? (
                payment.attachments.map((attachment: any) => (
                  <a
                    key={attachment.id}
                    href={`/api/payments/attachments/${attachment.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Paperclip className="h-4 w-4" />
                    Soporte
                  </a>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPayment(payment);
                    setIsDialogOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400"
                >
                  <Paperclip className="h-4 w-4" />
                  Subir soporte
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingPayment(payment);
                  setIsDialogOpen(true);
                }}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30"
                title="Editar pago"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm("¿Eliminar este pago?")) {
                    await deletePayment(payment.id);
                    router.refresh();
                  }
                }}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                title="Eliminar pago"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
        {payments.length === 0 && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-400">No hay pagos registrados para esta compra.</p>
            <button
              type="button"
              onClick={openNewPayment}
              className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline"
            >
              <Plus size={14} /> Registrar el pago y adjuntar su soporte
            </button>
          </div>
        )}
      </div>

      <PaymentDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        targetId={purchase.id}
        targetType="PURCHASE"
        total={purchase.total}
        subtotal={purchase.subtotal}
        tax={purchase.tax}
        paidAmount={purchase.paidAmount}
        number={purchase.number || purchase.ncf || `Compra #${purchase.id}`}
        entityName={purchase.contact?.name || purchase.supplierName || "Proveedor"}
        onSuccess={() => router.refresh()}
        initialPaymentData={editingPayment}
      />
    </section>
  );
}
