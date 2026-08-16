import { prisma } from "@/lib/prisma";

export class McpAuthError extends Error {
  status = 401;
}

export class McpBadRequestError extends Error {
  status = 400;
}

// Same char-code XOR loop as the private signaturesMatch() in lib/auth.ts.
function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function assertMcpApiKey(request: Request) {
  const provided = request.headers.get("x-api-key") || "";
  const expected = process.env.MCP_API_KEY || "";
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    throw new McpAuthError("Unauthorized");
  }
}

// MCP callers never carry the web UI's active_profile_id cookie, so profileId must
// always be explicit here - never fall back to a cookie-derived default profile.
export async function requireProfileId(rawValue: unknown): Promise<number> {
  const id = Number(rawValue);
  if (!Number.isFinite(id) || id <= 0) {
    throw new McpBadRequestError("profileId is required");
  }
  const profile = await prisma.accountProfile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) {
    throw new McpBadRequestError("profileId not found");
  }
  return profile.id;
}

export function requireConfirm(body: Record<string, unknown>) {
  if (body.confirm !== true) {
    throw new McpBadRequestError("confirm must be true - show the user a full summary and get explicit approval first");
  }
}

export function toFormData(body: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return formData;
}

// Tope del soporte que se puede adjuntar por MCP. Los comprobantes se guardan como data:
// URI dentro de la fila, asi que un archivo grande no solo viaja en el JSON: se queda en
// la base y la infla para siempre.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export type McpAttachment = {
  fileName?: unknown;
  mimeType?: unknown;
  contentBase64?: unknown;
};

/**
 * Convierte el adjunto que manda el servidor MCP (base64) en el File que esperan las
 * server actions, que estan escritas contra el FormData del formulario web.
 */
export function fileFromMcpAttachment(attachment: unknown): File | null {
  if (!attachment || typeof attachment !== "object") return null;
  const { fileName, mimeType, contentBase64 } = attachment as McpAttachment;
  if (typeof contentBase64 !== "string" || contentBase64.length === 0) {
    throw new McpBadRequestError("attachment.contentBase64 is required when attachment is given");
  }

  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length === 0) {
    throw new McpBadRequestError("attachment.contentBase64 is not valid base64");
  }
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new McpBadRequestError(
      `attachment is ${(bytes.length / 1024 / 1024).toFixed(1)} MB - the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`
    );
  }

  const type = typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream";
  return new File([new Uint8Array(bytes)], typeof fileName === "string" && fileName ? fileName : "comprobante-pago", { type });
}

export function mcpErrorResponse(error: unknown) {
  const status = error instanceof McpAuthError ? 401 : error instanceof McpBadRequestError ? 400 : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}

// Fields an update PATCH body may omit to mean "leave as-is". updatePurchase/updateInvoice
// do a full items replace, so partial edits (e.g. only relinking a project) must be seeded
// with the record's current values before the caller's body is layered on top.
export async function purchaseUpdateDefaults(id: number, profileId: number) {
  const purchase = await prisma.purchase.findFirst({
    where: { id, profileId },
    include: { items: true },
  });
  if (!purchase) throw new McpBadRequestError("Purchase not found for this profile");

  const rate = purchase.exchangeRate || 1;
  return {
    contactId: purchase.contactId ?? "manual",
    contactName: purchase.supplierName ?? undefined,
    contactTaxId: purchase.supplierTaxId ?? undefined,
    supplierWebsiteUrl: purchase.supplierWebsiteUrl ?? undefined,
    projectId: purchase.projectId ?? "none",
    currency: purchase.currency,
    exchangeRate: purchase.exchangeRate,
    date: purchase.date.toISOString().slice(0, 10),
    dueDate: purchase.dueDate ? purchase.dueDate.toISOString().slice(0, 10) : undefined,
    ncf: purchase.ncf ?? undefined,
    costType: purchase.costType ?? undefined,
    taxTreatment: purchase.taxTreatment,
    notes: purchase.notes ?? undefined,
    items: purchase.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      // Stored items are already exchangeRate-converted to DOP; undo that so a
      // re-submitted item round-trips through convertItemsToDop() unchanged.
      price: item.price / rate,
      taxRate: item.taxRate,
    })),
  };
}

export async function quotationUpdateDefaults(id: number, profileId: number) {
  const quotation = await prisma.quotation.findFirst({
    where: { id, profileId },
    include: { items: true },
  });
  if (!quotation) throw new McpBadRequestError("Quotation not found for this profile");

  return {
    number: quotation.number,
    contactId: quotation.contactId,
    projectId: quotation.projectId ?? "none",
    date: quotation.date.toISOString().slice(0, 10),
    validUntil: quotation.validUntil ? quotation.validUntil.toISOString().slice(0, 10) : undefined,
    status: quotation.status,
    title: quotation.title ?? undefined,
    subtitle: quotation.subtitle ?? undefined,
    notes: quotation.notes ?? undefined,
    termsAndConditions: quotation.termsAndConditions ?? undefined,
    includeCoverPage: quotation.includeCoverPage,
    includeTermsPage: quotation.includeTermsPage,
    items: quotation.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      taxRate: item.taxRate,
      itemType: item.itemType,
    })),
  };
}

export async function proformaUpdateDefaults(id: number, profileId: number) {
  const proforma = await prisma.proformaInvoice.findFirst({
    where: { id, profileId },
    include: { items: true },
  });
  if (!proforma) throw new McpBadRequestError("Proforma invoice not found for this profile");

  return {
    contactId: proforma.contactId,
    projectId: proforma.projectId ?? "none",
    date: proforma.date.toISOString().slice(0, 10),
    dueDate: proforma.dueDate ? proforma.dueDate.toISOString().slice(0, 10) : undefined,
    status: proforma.status,
    title: proforma.title ?? undefined,
    subtitle: proforma.subtitle ?? undefined,
    notes: proforma.notes ?? undefined,
    termsAndConditions: proforma.termsAndConditions ?? undefined,
    includeCoverPage: proforma.includeCoverPage,
    includeTermsPage: proforma.includeTermsPage,
    items: proforma.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      taxRate: item.taxRate,
    })),
  };
}

export async function invoiceUpdateDefaults(id: number, profileId: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, profileId },
    include: { items: true },
  });
  if (!invoice) throw new McpBadRequestError("Invoice not found for this profile");

  return {
    contactId: invoice.contactId,
    projectId: invoice.projectId ?? "none",
    date: invoice.date.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    ncf: invoice.ncf ?? undefined,
    incomeType: invoice.incomeType ?? undefined,
    title: invoice.title ?? undefined,
    subtitle: invoice.subtitle ?? undefined,
    notes: invoice.notes ?? undefined,
    termsAndConditions: invoice.termsAndConditions ?? undefined,
    includeCoverPage: invoice.includeCoverPage,
    includeTermsPage: invoice.includeTermsPage,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      taxRate: item.taxRate,
    })),
  };
}
