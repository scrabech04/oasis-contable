/**
 * Reglas de cualquier archivo que el usuario sube y queda guardado con el documento:
 * el soporte de una compra, el comprobante de un pago o la evidencia que deja la
 * importacion con IA.
 *
 * Viven aparte de app/actions.ts para que las rutas MCP puedan comprobarlas ANTES de
 * crear nada: si el archivo no sirve, mejor rechazarlo que dejar la compra registrada y
 * el soporte fuera, que es justo lo que se queria evitar.
 *
 * El limite importa mas de lo que parece: los archivos se guardan como data URI dentro
 * de la propia fila, y base64 infla el tamano un tercio, asi que cada MB que entra pesa
 * ~1.33 MB en la base.
 */

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Portadas: se reescalan en el navegador antes de subirse, por eso el tope es menor. */
export const COVER_IMAGE_MAX_BYTES = 2_500_000;

/** Nombres viejos, mantenidos para no tocar los llamadores que ya los usan. */
export const PURCHASE_ATTACHMENT_MAX_BYTES = ATTACHMENT_MAX_BYTES;
export const PURCHASE_ATTACHMENT_MIME_TYPES = ATTACHMENT_MIME_TYPES;

/** Devuelve el motivo del rechazo, o null si el archivo sirve. */
export function attachmentProblem(mimeType: string, sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "El archivo está vacío.";
  }
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return `El archivo supera el limite de ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB. Usa un PDF o imagen mas ligera.`;
  }
  if (!ATTACHMENT_MIME_TYPES.includes(mimeType as (typeof ATTACHMENT_MIME_TYPES)[number])) {
    return "Solo se permiten archivos en PDF, JPG, PNG o WEBP.";
  }
  return null;
}

/** Igual que attachmentProblem, con el texto que ya conocia el flujo de compras. */
export function purchaseAttachmentProblem(mimeType: string, sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "El soporte está vacío.";
  }
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return `El soporte supera el limite de ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB. Usa un PDF o imagen mas ligera.`;
  }
  if (!ATTACHMENT_MIME_TYPES.includes(mimeType as (typeof ATTACHMENT_MIME_TYPES)[number])) {
    return "Solo se permiten soportes en PDF, JPG, PNG o WEBP.";
  }
  return null;
}
