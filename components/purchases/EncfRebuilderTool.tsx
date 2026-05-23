"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, Link2, Loader2, QrCode, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EncfRebuilderToolProps {
  initialBuyerTaxId: string;
}

interface EncfRebuildResponse {
  ok: boolean;
  message: string;
  timbreUrl: string;
  qrDataUrl: string;
  dgiiUrl: string;
  elapsedMs: number;
  extracted: {
    fechaEmision: string;
    montoTotal: string;
    fechaFirma: string;
  };
  validation?: {
    validated: boolean;
    attempted: number;
    horaFirmaUsada: string | null;
    fechaFirma: string;
    message: string;
  };
}

const initialForm = (buyerTaxId: string) => ({
  rncEmisor: "",
  encf: "",
  rncComprador: buyerTaxId,
  codigoSeguridad: "",
  horaFirma: "",
});

export function EncfRebuilderTool({ initialBuyerTaxId }: EncfRebuilderToolProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm(initialBuyerTaxId));
  const [result, setResult] = useState<EncfRebuildResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const canUseInPurchase = useMemo(() => {
    return Boolean(form.encf.trim() && form.rncEmisor.trim() && result?.extracted.fechaEmision);
  }, [form.encf, form.rncEmisor, result]);

  const handleChange =
    (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const response = await fetch("/api/purchases/rebuild-encf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as EncfRebuildResponse;
      if (!response.ok || !data.ok) {
        setError(data.message || "No fue posible reconstruir el timbre.");
        return;
      }

      setResult(data);
    } catch {
      setError("No se pudo comunicar con el servidor para consultar la DGII.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.timbreUrl) return;

    try {
      await navigator.clipboard.writeText(result.timbreUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar el enlace al portapapeles.");
    }
  };

  const handleUseInPurchase = () => {
    if (!result) return;

    sessionStorage.setItem(
      "qr_scanned_data",
      JSON.stringify({
        ncf: form.encf.trim().toUpperCase(),
        supplierTaxId: form.rncEmisor.replace(/\D/g, ""),
        supplierName: "",
        date: result.extracted.fechaEmision,
        total: Number(result.extracted.montoTotal || 0),
        qrUrl: result.timbreUrl,
        scannedAt: Date.now(),
      })
    );

    router.push("/purchases/new?source=qr");
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Reconstruir e-NCF / QR
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Genera de nuevo el enlace oficial y el QR del timbre DGII cuando la factura ya no lo trae visible.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <WandSparkles className="h-5 w-5" />
              <CardTitle>Datos mínimos para consultar DGII</CardTitle>
            </div>
            <CardDescription>
              Con estos cinco datos la herramienta reconstruye el timbre oficial y valida la firma digital.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rncEmisor">RNC Emisor</Label>
                  <Input
                    id="rncEmisor"
                    value={form.rncEmisor}
                    onChange={handleChange("rncEmisor")}
                    placeholder="130463417"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="encf">e-NCF</Label>
                  <Input
                    id="encf"
                    value={form.encf}
                    onChange={handleChange("encf")}
                    placeholder="E310000014390"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rncComprador">RNC / Cédula Comprador</Label>
                  <Input
                    id="rncComprador"
                    value={form.rncComprador}
                    onChange={handleChange("rncComprador")}
                    placeholder="40200448476"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codigoSeguridad">Código de Seguridad</Label>
                  <Input
                    id="codigoSeguridad"
                    value={form.codigoSeguridad}
                    onChange={handleChange("codigoSeguridad")}
                    placeholder="RpmbNr"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="horaFirma">Hora de Firma</Label>
                  <Input
                    id="horaFirma"
                    value={form.horaFirma}
                    onChange={handleChange("horaFirma")}
                    placeholder="19:00:45"
                    autoComplete="off"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Si la sabes, ponla completa. Si no, deja solo los demás datos y el sistema intentará reconstruir el enlace con la fecha de firma encontrada.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">Tip práctico</p>
                <p className="mt-1">
                  Si tu empresa ya tiene el RNC configurado en Ajustes, aquí se autocompleta el campo del comprador para ahorrarte tiempo.
                </p>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isLoading} className="h-11 rounded-xl px-6">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Consultando DGII...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Reconstruir enlace y QR
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl px-6"
                  onClick={() => {
                    setForm(initialForm(initialBuyerTaxId));
                    setResult(null);
                    setError(null);
                    setCopied(false);
                  }}
                >
                  Limpiar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
              <QrCode className="h-5 w-5" />
              <CardTitle>Resultado</CardTitle>
            </div>
            <CardDescription>
              Aquí verás los datos extraídos, el enlace oficial y el QR listo para usar.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {!result ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
                <QrCode className="h-10 w-10 text-slate-300 dark:text-slate-700" />
                <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                  Aún no hay enlace reconstruido
                </h3>
                <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                  Completa los datos de la factura y deja que la herramienta consulte la DGII para reconstruir el timbre oficial.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <p className="font-semibold">{result.message}</p>
                  {result.validation?.message ? <p className="mt-1">{result.validation.message}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Fecha de Emisión</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{result.extracted.fechaEmision}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Monto Total</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">RD${result.extracted.montoTotal}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Fecha Firma</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{result.validation?.horaFirmaUsada ? result.validation.fechaFirma : result.extracted.fechaFirma}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Validación</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      {result.validation?.validated ? "Validado" : "Generado sin validación completa"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Intentos: {result.validation?.attempted ?? 0} | Tiempo: {(result.elapsedMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Enlace oficial DGII</p>
                  <a
                    href={result.timbreUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-sm font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
                  >
                    {result.timbreUrl}
                  </a>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={handleCopy} variant="outline" className="h-11 rounded-xl px-5">
                    <Copy className="h-4 w-4 mr-2" />
                    {copied ? "Copiado" : "Copiar enlace"}
                  </Button>
                  <a href={result.timbreUrl} target="_blank" rel="noreferrer">
                    <Button type="button" variant="outline" className="h-11 rounded-xl px-5">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir en DGII
                    </Button>
                  </a>
                  {canUseInPurchase ? (
                    <Button type="button" onClick={handleUseInPurchase} className="h-11 rounded-xl px-5">
                      Usar en nueva compra
                    </Button>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">QR reconstruido</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Puedes escanearlo o abrir directamente el enlace oficial.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40">
                    <img src={result.qrDataUrl} alt="QR del timbre DGII reconstruido" className="h-72 w-72 max-w-full rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
