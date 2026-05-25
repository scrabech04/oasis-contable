"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, User, FileText, Calendar, LayoutGrid, Calculator, MessageSquare } from "lucide-react";
import { createPurchase, updatePurchase } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { useRouter } from "next/navigation";

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

interface PurchaseFormProps {
    contacts: Contact[];
    projects?: { id: number; name: string }[];
    initialData?: any;
}

function toFiniteNumber(value: unknown, fallback = 0) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function itemTotal(item: { quantity: number; price: number; taxRate: number }) {
    return toFiniteNumber(item.quantity) * toFiniteNumber(item.price) * (1 + toFiniteNumber(item.taxRate) / 100);
}

export function PurchaseForm({ contacts, projects = [], initialData }: PurchaseFormProps) {
    const router = useRouter();
    const [items, setItems] = useState([
        { description: "", quantity: 1, price: 0, taxRate: 18 },
    ]);
    const [contactId, setContactId] = useState<string>("");
    const [contactName, setContactName] = useState("");
    const [contactTaxId, setContactTaxId] = useState("");
    const [ncf, setNcf] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState("");
    const [costType, setCostType] = useState("02");
    const [taxTreatment, setTaxTreatment] = useState("LOCAL_CREDIT");
    const [submitting, setSubmitting] = useState(false);
    const [projectId, setProjectId] = useState<string>("");
    const [projectName, setProjectName] = useState("");
    const [isFromQR, setIsFromQR] = useState(false);
    const [saveAsContact, setSaveAsContact] = useState(true);
    const [targetProfileId, setTargetProfileId] = useState<number | null>(null);

    const applyTaxTreatment = (value: string) => {
        setTaxTreatment(value);
        if (value === "LOCAL_CREDIT") {
            setItems((current) => current.map((item) => ({ ...item, taxRate: item.taxRate > 0 ? item.taxRate : 18 })));
            return;
        }
        setItems((current) => current.map((item) => ({ ...item, taxRate: 0 })));
    };

    useEffect(() => {
        const qrDataRaw = sessionStorage.getItem("qr_scanned_data");
        if (qrDataRaw) {
            try {
                const qrData = JSON.parse(qrDataRaw);
                // Check if it's recent (less than 5 minutes old)
                const now = new Date().getTime();
                if (now - qrData.scannedAt < 5 * 60 * 1000) {
                    setIsFromQR(true);
                    setTaxTreatment("LOCAL_CREDIT");
                    setContactId("");
                    setContactName(qrData.supplierName || "");
                    setContactTaxId(qrData.supplierTaxId || "");
                    setTargetProfileId(qrData.targetProfileId ? Number(qrData.targetProfileId) : null);
                    setSaveAsContact(false);
                    setNcf(qrData.ncf || "");
                    if (qrData.date) {
                        try {
                            // Date from DGII can be YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY
                            let formattedDate = qrData.date;
                            if (qrData.date.includes('/')) {
                                const [d, m, y] = qrData.date.split('/');
                                formattedDate = `${y}-${m}-${d}`;
                            } else if (qrData.date.includes('-')) {
                                const parts = qrData.date.split('-');
                                if (parts[0].length !== 4) { // Not YYYY-MM-DD, assume DD-MM-YYYY
                                    formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                }
                            }
                            setDate(formattedDate);
                            // Also set due date to the same by default for QR
                            setDueDate(formattedDate);
                        } catch (e) {
                            console.error("Error parsing QR date", e);
                        }
                    }

                    const qrTotal = toFiniteNumber(qrData.total);
                    const qrTaxAmount = toFiniteNumber(qrData.taxAmount);
                    if (qrTotal > 0 || qrTaxAmount > 0) {
                        const subtotal = qrTaxAmount > 0 ? Math.max(0, qrTotal - qrTaxAmount) : qrTotal;
                        const items = [
                            {
                                description: `Compra Factura Electrónica ${qrData.ncf || ''}`,
                                quantity: 1,
                                price: subtotal,
                                // If DGII QR does not expose ITBIS, do not invent tax.
                                taxRate: subtotal > 0 ? (qrTaxAmount / subtotal) * 100 : 0
                            }
                        ];
                        // Only round if it's EXTREMELY close to a standard rate to avoid rounding errors
                        const exactRate = items[0].taxRate;
                        if (Math.abs(exactRate - 18) < 0.001) items[0].taxRate = 18;
                        else if (Math.abs(exactRate - 16) < 0.001) items[0].taxRate = 16;
                        else if (Math.abs(exactRate - 0) < 0.001) items[0].taxRate = 0;

                        setItems(items);
                    }
                }
                // Clear it so it doesn't populate again on refresh if not intended
                sessionStorage.removeItem("qr_scanned_data");
            } catch (e) {
                console.error("Error loading QR data", e);
            }
        }
    }, []);

    useEffect(() => {
        if (initialData) {
            if (initialData.contactId) {
                setContactId(initialData.contactId.toString());
                setSaveAsContact(true);
            } else {
                setContactId("");
                setContactName(initialData.supplierName || "");
                setContactTaxId(initialData.supplierTaxId || "");
                setSaveAsContact(false);
            }
            setNcf(initialData.ncf || "");
            setDate(new Date(initialData.date).toISOString().split('T')[0]);
            setDueDate(initialData.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            setNotes(initialData.notes || "");
            setCostType(initialData.costType || "02");
            setTaxTreatment(initialData.taxTreatment || (initialData.type === "INFORMAL" ? "LOCAL_NO_CREDIT" : "LOCAL_CREDIT"));
            setItems(initialData.items.map((item: any) => ({
                description: item.description,
                quantity: item.quantity,
                price: item.price,
                taxRate: item.taxRate
            })));
        }
    }, [initialData]);

    const addItem = () => {
        setItems([...items, { description: "", quantity: 1, price: 0, taxRate: 18 }]);
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

    const subtotal = items.reduce((acc, item) => acc + toFiniteNumber(item.quantity) * toFiniteNumber(item.price), 0);
    const tax = items.reduce((acc, item) => acc + (toFiniteNumber(item.quantity) * toFiniteNumber(item.price) * (toFiniteNumber(item.taxRate) / 100)), 0);
    const total = subtotal + tax;
    const isManualSupplier = contactId === "manual";
    const showSupplierFields = contactId === "new" || isManualSupplier || isFromQR || (!contactId && (!!contactName || !!contactTaxId));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const formData = new FormData();
        formData.append("type", "FORMAL");
        formData.append("contactId", contactId);
        if (showSupplierFields) {
            formData.append("contactName", contactName);
            formData.append("contactTaxId", contactTaxId);
        }
        formData.append("saveAsContact", contactId === "new" && saveAsContact ? "true" : "false");
        formData.append("ncf", ncf);
        formData.append("date", date);
        formData.append("dueDate", dueDate);
        formData.append("notes", notes);
        formData.append("costType", costType);
        formData.append("taxTreatment", taxTreatment);
        if (isFromQR && targetProfileId) {
            formData.append("targetProfileId", String(targetProfileId));
        }
        formData.append("projectId", projectId);
        if (projectId === "new") {
            formData.append("projectName", projectName);
        }
        formData.append("items", JSON.stringify(items));

        try {
            let result;
            if (initialData) {
                result = await updatePurchase(initialData.id, formData);
            } else {
                result = await createPurchase(formData);
            }

            if (result.success) {
                router.push("/purchases");
            } else if ("error" in result) {
                alert(result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Error al guardar la compra");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto px-4 py-8 space-y-8 font-sans">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <nav className="flex items-center text-sm text-slate-500 dark:text-slate-400 mb-2">
                        <span>Compras</span>
                        <span className="material-icons-outlined text-sm mx-2">chevron_right</span>
                        <span className="font-medium text-primary">
                            {initialData ? "Editar Compra" : "Nueva Compra"}
                        </span>
                    </nav>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {initialData ? "Editar Factura de Compra" : "Nueva Compra a Proveedor"}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Registra una nueva factura de compra de tus proveedores</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded-lg"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        <span className="material-icons-outlined text-[18px]">save</span>
                        {submitting ? "Guardando..." : initialData ? "Actualizar Compra" : "Registrar Compra"}
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Supplier Section */}
                <div className="md:col-span-4">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-full shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center text-orange-600">
                                <User className="w-4 h-4" />
                            </div>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contacto / Proveedor</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="supplier" className="text-[10px] font-bold uppercase text-slate-400">Seleccionar Proveedor</Label>
                                <Select
                                    value={contactId}
                                    onValueChange={(value) => {
                                        setContactId(value);
                                        if (value === "new") {
                                            setSaveAsContact(true);
                                        } else if (value === "manual") {
                                            setSaveAsContact(false);
                                        } else if (!value) {
                                            setSaveAsContact(false);
                                            setContactName("");
                                            setContactTaxId("");
                                        }
                                    }}
                                    disabled={isFromQR}
                                >
                                    <SelectTrigger id="supplier" className="h-11 rounded-xl">
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {contacts.map((contact) => (
                                            <SelectItem key={contact.id} value={contact.id.toString()}>
                                                {contact.name}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="manual" className="text-amber-600 font-medium">Registrar emisor sin guardar proveedor</SelectItem>
                                        <SelectItem value="new" className="text-blue-600 font-medium">+ Nuevo Proveedor</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {showSupplierFields && (
                                <div className="space-y-4 p-4 bg-orange-50/20 dark:bg-orange-900/10 rounded-2xl border border-orange-100/50 dark:border-orange-900/30 animate-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-orange-600">Nombre / Razón Social</Label>
                                        <Input
                                            required
                                            placeholder="Nombre del Proveedor"
                                            className="h-10 rounded-xl bg-white dark:bg-slate-900"
                                            value={contactName}
                                            onChange={(e) => setContactName(e.target.value)}
                                            readOnly={isFromQR}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-orange-600">RNC / Cédula</Label>
                                        <Input
                                            required
                                            placeholder="130XXXX-X"
                                            className="h-10 rounded-xl bg-white dark:bg-slate-900 font-mono"
                                            value={contactTaxId}
                                            onChange={(e) => setContactTaxId(e.target.value)}
                                            readOnly={isFromQR}
                                        />
                                    </div>
                                    {!isFromQR && contactId === "new" && (
                                        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={saveAsContact}
                                                onChange={(e) => setSaveAsContact(e.target.checked)}
                                            />
                                            Guardar este proveedor también como contacto
                                        </label>
                                    )}
                                    {(isManualSupplier || !contactId) && contactTaxId && (
                                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-900/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                                            Este emisor se guardará en la compra con RNC <span className="font-mono font-bold">{contactTaxId}</span>, aunque no quede como contacto.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Purchase Details Section */}
                <div className="md:col-span-8">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-full shadow-sm">
                        <div className="flex items-center gap-2 mb-6 text-slate-400 dark:text-slate-500">
                            <span className="material-icons-outlined text-[20px]">description</span>
                            <h2 className="text-xs font-bold uppercase tracking-wider">Detalles del documento</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Clasificación Fiscal</label>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all appearance-none py-2.5 pl-3 pr-10 disabled:cursor-not-allowed disabled:opacity-80"
                                            value={taxTreatment}
                                            onChange={(e) => applyTaxTreatment(e.target.value)}
                                            disabled={isFromQR}
                                        >
                                            <option value="LOCAL_CREDIT">Compra local con crédito fiscal</option>
                                            <option value="LOCAL_NO_CREDIT">Gasto local sin crédito fiscal</option>
                                            <option value="FOREIGN_EXPENSE">Gasto internacional</option>
                                            <option value="IMPORT_GOODS">Importación de bienes</option>
                                            <option value="FOREIGN_WITHHOLDING">Pago al exterior con retención</option>
                                        </select>
                                        <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        {isFromQR
                                            ? "Detectado por QR: factura electrónica local con crédito fiscal."
                                            : taxTreatment === "LOCAL_CREDIT"
                                                ? "Entra al 606 y su ITBIS puede descontarse en IT-1."
                                                : taxTreatment === "FOREIGN_WITHHOLDING"
                                                    ? "No entra al 606; se marca para control de pagos al exterior/609."
                                                    : "No descuenta ITBIS; sí queda como gasto/costo para ISR."}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">NCF (Comprobante)</label>
                                    <input
                                        readOnly={isFromQR}
                                        className={`w-full border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all placeholder:text-slate-400 py-2.5 px-3 font-mono uppercase ${isFromQR ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed opacity-80' : 'bg-slate-50 dark:bg-slate-900'}`}
                                        placeholder="B0100000000"
                                        type="text"
                                        value={ncf}
                                        onChange={(e) => setNcf(e.target.value.toUpperCase())}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha Emisión</label>
                                    <input
                                        readOnly={isFromQR}
                                        className={`w-full border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all py-2.5 px-3 ${isFromQR ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed opacity-80' : 'bg-slate-50 dark:bg-slate-900'}`}
                                        type="date"
                                        required
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Proyecto Relacionado</label>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all py-2.5 px-3 appearance-none"
                                            value={projectId}
                                            onChange={(e) => setProjectId(e.target.value)}
                                        >
                                            <option value="">Sin Proyecto</option>
                                            {projects.map((project) => (
                                                <option key={project.id} value={project.id.toString()}>
                                                    {project.name}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de Gasto (DGII)</label>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all appearance-none py-2.5 pl-3 pr-10"
                                            value={costType}
                                            onChange={(e) => setCostType(e.target.value)}
                                        >
                                            <option value="01">01 - GASTOS DE PERSONAL</option>
                                            <option value="02">02 - TRABAJOS, SUMINISTROS Y SERVICIOS</option>
                                            <option value="03">03 - ARRENDAMIENTOS</option>
                                            <option value="04">04 - GASTOS DE ACTIVOS FIJOS</option>
                                            <option value="05">05 - GASTOS DE REPRESENTACION</option>
                                            <option value="06">06 - OTRAS DEDUCCIONES ADMITIDAS</option>
                                            <option value="07">07 - GASTOS FINANCIEROS</option>
                                            <option value="08">08 - GASTOS EXTRAORDINARIOS</option>
                                            <option value="09">09 - COMPRAS INVENTARIO</option>
                                            <option value="10">10 - ACTIVOS FIJOS</option>
                                            <option value="11">11 - GASTOS DE SEGUROS</option>
                                        </select>
                                        <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Vencimiento</label>
                                    <input
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all py-2.5 px-3"
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

                {/* Project Section */}
                <div className="md:col-span-12">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 text-slate-400 dark:text-slate-500">
                            <span className="material-icons-outlined text-[20px]">folder</span>
                            <h2 className="text-xs font-bold uppercase tracking-wider">Proyecto (Opcional)</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Seleccionar Proyecto</label>
                                <div className="relative">
                                    <select
                                        className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all appearance-none py-2.5 pl-3 pr-10"
                                        value={projectId}
                                        onChange={(e) => setProjectId(e.target.value)}
                                    >
                                        <option value="">Sin proyecto</option>
                                        {projects.map((project) => (
                                            <option key={project.id} value={project.id.toString()}>
                                                {project.name}
                                            </option>
                                        ))}
                                        <option value="new" className="text-blue-600 font-medium">+ Nuevo Proyecto</option>
                                    </select>
                                    <span className="material-icons-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>

                            {projectId === "new" && (
                                <div className="space-y-3 p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30 animate-in slide-in-from-top-2 duration-200">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400">Nombre del Proyecto</label>
                                        <input
                                            required
                                            placeholder="Ej: Desarrollo Web - Cliente X"
                                            className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
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
                <div className="md:col-span-12">
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="flex flex-col gap-1 p-4 bg-orange-600/10 dark:bg-orange-900/20 border-t border-orange-100 dark:border-orange-800">
                            <span className="text-[10px] font-black uppercase tracking-wider text-orange-600">Proveedor Seleccionado</span>
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {contactId === 'new'
                                    ? contactName || 'Nuevo Proveedor'
                                    : contactId === 'manual'
                                        ? contactName || 'Emisor manual'
                                        : contactName || contacts.find(s => s.id.toString() === contactId)?.name || 'Sin seleccionar'}
                            </div>
                        </div>
                        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                                <span className="material-icons-outlined text-[20px]">grid_view</span>
                                <h2 className="text-xs font-bold uppercase tracking-wider">Items de Compra</h2>
                            </div>
                            <button
                                type="button"
                                onClick={addItem}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all border border-blue-100 dark:border-blue-800"
                            >
                                <span className="material-icons-outlined text-[16px]">add</span>
                                Agregar Item
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900/50">
                                    <tr>
                                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descripción</th>
                                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Cant.</th>
                                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40 text-right">Costo Unit.</th>
                                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32 text-right">Impuesto %</th>
                                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40 text-right">Monto Total</th>
                                        <th className="px-6 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-sans">
                                    {items.map((item, index) => (
                                        <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <input
                                                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                                                    placeholder="Producto o servicio adquirido"
                                                    value={item.description}
                                                    onChange={(e) => updateItem(index, "description", e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <input
                                                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm text-slate-700 dark:text-slate-200"
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-[10px] font-bold text-slate-400">RD$</span>
                                                    <input
                                                        className="w-20 bg-transparent border-none p-0 focus:ring-0 text-sm text-right text-slate-700 dark:text-slate-200 font-mono"
                                                        type="number"
                                                        step="0.01"
                                                        value={item.price}
                                                        onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <input
                                                        className="w-10 bg-transparent border-none p-0 focus:ring-0 text-sm text-right text-slate-700 dark:text-slate-200 font-mono"
                                                        type="number"
                                                        value={item.taxRate}
                                                        onChange={(e) => updateItem(index, "taxRate", parseFloat(e.target.value) || 0)}
                                                    />
                                                    <span className="text-[10px] font-bold text-slate-400">%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-[10px] font-bold text-slate-400 font-sans">RD$</span>
                                                    <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                                                        {formatCurrency(itemTotal(item))}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    type="button"
                                                    className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30"
                                                    onClick={() => removeItem(index)}
                                                    disabled={items.length === 1}
                                                >
                                                    <span className="material-icons-outlined text-[20px]">delete</span>
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
                <div className="md:col-span-8">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-full shadow-sm">
                        <div className="flex items-center gap-2 mb-6 text-slate-400 dark:text-slate-500">
                            <span className="material-icons-outlined text-[20px]">chat_bubble_outline</span>
                            <h2 className="text-xs font-bold uppercase tracking-wider">Notas</h2>
                        </div>
                        <textarea
                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-blue-600 focus:border-blue-600 transition-all placeholder:text-slate-400 resize-none p-3"
                            placeholder="Información adicional sobre esta compra..."
                            rows={4}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        ></textarea>
                    </div>
                </div>

                <div className="md:col-span-4">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-full shadow-sm">
                        <div className="flex items-center gap-2 mb-6 text-slate-400 dark:text-slate-500">
                            <span className="material-icons-outlined text-[20px]">calculate</span>
                            <h2 className="text-xs font-bold uppercase tracking-wider">Totales de Compra</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                                <span className="font-medium text-slate-700 dark:text-slate-200 font-mono">RD$ {formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm pb-4 border-b border-slate-100 dark:border-slate-700">
                                <span className="text-slate-500 dark:text-slate-400">Impuestos</span>
                                <span className="font-medium text-slate-700 dark:text-slate-200 font-mono">RD$ {formatCurrency(tax)}</span>
                            </div>
                            <div className="flex justify-between items-end pt-2">
                                <span className="text-sm font-bold text-slate-900 dark:text-white">Total Compra</span>
                                <div className="text-right">
                                    <span className="block text-[10px] font-bold text-orange-500 uppercase opacity-75">Monto Final</span>
                                    <span className="text-3xl font-bold text-orange-600 dark:text-orange-500 font-mono">RD$ {formatCurrency(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-12 flex flex-col gap-4 md:flex-row md:items-center md:justify-between opacity-50 hover:opacity-100 transition-opacity">
                <p className="text-xs text-slate-500">© 2026 Accounting System Premium</p>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded-lg"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        <span className="material-icons-outlined text-[18px]">save</span>
                        {submitting ? "Guardando..." : initialData ? "Actualizar Compra" : "Registrar Compra"}
                    </button>
                </div>
            </div>
        </form>
    );
}
