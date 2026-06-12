import { getCompanySettings, updateCompanySettings, getCompanyIdentities } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Phone, MapPin, DollarSign, Fingerprint, Settings2, Hash, Percent } from "lucide-react";
import Link from "next/link";
import IdentitiesClient from "./IdentitiesClient";
import ProfilesClient from "./ProfilesClient";
import { getAccountProfiles, getActiveProfile } from "@/lib/account-profiles";
import { CoverTemplateSettings } from "@/components/settings/CoverTemplateSettings";

export default async function SettingsPage() {
    const [settings, identities, profiles, activeProfile] = await Promise.all([
        getCompanySettings(),
        getCompanyIdentities(),
        getAccountProfiles(),
        getActiveProfile()
    ]);
    const selectedIncomeTaxRegime = settings.incomeTaxRegime === "PERSON_PROGRESSIVE"
        ? "INDIVIDUAL"
        : settings.incomeTaxRegime || (activeProfile.type === "PERSON" ? "INDIVIDUAL" : "LEGAL_ENTITY");

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
                                <div className="space-y-2">
                                    <Label htmlFor="incomeTaxRegime">Regimen ISR para estimaciones</Label>
                                    <select
                                        id="incomeTaxRegime"
                                        name="incomeTaxRegime"
                                        defaultValue={selectedIncomeTaxRegime}
                                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    >
                                        <option value="LEGAL_ENTITY">Persona juridica - 27%</option>
                                        <option value="INDIVIDUAL">Persona fisica - 25%</option>
                                        <option value="CUSTOM">Tasa personalizada</option>
                                    </select>
                                    <p className="text-xs text-slate-500">Se usa en la estimacion fiscal de proyectos, no sustituye la declaracion anual.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="incomeTaxRate">Tasa ISR estimada (%)</Label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="incomeTaxRate"
                                            name="incomeTaxRate"
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.01"
                                            defaultValue={(Number(settings.incomeTaxRate ?? (activeProfile.type === "PERSON" ? 0.25 : 0.27)) * 100).toFixed(2).replace(/\.00$/, "")}
                                            className="pl-10"
                                            required
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500">Para persona fisica usa 25 y para juridica 27. Para personalizada puedes poner la tasa que indique tu contador.</p>
                                </div>
                            </div>
                            <CoverTemplateSettings settings={settings} />
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
