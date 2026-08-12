/**
 * Utilidades para el buscador unico de los listados (ver components/listing/ListToolbar).
 *
 * Viven aparte de app/actions.ts porque ese archivo es "use server" y solo puede exportar
 * funciones async.
 */

/**
 * La base es PostgreSQL, donde `contains` distingue mayusculas por defecto: buscar
 * "claro" no encontraria "CLARO". Todos los filtros de texto de los listados pasan por
 * aqui para que la busqueda se comporte como espera el usuario.
 */
export function likeTerm(search: string) {
  return { contains: search, mode: "insensitive" as const };
}

/**
 * Un termino de busqueda puede ser un monto. "RD$1,180.00", "1,180" y "1180" describen el
 * mismo importe, asi que se normaliza antes de compararlo contra la columna. Devuelve null
 * cuando el termino no es un numero, y en ese caso el listado solo busca por texto.
 */
export function parseAmountTerm(search?: string): number | null {
  if (!search) {
    return null;
  }

  const compact = search.replace(/rd\$/gi, "").replace(/[\s,]/g, "");

  if (!/^\d+(?:\.\d+)?$/.test(compact)) {
    return null;
  }

  const value = Number(compact);
  return Number.isFinite(value) ? value : null;
}

/**
 * Los importes se guardan como Float, y un total que sale de sumar subtotal + impuesto
 * puede arrastrar resto binario: una compra que se muestra como RD$5,625.00 puede valer
 * 5625.000000000001 y no coincidir con una igualdad exacta contra 5625.
 *
 * Por eso se compara contra una ventana de medio centavo: encuentra todo lo que se
 * redondea al importe que el usuario ve en pantalla, que es lo que tecleo.
 */
export function amountFilter(amount: number) {
  return { gte: amount - 0.005, lte: amount + 0.005 };
}

/**
 * Normaliza lo que llega por la URL: un termino vacio o de solo espacios equivale a no
 * buscar, para no meter un `contains: ""` que hace de comodin en toda la tabla.
 */
export function normalizeSearchTerm(value: unknown): string | undefined {
  const term = typeof value === "string" ? value.trim() : "";
  return term || undefined;
}
