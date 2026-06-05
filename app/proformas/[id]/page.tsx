import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit2 } from "lucide-react";
import { getProforma } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { ProformaPaymentsPanel } from "@/components/proformas/ProformaPaymentsPanel";
import { ConvertProformaButton } from "@/components/proformas/ConvertProformaButton";

const labels: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  CONVERTED: "Convertida",
  CANCELLED: "Cancelada",
};

export default async function ProformaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proformaId = Number(id);
  if (!Number.isInteger(proformaId)) notFound();
  const proforma = await getProforma(proformaId);
  if (!proforma) notFound();
  const pending = Math.max(proforma.total - proforma.paidAmount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <Link href="/proformas">
            <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-blue-600">Prefactura / documento no fiscal</p>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">{proforma.number}</h1>
            <p className="mt-1 text-sm text-slate-500">{proforma.contact?.name} · {formatDate(proforma.date)} · {labels[proforma.status] || proforma.status}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConvertProformaButton proformaId={proforma.id} disabled={proforma.status !== "PAID"} />
          {proforma.status !== "CONVERTED" && (
            <Link href={`/proformas/${proforma.id}/edit`}>
              <Button size="sm" className="gap-2 bg-blue-600 text-white hover:bg-blue-700"><Edit2 className="h-4 w-4" />Editar</Button>
            </Link>
          )}
        </div>
      </header>

      {proforma.status !== "PAID" && proforma.status !== "CONVERTED" && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Esta prefactura puede recibir anticipos, pero solo se convierte a factura fiscal cuando este pagada completa.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Subtotal" value={`RD$ ${formatCurrency(proforma.subtotal)}`} />
        <Metric label="ITBIS estimado" value={`RD$ ${formatCurrency(proforma.tax)}`} />
        <Metric label="Total" value={`RD$ ${formatCurrency(proforma.total)}`} tone="blue" />
        <Metric label="Pendiente" value={`RD$ ${formatCurrency(pending)}`} tone="orange" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Items proforma</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-5 py-3">Descripcion</th>
                <th className="px-5 py-3 text-right">Cant.</th>
                <th className="px-5 py-3 text-right">Precio</th>
                <th className="px-5 py-3 text-right">ITBIS</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {proforma.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium text-slate-900 dark:text-white">{item.description}</td>
                  <td className="px-5 py-4 text-right font-mono">{item.quantity}</td>
                  <td className="px-5 py-4 text-right font-mono">RD$ {formatCurrency(item.price)}</td>
                  <td className="px-5 py-4 text-right font-mono">{formatCurrency(item.taxRate)}%</td>
                  <td className="px-5 py-4 text-right font-mono font-black">RD$ {formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {proforma.items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="font-bold text-slate-900 dark:text-white">{item.description}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span>Cant. {item.quantity}</span>
                <span className="text-right">ITBIS {formatCurrency(item.taxRate)}%</span>
                <span>Unit. RD$ {formatCurrency(item.price)}</span>
                <span className="text-right font-mono font-black text-slate-900 dark:text-white">RD$ {formatCurrency(item.total)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {(proforma.notes || proforma.termsAndConditions || proforma.project) && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Info title="Notas" content={proforma.notes || "Sin notas."} />
          <Info title="Terminos y condiciones" content={proforma.termsAndConditions || "Sin terminos."} />
          {proforma.project && <Info title="Proyecto" content={proforma.project.name} />}
        </section>
      )}

      <ProformaPaymentsPanel proforma={proforma} />
    </div>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "orange" }) {
  const classes = {
    slate: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white",
    blue: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300",
    orange: "border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300",
  }[tone];
  return <div className={`rounded-2xl border p-4 shadow-sm ${classes}`}><p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p><p className="mt-2 font-mono text-lg font-black">{value}</p></div>;
}

function Info({ title, content }: { title: string; content: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{content}</p></div>;
}
