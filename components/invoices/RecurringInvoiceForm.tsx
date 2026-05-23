"use client";

import { useState } from "react";
import { Plus, Trash2, Calendar, LayoutGrid, Calculator, Repeat, Clock, Heading1, Heading2, Type, GripVertical } from "lucide-react";
import { useDragReorder } from "@/hooks/useDragReorder";
import { createRecurringInvoice } from "@/app/actions";
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
}

interface RecurringInvoiceFormProps {
    contacts: Contact[];
    projects?: { id: number; name: string }[];
    numberingSequences?: any[];
}

interface Item {
    description: string;
    quantity: number;
    price: number;
    taxRate: number;
    itemType?: "ITEM" | "HEADING" | "SUBHEADING";
}

export function RecurringInvoiceForm({ contacts, projects = [], numberingSequences = [] }: RecurringInvoiceFormProps) {
    const router = useRouter();
    const [items, setItems] = useState<Item[]>([
        { description: "", quantity: 1, price: 0, taxRate: 18, itemType: "ITEM" },
    ]);
    const [contactId, setContactId] = useState<string>("");
    const [contactName, setContactName] = useState("");
    const [contactTaxId, setContactTaxId] = useState("");
    const [frequency, setFrequency] = useState("MONTHLY");
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
    const [dueDays, setDueDays] = useState("30");
    const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");
    const [projectId, setProjectId] = useState<string>("");
    const [projectName, setProjectName] = useState("");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [submitting, setSubmitting] = useState(false);

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

    const updateItem = (index: number, field: string, value: string | number) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;
        setItems(newItems);
    };

    const calculateSubtotal = () => {
        return items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    };

    const { dragIndex, dragOverIndex, handleDragStart, handleDragOver, handleDragEnter, handleDrop, handleDragEnd } = useDragReorder(items, setItems);

    const calculateTax = () => {
        return items.reduce((acc, item) => acc + (item.price * item.quantity * (item.taxRate / 100)), 0);
    };

    const calculateTotal = () => {
        return calculateSubtotal() + calculateTax();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contactId) return alert("Por favor seleccione un contacto");
        if (items.some(item => !item.description || (item.itemType === "ITEM" && item.price <= 0))) {
            return alert("Por favor complete todos los items correctamente");
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append("contactId", contactId);
            if (contactId === "new") {
                formData.append("contactName", contactName);
                formData.append("contactTaxId", contactTaxId);
            }
            formData.append("frequency", frequency);
            formData.append("startDate", startDate);
            formData.append("dayOfMonth", dayOfMonth);
            formData.append("dueDays", dueDays);
            formData.append("projectId", projectId);
            if (projectId === "new") {
                formData.append("projectName", projectName);
            }
            formData.append("ncfSequenceId", selectedSequenceId);
            formData.append("title", title);
            formData.append("subtitle", subtitle);
            formData.append("items", JSON.stringify(items.map(item => ({
                ...item,
                total: (item.price * item.quantity) + (item.price * item.quantity * (item.taxRate / 100))
            }))));

            await createRecurringInvoice(formData);
            router.push("/invoices/recurring");
        } catch (error) {
            console.error(error);
            alert("Error al crear la factura recurrente");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Repeat className="h-5 w-5 text-primary" />
                            Datos del Contacto / Cliente y Recurrencia
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">


                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Contacto / Cliente</Label>
                                <Select value={contactId} onValueChange={setContactId} required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar contacto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {contacts.map((contact) => (
                                            <SelectItem key={contact.id} value={contact.id.toString()}>
                                                {contact.name}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="new" className="text-blue-600 font-medium">+ Nuevo Contacto</SelectItem>
                                    </SelectContent>
                                </Select>
                                {contactId === "new" && (
                                    <div className="space-y-3 p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30 mt-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-blue-600">Nombre del Contacto</Label>
                                            <Input
                                                required
                                                placeholder="Nombre completo o Empresa"
                                                value={contactName}
                                                onChange={(e) => setContactName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-blue-600">RNC / Cédula</Label>
                                            <Input
                                                required
                                                placeholder="130XXXX-X"
                                                value={contactTaxId}
                                                onChange={(e) => setContactTaxId(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Proyecto (Opcional)</Label>
                                <Select value={projectId} onValueChange={setProjectId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sin proyecto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sin proyecto</SelectItem>
                                        {projects.map((p) => (
                                            <SelectItem key={p.id} value={p.id.toString()}>
                                                {p.name}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="new" className="text-blue-600 font-medium">+ Nuevo Proyecto</SelectItem>
                                    </SelectContent>
                                </Select>
                                {projectId === "new" && (
                                    <div className="space-y-3 p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30 mt-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-blue-600">Nombre del Proyecto</Label>
                                            <Input
                                                required
                                                placeholder="Ej: Desarrollo Web - Cliente X"
                                                value={projectName}
                                                onChange={(e) => setProjectName(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" /> Frecuencia
                                </Label>
                                <Select value={frequency} onValueChange={setFrequency}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DAILY">Diaria</SelectItem>
                                        <SelectItem value="WEEKLY">Semanal</SelectItem>
                                        <SelectItem value="MONTHLY">Mensual</SelectItem>
                                        <SelectItem value="YEARLY">Anual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Primera Emisión</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Día de emisión</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={dayOfMonth}
                                    onChange={(e) => setDayOfMonth(e.target.value)}
                                    disabled={frequency === "DAILY" || frequency === "WEEKLY"}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Vence en días</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="365"
                                    value={dueDays}
                                    onChange={(e) => setDueDays(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de NCF (Opcional)</Label>
                                <Select value={selectedSequenceId} onValueChange={setSelectedSequenceId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Usar por defecto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sin NCF automático</SelectItem>
                                        {numberingSequences.map((s) => (
                                            <SelectItem key={s.id} value={s.id.toString()}>
                                                {s.name} ({s.prefix})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-blue-600">
                            <Calculator className="h-5 w-5" />
                            Totales Estimados
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Subtotal:</span>
                            <span className="font-medium">{formatCurrency(calculateSubtotal())}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">ITBIS (18%):</span>
                            <span className="font-medium">{formatCurrency(calculateTax())}</span>
                        </div>
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                            <span className="font-bold">Total:</span>
                            <span className="font-bold text-lg text-primary">{formatCurrency(calculateTotal())}</span>
                        </div>
                        <Button type="submit" className="w-full mt-4" disabled={submitting}>
                            {submitting ? "Creando..." : "Crear Factura Recurrente"}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Items Table Section */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
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
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">
                                <th className="pl-4 pr-1 py-4 w-10"></th>
                                <th className="px-6 py-4 text-center w-12">#</th>
                                <th className="px-6 py-4">Descripción</th>
                                <th className="px-6 py-4 text-center w-24">Cant.</th>
                                <th className="px-6 py-4 text-right w-40">Precio Unit.</th>
                                <th className="px-6 py-4 text-center w-32">ITBIS %</th>
                                <th className="px-6 py-4 text-right w-40">Monto Total</th>
                                <th className="px-6 py-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                            {items.map((item, index) => (
                                <tr
                                    key={index}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    onDragEnd={(e) => { e.currentTarget.removeAttribute('draggable'); handleDragEnd(); }}
                                    className={clsx(
                                    "group transition-all duration-200",
                                    {
                                        "bg-slate-50/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/50": item.itemType === "HEADING" && dragIndex !== index,
                                        "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/30": item.itemType !== "HEADING" && dragIndex !== index,
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
                                    <td className="px-6 py-4 text-center w-12">
                                        <div className={clsx(
                                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                            {
                                                "bg-blue-100 text-blue-700 shadow-sm": item.itemType === "HEADING",
                                                "bg-slate-100 text-slate-600": item.itemType === "SUBHEADING",
                                                "bg-slate-50 text-slate-400": item.itemType === "ITEM",
                                            }
                                        )}>
                                            {item.itemType === "HEADING" ? <Heading1 size={14} /> :
                                                item.itemType === "SUBHEADING" ? <Heading2 size={14} /> :
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <input
                                            className={clsx(
                                                "w-full bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 transition-all placeholder:text-slate-300",
                                                {
                                                    "text-sm font-black uppercase tracking-wide text-slate-800 dark:text-slate-100": item.itemType === "HEADING",
                                                    "text-sm font-bold text-slate-700 dark:text-slate-200 pl-4": item.itemType === "SUBHEADING",
                                                    "text-sm text-slate-600 dark:text-slate-300": item.itemType === "ITEM",
                                                }
                                            )}
                                            placeholder={
                                                item.itemType === "HEADING" ? "Escribe un título de sección..." :
                                                    item.itemType === "SUBHEADING" ? "Escribe un subtítulo..." :
                                                        "Descripción del producto o servicio"
                                            }
                                            value={item.description}
                                            onChange={(e) => updateItem(index, "description", e.target.value)}
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        {item.itemType === "ITEM" && (
                                            <input
                                                className="w-16 mx-auto bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 text-center text-sm text-slate-700 dark:text-slate-300 font-medium"
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                                            />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {item.itemType === "ITEM" && (
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-[10px] text-slate-400 font-medium">RD$</span>
                                                <input
                                                    className="w-24 bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 text-right text-sm text-slate-700 dark:text-slate-300 font-mono"
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
                                                    className="bg-transparent border-0 border-b border-transparent focus:border-blue-600 focus:ring-0 p-0 text-sm text-slate-700 dark:text-slate-300 cursor-pointer appearance-none text-center pr-4"
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
                                    <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300">
                                        {item.itemType === "ITEM" && (
                                            <>
                                                <span className="text-[10px] text-slate-400 mr-1 font-sans">RD$</span>
                                                <span className="font-mono">{formatCurrency(item.quantity * item.price * (1 + item.taxRate / 100))}</span>
                                            </>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            type="button"
                                            className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30"
                                            onClick={() => removeItem(index)}
                                            disabled={items.length === 1}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </form>
    );
}
