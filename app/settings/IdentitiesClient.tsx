"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Pencil, Trash2, ShieldCheck, Mail, Phone } from "lucide-react";
import { createCompanyIdentity, updateCompanyIdentity, deleteCompanyIdentity } from "@/app/actions";
import { primaryActionClass } from "@/lib/ui-styles";

export default function IdentitiesClient({ identities }: { identities: any[] }) {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newIsDefault, setNewIsDefault] = useState(false);
    const [editIsDefault, setEditIsDefault] = useState(false);

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mt-8">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-primary mb-1">
                        <Building2 className="h-5 w-5" />
                        <CardTitle>Identidades Comerciales (Logos y Marcas)</CardTitle>
                    </div>
                    <CardDescription>Crea múltiples perfiles de empresa para elegir al imprimir cotizaciones o facturas.</CardDescription>
                </div>
                {!isCreating && (
                    <Button onClick={() => { setIsCreating(true); setNewIsDefault(false); }} size="sm" className={primaryActionClass}>
                        <Plus className="h-4 w-4" /> Nueva
                    </Button>
                )}
            </CardHeader>
            <CardContent className="p-6">
                <div className="space-y-6">
                    {isCreating && (
                        <div className="p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50 mb-6">
                            <h4 className="font-bold mb-4">Nueva Identidad</h4>
                            <form action={async (fd) => {
                                await createCompanyIdentity(fd);
                                setIsCreating(false);
                                setNewIsDefault(false);
                            }} className="space-y-4">
                                <input type="hidden" name="isDefault" value={newIsDefault ? "true" : "false"} />
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Nombre de la Empresa</Label>
                                        <Input name="name" required placeholder="Ej: Tech Solutions SRL" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>RNC / Cédula</Label>
                                        <Input name="taxId" required placeholder="131-XXXXX-X" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Correo Electrónico</Label>
                                        <Input name="email" type="email" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Teléfono</Label>
                                        <Input name="phone" />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label>Dirección</Label>
                                        <Input name="address" />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label>URL del Logo (Opcional)</Label>
                                        <Input name="logoUrl" placeholder="https://ejemplo.com/logo.png" />
                                    </div>
                                    <div className="flex items-center space-x-2 md:col-span-2 mt-2">
                                        <input
                                            type="checkbox"
                                            id="is-default-new"
                                            checked={newIsDefault}
                                            onChange={(e) => setNewIsDefault(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300"
                                        />
                                        <Label htmlFor="is-default-new">Usar como identidad predeterminada</Label>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-4">
                                    <Button type="button" variant="ghost" onClick={() => { setIsCreating(false); setNewIsDefault(false); }}>Cancelar</Button>
                                    <Button type="submit">Guardar Identidad</Button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="grid gap-4">
                        {identities.map((identity) => (
                            <div key={identity.id} className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950">
                                {editingId === identity.id ? (
                                    <form action={async (fd) => {
                                        await updateCompanyIdentity(identity.id, fd);
                                        setEditingId(null);
                                    }} className="space-y-4">
                                        <input type="hidden" name="isDefault" value={editIsDefault ? "true" : "false"} />
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Nombre de la Empresa</Label>
                                                <Input name="name" defaultValue={identity.name} required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>RNC / Cédula</Label>
                                                <Input name="taxId" defaultValue={identity.taxId} required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Correo</Label>
                                                <Input name="email" defaultValue={identity.email || ""} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Teléfono</Label>
                                                <Input name="phone" defaultValue={identity.phone || ""} />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Dirección</Label>
                                                <Input name="address" defaultValue={identity.address || ""} />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label>URL del Logo (Opcional)</Label>
                                                <Input name="logoUrl" defaultValue={identity.logoUrl || ""} placeholder="https://ejemplo.com/logo.png" />
                                            </div>
                                            <div className="flex items-center space-x-2 md:col-span-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    id={`is-default-${identity.id}`}
                                                    checked={editIsDefault}
                                                    onChange={(e) => setEditIsDefault(e.target.checked)}
                                                    className="h-4 w-4 rounded border-slate-300"
                                                />
                                                <Label htmlFor={`is-default-${identity.id}`}>Usar como identidad predeterminada</Label>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-4">
                                            <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                                            <Button type="submit">Guardar Cambios</Button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-lg">{identity.name}</h4>
                                                {identity.isDefault && (
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium flex items-center gap-1">
                                                        <ShieldCheck className="h-3 w-3" /> Predeterminada
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 mb-2">RNC: {identity.taxId}</p>
                                            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                                                {identity.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {identity.email}</span>}
                                                {identity.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {identity.phone}</span>}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => { setEditingId(identity.id); setEditIsDefault(identity.isDefault); }} className="gap-2">
                                                <Pencil className="h-4 w-4" /> Editar
                                            </Button>
                                            <form action={async () => { await deleteCompanyIdentity(identity.id); }}>
                                                <Button type="submit" variant="destructive" size="sm" className="gap-2">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </form>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {identities.length === 0 && !isCreating && (
                            <div className="text-center py-8 text-slate-500">
                                No tienes identidades comerciales registradas. Haz clic en &quot;Nueva&quot; para crear la primera.
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
