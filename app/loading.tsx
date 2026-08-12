import { Loader2 } from "lucide-react";

/**
 * Pantalla de espera de la navegacion. Next la muestra sola mientras el servidor arma la
 * ruta, asi que un cambio de pantalla lento deja de parecer que no paso nada.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center animate-in fade-in duration-300"
    >
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">Cargando</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Preparando la pantalla...</p>
      </div>
    </div>
  );
}
