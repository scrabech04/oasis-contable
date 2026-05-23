"use client";

import { useState } from "react";
import { Plus, Trash2, User, Phone, Mail, Globe, MapPin, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { createContact, updateContact } from "@/app/actions";
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

interface ContactFormProps {
    initialData?: any;
}

export function ContactForm({ initialData }: ContactFormProps) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const [name, setName] = useState(initialData?.name || "");
    const [taxId, setTaxId] = useState(initialData?.taxId || "");
    const [type, setType] = useState(initialData?.type || "CLIENT");
    const [address, setAddress] = useState(initialData?.address || "");
    const [city, setCity] = useState(initialData?.city || "");
    const [country, setCountry] = useState(initialData?.country || "Republica Dominicana");
    const [phone, setPhone] = useState(initialData?.phone || "");
    const [email, setEmail] = useState(initialData?.email || "");
    const [website, setWebsite] = useState(initialData?.website || "");
    const [notes, setNotes] = useState(initialData?.notes || "");
    const [preferredNCF, setPreferredNCF] = useState(initialData?.preferredNCF || "");

    const [persons, setPersons] = useState(initialData?.contactPersons || [
        { name: "", position: "", email: "", phone: "", isMain: true }
    ]);

    const addPerson = () => {
        setPersons([...persons, { name: "", position: "", email: "", phone: "", isMain: false }]);
    };

    const removePerson = (index: number) => {
        const newPersons = persons.filter((_: any, i: number) => i !== index);
        if (persons[index].isMain && newPersons.length > 0) {
            newPersons[0].isMain = true;
        }
        setPersons(newPersons);
    };

    const updatePerson = (index: number, field: string, value: any) => {
        const newPersons = [...persons];
        newPersons[index][field] = value;
        if (field === 'isMain' && value === true) {
            newPersons.forEach((p, i) => {
                if (i !== index) p.isMain = false;
            });
        }
        setPersons(newPersons);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const formData = new FormData();
        formData.append("name", name);
        formData.append("taxId", taxId);
        formData.append("type", type);
        formData.append("address", address);
        formData.append("city", city);
        formData.append("country", country);
        formData.append("phone", phone);
        formData.append("email", email);
        formData.append("website", website);
        formData.append("notes", notes);
        formData.append("preferredNCF", preferredNCF);
        formData.append("contactPersons", JSON.stringify(persons));

        const result = initialData
            ? await updateContact(initialData.id, formData)
            : await createContact(formData);

        if (result.success) {
            router.push("/contacts");
            router.refresh();
        } else {
            alert(result.error || "Ocurrió un error al guardar el contacto");
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                        {initialData ? "Editar Contacto" : "Nuevo Contacto"}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Información general y personas de enlace.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        className="rounded-xl h-11 px-6"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={submitting}
                        className="rounded-xl h-11 px-8 shadow-lg shadow-primary/20"
                    >
                        {submitting ? "Guardando..." : "Guardar Contacto"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Info */}
                <div className="lg:col-span-2 space-y-8">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                Datos Generales
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 space-y-2">
                                    <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                        Nombre Completo o Razón Social *
                                    </Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ej: Antigravity Solutions S.R.L."
                                        className="h-12 text-lg font-bold rounded-xl"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="taxId" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                        RNC / Cédula
                                    </Label>
                                    <Input
                                        id="taxId"
                                        value={taxId}
                                        onChange={(e) => setTaxId(e.target.value)}
                                        placeholder="131-XXXXX-X"
                                        className="h-12 font-mono rounded-xl bg-slate-50 dark:bg-slate-800/50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                        Tipo de Contacto
                                    </Label>
                                    <Select value={type} onValueChange={setType}>
                                        <SelectTrigger className="h-12 rounded-xl">
                                            <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CLIENT">Cliente</SelectItem>
                                            <SelectItem value="SUPPLIER">Proveedor</SelectItem>
                                            <SelectItem value="BOTH">Ambos</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                Personas de Contacto
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            {persons.map((person: any, index: number) => (
                                <div key={index} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">Persona #{index + 1}</h4>
                                            {person.isMain && (
                                                <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">Principal</span>
                                            )}
                                        </div>
                                        {persons.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removePerson(index)}
                                                className="text-slate-400 hover:text-red-500"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Nombre</Label>
                                            <Input
                                                value={person.name}
                                                onChange={(e) => updatePerson(index, 'name', e.target.value)}
                                                className="h-10 rounded-lg text-sm"
                                                placeholder="Nombre de la persona"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Cargo/Posición</Label>
                                            <Input
                                                value={person.position}
                                                onChange={(e) => updatePerson(index, 'position', e.target.value)}
                                                className="h-10 rounded-lg text-sm"
                                                placeholder="Ej: Gerente de Compras"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Email</Label>
                                            <Input
                                                value={person.email}
                                                onChange={(e) => updatePerson(index, 'email', e.target.value)}
                                                className="h-10 rounded-lg text-sm px-3"
                                                placeholder="email@servidor.com"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase text-slate-400">Teléfono</Label>
                                            <Input
                                                value={person.phone}
                                                onChange={(e) => updatePerson(index, 'phone', e.target.value)}
                                                className="h-10 rounded-lg text-sm"
                                                placeholder="(809) 000-0000"
                                            />
                                        </div>
                                    </div>
                                    {!person.isMain && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="text-xs font-bold text-primary hover:bg-primary/5 p-0 h-auto"
                                            onClick={() => updatePerson(index, 'isMain', true)}
                                        >
                                            Establecer como contacto principal
                                        </Button>
                                    )}
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={addPerson}
                                className="w-full h-11 border-dashed border-2 text-slate-400 hover:text-primary hover:border-primary transition-all rounded-xl"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Agregar otra persona de contacto
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Secondary Info */}
                <div className="space-y-8">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-primary" />
                                Ubicación y Contacto
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Teléfono General
                                </Label>
                                <Input
                                    id="phone"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="(809) 000-0000"
                                    className="h-11 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Email General
                                </Label>
                                <Input
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="contacto@empresa.com"
                                    className="h-11 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Dirección
                                </Label>
                                <textarea
                                    id="address"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Calle, Edificio, Sector..."
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="city" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                        Ciudad
                                    </Label>
                                    <Input
                                        id="city"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        placeholder="Santo Domingo"
                                        className="h-11 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="country" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                        País
                                    </Label>
                                    <Input
                                        id="country"
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value)}
                                        className="h-11 rounded-xl"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5 text-primary" />
                                Configuración Fiscal
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="preferredNCF" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Tipo de NCF Sugerido
                                </Label>
                                <Select value={preferredNCF} onValueChange={setPreferredNCF}>
                                    <SelectTrigger className="h-11 rounded-xl">
                                        <SelectValue placeholder="No predefinido" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="01">01 - Crédito Fiscal</SelectItem>
                                        <SelectItem value="02">02 - Consumo</SelectItem>
                                        <SelectItem value="11">11 - Proveedor Informal</SelectItem>
                                        <SelectItem value="14">14 - Regímenes Especiales</SelectItem>
                                        <SelectItem value="15">15 - Gubernamental</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Notas Internas
                                </Label>
                                <textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Detalles adicionales sobre este contacto..."
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
