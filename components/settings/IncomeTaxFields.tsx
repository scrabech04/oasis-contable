"use client";

import { useState } from "react";
import { Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Tasa legal de cada regimen. CUSTOM es la unica que se teclea. */
const RATE_BY_REGIME: Record<string, number> = {
  LEGAL_ENTITY: 27,
  INDIVIDUAL: 25,
};

/**
 * Regimen y tasa como un solo control.
 *
 * Antes eran dos campos sueltos y se podian guardar en desacuerdo: elegir "persona fisica"
 * y escribir 27 dejaba el 27 guardado, pero los proyectos calculaban al 25 porque el que
 * mandaba era el regimen, sin que nada lo dijera. Aqui la tasa sigue al regimen y solo se
 * puede escribir cuando es personalizada.
 */
export function IncomeTaxFields({ regime, rate }: { regime: string; rate: number }) {
  const [selected, setSelected] = useState(regime);
  const [customRate, setCustomRate] = useState(String(rate));

  const isCustom = selected === "CUSTOM";
  const shown = isCustom ? customRate : String(RATE_BY_REGIME[selected] ?? rate);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="incomeTaxRegime">Regimen ISR para estimaciones</Label>
        <select
          id="incomeTaxRegime"
          name="incomeTaxRegime"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="LEGAL_ENTITY">Persona juridica - 27%</option>
          <option value="INDIVIDUAL">Persona fisica - 25%</option>
          <option value="CUSTOM">Tasa personalizada</option>
        </select>
        <p className="text-xs text-slate-500">
          Se usa en la estimacion fiscal de proyectos, no sustituye la declaracion anual.
        </p>
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
            value={shown}
            onChange={(event) => setCustomRate(event.target.value)}
            readOnly={!isCustom}
            className={`pl-10 ${isCustom ? "" : "bg-slate-100/60 text-slate-500 dark:bg-slate-800/60"}`}
            required
          />
        </div>
        <p className="text-xs text-slate-500">
          {isCustom
            ? "Escribe la tasa que te indique tu contador."
            : "La fija el regimen elegido. Para poner otra, elige Tasa personalizada."}
        </p>
      </div>
    </>
  );
}
