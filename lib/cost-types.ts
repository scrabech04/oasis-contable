/**
 * Los tipos de gasto del 606. En la base se guarda el codigo ("02") porque es lo que pide
 * la DGII, pero un grafico rotulado "01, 02, 09" no dice nada: aqui viven los nombres para
 * pintarlos.
 */
export const COST_TYPE_LABELS: Record<string, string> = {
  "01": "Gastos de personal",
  "02": "Trabajos, suministros y servicios",
  "03": "Arrendamientos",
  "04": "Gastos de activos fijos",
  "05": "Gastos de representacion",
  "06": "Otras deducciones admitidas",
  "07": "Gastos financieros",
  "08": "Gastos extraordinarios",
  "09": "Compras de inventario",
  "10": "Activos fijos",
  "11": "Gastos de seguros",
};

export function costTypeLabel(costType: string | null | undefined) {
  const code = String(costType || "").trim();
  return COST_TYPE_LABELS[code] || (code ? `Tipo ${code}` : "Sin clasificar");
}
