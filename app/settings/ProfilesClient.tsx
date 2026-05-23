"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccountProfile, deleteAccountProfile, updateAccountProfile } from "@/app/actions";
import { primaryActionClass } from "@/lib/ui-styles";

export default function ProfilesClient({ profiles }: { profiles: any[] }) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [editIsDefault, setEditIsDefault] = useState(false);

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Building2 className="h-5 w-5" />
            <CardTitle>Perfiles Contables</CardTitle>
          </div>
          <CardDescription>
            Cada perfil mantiene su propia contabilidad, RNC, reportes y documentos.
          </CardDescription>
        </div>
        {!isCreating ? (
          <Button onClick={() => { setIsCreating(true); setNewIsDefault(false); }} size="sm" className={primaryActionClass}>
            <Plus className="h-4 w-4" /> Nuevo perfil
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {isCreating ? (
          <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/50 p-4">
            <h4 className="font-bold mb-4">Nuevo perfil</h4>
            <form
              action={async (fd) => {
                await createAccountProfile(fd);
                setIsCreating(false);
                setNewIsDefault(false);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="isDefault" value={newIsDefault ? "true" : "false"} />
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input name="name" required placeholder="Ej: Samuel Calderón" />
                </div>
                <div className="space-y-2">
                  <Label>RNC / Cédula</Label>
                  <Input name="taxId" required placeholder="40200448476" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select name="type" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="PERSON">Persona física</option>
                    <option value="BUSINESS">Empresa</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Correo</Label>
                  <Input name="email" type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input name="phone" />
                </div>
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input name="logoUrl" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Dirección</Label>
                  <Input name="address" />
                </div>
                <label className="md:col-span-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newIsDefault}
                    onChange={(event) => setNewIsDefault(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Usar como perfil predeterminado
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancelar</Button>
                <Button type="submit">Guardar perfil</Button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="grid gap-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
              {editingId === profile.id ? (
                <form
                  action={async (fd) => {
                    await updateAccountProfile(profile.id, fd);
                    setEditingId(null);
                  }}
                  className="space-y-4"
                >
                  <input type="hidden" name="isDefault" value={editIsDefault ? "true" : "false"} />
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nombre</Label>
                      <Input name="name" defaultValue={profile.name} required />
                    </div>
                    <div className="space-y-2">
                      <Label>RNC / Cédula</Label>
                      <Input name="taxId" defaultValue={profile.taxId} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <select name="type" defaultValue={profile.type} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="PERSON">Persona física</option>
                        <option value="BUSINESS">Empresa</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Correo</Label>
                      <Input name="email" defaultValue={profile.email || ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>Teléfono</Label>
                      <Input name="phone" defaultValue={profile.phone || ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>Logo URL</Label>
                      <Input name="logoUrl" defaultValue={profile.logoUrl || ""} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Dirección</Label>
                      <Input name="address" defaultValue={profile.address || ""} />
                    </div>
                    <label className="md:col-span-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editIsDefault}
                        onChange={(event) => setEditIsDefault(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Usar como perfil predeterminado
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    <Button type="submit">Guardar cambios</Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-lg font-bold">{profile.name}</h4>
                      {profile.isDefault ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Predeterminado
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-500">RNC: {profile.taxId}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {profile.type === "PERSON" ? "Persona física" : "Empresa"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setEditingId(profile.id);
                        setEditIsDefault(profile.isDefault);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <form action={async () => { await deleteAccountProfile(profile.id); }}>
                      <Button type="submit" variant="destructive" size="sm" className="gap-2">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
