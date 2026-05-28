"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, User, FileText, Calendar, LayoutGrid, Calculator, Heading1, Heading2, Type, CreditCard, Pencil, Receipt, GripVertical } from "lucide-react";
import { useDragReorder } from "@/hooks/useDragReorder";
import { createInvoice, updateInvoice, getNextNcf, deletePayment } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface Contact {
    id: number;
    name: string;
    taxId: string | null;
}

interface Project {
    id: number;
    name: string;
    code: string;
}

interface NumberingSequence {
    id: number;
    name: string;
    prefix: string;
    currentNumber: number;
    isPreferred: boolean;
}

interface Item {
    description: string;
    quantity: number;
    price: number;
    taxRate: number;
    itemType?: "ITEM" | "HEADING" | "SUBHEADING";
}

interface InvoiceFormProps {
    contacts: Contact[];
    projects?: { id: number; name: string }[];
    initialData?: any;
    numberingSequences?: any[];
}

interface Payment {
    id: number;
    amount: number;
    date: string;
    method: string;
    withholdings: any[];
}

function normalizeTaxRate(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

export function InvoiceForm({ contacts, projects = [], initialData, numberingSequences = [] }: InvoiceFormProps) {
    const router = useRouter();
    const [items, setItems] = useState<Item[]>([
        { description: "", quantity: 1, price: 0, taxRate: 18, itemType: "ITEM" },
    ]);
    const [contactId, setContactId] = useState<string>("");
    const [contactName, setContactName] = useState("");
    const [contactTaxId, setContactTaxId] = useState("");
    const [ncf, setNcf] = useState("");
    const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");
    const [incomeType, setIncomeType] = useState("01");
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
    const [projectId, setProjectId] = useState<string>("");
    const [projectName, setProjectName] = useState("");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [notes, setNotes] = useState("");
    const [termsAndConditions, setTermsAndConditions] = useState("");
    const [includeCoverPage, setIncludeCoverPage] = useState(false);
    const [includeTermsPage, setIncludeTermsPage] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const payments = initialData?.payments || [];



    useEffect(() => {
        if (!initialData && numberingSequences.length > 0) {
            const preferred = numberingSequences.find(s => s.isPreferred);
            if (preferred) {
                setSelectedSequenceId(preferred.id.toString());
                handleSequenceChange(preferred.id.toString());
            }
        }
    }, [numberingSequences, initialData]);

    const handleSequenceChange = async (sequenceId: string) => {
        setSelectedSequenceId(sequenceId);
        if (sequenceId) {
            try {
                const nextNcf = await getNextNcf(parseInt(sequenceId));
                setNcf(nextNcf);
            } catch (error: any) {
                alert(error.message);
                setNcf("");
            }
        } else {
            setNcf("");
        }
    };

    useEffect(() => {
        if (initialData) {
            setContactId(initialData.contactId.toString());
            setNcf(initialData.ncf || "");
            setIncomeType(initialData.incomeType || "01");
            setInvoiceDate(new Date(initialData.date).toISOString().split('T')[0]);
            setDueDate(new Date(initialData.dueDate).toISOString().split('T')[0]);
            setItems(initialData.items.map((item: any) => ({
                description: item.description,
                quantity: item.quantity,
                itemType: item.itemType || "ITEM",
                price: item.price,
                taxRate: normalizeTaxRate(item.taxRate)
            })));
            setProjectId(initialData.projectId?.toString() || "");
            setTitle(initialData.title || "");
            setSubtitle(initialData.subtitle || "");
            setNotes(initialData.notes || "");
            setTermsAndConditions(initialData.termsAndConditions || "");
            setIncludeCoverPage(Boolean(initialData.includeCoverPage));
            setIncludeTermsPage(Boolean(initialData.includeTermsPage));
        }
    }, [initialData]);

    const addItem = (type: "ITEM" | "HEADING" | "SUBHEADING" = "ITEM") => {
        const newItem = {
            description: "",
            quantity: 1,
            price: 0,
            taxRate: 18,
            itemType: type
        };

        if (type === "HEADING" || type === "SUBHEADING") {
            newItem.quantity = 0;
            newItem.price = 0;
            newItem.taxRate = 0;
        } else if (type === "ITEM") {
            newItem.quantity = 1;
            newItem.taxRate = 18;
        }

        setItems([...items, newItem]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        // @ts-ignore
        newItems[index][field] = value;
        setItems(newItems);
    };

    const { dragIndex, dragOverIndex, handleDragStart, handleDragOver, handleDragEnter, handleDrop, handleDragEnd } = useDragReorder(items, setItems);

    const subtotal = items.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const tax = items.reduce((acc, item) => acc + (item.quantity * item.price * (item.taxRate / 100)), 0);
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
        formData.append("ncf", ncf);
        formData.append("date", invoiceDate);
        formData.append("dueDate", dueDate);
        formData.append("incomeType", incomeType);
        formData.append("projectId", projectId);
        if (projectId === "new") {
            formData.append("projectName", projectName);
        }

        formData.append("title", title);
        formData.append("subtitle", subtitle);
        formData.append("notes", notes); // Fixed: sending notes properly
        formData.append("termsAndConditions", termsAndConditions);
        formData.append("includeCoverPage", String(includeCoverPage));
        formData.append("includeTermsPage", String(includeTermsPage));
        formData.append("items", JSON.stringify(items));

        try {
            let result;
            if (initialData) {
                result = await updateInvoice(initialData.id, formData);
            } else {
                result = await createInvoice(formData);
            }

            if (result.success) {
                router.push("/invoices");
            } else if ("error" in result) {
                alert(result.error);
            }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Error al guardar la factura";
            alert(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="px-4 py-8 space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <nav className="flex items-center text-sm text-slate-500 dark:text-slate-400 mb-2">
                        <span>Facturación</span>
                        <span className="material-icons-outlined text-sm mx-2">chevron_right</span>
                        <span className="font-medium text-blue-600">
                            {initialData ? "Editar Factura" : "Nueva Factura"}
                        </span>
                    </nav>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600">
                            <span className="material-icons-outlined">receipt_long</span>
                        </span>
                        {initialData ? `Editar Factura` : "Nueva Factura"}
                    </h1>
                </div>
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
                        {submitting ? "Guardando..." : initialData ? "Actualizar Factura" : "Crear Factura"}
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contact Section */}
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

                {/* Invoice Details Section */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                <span className="material-icons-outlined text-sm">description</span>
                            </div>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Detalles de Facturación</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                            {/* Numeración / NCF */}
                            <div className="space-y-4">
                                <div className="relative group">
                                    <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10">Numeración / NCF</label>

                                    <div className="space-y-2">
                                        {!initialData && numberingSequences.length > 0 && (
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-3 text-xs focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                                    value={selectedSequenceId}
                                                    onChange={(e) => handleSequenceChange(e.target.value)}
                                                >
                                                    <option value="">Manual / Sin NCF</option>
                                                    {numberingSequences.map((seq) => (
                                                        <option key={seq.id} value={seq.id.toString()}>
                                                            {seq.name} ({seq.prefix})
                                                        </option>
                                                    ))}
                                                </select>
                                                <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                            </div>
                                        )}
                                        <input
                                            className="w-full bg-slate-100/50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-3 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-mono uppercase font-bold text-slate-700 dark:text-slate-200"
                                            placeholder="E3100000000"
                                            type="text"
                                            value={ncf}
                                            onChange={(e) => setNcf(e.target.value)}
                                            readOnly={!!selectedSequenceId && !initialData}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Fechas */}
                            <div className="space-y-6">
                                <div className="relative group">
                                    <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10 transition-all">Fecha Emisión</label>
                                    <input
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                        type="date"
                                        required
                                        value={invoiceDate}
                                        onChange={(e: any) => setInvoiceDate(e.target.value)}
                                    />
                                </div>
                                <div className="relative group">
                                    <label className="absolute left-3 -top-2 px-1 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-400 z-10 transition-all">Vencimiento</label>
                                    <input
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                                        type="date"
                                        required
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                    />
                                </div>
                            </div>


                        </div>
                    </div>
                </div>

                {/* Project Section (Moved here and styled like QuotationForm) */}
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
                                        onChange={(e: any) => setProjectId(e.target.value)}
                                    >
                                        <option value="">Sin Proyecto</option>
                                        {projects.map((project: any) => (
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

                {/* Items Table Section - Updated styling */}
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
                        <div className="overflow-x-auto">
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
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Notas</h2>
                        </div>
                        <textarea
                            className="w-full flex-grow bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 rounded-xl p-4 focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all resize-none text-sm text-slate-700 dark:text-slate-300 font-medium"
                            placeholder="Información adicional sobre esta factura..."
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
                                placeholder="Terminos y condiciones especificos para esta factura..."
                                value={termsAndConditions}
                                onChange={(e) => setTermsAndConditions(e.target.value)}
                                rows={6}
                            ></textarea>
                        </div>
                    </div>

                </div>
            </div>

            <div className="lg:col-span-1">

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
                            {/* Paid Amount Display */}
                            {initialData && (
                                <div className="flex justify-between items-center text-sm py-2">
                                    <span className="text-green-600 font-bold uppercase tracking-tighter text-[11px]">Pagado</span>
                                    <span className="font-bold text-green-600 font-mono text-base">
                                        RD$ {formatCurrency(payments.reduce((acc: number, p: any) => acc + p.amount, 0))}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="p-8 bg-blue-600">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200/50">Total Factura</span>
                                <div className="flex items-baseline justify-between text-white">
                                    <span className="text-xs font-bold">RD$</span>
                                    <span className="text-4xl font-black font-mono tracking-tighter tabular-nums">{formatCurrency(total)}</span>
                                </div>
                            </div>
                            {initialData && (
                                <div className="mt-4 pt-4 border-t border-blue-500/30 flex justify-between items-center text-blue-100">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Pendiente</span>
                                    <span className="font-mono font-bold text-lg">
                                        RD$ {formatCurrency(total - payments.reduce((acc: number, p: any) => acc + p.amount, 0))}
                                    </span>
                                </div>
                            )}
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
                    {submitting ? "Guardando..." : initialData ? "Actualizar Factura" : "Crear Factura"}
                </button>
            </div>
            {initialData && (
                <div />
            )}
        </form >
    );
}
