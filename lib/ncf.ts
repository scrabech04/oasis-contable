/**
 * Numeracion de comprobantes fiscales. Aparte de las server actions para poder probar la
 * eleccion del numero sin base de datos: la consulta vive en actions.ts y aqui solo se
 * decide, con los NCF ya emitidos en la mano, cual toca.
 */

export function formatNcf(prefix: string, number: number) {
  return `${prefix}${String(number).padStart(8, "0")}`;
}

/**
 * El campo de NCF del formulario se ve en mayusculas por CSS, pero eso es solo pintura: el
 * valor viaja tal como se tecleo. Sin normalizar aqui, escribir "b0100000045" guardaba un
 * NCF en minusculas que en pantalla se veia igual que el correcto.
 */
export function normalizeNcf(value: string | null | undefined) {
  const clean = String(value || "").trim().toUpperCase();
  return clean || null;
}

/**
 * Parte un NCF en prefijo y correlativo, o null si no tiene esa forma.
 * `B0100000045` -> `{ prefix: "B01", number: 45 }`.
 *
 * El prefijo son los tres primeros caracteres (`B01`, `B02`, `E31`...), igual que asume el
 * resto de la aplicacion; lo que sigue tiene que ser todo digitos para considerarlo un
 * correlativo y no un codigo escrito a mano.
 */
export function splitNcf(ncf: string | null | undefined) {
  const clean = normalizeNcf(ncf);
  if (!clean || clean.length <= 3) return null;

  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(3);
  if (!/^\d+$/.test(suffix)) return null;

  return { prefix, number: Number(suffix) };
}

/** Mayor correlativo ya emitido con ese prefijo, o 0 si la serie esta sin estrenar. */
export function highestIssuedNumber(prefix: string, issued: Array<string | null | undefined>) {
  const cleanPrefix = String(prefix || "").trim().toUpperCase();
  if (!cleanPrefix) return 0;

  let highest = 0;
  for (const ncf of issued) {
    const value = String(ncf || "").trim().toUpperCase();
    if (!value.startsWith(cleanPrefix)) continue;

    // Un NCF con letras o basura detras del prefijo no pertenece a esta serie.
    const suffix = value.slice(cleanPrefix.length);
    if (!/^\d+$/.test(suffix)) continue;

    highest = Math.max(highest, Number(suffix));
  }

  return highest;
}

/**
 * El contador de la secuencia no sabe nada de las facturas ya emitidas: si un NCF entro
 * por otra via (importado del sistema anterior, escrito a mano, o la secuencia recreada
 * con su numero inicial), el contador queda por detras y volveria a entregar un
 * comprobante ya facturado. Se emite el mayor entre el contador y el ultimo usado mas
 * uno, asi la secuencia se corrige sola y nunca repite.
 */
export function nextFreeNumber(prefix: string, counter: number, issued: Array<string | null | undefined>) {
  const safeCounter = Number.isFinite(counter) && counter > 0 ? Math.floor(counter) : 1;
  return Math.max(safeCounter, highestIssuedNumber(prefix, issued) + 1);
}
