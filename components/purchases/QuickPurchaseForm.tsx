"use client";

import { useState, useEffect } from "react";
import { createPurchase, updatePurchase } from "@/app/actions";
import { useRouter } from "next/navigation";
import { ShoppingBag, Calculator, Calendar, Tag, FileText } from "lucide-react";

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

interface QuickPurchaseFormProps {
    projects?: { id: number; name: string }[];
    initialData?: any;
}

export function QuickPurchaseForm({ projects = [], initialData }: QuickPurchaseFormProps) {
    const router = useRouter();
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState("General");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [projectId, setProjectId] = useState<string>("");
    const [projectName, setProjectName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (initialData) {
            const noteParts = (initialData.notes || "").split(": ");
            const desc = noteParts.length > 1 ? noteParts.slice(1).join(": ") : initialData.notes;

            setDescription(desc || "");
            setAmount(initialData.total.toString());
            const cat = noteParts.length > 1 ? noteParts[0] : "General";
            setCategory(cat);
            setDate(new Date(initialData.date).toISOString().split('T')[0]);
            setProjectId(initialData.projectId?.toString() || "");
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const formData = new FormData();
        formData.append("type", "INFORMAL");
        formData.append("taxTreatment", "LOCAL_NO_CREDIT");
        formData.append("description", description);
        formData.append("amount", amount);
        formData.append("category", category);
        formData.append("date", date);
        formData.append("projectId", projectId);
        if (projectId === "new") {
            formData.append("projectName", projectName);
        }
        formData.append("notes", "");

        try {
            let result;
            if (initialData) {
                result = await updatePurchase(initialData.id, formData);
            } else {
                result = await createPurchase(formData);
            }

            if (result.success) {
                router.push("/purchases");
            }
        } catch (error) {
            console.error(error);
            alert("Error al guardar el gasto");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto pb-8">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    {initialData ? "Editar Gasto" : "Gasto Rápido"}
                </h1>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancelar
                    </Button>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={submitting}>
                        {submitting ? "Guardando..." : initialData ? "Actualizar" : "Registrar Gasto"}
                    </Button>
                </div>
            </div>

            <Card className="shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase text-slate-500">
                        <ShoppingBag className="h-4 w-4" />
                        Información del Gasto
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="description" className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Descripción
                        </Label>
                        <Input
                            id="description"
                            required
                            placeholder="Ej: Pago de internet, Almuerzo cliente..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="h-11"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="amount" className="flex items-center gap-1">
                                <Calculator className="h-3 w-3" /> Monto
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">RD$</span>
                                <Input
                                    id="amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    placeholder="0.00"
                                    className="pl-12 h-11 text-lg font-semibold"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date" className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> Fecha
                            </Label>
                            <Input
                                id="date"
                                type="date"
                                required
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="h-11"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="category" className="flex items-center gap-1">
                            <Tag className="h-3 w-3" /> Categoría
                        </Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger id="category" className="h-11">
                                <SelectValue placeholder="Seleccionar categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="General">General</SelectItem>
                                <SelectItem value="Servicios">Servicios (Luz, Agua, Internet)</SelectItem>
                                <SelectItem value="Arriendo">Arriendo</SelectItem>
                                <SelectItem value="Nómina">Nómina</SelectItem>
                                <SelectItem value="Suministros">Suministros</SelectItem>
                                <SelectItem value="Marketing">Marketing</SelectItem>
                                <SelectItem value="Otros">Otros</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="projectId" className="flex items-center gap-1 text-slate-500">
                            Proyecto Relacionado (Opcional)
                        </Label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger id="projectId" className="h-11">
                                <SelectValue placeholder="Sin Proyecto" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin Proyecto</SelectItem>
                                {projects.map((project) => (
                                    <SelectItem key={project.id} value={project.id.toString()}>
                                        {project.name}
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
                </CardContent>
            </Card>

            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-700">
                <Calculator className="h-5 w-5 mt-0.5 shrink-0" />
                <p>
                    Utilice este formulario para registrar gastos rápidos que no requieren comprobante fiscal formal.
                    Para gastos con NCF, utilice el formulario de <strong>Compra Formal</strong>.
                </p>
            </div>
        </form>
    );
}
