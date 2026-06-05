"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createProforma, updateProforma } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { primaryActionClass } from "@/lib/ui-styles";
import { Plus, Save, Trash2 } from "lucide-react";

type ProformaFormProps = {
  contacts: any[];
  projects: any[];
  initialData?: any;
};

function dateInput(value?: Date | string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

const defaultItem = { description: "", quantity: 1, price: 0, taxRate: 18 };

export function ProformaForm({ contacts, projects, initialData }: ProformaFormProps) {
  const router = useRouter();
  const [contactId, setContactId] = useState(initialData?.contactId ? String(initialData.contactId) : contacts[0]?.id ? String(contacts[0].id) : "new");
  const [contactName, setContactName] = useState(initialData?.contact?.name || "");
  const [projectId, setProjectId] = useState(initialData?.projectId ? String(initialData.projectId) : "");
  const [date, setDate] = useState(dateInput(initialData?.date));
  const [dueDate, setDueDate] = useState(initialData?.dueDate ? dateInput(initialData.dueDate) : "");
  const [status, setStatus] = useState(initialData?.status || "DRAFT");
  const [title, setTitle] = useState(initialData?.title || "");
  const [subtitle, setSubtitle] = useState(initialData?.subtitle || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [termsAndConditions, setTermsAndConditions] = useState(initialData?.termsAndConditions || "");
  const [items, setItems] = useState<any[]>(initialData?.items?.length ? initialData.items.map((item: any) => ({
    description: item.description,
    quantity: item.quantity,
    price: item.price,
    taxRate: item.taxRate,
  })) : [{ ...defaultItem }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
    const tax = items.reduce((sum, item) => {
      const line = (Number(item.quantity) || 0) * (Number(item.price) || 0);
      const rate = Number(item.taxRate) > 0 && Number(item.taxRate) <= 1 ? Number(item.taxRate) * 100 : Number(item.taxRate) || 0;
      return sum + line * (rate / 100);
    }, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  const setItem = (index: number, key: string, value: string) => {
    setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    formData.set("contactId", contactId);
    formData.set("contactName", contactName);
    formData.set("projectId", projectId || "none");
    formData.set("date", date);
    formData.set("dueDate", dueDate);
    formData.set("status", status);
    formData.set("title", title);
    formData.set("subtitle", subtitle);
    formData.set("notes", notes);
    formData.set("termsAndConditions", termsAndConditions);
    formData.set("items", JSON.stringify(items));

    const result = initialData?.id ? await updateProforma(initialData.id, formData) : await createProforma(formData);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/proformas/${result.id}`);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-blue-600">Documento no fiscal</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">{initialData ? `Editar ${initialData.number}` : "Nueva prefactura"}</h1>
          <p className="mt-1 text-sm text-slate-500">No emite NCF ni entra al 607 hasta convertirse en factura fiscal.</p>
        </div>
        <button type="submit" disabled={isSubmitting} className={primaryActionClass}>
          <Save className="h-4 w-4" />
          {isSubmitting ? "Guardando..." : "Guardar prefactura"}
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cliente</label>
          <select value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            <option value="new">Crear cliente manual</option>
          </select>
          {contactId === "new" && (
            <div className="mt-3 space-y-3">
              <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Nombre del cliente" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
              <input name="contactTaxId" placeholder="RNC/Cedula" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Proyecto</label>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="">Sin proyecto</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Fecha
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal dark:border-slate-800 dark:bg-slate-950" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Vence
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal dark:border-slate-800 dark:bg-slate-950" />
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Estado
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal dark:border-slate-800 dark:bg-slate-950">
              <option value="DRAFT">Borrador</option>
              <option value="SENT">Enviada</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titulo opcional" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
          <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Subtitulo opcional" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Items</h2>
          <button type="button" onClick={() => setItems([...items, { ...defaultItem }])} className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100">
            <Plus className="h-4 w-4" />
            Agregar item
          </button>
        </div>
        <div className="space-y-3 p-5">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800 md:grid-cols-[1fr_90px_130px_110px_44px]">
              <input value={item.description} onChange={(event) => setItem(index, "description", event.target.value)} placeholder="Descripcion" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
              <input value={item.quantity} onChange={(event) => setItem(index, "quantity", event.target.value)} type="number" min="0" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
              <input value={item.price} onChange={(event) => setItem(index, "price", event.target.value)} type="number" min="0" step="0.01" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
              <input value={item.taxRate} onChange={(event) => setItem(index, "taxRate", event.target.value)} type="number" min="0" step="0.01" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
              <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))} className="flex h-11 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas internas o visibles" className="min-h-28 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
          <textarea value={termsAndConditions} onChange={(event) => setTermsAndConditions(event.target.value)} placeholder="Terminos y condiciones" className="mt-3 min-h-28 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm dark:border-blue-900/40 dark:bg-blue-900/20">
          <p className="text-xs font-black uppercase tracking-wider text-blue-600">Totales proforma</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><strong>RD$ {formatCurrency(totals.subtotal)}</strong></div>
            <div className="flex justify-between"><span>ITBIS estimado</span><strong>RD$ {formatCurrency(totals.tax)}</strong></div>
            <div className="border-t border-blue-100 pt-3 text-lg font-black text-blue-700 dark:border-blue-900/40 dark:text-blue-300">
              <div className="flex justify-between"><span>Total</span><span>RD$ {formatCurrency(totals.total)}</span></div>
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}
