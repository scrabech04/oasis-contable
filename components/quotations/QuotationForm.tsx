"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, User, FileText, Calendar, LayoutGrid, Calculator, ChevronDown, Type, Heading1, Heading2, GripVertical } from "lucide-react";
import { useDragReorder } from "@/hooks/useDragReorder";
import { createQuotation, updateQuotation, getNextQuotationNumber } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Contact {
    id: number;
    name: string;
}

interface QuotationFormProps {
    contacts: Contact[];
    projects?: { id: number; name: string }[];
    initialData?: any;
}

type ItemType = "ITEM" | "HEADING" | "SUBHEADING";

interface QuotationItem {
    description: string;
    itemType: ItemType;
    quantity: number;
    price: number;
    taxRate: number;
}

export function QuotationForm({ contacts, projects = [], initialData }: QuotationFormProps) {
    const router = useRouter();
    const [items, setItems] = useState<QuotationItem[]>([
        { description: "", itemType: "ITEM", quantity: 1, price: 0, taxRate: 18 },
    ]);
    const [contactId, setContactId] = useState<string>("");
    const [contactName, setContactName] = useState("");
    const [contactTaxId, setContactTaxId] = useState("");
    const [number, setNumber] = useState("");
    const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
    const [validUntil, setValidUntil] = useState("");
    const [projectId, setProjectId] = useState<string>("");
    const [projectName, setProjectName] = useState("");
    const [status, setStatus] = useState("DRAFT");
    const [notes, setNotes] = useState("");
    const [termsAndConditions, setTermsAndConditions] = useState("");
    const [includeCoverPage, setIncludeCoverPage] = useState(false);
    const [includeTermsPage, setIncludeTermsPage] = useState(false);
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!initialData && !number) {
            getNextQuotationNumber().then(setNumber);
        }
    }, [initialData, number]);

    useEffect(() => {
        if (initialData) {
            setContactId(initialData.contactId.toString());
            setNumber(initialData.number || "");
            setQuotationDate(new Date(initialData.date).toISOString().split('T')[0]);
            setValidUntil(initialData.validUntil ? new Date(initialData.validUntil).toISOString().split('T')[0] : "");
            setItems(initialData.items.map((item: any) => ({
                description: item.description,
                itemType: (item.itemType as ItemType) || "ITEM",
                quantity: item.quantity,
                price: item.price,
                taxRate: item.taxRate || 0
            })));
            setProjectId(initialData.projectId?.toString() || "");
            setStatus(initialData.status || "DRAFT");
            setNotes(initialData.notes || "");
            setTermsAndConditions(initialData.termsAndConditions || "");
            setIncludeCoverPage(Boolean(initialData.includeCoverPage));
            setIncludeTermsPage(Boolean(initialData.includeTermsPage));
            setTitle(initialData.title || "");
            setSubtitle(initialData.subtitle || "");
        }
    }, [initialData]);

    const addItem = (type: ItemType = "ITEM") => {
        setItems([...items, { description: "", itemType: type, quantity: type === "ITEM" ? 1 : 0, price: 0, taxRate: type === "ITEM" ? 18 : 0 }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
        const newItems = [...items];
        // @ts-ignore
        newItems[index][field] = value;

        // Reset numeric fields if not ITEM
        if (field === "itemType" && value !== "ITEM") {
            newItems[index].quantity = 0;
            newItems[index].price = 0;
            newItems[index].taxRate = 0;
        } else if (field === "itemType" && value === "ITEM") {
            newItems[index].quantity = 1;
            newItems[index].taxRate = 18;
        }

        setItems(newItems);
    };

    const { dragIndex, dragOverIndex, handleDragStart, handleDragOver, handleDragEnter, handleDrop, handleDragEnd } = useDragReorder(items, setItems);

    const subtotal = items.reduce((acc, item) => acc + (item.itemType === "ITEM" ? item.quantity * item.price : 0), 0);
    const tax = items.reduce((acc, item) => acc + (item.itemType === "ITEM" ? (item.quantity * item.price * (item.taxRate / 100)) : 0), 0);
    const total = subtotal + tax;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const formData = new FormData();
        formData.append("contactId", contactId);
        if (contactId === "new") {
            formData.append("contactName", contactName);
            formData.append("contactTaxId", contactTaxId);
        }
        formData.append("number", number);
        formData.append("date", quotationDate);
        formData.append("validUntil", validUntil);
        formData.append("projectId", projectId);
        if (projectId === "new") {
            formData.append("projectName", projectName);
        }
        formData.append("status", status);
        formData.append("items", JSON.stringify(items));
        formData.append("notes", notes);
        formData.append("termsAndConditions", termsAndConditions);
        formData.append("includeCoverPage", String(includeCoverPage));
        formData.append("includeTermsPage", String(includeTermsPage));
        formData.append("title", title);
        formData.append("subtitle", subtitle);

        try {
            let result;
            if (initialData) {
                result = await updateQuotation(initialData.id, formData);
            } else {
                result = await createQuotation(formData);
            }

            if (result.success) {
                router.push("/quotations");
                router.refresh();
            } else if ((result as any).error) {
                alert((result as any).error);
            }
        } catch (error) {
            console.error(error);
            alert("Error al guardar la cotización");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="px-4 py-8 space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <nav className="flex items-center text-sm text-slate-500 dark:text-slate-400 mb-2">
                        <span>Ventas</span>
                        <span className="material-icons-outlined text-sm mx-2">chevron_right</span>
                        <span className="font-medium text-blue-600">
                            {initialData ? "Editar Cotización" : "Nueva Cotización"}
                        </span>
                    </nav>
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                            <span className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600">
                                <span className="material-icons-outlined">request_quote</span>
                            </span>
                            {initialData ? `Editar Cotización #${number}` : "Nueva Cotización"}
                        </h1>
                        <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                            {
                                "bg-slate-100 text-slate-500 border-slate-200": status === "DRAFT",
                                "bg-blue-50 text-blue-600 border-blue-200": status === "SENT",
                                "bg-yellow-50 text-yellow-600 border-yellow-200": status === "WAITING",
                                "bg-green-50 text-green-600 border-green-200": status === "ACCEPTED",
                            }
                        )}>
                            {status === "DRAFT" ? "Borrador" : status === "SENT" ? "Enviada" : status === "WAITING" ? "En Espera" : "Aprobada"}
                        </span>
                    </div>
                </div >
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {submitting ? "Guardando..." : initialData ? "Actualizar Cotización" : "Crear Cotización"}
                    </button>
                </div>
            </header >

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Client Section */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm h-full">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                <span className="material-icons-outlined text-sm">person</span>
                            </div>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contacto / Cliente</h2>
                        </div>
                        <div className="space-y-5">
                            <div className="relative group">
                                <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10">Seleccionar Contacto</label>
                                <div className="relative mt-1">
                                    <select
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-3 pr-10 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all appearance-none text-sm font-medium"
                                        value={contactId}
                                        onChange={(e) => setContactId(e.target.value)}
                                        required
                                    >
                                        <option value="">Seleccionar...</option>
                                        {contacts.map((contact) => (
                                            <option key={contact.id} value={contact.id.toString()}>
                                                {contact.name}
                                            </option>
                                        ))}
                                        <option value="new" className="text-blue-600 font-bold">+ Nuevo Contacto</option>
                                    </select>
                                    <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>

                            {contactId === "new" && (
                                <div className="space-y-4 p-5 bg-blue-50/20 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/30 animate-in slide-in-from-top-2 duration-300">
                                    <div className="relative group">
                                        <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-blue-600 z-10 transition-all">Nombre</label>
                                        <input
                                            required
                                            placeholder="Nombre o Empresa"
                                            className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                            value={contactName}
                                            onChange={(e) => setContactName(e.target.value)}
                                        />
                                    </div>
                                    <div className="relative group">
                                        <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-blue-600 z-10 transition-all">RNC / Cédula</label>
                                        <input
                                            required
                                            placeholder="130XXXX-X"
                                            className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                            value={contactTaxId}
                                            onChange={(e) => setContactTaxId(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {contactId && contactId !== "new" && (
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-3 font-medium text-slate-700 dark:text-slate-200">
                                        <div className="h-2 w-2 rounded-full bg-green-500 ripple"></div>
                                        <span className="text-sm truncate">{contacts.find(c => c.id.toString() === contactId)?.name}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Quotation Details Section */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                <span className="material-icons-outlined text-sm">settings_suggest</span>
                            </div>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Detalles de la Oferta</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                            {/* Número de Cotización */}
                            <div className="relative group">
                                <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10 transition-all">Número de Cotización</label>
                                <input
                                    className="w-full bg-slate-100/50 dark:bg-slate-800 border-transparent focus:bg-transparent dark:focus:bg-transparent border-b-2 focus:border-blue-600 rounded-t-xl py-3 px-3 focus:ring-0 transition-all font-mono font-bold text-slate-800 dark:text-white"
                                    placeholder="0617"
                                    type="text"
                                    value={number}
                                    onChange={(e) => setNumber(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Estado */}
                            <div className="relative group">
                                <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10 transition-all">Estado Actual</label>
                                <div className="relative mt-1">
                                    <select
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-3 pr-10 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all appearance-none text-sm font-medium"
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                    >
                                        <option value="DRAFT">Borrador</option>
                                        <option value="SENT">Enviada</option>
                                        <option value="WAITING">En Espera</option>
                                        <option value="ACCEPTED">Aprobada</option>
                                        <option value="REJECTED">Rechazada</option>
                                        <option value="INVOICED">Facturada (Lectura)</option>
                                    </select>
                                    <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>

                            {/* Fecha de Emisión */}
                            <div className="relative group">
                                <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10 transition-all">Fecha Emisión</label>
                                <input
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                    type="date"
                                    required
                                    value={quotationDate}
                                    onChange={(e) => setQuotationDate(e.target.value)}
                                />
                            </div>

                            {/* Vencimiento */}
                            <div className="relative group">
                                <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10 transition-all">Válido hasta</label>
                                <input
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                    type="date"
                                    value={validUntil}
                                    onChange={(e) => setValidUntil(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Project Section */}
                <div className="lg:col-span-3">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                <span className="material-icons-outlined text-sm">folder</span>
                            </div>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Proyecto (Opcional)</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="relative group">
                                <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10">Seleccionar Proyecto</label>
                                <div className="relative mt-1">
                                    <select
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-3 pr-10 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all appearance-none text-sm font-medium"
                                        value={projectId}
                                        onChange={(e) => setProjectId(e.target.value)}
                                    >
                                        <option value="">Sin proyecto</option>
                                        {projects.map((project) => (
                                            <option key={project.id} value={project.id.toString()}>
                                                {project.name}
                                            </option>
                                        ))}
                                        <option value="new" className="text-blue-600 font-bold">+ Nuevo Proyecto</option>
                                    </select>
                                    <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>

                            {projectId === "new" && (
                                <div className="space-y-4 p-5 bg-blue-50/20 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/30 animate-in slide-in-from-top-2 duration-300">
                                    <div className="relative group">
                                        <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-blue-600 z-10">Nombre del Proyecto</label>
                                        <input
                                            required
                                            placeholder="Ej: Desarrollo Web - Cliente X"
                                            className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                            value={projectName}
                                            onChange={(e) => setProjectName(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Items Table Section */}
                <div className="lg:col-span-3">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                    <span className="material-icons-outlined text-sm">view_quilt</span>
                                </div>
                                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Líneas de Detalle Personalizadas</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => addItem("HEADING")}
                                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-white hover:bg-slate-600 border border-slate-200 dark:border-slate-800 rounded-xl transition-all active:scale-95"
                                >
                                    <Heading1 size={14} />
                                    Título
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addItem("SUBHEADING")}
                                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-slate-500 border border-slate-200 dark:border-slate-800 rounded-xl transition-all active:scale-95"
                                >
                                    <Heading2 size={14} />
                                    Subtítulo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addItem("ITEM")}
                                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 dark:border-blue-800 rounded-xl transition-all active:scale-95"
                                >
                                    <Plus size={14} />
                                    Item
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3 p-4 md:hidden">
                            {items.map((item, index) => (
                                <article
                                    key={index}
                                    className={clsx(
                                        "rounded-2xl border p-4 shadow-sm dark:border-slate-800",
                                        item.itemType === "HEADING"
                                            ? "border-blue-100 bg-blue-50/50 dark:bg-blue-900/10"
                                            : "border-slate-200 bg-white dark:bg-slate-900"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className={clsx(
                                                "flex h-9 w-9 items-center justify-center rounded-xl",
                                                {
                                                    "bg-blue-600 text-white": item.itemType === "HEADING",
                                                    "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300": item.itemType === "SUBHEADING",
                                                    "bg-slate-100 text-slate-400 dark:bg-slate-800": item.itemType === "ITEM",
                                                }
                                            )}>
                                                {item.itemType === "HEADING" ? <Heading1 size={16} /> :
                                                    item.itemType === "SUBHEADING" ? <Heading2 size={16} /> : <Type size={16} />}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Linea #{index + 1}</p>
                                                <p className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white">
                                                    {item.itemType === "ITEM" ? `RD$ ${formatCurrency(item.quantity * item.price * (1 + item.taxRate / 100))}` : "Texto"}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:text-red-500 disabled:opacity-30 dark:border-slate-700"
                                            onClick={() => removeItem(index)}
                                            disabled={items.length === 1}
                                            title="Eliminar linea"
                                        >
                                            <span className="material-icons-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        <label className="block">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                {item.itemType === "ITEM" ? "Descripcion" : "Titulo"}
                                            </span>
                                            <input
                                                className={clsx(
                                                    "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800",
                                                    item.itemType === "HEADING" ? "text-sm font-black uppercase text-slate-900 dark:text-white" : "text-sm font-medium text-slate-800 dark:text-slate-100"
                                                )}
                                                placeholder={item.itemType === "HEADING" ? "Nombre de seccion..." : item.itemType === "SUBHEADING" ? "Sub-seccion..." : "Descripcion del producto..."}
                                                value={item.description}
                                                onChange={(e) => updateItem(index, "description", e.target.value)}
                                            />
                                        </label>
                                        {item.itemType === "ITEM" && (
                                            <>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <label className="block">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Cantidad</span>
                                                        <input
                                                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">ITBIS %</span>
                                                        <select
                                                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                            value={item.taxRate.toString()}
                                                            onChange={(e) => updateItem(index, "taxRate", parseInt(e.target.value))}
                                                        >
                                                            <option value="18">18%</option>
                                                            <option value="16">16%</option>
                                                            <option value="0">0%</option>
                                                        </select>
                                                    </label>
                                                </div>
                                                <label className="block">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Precio unitario</span>
                                                    <div className="mt-1 flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800">
                                                        <span className="text-[10px] font-black text-slate-400">RD$</span>
                                                        <input
                                                            className="min-w-0 flex-1 border-0 bg-transparent px-2 text-right font-mono text-sm text-slate-800 focus:ring-0 dark:text-slate-100"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.price}
                                                            onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                                                        />
                                                    </div>
                                                </label>
                                            </>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-100 dark:border-slate-800">
                                        <th className="pl-4 pr-1 py-4 w-10"></th>
                                        <th className="px-6 py-4 w-12 text-center">Tipo</th>
                                        <th className="px-6 py-4">Descripción / Título</th>
                                        <th className="px-6 py-4 text-center w-24">Cant.</th>
                                        <th className="px-6 py-4 text-right w-40">Precio Unit.</th>
                                        <th className="px-6 py-4 text-center w-32">ITBIS %</th>
                                        <th className="px-6 py-4 text-right w-40">Monto Total</th>
                                        <th className="px-6 py-4 w-12 text-center"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {items.map((item, index) => (
                                        <tr
                                            key={index}
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragEnter={(e) => handleDragEnter(e, index)}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onDragEnd={(e) => { e.currentTarget.removeAttribute('draggable'); handleDragEnd(); }}
                                            className={clsx(
                                            "group transition-all",
                                            {
                                                "bg-slate-50/50 dark:bg-blue-900/5": item.itemType === "HEADING" && dragIndex !== index,
                                                "bg-white dark:bg-slate-900": item.itemType !== "HEADING" && dragIndex !== index,
                                                "hover:bg-slate-50/50 dark:hover:bg-blue-900/10": item.itemType === "ITEM" && dragIndex !== index,
                                                "opacity-40": dragIndex === index,
                                                "border-t-2 border-t-blue-500": dragOverIndex === index && dragIndex !== null && dragIndex !== index,
                                            }
                                        )}>
                                            <td className="pl-4 pr-1 py-4">
                                                <div
                                                    className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
                                                    onMouseDown={(e) => { const tr = (e.currentTarget as HTMLElement).closest('tr'); if (tr) tr.setAttribute('draggable', 'true'); }}
                                                    onMouseUp={(e) => { const tr = (e.currentTarget as HTMLElement).closest('tr'); if (tr) tr.removeAttribute('draggable'); }}
                                                >
                                                    <GripVertical size={16} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className={clsx(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                                    {
                                                        "bg-blue-600 text-white shadow-lg shadow-blue-500/30": item.itemType === "HEADING",
                                                        "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300": item.itemType === "SUBHEADING",
                                                        "bg-slate-100 dark:bg-slate-800 text-slate-400": item.itemType === "ITEM",
                                                    }
                                                )} title={item.itemType}>
                                                    {item.itemType === "HEADING" ? <Heading1 size={16} /> :
                                                        item.itemType === "SUBHEADING" ? <Heading2 size={16} /> : <Type size={16} />}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <input
                                                    className={clsx(
                                                        "w-full bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 transition-all",
                                                        {
                                                            "text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight": item.itemType === "HEADING",
                                                            "text-sm font-bold text-slate-700 dark:text-slate-200": item.itemType === "SUBHEADING",
                                                            "text-sm font-medium text-slate-700 dark:text-slate-300": item.itemType === "ITEM",
                                                        }
                                                    )}
                                                    placeholder={item.itemType === "HEADING" ? "Nombre de Sección..." : item.itemType === "SUBHEADING" ? "Sub-sección..." : "Descripción del producto..."}
                                                    value={item.description}
                                                    onChange={(e) => updateItem(index, "description", e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                {item.itemType === "ITEM" && (
                                                    <input
                                                        className="w-16 mx-auto bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 text-center text-sm font-bold text-slate-700 dark:text-slate-200"
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {item.itemType === "ITEM" && (
                                                    <div className="flex items-center justify-end gap-1 font-mono font-bold text-slate-700 dark:text-slate-200">
                                                        <span className="text-[10px] text-slate-400 opacity-50 font-sans">RD$</span>
                                                        <input
                                                            className="w-24 bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 text-right text-sm"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.price}
                                                            onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                                                        />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {item.itemType === "ITEM" && (
                                                    <div className="flex items-center justify-center">
                                                        <select
                                                            className="bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer appearance-none text-center pr-4"
                                                            value={item.taxRate.toString()}
                                                            onChange={(e) => updateItem(index, "taxRate", parseInt(e.target.value))}
                                                        >
                                                            <option value="18">18%</option>
                                                            <option value="16">16%</option>
                                                            <option value="0">0%</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                                                {item.itemType === "ITEM" ? (
                                                    <>
                                                        <span className="text-[10px] text-slate-400 mr-2 font-normal">RD$</span>
                                                        <span className="font-mono text-base">{formatCurrency(item.quantity * item.price * (1 + item.taxRate / 100))}</span>
                                                    </>
                                                ) : "-"}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    type="button"
                                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all active:scale-90 disabled:opacity-0"
                                                    onClick={() => removeItem(index)}
                                                    disabled={items.length === 1}
                                                >
                                                    <span className="material-icons-outlined text-lg">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer Section: Notes and Totals */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm h-full flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                <span className="material-icons-outlined text-sm">chat_bubble_outline</span>
                            </div>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Términos y Condiciones / Notas</h2>
                        </div>
                        <textarea
                            className="w-full flex-grow bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 rounded-xl p-4 focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all resize-none text-sm text-slate-700 dark:text-slate-300 font-medium"
                            placeholder="Ej: Propuesta válida por 30 días. Pago 50% anticipado..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={5}
                        ></textarea>
                        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        checked={includeCoverPage}
                                        onChange={(event) => setIncludeCoverPage(event.target.checked)}
                                    />
                                    Incluir portada por defecto
                                </label>
                                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        checked={includeTermsPage}
                                        onChange={(event) => setIncludeTermsPage(event.target.checked)}
                                    />
                                    Incluir terminos por defecto
                                </label>
                            </div>
                            <textarea
                                className="w-full bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 rounded-xl p-4 focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all resize-none text-sm text-slate-700 dark:text-slate-300 font-medium"
                                placeholder="Terminos y condiciones especificos para esta cotizacion..."
                                value={termsAndConditions}
                                onChange={(e) => setTermsAndConditions(e.target.value)}
                                rows={6}
                            ></textarea>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden h-full flex flex-col">
                        <div className="p-4 bg-slate-900 dark:bg-slate-800 flex items-center gap-3">
                            <div className="h-6 w-6 rounded-md bg-blue-600 flex items-center justify-center text-white">
                                <span className="material-icons-outlined text-xs">calculate</span>
                            </div>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Resumen de Totales</h2>
                        </div>
                        <div className="p-8 space-y-4 flex-grow">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tighter text-[11px]">Subtotal Bruto</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-base">RD$ {formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm pb-6 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tighter text-[11px]">Impuestos (ITBIS)</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-base">RD$ {formatCurrency(tax)}</span>
                            </div>
                        </div>
                        <div className="p-8 bg-blue-600">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200/50">Total Propuesto</span>
                                <div className="flex items-baseline justify-between text-white">
                                    <span className="text-xs font-bold">RD$</span>
                                    <span className="text-4xl font-black font-mono tracking-tighter tabular-nums">{formatCurrency(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 items-center justify-end gap-3 shadow-sm">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50"
                >
                    {submitting ? "Guardando..." : initialData ? "Actualizar Cotización" : "Crear Cotización"}
                </button>
            </div>
        </form >
    );
}
