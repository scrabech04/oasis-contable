"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info" | "loading";

type Toast = {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
};

type ToastInput = { title: string; description?: string };

export type ToastApi = {
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  /** Aviso sin auto-cierre, para una tarea en curso. Se remata con update() o dismiss(). */
  loading: (title: string, description?: string) => number;
  update: (id: number, variant: ToastVariant, title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

// Cuanto se queda cada aviso en pantalla. El error dura mas porque suele traer algo que
// leer, y el de carga no se va solo: lo cierra quien lanzo la tarea.
const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  error: 8000,
  loading: 0,
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);

  // Sin proveedor no se rompe la pantalla: el aviso se pierde y queda constancia en
  // consola. Pasa solo si un arbol se monta fuera del layout.
  return (
    api || {
      success: () => 0,
      error: (title) => {
        console.error("[toast]", title);
        return 0;
      },
      info: () => 0,
      loading: () => 0,
      update: () => {},
      dismiss: () => {},
    }
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, variant: ToastVariant) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);

      const delay = AUTO_DISMISS_MS[variant];
      if (!delay) {
        timers.current.delete(id);
        return;
      }

      timers.current.set(
        id,
        setTimeout(() => dismiss(id), delay),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (variant: ToastVariant, { title, description }: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, variant, title, description }]);
      schedule(id, variant);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, variant: ToastVariant, title: string, description?: string) => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, variant, title, description } : toast)),
      );
      schedule(id, variant);
    },
    [schedule],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push("success", { title, description }),
      error: (title, description) => push("error", { title, description }),
      info: (title, description) => push("info", { title, description }),
      loading: (title, description) => push("loading", { title, description }),
      update,
      dismiss,
    }),
    [push, update, dismiss],
  );

  const timersRef = timers;
  useEffect(() => {
    const pending = timersRef.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, [timersRef]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const variantStyles: Record<ToastVariant, { box: string; icon: string }> = {
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/80 dark:text-emerald-100",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/80 dark:text-red-100",
    icon: "text-red-600 dark:text-red-400",
  },
  info: {
    box: "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
    icon: "text-blue-600 dark:text-blue-400",
  },
  loading: {
    box: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/80 dark:text-blue-100",
    icon: "text-blue-600 dark:text-blue-400",
  },
};

function ToastIcon({ variant, className }: { variant: ToastVariant; className: string }) {
  if (variant === "success") return <CheckCircle2 className={className} />;
  if (variant === "error") return <AlertCircle className={className} />;
  if (variant === "loading") return <Loader2 className={`${className} animate-spin`} />;
  return <Info className={className} />;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    // Sobre el nav inferior en movil, y por encima de los modales.
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[100] flex flex-col items-center gap-2 print:hidden md:inset-x-auto md:bottom-6 md:right-6 md:items-end">
      {toasts.map((toast) => {
        const styles = variantStyles[toast.variant];
        return (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            aria-live={toast.variant === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 ${styles.box}`}
          >
            <ToastIcon variant={toast.variant} className={`mt-0.5 h-5 w-5 shrink-0 ${styles.icon}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-relaxed opacity-80">{toast.description}</p>
              )}
            </div>
            {toast.variant !== "loading" && (
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded-lg p-1 opacity-50 transition-opacity hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
