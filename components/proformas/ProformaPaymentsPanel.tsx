"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { WalletCards } from "lucide-react";

export function ProformaPaymentsPanel({ proforma }: { proforma: any }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const canReceivePayment = !["CONVERTED", "CANCELLED"].includes(proforma.status);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <WalletCards className="h-5 w-5 text-blue-600" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Anticipos recibidos</h2>
        </div>
        {canReceivePayment && (
          <Button onClick={() => setOpen(true)} size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
            Registrar anticipo
          </Button>
        )}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {proforma.payments.map((payment: any) => (
          <article key={payment.id} className="grid grid-cols-1 gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-black text-slate-900 dark:text-white">RD$ {formatCurrency(payment.amount)} · {payment.method}</p>
              <p className="mt-1 text-sm text-slate-500">{formatDate(payment.date)}{payment.reference ? ` · Ref. ${payment.reference}` : ""}</p>
              {payment.notes && <p className="mt-2 text-sm text-slate-500">{payment.notes}</p>}
            </div>
            {payment.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-2 md:justify-end">
                {payment.attachments.map((attachment: any) => (
                  <a key={attachment.id} href={`/api/payments/attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                    Soporte
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
        {proforma.payments.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No hay anticipos registrados para esta prefactura.</p>
        )}
      </div>

      <PaymentDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        targetId={proforma.id}
        targetType="PROFORMA"
        total={proforma.total}
        subtotal={proforma.subtotal}
        tax={proforma.tax}
        paidAmount={proforma.paidAmount}
        number={proforma.number}
        entityName={proforma.contact?.name || "Sin cliente"}
        onSuccess={() => router.refresh()}
      />
    </section>
  );
}
