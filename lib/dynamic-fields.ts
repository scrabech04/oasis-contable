/**
 * Campos dinamicos en las descripciones de las lineas: "MANTENIMIENTO WEB MENSUAL {MES}"
 * en la plantilla recurrente sale como "MANTENIMIENTO WEB MENSUAL JULIO" en la factura del
 * 28/07. Se resuelven al guardar la factura con su fecha, no al mostrarla: la factura ya
 * emitida tiene que decir siempre lo mismo, en el PDF, en el listado y en los reportes.
 *
 * El mes respeta como se escribio la marca: {MES} -> JULIO, {Mes} -> Julio, {mes} -> julio.
 * Una marca que no se conoce se deja tal cual, para que se vea y se corrija.
 */
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const DYNAMIC_FIELDS_HINT = "Campos dinámicos: {MES} pone el mes de la factura (JULIO) y {AÑO} el año.";

function matchCase(word: string, pattern: string) {
  if (pattern === pattern.toUpperCase()) return word.toUpperCase();
  if (pattern === pattern.toLowerCase()) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Las fechas de negocio se guardan como medianoche UTC (ver formatDate), asi que el mes se
// lee en UTC: en la zona local la factura del 1ro caeria en el mes anterior.
export function resolveDynamicFields(text: string, date: Date) {
  if (!text.includes("{")) return text;
  const month = MONTHS[date.getUTCMonth()];
  const year = String(date.getUTCFullYear());

  return text.replace(/\{(mes|año|ano)\}/gi, (_match, name: string) => {
    return name.toLowerCase() === "mes" ? matchCase(month, name) : year;
  });
}
