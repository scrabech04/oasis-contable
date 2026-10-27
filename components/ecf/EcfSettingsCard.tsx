"use client";

/**
 * Configuracion de facturacion electronica del perfil activo: ambiente de la DGII, datos
 * del emisor que pide el e-CF, certificado digital y las URL que se registran en la DGII.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileKey2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { saveEcfSettings, uploadEcfCertificate, type getEcfSettings } from "@/app/ecf-actions";

type Settings = Awaited<ReturnType<typeof getEcfSettings>>;

const selectClass =
  "w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-blue-500";

export function EcfSettingsCard({ settings }: { settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const urls = settings.urls.find((u) => u.environment === (settings.environment || "CerteCF")) ?? settings.urls[1];

  const save = async (formData: FormData) => {
    setSaving(true);
    const result = await saveEcfSettings(formData);
    setSaving(false);
    if (result.success) {
      toast.success("Facturacion electronica actualizada");
      router.refresh();
    } else toast.error("No se pudo guardar", result.error);
  };

  const upload = async (formData: FormData) => {
    setUploading(true);
    const result = await uploadEcfCertificate(formData);
    setUploading(false);
    if (result.success) {
      toast.success("Certificado cargado", result.subject);
      router.refresh();
    } else toast.error("No se pudo cargar el certificado", result.error);
  };

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value);
    toast.info("Copiado");
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-primary">
          <FileKey2 className="h-5 w-5" />
          <CardTitle>Facturación electrónica (e-CF)</CardTitle>
        </div>
        <CardDescription>
          Perfil {settings.profileName} · RNC {settings.taxId}. Cada RNC se certifica por separado ante la DGII.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-8">
        <form action={save} className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Ambiente de la DGII</Label>
            <select name="environment" defaultValue={settings.environment || ""} className={selectClass}>
              <option value="">Desactivada</option>
              <option value="TesteCF">Pruebas libres (TesteCF)</option>
              <option value="CerteCF">Certificación (CerteCF)</option>
              <option value="eCF">Producción (eCF)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Nombre comercial (opcional)</Label>
            <Input name="commercialName" defaultValue={settings.commercialName || ""} placeholder="Ej: Oasis Gate" />
          </div>
          <div className="space-y-2">
            <Label>Código de provincia (opcional, 6 dígitos)</Label>
            <Input name="province" defaultValue={settings.province || ""} placeholder="Ej: 010000" inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <Label>Código de municipio (opcional, 6 dígitos)</Label>
            <Input name="municipality" defaultValue={settings.municipality || ""} placeholder="Ej: 010100" inputMode="numeric" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Certificado digital</h3>
          {settings.certificate ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {settings.certificate.subject}
              <br />
              Válido hasta {formatDate(settings.certificate.validTo)}
              {settings.certificate.serialNumber ? ` · Titular ${settings.certificate.serialNumber}` : ""}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Todavía no hay certificado cargado.</p>
          )}
          {!settings.keyConfigured ? (
            <p className="text-sm text-amber-700">
              Falta configurar la variable ECF_CERT_KEY en el servidor; sin ella no se puede guardar el certificado.
            </p>
          ) : null}
          <form action={upload} className="grid md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>Archivo .p12 / .pfx</Label>
              <Input name="certificate" type="file" accept=".p12,.pfx" required />
            </div>
            <div className="space-y-2">
              <Label>Contraseña del certificado</Label>
              <Input name="password" type="password" required autoComplete="off" />
            </div>
            <Button type="submit" disabled={uploading || !settings.keyConfigured}>
              {uploading ? "Validando..." : settings.certificate ? "Reemplazar certificado" : "Cargar certificado"}
            </Button>
          </form>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">URLs para registrar en la DGII ({urls.environment})</h3>
          <p className="text-xs text-slate-500">
            Se piden en la postulación del portal de certificación y, ya en producción, en la Oficina Virtual
            (Facturación Electrónica &gt; Mantenimiento Directorio FE). La DGII y los demás emisores le agregan
            la ruta estándar (/fe/recepcion/api/ecf, /fe/aprobacioncomercial/api/ecf, /fe/autenticacion/...), así
            que en los tres campos va la misma dirección base.
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-48 shrink-0 font-medium text-slate-700 dark:text-slate-200">Dirección a registrar</span>
            <code className="flex-1 truncate rounded bg-slate-100 dark:bg-slate-800 px-2 py-1">{urls.base}</code>
            <Button type="button" variant="ghost" size="icon" onClick={() => copy(urls.base)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {[
            ["Recepción", urls.recepcion],
            ["Aprobación comercial", urls.aprobacion],
            ["Autenticación (opcional)", urls.autenticacion],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-48 shrink-0 text-slate-500">{label}</span>
              <code className="flex-1 truncate rounded bg-slate-50 dark:bg-slate-900 px-2 py-1 text-slate-500">{value}</code>
              <Button type="button" variant="ghost" size="icon" onClick={() => copy(value)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
