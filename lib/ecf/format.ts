/**
 * Formatos que exige la DGII dentro de los XML de facturacion electronica.
 *
 * Las reglas salen del Informe Tecnico e-CF (seccion 11 y 13) y de los XSD: montos con dos
 * decimales y punto, sin separador de miles; redondeo "half up" al segundo decimal; fechas
 * dd-MM-AAAA y fecha-hora dd-MM-AAAA HH:mm:ss en hora de Republica Dominicana.
 */

const DR_TIME_ZONE = "America/Santo_Domingo";

/**
 * Redondeo al segundo decimal tal como lo describe la DGII: el tercer decimal >= 5 sube.
 * Se suma un epsilon porque 1.005 en binario vale 1.00499999... y Math.round lo bajaria.
 */
export function round2(value: number) {
  const n = Number(value) || 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + 1e-9) * 100)) / 100;
}

export function round4(value: number) {
  const n = Number(value) || 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + 1e-11) * 10000)) / 10000;
}

/** Monto con exactamente dos decimales: 1500 -> "1500.00". */
export function money(value: number) {
  return round2(value).toFixed(2);
}

/**
 * Precio unitario: el XSD admite hasta cuatro decimales. Se escriben dos cuando alcanzan y
 * cuatro solo si el precio los necesita, para no ensuciar el XML con ceros.
 */
export function unitPrice(value: number) {
  const four = round4(value);
  return round2(four) === four ? four.toFixed(2) : four.toFixed(4).replace(/0{1,2}$/, "");
}

/** Cantidad del item: decimal con dos posiciones. */
export function quantity(value: number) {
  return round2(value).toFixed(2);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Fecha sin hora (emision, vencimiento, limite de pago). En OFlow estas fechas se guardan a
 * medianoche UTC, asi que se leen en UTC: en hora dominicana el 2 de agosto seria el 1.
 */
export function dgiiDate(date: Date) {
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}

function drParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Fecha-hora real (firma, acuse, aprobacion) en hora de Republica Dominicana. */
export function dgiiDateTime(date: Date) {
  const p = drParts(date);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** Fecha de hoy en RD como fecha sin hora (medianoche UTC), igual que las guarda OFlow. */
export function todayDr(now = new Date()) {
  const p = drParts(now);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

/** "dd-MM-yyyy" -> Date a medianoche UTC, o null si no tiene esa forma. */
export function parseDgiiDate(value: string | null | undefined) {
  const match = /^\s*(\d{1,2})-(\d{1,2})-(\d{4})/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

/** RNC o cedula solo con digitos: "131-88073-8" -> "131880738". */
export function cleanTaxId(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

export function isValidTaxId(value: string | null | undefined) {
  const digits = cleanTaxId(value);
  return digits.length === 9 || digits.length === 11;
}

/** Recorta un texto ALFANUM al largo maximo del campo, sin dejar espacios colgando. */
export function clip(value: string | null | undefined, max: number) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() : clean;
}
