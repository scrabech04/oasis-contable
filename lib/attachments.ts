/**
 * Reglas del soporte que se adjunta a una compra (la factura del proveedor escaneada).
 *
 * Viven aparte de app/actions.ts para que las rutas MCP puedan comprobarlas ANTES de
 * crear nada: si el archivo no sirve, mejor rechazarlo que dejar la compra registrada y
 * el soporte fuera, que es justo lo que se queria evitar.
 */

export const PURCHASE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const PURCHASE_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Devuelve el motivo del rechazo, o null si el soporte sirve. */
export function purchaseAttachmentProblem(mimeType: string, sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "El soporte está vacío.";
  }
  if (sizeBytes > PURCHASE_ATTACHMENT_MAX_BYTES) {
    return `El soporte supera el limite de ${PURCHASE_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB. Usa un PDF o imagen mas ligera.`;
  }
  if (!PURCHASE_ATTACHMENT_MIME_TYPES.includes(mimeType as (typeof PURCHASE_ATTACHMENT_MIME_TYPES)[number])) {
    return "Solo se permiten soportes en PDF, JPG, PNG o WEBP.";
  }
  return null;
}
