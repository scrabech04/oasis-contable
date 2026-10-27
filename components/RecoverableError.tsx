"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const RELOAD_KEY = "oflow:error-reload-at";
// Si la pagina vuelve a fallar dentro de esta ventana despues de recargarse sola, el problema
// no es pasajero y se le muestra el boton en vez de recargar en bucle.
const RELOAD_WINDOW_MS = 15_000;

/**
 * Al abrir la PWA despues de un rato el servidor arranca en frio y, si hubo un despliegue en
 * medio, el telefono puede pedir trozos de JS que ya no existen. Antes eso dejaba la pantalla
 * en blanco con "Application error" y se arreglaba recargando a mano; ahora se recarga sola
 * una vez y solo si vuelve a fallar se muestra el aviso.
 */
export function RecoverableError({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  // Se decide al montar: recargar si no se acaba de hacer, o mostrar el aviso si ya se hizo.
  const [showMessage] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) <= RELOAD_WINDOW_MS;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    console.error(error);
    if (showMessage) return;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {}
    window.location.reload();
  }, [error, showMessage]);

  if (!showMessage) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div>
        <p className="text-base font-bold text-slate-900 dark:text-white">No se pudo cargar la pantalla</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revisa la conexion y vuelve a intentarlo.</p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (reset) reset();
          else window.location.reload();
        }}
        className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
      >
        <RefreshCw className="h-4 w-4" />
        Reintentar
      </button>
    </div>
  );
}
