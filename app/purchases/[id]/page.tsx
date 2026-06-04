import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CreditCard, Edit2, ExternalLink, FileText, FolderOpen, Paperclip, ReceiptText } from "lucide-react";
import { getPurchase } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";

interface PurchaseDetailPageProps {
  params: Promise<{ id: string }>;
}

const statusLabels: Record<string, string> = {
  OPEN: "Pendiente",
  PARTIAL: "Pago parcial",
  PAID: "Saldada",
};

const taxTreatmentLabels: Record<string, string> = {
  LOCAL_CREDIT: "Credito fiscal",
  LOCAL_NO_CREDIT: "Sin credito fiscal",
  FOREIGN_EXPENSE: "Gasto internacional",
  IMPORT_GOODS: "Importacion",
  FOREIGN_WITHHOLDING: "Exterior con retencion",
};

const paymentMethodLabels: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CARD: "Tarjeta",
  PAYPAL: "PayPal",
  OTHER: "Otro",
};

function statusClass(status: string) {
  if (status === "PAID") return "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300";
  if (status === "PARTIAL") return "border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function websiteHref(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function formatMaybeDate(value: Date | string | null | undefined) {
  return value ? formatDate(value) : "No definido";
}

export default async function PurchaseDetailPage({ params }: PurchaseDetailPageProps) {
  const { id } = await params;
  const purchaseId = Number(id);

  if (!Number.isInteger(purchaseId)) {
    notFound();
  }

  const purchase = await getPurchase(purchaseId);

  if (!purchase) {
    notFound();
  }

  const supplierName = purchase.contact?.name || purchase.supplierName || "Proveedor sin nombre";
  const supplierTaxId = purchase.contact?.taxId || purchase.supplierTaxId || "";
  const supplierWebsite = websiteHref(purchase.supplierWebsiteUrl || purchase.contact?.website);
  const isForeign = purchase.origin === "FOREIGN" || ["FOREIGN_EXPENSE", "IMPORT_GOODS", "FOREIGN_WITHHOLDING"].includes(purchase.taxTreatment);
  const pendingAmount = Math.max((Number(purchase.total) || 0) - (Number(purchase.paidAmount) || 0), 0);
  const sourceCurrency = purchase.currency === "USD" ? "US$" : "RD$";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/purchases">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Compra {purchase.ncf || purchase.number || `#${purchase.id}`}
              </h1>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(purchase.status)}`}>
                {statusLabels[purchase.status] || purchase.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Registrada el {formatMaybeDate(purchase.date)} · {supplierName}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {purchase.attachments[0] && (
            <Link href={`/api/purchases/attachments/${purchase.attachments[0].id}`} target="_blank">
              <Button variant="outline" size="sm" className="gap-2">
                <Paperclip className="h-4 w-4" />
                Soporte
              </Button>
            </Link>
          )}
          <Link href={`/purchases/${purchase.id}/edit`}>
            <Button size="sm" className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
              <Edit2 className="h-4 w-4" />
              Editar
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Subtotal</p>
          <p className="mt-2 font-mono text-lg font-black text-slate-900 dark:text-white">RD$ {formatCurrency(purchase.subtotal)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Impuestos</p>
          <p className="mt-2 font-mono text-lg font-black text-slate-900 dark:text-white">RD$ {formatCurrency(purchase.tax)}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm dark:border-blue-900/40 dark:bg-blue-900/20">
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Total</p>
          <p className="mt-2 font-mono text-lg font-black text-blue-700 dark:text-blue-300">RD$ {formatCurrency(purchase.total)}</p>
          {purchase.currency === "USD" && (
            <p className="mt-1 text-[11px] font-bold text-blue-500">
              {sourceCurrency} {formatCurrency(purchase.sourceTotal || 0)} @ RD$ {formatCurrency(purchase.exchangeRate)}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 shadow-sm dark:border-orange-900/40 dark:bg-orange-900/20">
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-600">Pendiente</p>
          <p className="mt-2 font-mono text-lg font-black text-orange-700 dark:text-orange-300">RD$ {formatCurrency(pendingAmount)}</p>
          <p className="mt-1 text-[11px] font-bold text-orange-500">Pagado: RD$ {formatCurrency(purchase.paidAmount)}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <ReceiptText className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Detalle del documento</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Info label="Proveedor" value={supplierName} />
            <Info label="RNC / Cedula" value={isForeign ? "No aplica proveedor internacional" : supplierTaxId || "Sin RNC registrado"} />
            <Info label="NCF / e-NCF" value={purchase.ncf || "Sin NCF"} />
            <Info label="Numero interno" value={purchase.number || `Compra #${purchase.id}`} />
            <Info label="Fecha emision" value={formatMaybeDate(purchase.date)} icon={<CalendarDays className="h-4 w-4" />} />
            <Info label="Vencimiento" value={formatMaybeDate(purchase.dueDate)} />
            <Info label="Clasificacion fiscal" value={taxTreatmentLabels[purchase.taxTreatment] || purchase.taxTreatment} />
            <Info label="Tipo de costo 606" value={purchase.costType || "No definido"} />
            <Info label="Origen" value={isForeign ? "Internacional" : "Local"} />
            <Info label="Credito fiscal" value={purchase.hasFiscalCredit ? "Si aplica" : "No aplica"} />
            {purchase.project && (
              <div className="sm:col-span-2">
                <Link href={`/projects/${purchase.project.id}`} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                  <FolderOpen className="h-4 w-4" />
                  Proyecto: {purchase.project.name}
                </Link>
              </div>
            )}
            {supplierWebsite && (
              <div className="sm:col-span-2">
                <Link href={supplierWebsite} target="_blank" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700">
                  <ExternalLink className="h-4 w-4" />
                  Sitio oficial del proveedor
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <FileText className="h-5 w-5 text-orange-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Notas y soportes</h2>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notas</p>
              <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                {purchase.notes || "Sin notas registradas."}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Adjuntos</p>
              <div className="mt-2 space-y-2">
                {purchase.attachments.map((attachment) => (
                  <Link key={attachment.id} href={`/api/purchases/attachments/${attachment.id}`} target="_blank" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800">
                    <span className="min-w-0 truncate">{attachment.fileName}</span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
                {purchase.attachments.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400 dark:border-slate-800">
                    No hay archivos adjuntos.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <ReceiptText className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Items de compra</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-5 py-3">Descripcion</th>
                <th className="px-5 py-3 text-right">Cant.</th>
                <th className="px-5 py-3 text-right">Costo unit.</th>
                <th className="px-5 py-3 text-right">Impuesto</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {purchase.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium text-slate-900 dark:text-white">{item.description}</td>
                  <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-300">{item.quantity}</td>
                  <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-300">RD$ {formatCurrency(item.price)}</td>
                  <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-300">{formatCurrency(item.taxRate)}%</td>
                  <td className="px-5 py-4 text-right font-mono font-black text-slate-900 dark:text-white">RD$ {formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {purchase.items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="font-bold text-slate-900 dark:text-white">{item.description}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span>Cant. {item.quantity}</span>
                <span className="text-right">ITBIS {formatCurrency(item.taxRate)}%</span>
                <span>Unit. RD$ {formatCurrency(item.price)}</span>
                <span className="text-right font-mono font-black text-slate-900 dark:text-white">RD$ {formatCurrency(item.total)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Pagos registrados</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {purchase.payments.map((payment) => (
            <article key={payment.id} className="grid grid-cols-1 gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-black text-slate-900 dark:text-white">
                  RD$ {formatCurrency(payment.amount)} · {paymentMethodLabels[payment.method] || payment.method}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatMaybeDate(payment.date)}{payment.reference ? ` · Ref. ${payment.reference}` : ""}
                </p>
                {payment.notes && <p className="mt-2 text-sm text-slate-500">{payment.notes}</p>}
                {payment.withholdings.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {payment.withholdings.map((withholding) => (
                      <span key={withholding.id} className="rounded-full border border-orange-100 bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-700">
                        {withholding.type}: RD$ {formatCurrency(withholding.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {payment.attachments.map((attachment) => (
                  <Link key={attachment.id} href={`/api/payments/attachments/${attachment.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Paperclip className="h-4 w-4" />
                    Soporte
                  </Link>
                ))}
              </div>
            </article>
          ))}
          {purchase.payments.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No hay pagos registrados para esta compra.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
