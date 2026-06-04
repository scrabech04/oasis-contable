"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";

type NewSubscriptionPanelProps = {
  children: ReactNode;
};

export function NewSubscriptionPanel({ children }: NewSubscriptionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
        >
          {isOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isOpen ? "Cerrar" : "Añadir suscripción"}
        </button>
      </div>

      {isOpen && children}
    </section>
  );
}
