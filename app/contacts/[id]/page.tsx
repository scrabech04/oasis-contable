import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactLedger } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

interface ContactDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PAID: "Pagada",
    PARTIAL: "Parcial",
    DRAFT: "Borrador",
    SENT: "Enviada",
    OPEN: "Abierta",
    OVERDUE: "Vencida",
    ACCEPTED: "Aceptada",
    REJECTED: "Rechazada",
    INVOICED: "Facturada",
    CONVERTED: "Convertida",
    CANCELLED: "Cancelada",
  };
  return labels[status] || status || "Sin estado";
}

function statusClass(status: string) {
  if (["PAID", "ACCEPTED", "CONVERTED"].includes(status)) return "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (["PARTIAL", "SENT", "OPEN"].includes(status)) return "border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300";
  if (["OVERDUE", "REJECTED", "CANCELLED"].includes(status)) return "border-red-100 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
  return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
}

function ContactTypeBadge({ type }: { type: string }) {
  const label = type === "CLIENT" ? "Cliente" : type === "SUPPLIER" ? "Proveedor" : "Cliente / Proveedor";
  const className =
    type === "CLIENT"
      ? "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
      : type === "SUPPLIER"
        ? "border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300"
        : "border-purple-100 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-300";

  return <span className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${className}`}>{label}</span>;
}

function money(value: number) {
  return `RD$ ${formatCurrency(value || 0)}`;
}

function MetricCard({ label, value, helper, tone = "slate" }: { label: string; value: string; helper?: string; tone?: "blue" | "orange" | "emerald" | "slate" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300",
    orange: "border-orange-100 bg-orange-50/70 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/20 dark:text-orange-300",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300",
    slate: "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-2 break-words font-mono text-lg font-black">{value}</p>
      {helper ? <p className="mt-1 text-[11px] opacity-70">{helper}</p> : null}
    </div>
  );
}

function ActivitySection({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: string;
  rows: Array<{ id: number; href: string; number: string; date: Date; status: string; total: number; paid?: number; project?: string | null; kind?: string }>;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
          <span className="material-icons-outlined text-[19px] text-blue-600 dark:text-blue-300">{icon}</span>
          {title}
        </h2>
        <span className="text-xs font-bold text-slate-400">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-sm text-slate-400">{empty}</div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <Link
              key={`${row.kind || title}-${row.id}`}
              href={row.href}
              className="grid gap-3 px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 md:grid-cols-[1fr_auto_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-mono text-sm font-black text-slate-900 dark:text-white">{row.number}</p>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(row.date)}
                  {row.project ? ` · ${row.project}` : ""}
                </p>
              </div>
              <div className="font-mono text-sm font-black text-slate-900 dark:text-white md:text-right">{money(row.total)}</div>
              {typeof row.paid === "number" ? (
                <div className="text-xs font-bold text-slate-500 md:min-w-28 md:text-right">Pagado: {money(row.paid)}</div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ContactDetailPage({ params }: ContactDetailPageProps) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) notFound();

  const contact = await getContactLedger(contactId);
  if (!contact) notFound();

  const invoices = contact.invoices || [];
  const purchases = contact.purchases || [];
  const quotations = contact.quotations || [];
  const proformas = contact.proformaInvoices || [];
  const projects = contact.projects || [];
  const mainPerson = contact.contactPersons?.find((person: any) => person.isMain) || contact.contactPersons?.[0];

  const invoicedTotal = invoices.reduce((sum: number, invoice: any) => sum + invoice.total, 0);
  const invoicePaidTotal = invoices.reduce((sum: number, invoice: any) => sum + (invoice.paidAmount || 0), 0);
  const purchasesTotal = purchases.reduce((sum: number, purchase: any) => sum + purchase.total, 0);
  const purchasesPaidTotal = purchases.reduce((sum: number, purchase: any) => sum + (purchase.paidAmount || 0), 0);
  const proformasTotal = proformas.reduce((sum: number, proforma: any) => sum + proforma.total, 0);
  const quotesTotal = quotations.reduce((sum: number, quotation: any) => sum + quotation.total, 0);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link href="/contacts" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500 transition hover:text-blue-600">
            <span className="material-icons-outlined text-[18px]">arrow_back</span>
            Contactos
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-3xl font-black text-slate-950 dark:text-white">{contact.name}</h1>
            <ContactTypeBadge type={contact.type} />
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{contact.taxId || "Sin RNC / Cedula"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Link href={`/invoices/new?contactId=${contact.id}`}>
            <Button className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
              <span className="material-icons-outlined text-[18px]">receipt_long</span>
              Factura
            </Button>
          </Link>
          <Link href={`/quotations/new?contactId=${contact.id}`}>
            <Button variant="outline" className="w-full gap-2 sm:w-auto">
              <span className="material-icons-outlined text-[18px]">request_quote</span>
              Cotizacion
            </Button>
          </Link>
          <Link href={`/contacts/${contact.id}/edit`}>
            <Button variant="outline" className="w-full gap-2 sm:w-auto">
              <span className="material-icons-outlined text-[18px]">edit</span>
              Editar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Facturado" value={money(invoicedTotal)} helper={`${invoices.length} facturas`} tone="blue" />
        <MetricCard label="Por cobrar" value={money(Math.max(0, invoicedTotal - invoicePaidTotal))} helper={`Cobrado ${money(invoicePaidTotal)}`} tone="orange" />
        <MetricCard label="Compras" value={money(purchasesTotal)} helper={`Pagado ${money(purchasesPaidTotal)}`} tone="emerald" />
        <MetricCard label="Cotizado / Proforma" value={money(quotesTotal + proformasTotal)} helper={`${quotations.length + proformas.length} documentos`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <span className="material-icons-outlined text-[19px] text-blue-600 dark:text-blue-300">badge</span>
              Datos del contacto
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email</dt>
                <dd className="mt-1 break-words text-slate-700 dark:text-slate-200">{contact.email || mainPerson?.email || "No definido"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Telefono</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{contact.phone || mainPerson?.phone || "No definido"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Direccion</dt>
                <dd className="mt-1 break-words text-slate-700 dark:text-slate-200">{contact.address || "No definida"}</dd>
              </div>
              {contact.website ? (
                <div>
                  <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sitio web</dt>
                  <dd className="mt-1">
                    <a className="break-all font-bold text-blue-600 hover:underline" href={contact.website} target="_blank" rel="noreferrer">
                      {contact.website}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <span className="material-icons-outlined text-[19px] text-blue-600 dark:text-blue-300">folder</span>
              Proyectos asociados
            </h2>
            {projects.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">Sin proyectos asociados.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {projects.map((project: any) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:border-blue-900 dark:hover:bg-blue-950/20">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">{project.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{project.code} · {statusLabel(project.status)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>

        <main className="space-y-5">
          <ActivitySection
            title="Facturas de venta"
            icon="receipt_long"
            empty="Este contacto no tiene facturas de venta."
            rows={invoices.map((invoice: any) => ({
              id: invoice.id,
              href: `/invoices/${invoice.id}`,
              number: invoice.number || `Factura #${invoice.id}`,
              date: invoice.date,
              status: invoice.status,
              total: invoice.total,
              paid: invoice.paidAmount || 0,
              project: invoice.project?.name,
              kind: "invoice",
            }))}
          />

          <ActivitySection
            title="Compras / gastos"
            icon="shopping_cart"
            empty="Este contacto no tiene compras registradas."
            rows={purchases.map((purchase: any) => ({
              id: purchase.id,
              href: `/purchases/${purchase.id}`,
              number: purchase.ncf || purchase.number || `Compra #${purchase.id}`,
              date: purchase.date,
              status: purchase.status,
              total: purchase.total,
              paid: purchase.paidAmount || 0,
              project: purchase.project?.name,
              kind: "purchase",
            }))}
          />

          <ActivitySection
            title="Cotizaciones"
            icon="request_quote"
            empty="Este contacto no tiene cotizaciones."
            rows={quotations.map((quotation: any) => ({
              id: quotation.id,
              href: `/quotations/${quotation.id}`,
              number: quotation.number || `Cotizacion #${quotation.id}`,
              date: quotation.date,
              status: quotation.status,
              total: quotation.total,
              project: quotation.project?.name,
              kind: "quotation",
            }))}
          />

          <ActivitySection
            title="Prefacturas"
            icon="draft"
            empty="Este contacto no tiene prefacturas."
            rows={proformas.map((proforma: any) => ({
              id: proforma.id,
              href: `/proformas/${proforma.id}`,
              number: proforma.number || `Prefactura #${proforma.id}`,
              date: proforma.date,
              status: proforma.status,
              total: proforma.total,
              paid: proforma.paidAmount || 0,
              project: proforma.project?.name,
              kind: "proforma",
            }))}
          />
        </main>
      </div>
    </div>
  );
}
