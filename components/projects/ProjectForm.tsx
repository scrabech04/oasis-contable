"use client";

import { useState, useEffect } from "react";
import { createProject, updateProject, getUnlinkedInvoicesByContact } from "@/app/actions";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProjectFormProps {
    project?: any;
    contacts: any[];
    profiles?: Array<{ id: number; name: string; taxId: string }>;
    activeProfileId?: number;
    onSuccess?: () => void;
}

export function ProjectForm({ project, contacts, profiles = [], activeProfileId, onSuccess }: ProjectFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [selectedContactId, setSelectedContactId] = useState(project?.contactId?.toString() || "");
    const [contactName, setContactName] = useState("");
    const [contactTaxId, setContactTaxId] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [startDate, setStartDate] = useState(project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [isManualCode, setIsManualCode] = useState(false);
    const [code, setCode] = useState(project?.code || "");
    const [unlinkedInvoices, setUnlinkedInvoices] = useState<any[]>([]);
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<number[]>(project?.invoices?.map((i: any) => i.id) || []);
    const [sharedProfileIds, setSharedProfileIds] = useState<number[]>(project?.sharedWith?.map((share: any) => share.profileId) || []);
    const ownerProfileId = project?.profileId || activeProfileId;
    const shareableProfiles = profiles.filter((profile) => profile.id !== ownerProfileId);

    // Auto-generate code
    useEffect(() => {
        if (!project && selectedContactId && startDate && !isManualCode) {
            const contact = contacts.find(c => c.id.toString() === selectedContactId);
            const sourceName = selectedContactId === "new" ? contactName : contact?.name;
            if (sourceName) {
                const initials = sourceName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X');
                const date = new Date(startDate);
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear().toString().substring(2);
                // Added day to make it more unique: INITIALS + DAY + MONTH + YEAR
                setCode(`${initials}${day}${month}${year}`);
            }
        }
    }, [selectedContactId, contactName, startDate, contacts, project, isManualCode]);

    // Fetch unlinked invoices when contact changes
    useEffect(() => {
        if (selectedContactId && selectedContactId !== "new") {
            getUnlinkedInvoicesByContact(parseInt(selectedContactId)).then(invoices => {
                // If editing, include already linked invoices in the list if they aren't there
                const existingInvoices = project?.invoices || [];
                const combined = [...existingInvoices, ...invoices.filter((inv: any) => !existingInvoices.some((ex: any) => ex.id === inv.id))];
                setUnlinkedInvoices(combined);
            });
        } else {
            setUnlinkedInvoices([]);
            setSelectedInvoiceIds([]);
        }
    }, [selectedContactId, project]);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        // Add selected invoice IDs to formData
        formData.delete("invoiceIds");
        selectedInvoiceIds.forEach(id => formData.append("invoiceIds", id.toString()));
        formData.delete("sharedProfileIds");
        sharedProfileIds.forEach(id => formData.append("sharedProfileIds", id.toString()));
        formData.set("code", code); // Ensure auto-generated code is used
        formData.set("startDate", startDate);

        try {
            let result;
            if (project) {
                result = await updateProject(project.id, formData);
            } else {
                result = await createProject(formData);
            }

            if (result.success) {
                if (onSuccess) {
                    onSuccess();
                } else {
                    router.push("/projects");
                    router.refresh();
                }
            } else {
                alert((result as any).error || "Error al guardar el proyecto");
            }
        } catch (error) {
            console.error("Error saving project:", error);
            const message = error instanceof Error ? error.message : "Ocurrio un error inesperado al guardar el proyecto";
            alert(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <form action={handleSubmit} className="space-y-8">
            {/* Detalles del Proyecto */}
            <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <span className="material-icons-outlined text-blue-600">assignment</span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Detalles del Proyecto</h2>
                </div>
                <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                        {/* Código */}
                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Código del Proyecto (Auto)
                            </label>
                            <Input
                                id="code"
                                name="code"
                                value={code}
                                onChange={(e) => {
                                    setIsManualCode(true);
                                    setCode(e.target.value.toUpperCase());
                                }}
                                required
                                className="w-full px-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 font-mono font-bold"
                                placeholder="Ej: CLI0126"
                            />
                        </div>

                        {/* Nombre */}
                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Nombre del Proyecto
                            </label>
                            <Input
                                id="name"
                                name="name"
                                defaultValue={project?.name}
                                required
                                className="w-full px-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                                placeholder="Nombre informativo"
                            />
                        </div>

                        {/* Descripción */}
                        <div className="md:col-span-2 relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Descripción
                            </label>
                            <textarea
                                id="description"
                                name="description"
                                rows={3}
                                defaultValue={project?.description || ""}
                                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all resize-none"
                                placeholder="Descripción breve del proyecto..."
                            ></textarea>
                        </div>

                        {/* Contacto */}
                        <div className="relative group">
                            <input type="hidden" name="contactId" value={selectedContactId} />
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 z-10">
                                Contacto / Cliente
                            </label>
                            <Select
                                value={selectedContactId}
                                onValueChange={setSelectedContactId}
                                required
                            >
                                <SelectTrigger className="w-full px-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none appearance-none transition-all">
                                    <SelectValue placeholder="Seleccionar contacto" />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                    {contacts.map((contact: any) => (
                                        <SelectItem key={contact.id} value={contact.id.toString()}>
                                            {contact.name}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="new" className="font-semibold text-blue-600">
                                        + Nuevo Contacto
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            {selectedContactId === "new" && (
                                <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-900/10">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-blue-700 dark:text-blue-300">Nombre del cliente</Label>
                                        <Input
                                            name="contactName"
                                            value={contactName}
                                            onChange={(event) => setContactName(event.target.value)}
                                            required
                                            placeholder="Empresa o persona"
                                            className="bg-white dark:bg-slate-950"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold text-blue-700 dark:text-blue-300">RNC / Cedula</Label>
                                            <Input
                                                name="contactTaxId"
                                                value={contactTaxId}
                                                onChange={(event) => setContactTaxId(event.target.value)}
                                                placeholder="Opcional"
                                                className="bg-white dark:bg-slate-950"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold text-blue-700 dark:text-blue-300">Telefono</Label>
                                            <Input
                                                name="contactPhone"
                                                value={contactPhone}
                                                onChange={(event) => setContactPhone(event.target.value)}
                                                placeholder="Opcional"
                                                className="bg-white dark:bg-slate-950"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-blue-700 dark:text-blue-300">Email</Label>
                                        <Input
                                            name="contactEmail"
                                            type="email"
                                            value={contactEmail}
                                            onChange={(event) => setContactEmail(event.target.value)}
                                            placeholder="Opcional"
                                            className="bg-white dark:bg-slate-950"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Responsable */}
                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Responsable
                            </label>
                            <Input
                                id="responsible"
                                name="responsible"
                                defaultValue={project?.responsible || ""}
                                className="w-full px-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                                placeholder="Persona a cargo"
                            />
                        </div>

                        {/* Fechas */}
                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Fecha de Inicio
                            </label>
                            <Input
                                id="startDate"
                                name="startDate"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                                className="w-full px-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Fecha Estimada de Fin
                            </label>
                            <Input
                                id="endDate"
                                name="endDate"
                                type="date"
                                defaultValue={project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : ""}
                                className="w-full px-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Estado y Vinculación */}
            <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <span className="material-icons-outlined text-blue-600">settings_suggest</span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado y Vinculación</h2>
                </div>
                <div className="p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30">
                            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600">
                                <span className="material-icons-outlined text-sm">flag</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Estado Actual</p>
                                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {project ? (
                                        <Select name="status" defaultValue={project.status}>
                                            <SelectTrigger className="h-7 border-none bg-transparent p-0 focus:ring-0 text-blue-600">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                <SelectItem value="PROPOSAL">Propuesta</SelectItem>
                                                <SelectItem value="ACTIVE">Activo</SelectItem>
                                                <SelectItem value="ON_HOLD">En Espera</SelectItem>
                                                <SelectItem value="COMPLETED">Completado</SelectItem>
                                                <SelectItem value="CANCELLED">Cancelado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        "NUEVO"
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                            <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                <span className="material-icons-outlined text-sm">link</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Facturas Vinculadas</p>
                                <p className="text-sm font-medium text-slate-500">{selectedInvoiceIds.length} facturas</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                            <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                <span className="material-icons-outlined text-sm">groups</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Compartido</p>
                                <p className="text-sm font-medium text-slate-500">{sharedProfileIds.length} perfiles</p>
                            </div>
                        </div>
                    </div>

                    {shareableProfiles.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <span className="material-icons-outlined text-sm">share</span>
                                    Compartir proyecto con otros perfiles
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    El proyecto seguira perteneciendo a su perfil original, pero podra seleccionarse desde los perfiles marcados.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {shareableProfiles.map((profile) => {
                                    const checked = sharedProfileIds.includes(profile.id);
                                    return (
                                        <label
                                            key={profile.id}
                                            className={`flex items-center gap-3 rounded-xl border p-4 transition-colors cursor-pointer ${checked ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-white hover:bg-slate-50"} dark:border-slate-800 dark:bg-slate-900`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                                                checked={checked}
                                                onChange={(event) => {
                                                    if (event.target.checked) {
                                                        setSharedProfileIds([...sharedProfileIds, profile.id]);
                                                    } else {
                                                        setSharedProfileIds(sharedProfileIds.filter((id) => id !== profile.id));
                                                    }
                                                }}
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{profile.name}</span>
                                                <span className="block text-xs text-slate-500 font-mono">{profile.taxId}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {unlinkedInvoices.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span className="material-icons-outlined text-sm">fact_check</span>
                                Seleccionar Facturas de Ingresos para Vincular
                            </h3>
                            <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden bg-slate-50/10">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                                        <tr>
                                            <th className="px-6 py-3 text-left w-12 text-center"></th>
                                            <th className="px-6 py-3 text-left">Factura</th>
                                            <th className="px-6 py-3 text-left">Fecha</th>
                                            <th className="px-6 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {unlinkedInvoices.map((inv) => (
                                            <tr key={inv.id} className="hover:bg-white dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="h-5 w-5 rounded-md border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-transparent transition-all cursor-pointer"
                                                        checked={selectedInvoiceIds.includes(inv.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedInvoiceIds([...selectedInvoiceIds, inv.id]);
                                                            } else {
                                                                setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== inv.id));
                                                            }
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-6 py-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                                    {inv.number}
                                                </td>
                                                <td className="px-6 py-3 text-slate-500 dark:text-slate-400">
                                                    {new Date(inv.date).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                                                    RD$ {formatCurrency(inv.total)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Presupuesto */}
            <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <span className="material-icons-outlined text-blue-600">payments</span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Presupuesto Estimado</h2>
                </div>
                <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Ingresos Estimados (RD$)
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                <Input
                                    id="budgetIncome"
                                    name="budgetIncome"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    defaultValue={project?.budgetIncome || ""}
                                    className="w-full pl-8 pr-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all font-mono"
                                />
                            </div>
                        </div>
                        <div className="relative group">
                            <label className="absolute left-3 -top-2.5 px-1 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all">
                                Costos Estimados (RD$)
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                <Input
                                    id="budgetCost"
                                    name="budgetCost"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    defaultValue={project?.budgetCost || ""}
                                    className="w-full pl-8 pr-4 py-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="flex items-center justify-end gap-4 pt-6 pb-12">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={loading}
                    className="px-8 py-6 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    disabled={loading}
                    className="px-8 py-6 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50"
                >
                    {loading ? "Guardando..." : project ? "Actualizar Proyecto" : "Crear Proyecto"}
                </Button>
            </footer>
        </form>
    );
}
