"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { movePurchaseToProfile, setActiveProfile } from "@/app/actions";
import { Button } from "@/components/ui/button";

interface MovePurchaseProfileProps {
  purchaseId: number;
  currentProfileName: string;
  hasProject: boolean;
  /** Perfiles a los que se puede mover, sin el actual. */
  profiles: Array<{ id: number; name: string }>;
}

export function MovePurchaseProfile({
  purchaseId,
  currentProfileName,
  hasProject,
  profiles,
}: MovePurchaseProfileProps) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(String(profiles[0]?.id ?? ""));
  const [isMoving, setIsMoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (profiles.length === 0) return null;

  const target = profiles.find((profile) => String(profile.id) === targetId);

  const move = async () => {
    if (!target || isMoving) return;

    const warning = hasProject
      ? " La compra se desvinculará de su proyecto, porque el proyecto pertenece a este perfil."
      : "";
    if (!confirm(`Esta compra pasará de ${currentProfileName} a ${target.name}.${warning} ¿Continuar?`)) {
      return;
    }

    setIsMoving(true);
    setMessage(null);

    try {
      const result = await movePurchaseToProfile(purchaseId, target.id);
      if (!result.success) {
        setMessage(result.error);
        setIsMoving(false);
        return;
      }

      // La compra ya no vive en el perfil activo: se cambia para no dejar al usuario
      // mirando una pagina que su perfil actual ya no puede ver.
      await setActiveProfile(target.id);
      router.refresh();
      setMessage(`Movida a ${target.name}.`);
    } catch {
      setMessage("No fue posible mover la compra.");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Perfil</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-white">
          {currentProfileName}
        </p>
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          disabled={isMoving}
          className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={String(profile.id)}>
              {profile.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMoving || !target}
          onClick={move}
          className="h-9 gap-1.5 rounded-lg text-[11px] font-black"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {isMoving ? "Moviendo..." : "Mover"}
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        Para cuando la compra se registró en el perfil equivocado. El proveedor se reusa o se
        copia en el perfil destino, y los pagos y adjuntos se van con ella.
      </p>

      {message && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-[11px] font-bold ${message.startsWith("Movida") ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
