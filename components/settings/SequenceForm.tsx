"use client";

import { useState } from "react";
import { createNumberingSequence, updateNumberingSequence } from "@/app/actions";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SequenceForm({ initialData, onClose }: { initialData?: any, onClose: () => void }) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [isPreferred, setIsPreferred] = useState(initialData?.isPreferred || false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        const formData = new FormData(e.currentTarget);
        formData.append("isPreferred", isPreferred.toString());

        try {
            if (initialData) {
                await updateNumberingSequence(initialData.id, formData);
            } else {
                await createNumberingSequence(formData);
            }
            onClose();
            router.refresh();
        } catch (error) {
            console.error(error);
            alert("Error al guardar la secuencia");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 w-full max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {initialData ? "Editar numeración" : "Nueva numeración"}
                </h2>
                <div className="flex items-center gap-2">
                    <Label htmlFor="preferred" className="text-sm font-medium">Preferida</Label>
                    <Switch
                        id="preferred"
                        checked={isPreferred}
                        onCheckedChange={setIsPreferred}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Tipo de documento *</Label>
                    <select
                        name="docType"
                        required
                        defaultValue={initialData?.docType || "INVOICE"}
                        className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="INVOICE">Factura de venta</option>
                        <option value="QUOTATION">Cotización</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <select
                        name="type"
                        required
                        defaultValue={initialData?.type || "01"}
                        className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="01">B01 - Crédito fiscal</option>
                        <option value="02">B02 - Consumo</option>
                        <option value="14">B14 - Régimen especial</option>
                        <option value="15">B15 - Gubernamentales</option>
                        <option value="16">B16 - Exportaciones</option>
                        <option value="CUSTOM">Personalizado</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <Input name="name" required placeholder="Ej: Crédito fiscal (01)" defaultValue={initialData?.name} />
                </div>
                <div className="space-y-2">
                    <Label>Prefijo *</Label>
                    <Input name="prefix" required placeholder="Ej: B01" defaultValue={initialData?.prefix} />
                </div>

                <div className="space-y-2">
                    <Label>Número inicial *</Label>
                    <Input name="initialNumber" type="number" required defaultValue={initialData?.initialNumber || 1} />
                </div>
                <div className="space-y-2">
                    <Label>Número final</Label>
                    <Input name="finalNumber" type="number" defaultValue={initialData?.finalNumber} placeholder="Opcional" />
                </div>

                {initialData && (
                    <div className="space-y-2">
                        <Label>Siguiente número *</Label>
                        <Input name="nextNumber" type="number" required defaultValue={initialData?.nextNumber} />
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Fecha de vencimiento</Label>
                    <Input name="expiryDate" type="date" defaultValue={initialData?.expiryDate ? new Date(initialData.expiryDate).toISOString().split('T')[0] : ""} />
                </div>

                <div className="space-y-2">
                    <Label>Sucursal</Label>
                    <Input name="branch" defaultValue={initialData?.branch || "Principal"} />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Pie de factura</Label>
                <textarea
                    name="footerText"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md h-24 focus:ring-2 focus:ring-blue-500"
                    placeholder="Texto que aparecerá al final del documento..."
                    defaultValue={initialData?.footerText}
                />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                    Cancelar
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={submitting}>
                    {submitting ? "Guardando..." : "Guardar"}
                </Button>
            </div>
        </form>
    );
}
