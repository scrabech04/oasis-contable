import { getCompanySettings, updateCompanySettings, getCompanyIdentities } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Phone, MapPin, DollarSign, Fingerprint, Settings2, Hash } from "lucide-react";
import Link from "next/link";
import IdentitiesClient from "./IdentitiesClient";
import ProfilesClient from "./ProfilesClient";
import { getAccountProfiles, getActiveProfile } from "@/lib/account-profiles";

export default async function SettingsPage() {
    const [settings, identities, profiles, activeProfile] = await Promise.all([
        getCompanySettings(),
        getCompanyIdentities(),
        getAccountProfiles(),
        getActiveProfile()
    ]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Configuración</h1>
                    <p className="text-slate-500">Administra los datos de tu empresa y preferencias del sistema.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/settings/numbering">
                        <Button variant="outline" className="gap-2">
                            <Hash className="h-4 w-4" /> Numeración (NCF)
                        </Button>
                    </Link>
                </div>
            </header>

            <div className="grid gap-6">
                <ProfilesClient profiles={profiles} />
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-primary">
                            <Building2 className="h-5 w-5" />
                            <CardTitle>Ajustes del Perfil Activo</CardTitle>
                        </div>
                        <CardDescription>Perfil activo: {activeProfile.name}. Esta información aparecerá en tus facturas, reportes y validaciones del perfil seleccionado.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <form action={async (formData) => { "use server"; await updateCompanySettings(formData); }} className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre de la Empresa</Label>
                                    <div className="relative">
                                        <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input id="name" name="name" defaultValue={settings.name} className="pl-10" required />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="taxId">RNC / Cédula</Label>
                                    <div className="relative">
                                        <Fingerprint className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input id="taxId" name="taxId" defaultValue={settings.taxId} className="pl-10" required />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Correo Electrónico</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input id="email" name="email" type="email" defaultValue={settings.email || ""} className="pl-10" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Teléfono</Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input id="phone" name="phone" defaultValue={settings.phone || ""} className="pl-10" />
                                    </div>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="address">Dirección Física</Label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input id="address" name="address" defaultValue={settings.address || ""} className="pl-10" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="currency">Moneda por Defecto</Label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input id="currency" name="currency" defaultValue={settings.currency} className="pl-10" required />
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end pt-4">
                                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                                    <Settings2 className="h-4 w-4" /> Guardar Cambios
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <IdentitiesClient identities={identities} />
            </div>
        </div>
    );
}
