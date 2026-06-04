import Link from "next/link";
import { createSubscription, deleteSubscription, getProjects, getSubscriptions, updateSubscription, updateSubscriptionStatus } from "@/app/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { primaryActionClass } from "@/lib/ui-styles";
import { Button } from "@/components/ui/button";
import { CalendarClock, CreditCard, Edit3, ExternalLink, Pause, Plus, Save, Trash2, XCircle } from "lucide-react";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { getPeriodParams } from "@/lib/list-period";
import { NewSubscriptionPanel } from "@/components/subscriptions/NewSubscriptionPanel";

const categoryLabels: Record<string, string> = {
  DOMAIN: "Dominio",
  HOSTING: "Hosting",
  SOFTWARE: "Software",
  PLATFORM: "Plataforma",
  OTHER: "Otro",
};

const cycleLabels: Record<string, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
  ONE_TIME: "Unico",
};

const methodLabels: Record<string, string> = {
  CARD: "Tarjeta",
  BANK_TRANSFER: "Transferencia",
  PAYPAL: "PayPal",
  CASH: "Efectivo",
  OTHER: "Otro",
};

function daysUntil(date: Date | string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function renewalTone(days: number | null, reminderDays: number) {
  if (days === null) return "bg-slate-50 text-slate-500 border-slate-200";
  if (days < 0) return "bg-red-50 text-red-700 border-red-100";
  if (days <= reminderDays) return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-emerald-50 text-emerald-700 border-emerald-100";
}

function currencyPrefix(currency: string | null | undefined) {
  return currency === "USD" ? "US$" : "RD$";
}

function amountInDop(subscription: any) {
  const amount = Number(subscription.amount) || 0;
  const rate = Number(subscription.exchangeRate) || 1;
  return subscription.currency === "USD" ? amount * rate : amount;
}

function inputDate(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default async function SubscriptionsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const period = getPeriodParams(searchParams);
  const [subscriptions, projects] = await Promise.all([
    getSubscriptions(period),
    getProjects(),
  ]);

  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "ACTIVE");
  const monthlyEstimate = activeSubscriptions.reduce((sum, subscription) => {
    const amount = amountInDop(subscription);
    if (subscription.billingCycle === "YEARLY") return sum + amount / 12;
    if (subscription.billingCycle === "QUARTERLY") return sum + amount / 3;
    if (subscription.billingCycle === "WEEKLY") return sum + amount * 4;
    if (subscription.billingCycle === "ONE_TIME") return sum;
    return sum + amount;
  }, 0);
  const dueSoon = activeSubscriptions.filter((subscription) => {
    const days = daysUntil(subscription.nextBillingDate);
    return days !== null && days <= subscription.reminderDays;
  }).length;

  async function createSubscriptionFromPage(formData: FormData) {
    "use server";
    await createSubscription(formData);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Suscripciones activas</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Dominios, hosting, plataformas y servicios recurrentes por proyecto.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Activas</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{activeSubscriptions.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-900/40 dark:bg-amber-900/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Por vencer</p>
            <p className="text-xl font-black text-amber-700 dark:text-amber-300">{dueSoon}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-900/40 dark:bg-blue-900/20 sm:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Estimado mensual</p>
            <p className="text-xl font-black text-blue-700 dark:text-blue-300">RD$ {formatCurrency(monthlyEstimate)}</p>
          </div>
        </div>
      </header>

      <ListPeriodFilter basePath="/subscriptions" searchParams={searchParams} total={subscriptions.length} itemSingular="suscripcion registrada" itemPlural="suscripciones registradas" />

      <NewSubscriptionPanel>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form action={createSubscriptionFromPage} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Que compraste</label>
              <input name="name" required placeholder="Dominio oasis.do" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</label>
              <input name="provider" required placeholder="GoDaddy, Hostinger..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proyecto</label>
              <select name="projectId" defaultValue="" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                <option value="">Sin proyecto</option>
                {projects.map((project: any) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Categoria</label>
              <select name="category" defaultValue="DOMAIN" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                <option value="DOMAIN">Dominio</option>
                <option value="HOSTING">Hosting</option>
                <option value="SOFTWARE">Software</option>
                <option value="PLATFORM">Plataforma</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Monto</label>
              <input name="amount" type="number" step="0.01" min="0" placeholder="0.00" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Moneda</label>
              <select name="currency" defaultValue="DOP" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                <option value="DOP">RD$</option>
                <option value="USD">US$</option>
              </select>
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tasa</label>
              <input name="exchangeRate" type="number" step="0.01" min="0.01" defaultValue="1" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Ciclo</label>
              <select name="billingCycle" defaultValue="MONTHLY" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                <option value="MONTHLY">Mensual</option>
                <option value="YEARLY">Anual</option>
                <option value="QUARTERLY">Trimestral</option>
                <option value="WEEKLY">Semanal</option>
                <option value="ONE_TIME">Unico</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proximo cobro</label>
              <input name="nextBillingDate" type="date" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Metodo</label>
              <select name="paymentMethod" defaultValue="CARD" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                <option value="CARD">Tarjeta</option>
                <option value="BANK_TRANSFER">Transferencia</option>
                <option value="PAYPAL">PayPal</option>
                <option value="CASH">Efectivo</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tarjeta/cuenta</label>
              <input name="paymentAccount" placeholder="Visa **** 1234" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sitio web</label>
              <input name="websiteUrl" type="url" placeholder="https://..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Donde cancelar</label>
              <input name="managementUrl" type="url" placeholder="https://panel..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Aviso</label>
              <input name="reminderDays" type="number" min="0" defaultValue={7} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="lg:col-span-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas</label>
              <input name="notes" placeholder="Usuario, plan, instrucciones..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
            <div className="flex items-end lg:col-span-2">
              <button type="submit" className={`${primaryActionClass} w-full`}>
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
          </form>
        </section>
      </NewSubscriptionPanel>

      <section className="grid grid-cols-1 gap-4">
        {subscriptions.map((subscription) => {
          const days = daysUntil(subscription.nextBillingDate);
          const tone = renewalTone(days, subscription.reminderDays);
          return (
            <article key={subscription.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-black text-slate-900 dark:text-white">{subscription.name}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{categoryLabels[subscription.category] || subscription.category}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${subscription.status === "ACTIVE" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{subscription.status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                    <span>{subscription.provider}</span>
                    {subscription.project && <span>Proyecto: {subscription.project.name}</span>}
                    <span>{cycleLabels[subscription.billingCycle] || subscription.billingCycle}</span>
                    <span>{currencyPrefix(subscription.currency)} {formatCurrency(subscription.amount)}</span>
                    {subscription.currency === "USD" && (
                      <span>RD$ {formatCurrency(amountInDop(subscription))} a {formatCurrency(subscription.exchangeRate)}</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[520px]">
                  <div className={`rounded-xl border px-3 py-2 ${tone}`}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase">
                      <CalendarClock className="h-4 w-4" />
                      Renovacion
                    </div>
                    <p className="mt-1 text-sm font-black">{subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : "Sin fecha"}</p>
                    {days !== null && <p className="text-xs">{days < 0 ? `Vencio hace ${Math.abs(days)} dias` : `Faltan ${days} dias`}</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
                      <CreditCard className="h-4 w-4" />
                      Pago
                    </div>
                    <p className="mt-1 truncate text-sm font-black text-slate-800 dark:text-slate-100">{methodLabels[subscription.paymentMethod] || subscription.paymentMethod}</p>
                    <p className="truncate text-xs text-slate-500">{subscription.paymentAccount || "Sin cuenta"}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {subscription.websiteUrl && (
                      <Link href={subscription.websiteUrl} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300">
                        <ExternalLink className="h-4 w-4" />
                        Web
                      </Link>
                    )}
                    {subscription.managementUrl && (
                      <Link href={subscription.managementUrl} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100">
                        <ExternalLink className="h-4 w-4" />
                        Cancelar
                      </Link>
                    )}
                    <form action={async () => {
                      "use server";
                      await updateSubscriptionStatus(subscription.id, subscription.status === "ACTIVE" ? "PAUSED" : "ACTIVE");
                    }}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Pause className="h-4 w-4" />
                        {subscription.status === "ACTIVE" ? "Pausar" : "Activar"}
                      </Button>
                    </form>
                    <form action={async () => {
                      "use server";
                      await updateSubscriptionStatus(subscription.id, "CANCELLED");
                    }}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <XCircle className="h-4 w-4" />
                        Marcar cancelada
                      </Button>
                    </form>
                    <form action={async () => {
                      "use server";
                      await deleteSubscription(subscription.id);
                    }}>
                      <Button variant="danger" size="sm" className="gap-1">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
              <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <Edit3 className="h-4 w-4" />
                  Editar suscripcion
                </summary>
                <form
                  action={async (formData) => {
                    "use server";
                    await updateSubscription(subscription.id, formData);
                  }}
                  className="grid grid-cols-1 gap-4 border-t border-slate-200 p-4 dark:border-slate-800 lg:grid-cols-12"
                >
                  <div className="lg:col-span-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Que compraste</label>
                    <input name="name" required defaultValue={subscription.name} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</label>
                    <input name="provider" required defaultValue={subscription.provider} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proyecto</label>
                    <select name="projectId" defaultValue={subscription.projectId || ""} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="">Sin proyecto</option>
                      {projects.map((project: any) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Categoria</label>
                    <select name="category" defaultValue={subscription.category} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="DOMAIN">Dominio</option>
                      <option value="HOSTING">Hosting</option>
                      <option value="SOFTWARE">Software</option>
                      <option value="PLATFORM">Plataforma</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Monto</label>
                    <input name="amount" type="number" step="0.01" min="0" defaultValue={subscription.amount} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Moneda</label>
                    <select name="currency" defaultValue={subscription.currency || "DOP"} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="DOP">RD$</option>
                      <option value="USD">US$</option>
                    </select>
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tasa</label>
                    <input name="exchangeRate" type="number" step="0.01" min="0.01" defaultValue={subscription.exchangeRate || 1} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Ciclo</label>
                    <select name="billingCycle" defaultValue={subscription.billingCycle} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="MONTHLY">Mensual</option>
                      <option value="YEARLY">Anual</option>
                      <option value="QUARTERLY">Trimestral</option>
                      <option value="WEEKLY">Semanal</option>
                      <option value="ONE_TIME">Unico</option>
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proximo cobro</label>
                    <input name="nextBillingDate" type="date" defaultValue={inputDate(subscription.nextBillingDate)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Metodo</label>
                    <select name="paymentMethod" defaultValue={subscription.paymentMethod} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="CARD">Tarjeta</option>
                      <option value="BANK_TRANSFER">Transferencia</option>
                      <option value="PAYPAL">PayPal</option>
                      <option value="CASH">Efectivo</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tarjeta/cuenta</label>
                    <input name="paymentAccount" defaultValue={subscription.paymentAccount || ""} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sitio web</label>
                    <input name="websiteUrl" type="url" defaultValue={subscription.websiteUrl || ""} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Donde cancelar</label>
                    <input name="managementUrl" type="url" defaultValue={subscription.managementUrl || ""} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Aviso</label>
                    <input name="reminderDays" type="number" min="0" defaultValue={subscription.reminderDays} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado</label>
                    <select name="status" defaultValue={subscription.status} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="ACTIVE">Activa</option>
                      <option value="PAUSED">Pausada</option>
                      <option value="CANCELLED">Cancelada</option>
                    </select>
                  </div>
                  <div className="lg:col-span-5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas</label>
                    <input name="notes" defaultValue={subscription.notes || ""} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  </div>
                  <div className="flex items-end lg:col-span-2">
                    <button type="submit" className={`${primaryActionClass} w-full`}>
                      <Save className="h-4 w-4" />
                      Guardar
                    </button>
                  </div>
                </form>
              </details>
              {(subscription.notes || subscription.description) && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  {subscription.notes || subscription.description}
                </p>
              )}
            </article>
          );
        })}
        {subscriptions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            No hay suscripciones registradas todavia.
          </div>
        )}
      </section>
    </div>
  );
}
