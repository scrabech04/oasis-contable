/**
 * Que pantallas alcanza cada rol.
 *
 * Vive aparte de lib/authz.ts porque esto lo consume el middleware, que corre en el
 * runtime edge y no puede tocar Prisma ni `next/headers`. Aqui solo hay reglas sobre
 * cadenas de texto.
 */

/** Rutas exactas que puede abrir el contador. */
const ACCOUNTANT_EXACT_PATHS = new Set([
  "/purchases",
  "/expenses",
  "/reports",
  "/reports/it1",
]);

/**
 * El detalle de una compra se ve, pero nada mas debajo de /purchases.
 * `/purchases/12` si; `/purchases/new`, `/purchases/12/edit`, `/purchases/quick`,
 * `/purchases/ai-import` y `/purchases/rebuild-encf` no.
 */
const ACCOUNTANT_PURCHASE_DETAIL = /^\/purchases\/\d+$/;

/** Donde aterriza el contador: la pantalla en la que realmente trabaja. */
export const ACCOUNTANT_HOME = "/purchases";

export function accountantCanOpen(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (ACCOUNTANT_EXACT_PATHS.has(path)) return true;
  if (ACCOUNTANT_PURCHASE_DETAIL.test(path)) return true;
  return false;
}

/**
 * Las server actions de Next viajan como POST a la ruta de la pagina, marcadas con esta
 * cabecera. Bloquearlas todas de un golpe es lo que convierte al contador en solo lectura
 * sin depender de acordarse de proteger cada accion una por una: lo que no esta permitido
 * no necesita enumerarse.
 *
 * Por eso el cambio de perfil del contador NO es una server action, sino un POST normal a
 * /api/active-profile: asi aqui no hace falta ninguna excepcion.
 */
export function isServerActionRequest(request: {
  method: string;
  headers: { get(name: string): string | null };
}) {
  if (request.method !== "POST") return false;
  return Boolean(request.headers.get("next-action"));
}
