/**
 * A donde volver despues de guardar, cuando se llego al formulario desde otra pantalla
 * (por ejemplo editando una transaccion desde el detalle de un proyecto).
 *
 * El valor viene de la URL, asi que solo se acepta una ruta interna: sin esto, un enlace
 * preparado con `?returnTo=https://otro-sitio` sacaria al usuario de la aplicacion justo
 * despues de guardar, que es el momento en que menos lo miraria.
 */
export function safeReturnTo(value: unknown): string | undefined {
  const path = typeof value === "string" ? value.trim() : "";

  if (!path.startsWith("/")) {
    return undefined;
  }

  // "//host" y "/\host" son URLs absolutas disfrazadas de ruta relativa.
  if (path.startsWith("//") || path.startsWith("/\\")) {
    return undefined;
  }

  return path;
}
