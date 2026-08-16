"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  ACTIVE_PROFILE_COOKIE,
  getActiveProfileId,
  getScopedCompanySettings,
  normalizeProfileTaxId,
} from "@/lib/account-profiles";
import { allowedProfileIds, requireWriteAccess } from "@/lib/authz";
import { getPeriodDateRange, type PeriodParams } from "@/lib/list-period";
import { amountFilter, likeTerm, parseAmountTerm } from "@/lib/list-search";
import { formatNcf, nextFreeNumber, normalizeNcf, splitNcf } from "@/lib/ncf";
import { purchaseAttachmentProblem } from "@/lib/attachments";
import { BUYER_TAX_ID_PARAMS, qrParamReader } from "@/lib/dgii-qr";
import { buildDgiiConstancia, ConstanciaError, isDgiiTimbreUrl } from "@/lib/dgii-constancia";

type ActionResult = { success: true; id?: number; newId?: number; invoiceId?: number; projectId?: number; recurringInvoiceId?: number; proformaId?: number } | { success: false; error: string };

function text(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

/**
 * El formulario acepta el sitio tal como se lee en la factura ("proveedor.com"), sin
 * obligar a teclear el esquema. Se completa aqui para que el enlace guardado abra bien
 * desde cualquier pantalla.
 */
function normalizeWebsiteUrl(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function boundedText(formData: FormData, key: string, allowed: string[], fallback: string) {
  const value = text(formData, key, fallback);
  return allowed.includes(value) ? value : fallback;
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function optionalNumber(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw || raw === "new" || raw === "manual") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(formData: FormData, key: string, fallback = new Date()) {
  const raw = text(formData, key);
  return raw ? new Date(`${raw}T00:00:00`) : fallback;
}

function optionalDate(formData: FormData, key: string) {
  const raw = text(formData, key);
  return raw ? new Date(`${raw}T00:00:00`) : null;
}

function parseItems(formData: FormData) {
  const raw = text(formData, "items", "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Los formularios de gasto rapido no arman lineas: mandan un importe suelto y una
 * descripcion. Sin esto `parseItems` devolveria [] y la compra se guardaria con total 0,
 * perdiendo justo el dato que el usuario escribio.
 *
 * Vive aparte de `parseItems` porque ese lo comparten facturas, cotizaciones y
 * prefacturas, y ahi un campo `amount` suelto no significa lo mismo.
 */
function parsePurchaseItems(formData: FormData) {
  const items = parseItems(formData);
  if (items.length > 0) {
    return items;
  }

  const amount = numberValue(formData, "amount");
  if (!amount) {
    return items;
  }

  // La forma tiene que coincidir con PurchaseItem: el create hace spread de estas claves.
  return [
    {
      description: text(formData, "description") || "Gasto",
      quantity: 1,
      price: amount,
      taxRate: 0,
    },
  ];
}

/**
 * En las compras informales la tabla no muestra proveedor sino las notas, con el formato
 * "Categoria: descripcion" (ver PurchasesTable). Si el formulario mando categoria y
 * descripcion pero no notas, se arma aqui para que la fila no salga vacia.
 */
function purchaseNotes(formData: FormData) {
  const notes = optionalText(formData, "notes");
  if (notes) {
    return notes;
  }

  const category = text(formData, "category");
  const description = text(formData, "description");

  if (!category && !description) {
    return null;
  }

  return category && description ? `${category}: ${description}` : category || description;
}

function normalizeTaxRateValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function totals(items: any[]) {
  const subtotal = items.reduce((sum, item) => {
    if (item.itemType && item.itemType !== "ITEM") return sum;
    return sum + (Number(item.quantity) || 0) * (Number(item.price) || 0);
  }, 0);
  const tax = items.reduce((sum, item) => {
    if (item.itemType && item.itemType !== "ITEM") return sum;
    const line = (Number(item.quantity) || 0) * (Number(item.price) || 0);
    return sum + line * (normalizeTaxRateValue(item.taxRate) / 100);
  }, 0);
  return { subtotal, tax, total: subtotal + tax };
}

function moneyContext(formData: FormData) {
  const currency = text(formData, "currency", "DOP").toUpperCase() === "USD" ? "USD" : "DOP";
  const rawRate = numberValue(formData, "exchangeRate", 1);
  const exchangeRate = currency === "USD" ? Math.max(rawRate || 0, 0.0001) : 1;
  return { currency, exchangeRate };
}

function convertItemsToDop(items: any[], exchangeRate: number) {
  return items.map((item) => ({
    ...item,
    price: (Number(item.price) || 0) * exchangeRate,
  }));
}

function invoiceItemsData(items: any[]) {
  return items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const taxRate = normalizeTaxRateValue(item.taxRate);

    return {
      description: String(item.description || ""),
      quantity,
      price,
      taxRate,
      total: quantity * price * (1 + taxRate / 100),
    };
  });
}

function recurringInvoiceItemsData(items: any[]) {
  return items
    .filter((item) => !item.itemType || item.itemType === "ITEM")
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const taxRate = normalizeTaxRateValue(item.taxRate);

      return {
        description: String(item.description || ""),
        quantity,
        price,
        taxRate,
        total: quantity * price * (1 + taxRate / 100),
      };
    });
}

function statusFor(total: number, paidAmount: number) {
  if (paidAmount <= 0) return "OPEN";
  if (paidAmount >= total) return "PAID";
  return "PARTIAL";
}

function proformaStatusFor(total: number, paidAmount: number, currentStatus?: string) {
  if (currentStatus === "CONVERTED" || currentStatus === "CANCELLED") return currentStatus;
  if (paidAmount <= 0) return currentStatus === "SENT" ? "SENT" : "DRAFT";
  if (paidAmount >= total) return "PAID";
  return "PARTIAL";
}

function effectivePaymentAmount(payment: { amount: number; withholdings?: Array<{ amount: number }> }) {
  const withheld = (payment.withholdings || []).reduce((sum, withholding) => sum + (Number(withholding.amount) || 0), 0);
  return (Number(payment.amount) || 0) + withheld;
}

async function getNextInvoiceNumber() {
  const last = await prisma.invoice.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  let next = (last?.id || 0) + 1;

  while (true) {
    const number = `INV-${String(next).padStart(4, "0")}`;
    const exists = await prisma.invoice.findUnique({
      where: { number },
      select: { id: true },
    });
    if (!exists) return number;
    next += 1;
  }
}

async function getNextProformaNumber(profileId: number) {
  const last = await prisma.proformaInvoice.findFirst({
    where: { profileId },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return `PRO-${String((last?.id || 0) + 1).padStart(4, "0")}`;
}

// Nombre canonico para comparar contactos: sin acentos, mayusculas y sin puntuacion ni
// espacios, para que "Ferreteria Lopez, S.R.L." y "FERRETERIA LOPEZ SRL" sean el mismo.
function normalizeContactName(name: string | null | undefined) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Un contacto ya registrado se considera el mismo cuando comparte el RNC/cedula **o** el
 * nombre.
 *
 * Antes, dos RNC distintos cortaban la comparacion antes de mirar el nombre. Eso hacia que
 * la importacion con IA creara un contacto nuevo con el nombre EXACTO de uno que ya
 * existia, solo porque el RNC salio mal leido del PDF. Un digito equivocado bastaba para
 * duplicar el cliente.
 *
 * El RNC que llega no se usa para corregir al que ya esta guardado: quien reutiliza el
 * contacto (`resolveContact`) solo rellena huecos, nunca pisa un dato existente. Asi un
 * RNC mal leido no puede estropear el bueno.
 *
 * A cambio, dos empresas distintas con el mismo nombre exacto y RNC diferente se tratan
 * como una sola. Es raro, y se prefiere a llenar la agenda de duplicados; para separarlas
 * basta con que sus nombres no sean identicos.
 */
function isSameContact(
  candidate: { name: string; taxId: string | null },
  name: string,
  taxId: string | null,
) {
  const candidateTaxId = normalizeProfileTaxId(candidate.taxId);
  const incomingTaxId = normalizeProfileTaxId(taxId);
  if (candidateTaxId && incomingTaxId && candidateTaxId === incomingTaxId) return true;

  const candidateName = normalizeContactName(candidate.name);
  const incomingName = normalizeContactName(name);
  return Boolean(candidateName) && candidateName === incomingName;
}

async function findExistingContact(profileId: number, name: string, taxId: string | null, excludeId?: number) {
  const incomingTaxId = normalizeProfileTaxId(taxId);
  const incomingName = normalizeContactName(name);
  if (!incomingTaxId && !incomingName) return null;

  const candidates = await prisma.contact.findMany({
    where: { profileId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true, name: true, taxId: true, email: true, phone: true, website: true, type: true },
    orderBy: { id: "asc" },
  });

  // El match por RNC manda sobre el match por nombre.
  return (
    candidates.find(
      (candidate) => incomingTaxId && normalizeProfileTaxId(candidate.taxId) === incomingTaxId,
    ) ||
    candidates.find((candidate) => isSameContact(candidate, name, taxId)) ||
    null
  );
}

// Un contacto que ya existe como CLIENT y ahora aparece como proveedor (o al reves)
// pasa a BOTH en lugar de duplicarse.
function mergeContactType(existingType: string | null, incomingType: string) {
  const current = existingType || incomingType;
  if (current === incomingType || current === "BOTH") return current;
  return "BOTH";
}

async function resolveContact(formData: FormData, profileId: number, fallbackType = "CLIENT") {
  const contactId = text(formData, "contactId");
  if (contactId && contactId !== "new" && contactId !== "manual") {
    const contact = await prisma.contact.findFirst({
      where: { id: Number(contactId), profileId },
      select: { id: true },
    });
    if (!contact) throw new Error("Contacto no encontrado para el perfil activo.");
    return contact.id;
  }

  const name = text(formData, "contactName");
  if (!name) throw new Error("Debe indicar un contacto.");

  const taxId = optionalText(formData, "contactTaxId");
  const email = optionalText(formData, "contactEmail");
  const phone = optionalText(formData, "contactPhone");
  const website = normalizeWebsiteUrl(optionalText(formData, "contactWebsiteUrl") || optionalText(formData, "supplierWebsiteUrl"));

  const existing = await findExistingContact(profileId, name, taxId);
  if (existing) {
    // Reusamos el perfil existente y solo completamos los datos que le falten.
    const patch: Prisma.ContactUpdateInput = {};
    if (taxId && !existing.taxId) patch.taxId = taxId;
    if (email && !existing.email) patch.email = email;
    if (phone && !existing.phone) patch.phone = phone;
    if (website && !existing.website) patch.website = website;
    const type = mergeContactType(existing.type, fallbackType);
    if (type !== existing.type) patch.type = type;

    if (Object.keys(patch).length > 0) {
      await prisma.contact.update({ where: { id: existing.id }, data: patch });
    }

    return existing.id;
  }

  const contact = await prisma.contact.create({
    data: {
      name,
      taxId,
      email,
      phone,
      website,
      type: fallbackType,
      profileId,
    },
  });

  return contact.id;
}

async function uniqueProjectCode(baseCode: string) {
  const normalized = (baseCode || `PROY${Date.now().toString().slice(-6)}`)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
  let candidate = normalized || `PROY${Date.now().toString().slice(-6)}`;
  let suffix = 2;

  while (await prisma.project.findUnique({ where: { code: candidate }, select: { id: true } })) {
    const suffixText = `-${suffix}`;
    candidate = `${normalized.slice(0, Math.max(1, 24 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  return candidate;
}

async function resolveExplicitOrActiveProfileId(formData: FormData, key = "targetProfileId") {
  const requestedProfileId = Number(text(formData, key));
  if (Number.isFinite(requestedProfileId) && requestedProfileId > 0) {
    const profile = await prisma.accountProfile.findUnique({
      where: { id: requestedProfileId },
      select: { id: true },
    });
    if (profile) return profile.id;
  }

  return getActiveProfileId();
}

/**
 * El RNC comprador del timbre manda sobre el perfil activo y sobre lo que mande el
 * cliente: es el documento fiscal el que dice de quien es la compra. Asi la compra cae en
 * su perfil aunque el cambio automatico del navegador no llegue a aplicarse.
 */
async function resolvePurchaseProfileId(formData: FormData) {
  const timbreUrl = optionalText(formData, "dgiiTimbreUrl");

  if (timbreUrl && isDgiiTimbreUrl(timbreUrl)) {
    try {
      const buyerTaxId = qrParamReader(timbreUrl)(...BUYER_TAX_ID_PARAMS);
      const profile = await profileForBuyerTaxId(buyerTaxId);
      if (profile) return profile.id;
    } catch {
      // Un timbre ilegible no debe impedir guardar: se sigue con el perfil de siempre.
    }
  }

  return resolveExplicitOrActiveProfileId(formData, "targetProfileId");
}

// Used by read functions to accept an explicit profileId (MCP-facing callers) while
// preserving cookie-derived behavior for the web UI, which never passes one.
async function resolveReadProfileId(explicitProfileId?: number) {
  if (explicitProfileId !== undefined) {
    const profile = await prisma.accountProfile.findUnique({ where: { id: explicitProfileId }, select: { id: true } });
    if (!profile) throw new Error("Perfil no encontrado.");
    return profile.id;
  }
  return getActiveProfileId();
}

async function supplierTaxIdForPurchase(formData: FormData, contactId: number | null) {
  const directTaxId = optionalText(formData, "contactTaxId");
  if (directTaxId) return directTaxId;
  if (!contactId) return null;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { taxId: true },
  });

  return contact?.taxId || null;
}

async function findDuplicatePurchase(profileId: number, ncf: string | null, supplierTaxId: string | null, excludeId?: number) {
  const normalizedNcf = String(ncf || "").trim().toUpperCase();
  if (!normalizedNcf) return null;

  const normalizedSupplierTaxId = normalizeProfileTaxId(supplierTaxId);
  const candidates = await prisma.purchase.findMany({
    where: {
      profileId,
      ncf: { not: null },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    include: { contact: { select: { taxId: true, name: true } } },
    orderBy: { id: "asc" },
  });

  return candidates.find((purchase) => {
    if (String(purchase.ncf || "").trim().toUpperCase() !== normalizedNcf) return false;
    if (!normalizedSupplierTaxId) return true;
    const candidateTaxId = normalizeProfileTaxId(purchase.supplierTaxId || purchase.contact?.taxId);
    return candidateTaxId === normalizedSupplierTaxId;
  }) || null;
}

async function resolveProject(formData: FormData, profileId: number, contactId: number | null) {
  const projectId = text(formData, "projectId");
  if (!projectId || projectId === "manual" || projectId === "none") return null;
  if (projectId !== "new") {
    const project = await prisma.project.findFirst({
      where: {
        id: Number(projectId),
        OR: [
          { profileId },
          { sharedWith: { some: { profileId } } },
        ],
      },
      select: { id: true },
    });
    if (!project) throw new Error("Proyecto no encontrado para el perfil activo.");
    return project.id;
  }

  const name = text(formData, "projectName");
  if (!name || !contactId) return null;

  const code = `${name.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, "X")}${Date.now().toString().slice(-5)}`;
  const project = await prisma.project.create({
    data: {
      code,
      name,
      contactId,
      profileId,
    },
  });
  return project.id;
}

function sharedProfileIds(formData: FormData, ownerProfileId: number) {
  return formData
    .getAll("sharedProfileIds")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0 && id !== ownerProfileId);
}

function checkboxValue(formData: FormData, key: string) {
  const value = text(formData, key);
  return value === "true" || value === "on" || value === "1";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsClamped(date: Date, months: number, dayOfMonth?: number | null) {
  const next = new Date(date);
  const targetDay = dayOfMonth || next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDay, lastDay));
  return next;
}

function nextRecurringDate(date: Date, frequency: string, dayOfMonth?: number | null) {
  if (frequency === "DAILY") return addDays(date, 1);
  if (frequency === "WEEKLY") return addDays(date, 7);
  if (frequency === "YEARLY") return addMonthsClamped(date, 12, dayOfMonth);
  return addMonthsClamped(date, 1, dayOfMonth);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / msPerDay));
}

function nextMonthlyDateForDay(dayOfMonth: number) {
  const today = startOfLocalDay(new Date());
  const candidate = addMonthsClamped(new Date(today.getFullYear(), today.getMonth(), 1), 0, dayOfMonth);

  if (candidate <= today) {
    return addMonthsClamped(candidate, 1, dayOfMonth);
  }

  return candidate;
}

async function fileToGenerativePart(file: File) {
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    inlineData: {
      mimeType,
      data: buffer.toString("base64"),
    },
  };
}

function isLikelyInvoiceRow(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean(
    value.supplierName ||
    value.vendorName ||
    value.clientName ||
    value.customerName ||
    value.ncf ||
    value.encf ||
    value.total ||
    Array.isArray(value.items)
  );
}

function rowsFromParsedJson(parsed: any) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.invoices)) return parsed.invoices;
  if (Array.isArray(parsed.facturas)) return parsed.facturas;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.results)) return parsed.results;
  if (isLikelyInvoiceRow(parsed.invoice)) return [parsed.invoice];
  if (isLikelyInvoiceRow(parsed.factura)) return [parsed.factura];
  if (isLikelyInvoiceRow(parsed.purchase)) return [parsed.purchase];
  if (isLikelyInvoiceRow(parsed.sale)) return [parsed.sale];
  if (isLikelyInvoiceRow(parsed.document)) return [parsed.document];
  if (isLikelyInvoiceRow(parsed)) return [parsed];
  return [];
}

function extractJsonArray(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const rows = rowsFromParsedJson(JSON.parse(cleaned));
    if (rows.length > 0) return rows;
  } catch {
    // Fall through to substring extraction for responses with prose around JSON.
  }

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart === -1 || objectEnd <= objectStart) return [];

  try {
    return rowsFromParsedJson(JSON.parse(cleaned.slice(objectStart, objectEnd + 1)));
  } catch {
    return [];
  }
}

const purchaseInvoiceSchema: ResponseSchema = {
  type: SchemaType.ARRAY,
  minItems: 1,
  items: {
    type: SchemaType.OBJECT,
    required: ["type", "supplierName", "supplierTaxId", "ncf", "date", "costType", "taxTreatment", "items", "total"],
    properties: {
      type: { type: SchemaType.STRING, description: "FORMAL or INFORMAL" },
      supplierName: { type: SchemaType.STRING, description: "Issuer/vendor/seller legal name. Use the value next to Razon social emisor, Nombre emisor, Proveedor, Vendedor, Seller, Merchant or Vendor. Never use buyer/client name." },
      supplierTaxId: { type: SchemaType.STRING, description: "Issuer/vendor tax id. Use RNC Emisor, RNC proveedor, Cedula emisor, Tax ID, VAT or RUC. Never use buyer/client tax id." },
      supplierWebsiteUrl: { type: SchemaType.STRING, nullable: true },
      ncf: { type: SchemaType.STRING },
      date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
      dueDate: { type: SchemaType.STRING, nullable: true, description: "YYYY-MM-DD or empty" },
      costType: { type: SchemaType.STRING },
      category: { type: SchemaType.STRING },
      subtotal: { type: SchemaType.NUMBER },
      taxAmount: { type: SchemaType.NUMBER },
      serviceChargeAmount: { type: SchemaType.NUMBER, description: "Legal 10% service charge/tip for restaurants, if present. Not ITBIS." },
      total: { type: SchemaType.NUMBER },
      taxTreatment: { type: SchemaType.STRING },
      notes: { type: SchemaType.STRING },
      items: {
        type: SchemaType.ARRAY,
        minItems: 1,
        items: {
          type: SchemaType.OBJECT,
          required: ["description", "quantity", "baseAmount", "taxAmount"],
          properties: {
            description: { type: SchemaType.STRING },
            quantity: { type: SchemaType.NUMBER },
            baseAmount: { type: SchemaType.NUMBER },
            taxAmount: { type: SchemaType.NUMBER },
          },
        },
      },
    },
  },
};

const purchaseSupplierFallbackSchema: ResponseSchema = {
  type: SchemaType.ARRAY,
  minItems: 1,
  maxItems: 1,
  items: {
    type: SchemaType.OBJECT,
    required: ["supplierName", "supplierTaxId"],
    properties: {
      supplierName: {
        type: SchemaType.STRING,
        description: "Issuer/vendor/store name from the receipt header. Prefer business/store name plus legal group if both are visible.",
      },
      supplierTaxId: {
        type: SchemaType.STRING,
        description: "Tax id/RNC of the issuer/vendor/store from the receipt header. Never use customer/buyer tax id.",
      },
      supplierWebsiteUrl: { type: SchemaType.STRING, nullable: true },
    },
  },
};

const purchaseHeaderFallbackSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  required: ["headerText"],
  properties: {
    headerText: {
      type: SchemaType.STRING,
      description: "Exact transcription of the top/header lines of the receipt, preserving line breaks when possible.",
    },
  },
};

const saleInvoiceSchema: ResponseSchema = {
  type: SchemaType.ARRAY,
  minItems: 1,
  items: {
    type: SchemaType.OBJECT,
    required: ["clientName", "clientTaxId", "ncf", "date", "incomeType", "items"],
    properties: {
      clientName: { type: SchemaType.STRING },
      clientTaxId: { type: SchemaType.STRING },
      ncf: { type: SchemaType.STRING },
      date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
      dueDate: { type: SchemaType.STRING, nullable: true, description: "YYYY-MM-DD or empty" },
      incomeType: { type: SchemaType.STRING },
      notes: { type: SchemaType.STRING },
      items: {
        type: SchemaType.ARRAY,
        minItems: 1,
        items: {
          type: SchemaType.OBJECT,
          required: ["description", "quantity", "price", "taxRate"],
          properties: {
            description: { type: SchemaType.STRING },
            quantity: { type: SchemaType.NUMBER },
            price: { type: SchemaType.NUMBER },
            taxRate: { type: SchemaType.NUMBER, description: "Tax percentage, e.g. 18 not 0.18" },
          },
        },
      },
    },
  },
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function configuredGeminiModels() {
  const primary = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash")
    .split(",");
  return uniqueValues([primary, ...fallbacks]);
}

function summarizeGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Error desconocido");
  return message.replace(/\s+/g, " ").slice(0, 500);
}

async function generateGeminiInvoiceRows({
  apiKey,
  prompt,
  filePart,
  schema,
}: {
  apiKey: string;
  prompt: string;
  filePart: Awaited<ReturnType<typeof fileToGenerativePart>>;
  schema: ResponseSchema;
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const attempts: string[] = [];

  for (const modelName of configuredGeminiModels()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1,
        },
      });
      const result = await model.generateContent([prompt, filePart]);
      const responseText = result.response.text();
      const rows = extractJsonArray(responseText);

      if (rows.length > 0) {
        return { success: true as const, modelName, rows };
      }

      attempts.push(`${modelName}: respondio sin JSON de facturas reconocible`);
    } catch (error) {
      attempts.push(`${modelName}: ${summarizeGeminiError(error)}`);
    }
  }

  return {
    success: false as const,
    error: `No fue posible procesar el archivo con IA. Modelos probados: ${attempts.join(" | ")}`,
  };
}

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function expandTwoDigitYear(value: string) {
  const year = Number(value);
  if (!Number.isFinite(year)) return NaN;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function validDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dateInputValue(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDateString(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return todayDateInputValue();

  const iso = raw.match(/(^|[^\d])(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?=$|[^\d])/);
  if (iso) {
    const year = Number(iso[2]);
    const month = Number(iso[3]);
    const day = Number(iso[4]);
    if (validDateParts(year, month, day)) return dateInputValue(year, month, day);
  }

  const local = raw.match(/(^|[^\d])(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?=$|[^\d])/);
  if (local) {
    const day = Number(local[2]);
    const month = Number(local[3]);
    const year = local[4].length === 2 ? expandTwoDigitYear(local[4]) : Number(local[4]);
    if (validDateParts(year, month, day)) return dateInputValue(year, month, day);
  }

  return todayDateInputValue();
}

function normalizeMoney(value: unknown) {
  let raw = String(value ?? 0).trim().replace(/[^\d.,-]/g, "");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    raw = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = raw.length - lastComma - 1;
    raw = decimals === 2 ? raw.replace(",", ".") : raw.replace(/,/g, "");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function moneyAfterLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*:?\\s*(?:RD\\$\\s*)?([0-9][0-9.,]*)`, "i");
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeMoney(match[1]);
    }
  }
  return 0;
}

function textAfterLabel(text: string, labels: string[]) {
  const stopLabels = [
    "RNC Emisor",
    "Rnc Emisor",
    "RNC Comprador",
    "Rnc Comprador",
    "Comprador",
    "Razon Social Comprador",
    "Razón Social Comprador",
    "eNCF",
    "ENCF",
    "Fecha",
    "Monto",
    "Total",
    "ITBIS",
    "Codigo",
    "Código",
  ];

  const normalizeSearch = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const searchable = normalizeSearch(text);

  for (const label of labels) {
    const normalizedLabel = normalizeSearch(label);
    const labelIndex = searchable.indexOf(normalizedLabel);
    if (labelIndex === -1) continue;

    const valueStart = labelIndex + normalizedLabel.length;
    const stopIndex = stopLabels
      .map((stopLabel) => searchable.indexOf(normalizeSearch(stopLabel), valueStart))
      .filter((index) => index > valueStart)
      .sort((a, b) => a - b)[0] ?? text.length;

    let value = text.slice(valueStart, stopIndex).replace(/^[:\s]+/, "").trim().replace(/\s+/g, " ");
    if (!value) continue;
    value = value.replace(/^\d{9,11}\s+/, "").trim();
    if (value && !/^[\d.,-]+$/.test(value) && !/raz[oó]n social emisor/i.test(value)) return value;
  }

  return "";
}

/** Perfil dueno del comprobante segun el RNC comprador que trae el QR. */
async function profileForBuyerTaxId(buyerTaxId: string) {
  const normalized = normalizeProfileTaxId(buyerTaxId);
  if (!normalized) return null;

  const profiles = await prisma.accountProfile.findMany({
    select: { id: true, name: true, taxId: true },
  });

  return profiles.find((profile) => normalizeProfileTaxId(profile.taxId) === normalized) || null;
}

async function fetchDgiiTimbreDetails(url: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
      headers: {
        "user-agent": "Mozilla/5.0 compatible; oFlowByOasis/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return { taxAmount: 0 };

    const text = textFromHtml(await response.text());
    return {
      supplierName: textAfterLabel(text, [
        "Razon Social Emisor",
        "Razon social emisor",
        "Razón Social Emisor",
        "Razón social emisor",
        "Nombre Emisor",
        "Nombre emisor",
      ]),
      total: moneyAfterLabel(text, [
        "Monto Total",
        "Monto total",
        "Total Factura",
        "Total factura",
      ]),
      taxAmount: moneyAfterLabel(text, [
        "Total de ITBIS",
        "Total ITBIS",
        "ITBIS",
        "Monto ITBIS",
      ]),
    };
  } catch {
    return { supplierName: "", total: 0, taxAmount: 0 };
  }
}

function normalizeImportedItems(items: any[], fallbackDescription: string) {
  const safeItems = Array.isArray(items) && items.length > 0 ? items : [{ description: fallbackDescription }];
  return safeItems.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const explicitBaseAmount = normalizeMoney(
      item.baseAmount ??
      item.subtotal ??
      item.lineTotal ??
      item.amount ??
      item.total ??
      0
    );
    const unitPrice = normalizeMoney(item.price ?? item.unitPrice ?? 0);
    const baseAmount = explicitBaseAmount > 0 ? explicitBaseAmount : unitPrice * quantity;
    const taxAmount = normalizeMoney(item.taxAmount ?? item.itbis ?? item.tax ?? item.impuesto ?? 0);
    const rawTaxRate = normalizeTaxRateValue(item.taxRate);
    const taxRate = rawTaxRate > 0
      ? rawTaxRate
      : baseAmount > 0
        ? (taxAmount / baseAmount) * 100
        : 0;

    return {
      description: String(item.description || fallbackDescription),
      quantity,
      baseAmount,
      taxAmount,
      price: baseAmount / quantity,
      taxRate,
    };
  });
}

function firstMoney(row: any, keys: string[]) {
  for (const key of keys) {
    const value = normalizeMoney(looseValue(row, key));
    if (value > 0) return value;
  }
  return 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyCloseTo(value: number, expected: number) {
  return Math.abs(value - expected) <= Math.max(1, Math.abs(expected) * 0.015);
}

function normalizeJsonKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function looseValue(row: any, key: string) {
  if (!row || typeof row !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];

  const target = normalizeJsonKey(key);
  const entry = Object.entries(row).find(([candidate]) => normalizeJsonKey(candidate) === target);
  return entry?.[1];
}

function firstText(row: any, keys: string[]) {
  for (const key of keys) {
    const value = looseValue(row, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value !== "object") return String(value).trim();
  }
  return "";
}

function textLooksLikeLegalTip(text: string) {
  return /propina|10\s*%.*ley|ley.*10\s*%|servicio\s+legal|cargo\s+(?:de|por)\s+servicio|service\s+charge|gratuity|legal\s+tip/i.test(text);
}

function serviceChargeFromItems(row: any) {
  if (!Array.isArray(row?.items)) return 0;

  for (const item of row.items) {
    const description = firstText(item, ["description", "descripcion", "concept", "concepto", "name", "nombre"]);
    if (!textLooksLikeLegalTip(description)) continue;

    const amount = firstMoney(item, ["baseAmount", "amount", "total", "lineTotal", "price", "subtotal", "monto"]);
    if (amount > 0) return amount;
  }

  return 0;
}

function serviceChargeFromText(row: any) {
  const sources = [
    firstText(row, ["notes", "nota", "observaciones", "rawText", "texto", "description", "descripcion"]),
    ...((Array.isArray(row?.items) ? row.items : []).map((item: any) =>
      firstText(item, ["description", "descripcion", "concept", "concepto", "notes", "nota"])
    )),
  ].filter(Boolean);

  for (const source of sources) {
    if (!textLooksLikeLegalTip(source)) continue;
    const amount = moneyAfterLabel(source, [
      "Propina Legal",
      "Propina de Ley",
      "10% Ley",
      "10 % Ley",
      "Servicio Legal",
      "Cargo Servicio",
      "Cargo por Servicio",
      "Service Charge",
      "Legal Tip",
      "Gratuity",
    ]);
    if (amount > 0) return amount;
  }

  return 0;
}

function explicitServiceChargeAmount(row: any) {
  return firstMoney(row, [
    "serviceChargeAmount",
    "serviceCharge",
    "legalTipAmount",
    "legalTip",
    "propinaLegalAmount",
    "propinaLegal",
    "propinaDeLey",
    "propinaLey",
    "tipAmount",
    "gratuityAmount",
    "cargoServicio",
    "cargoPorServicio",
    "servicioLegal",
  ]) || serviceChargeFromItems(row) || serviceChargeFromText(row);
}

function collectTextValues(value: unknown, depth = 0): string[] {
  if (depth > 2 || value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectTextValues(item, depth + 1));
  return Object.values(value).flatMap((item) => collectTextValues(item, depth + 1));
}

function cleanSupplierName(value: string) {
  let cleaned = String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

  const labeled = textAfterLabel(cleaned, [
    "Razon social emisor",
    "RazÃ³n social emisor",
    "Nombre emisor",
    "Proveedor",
    "Vendedor",
    "Emisor",
  ]);
  if (labeled) cleaned = labeled;

  cleaned = cleaned
    .replace(/^(rnc|cedula|c[eÃ©]dula|tax id|id fiscal)\s*(emisor|proveedor)?\s*:?\s*/i, "")
    .replace(/^\d{9,11}\s+/, "")
    .trim();

  if (!cleaned) return "";
  if (/^(proveedor|emisor|vendedor|merchant|seller)\s*(sin identificar|desconocido|no identificado|n\/a)?$/i.test(cleaned)) return "";
  if (/^(compra importada|factura|invoice|receipt|recibo)$/i.test(cleaned)) return "";
  if (/^[\d\s.,:/#-]+$/.test(cleaned)) return "";
  return cleaned;
}

function cleanTaxId(value: string) {
  const raw = String(value || "").trim();
  const labeled = textAfterLabel(raw, [
    "RNC Emisor",
    "Rnc Emisor",
    "RNC proveedor",
    "RNC Proveedor",
    "Cedula emisor",
    "CÃ©dula emisor",
    "ID tributario emisor",
    "Tax ID",
  ]);
  const source = labeled || raw;
  const match = source.match(/[A-Z]{0,3}\d[\d\s-]{7,18}[A-Z0-9]?/i);
  return (match?.[0] || source).replace(/\s+/g, "").trim();
}

function textBag(row: any) {
  return collectTextValues(row).join(" ");
}

function headerSupplierFromText(headerText: string) {
  const decoded = textFromHtml(headerText || "");
  const rawLines = String(headerText || decoded)
    .replace(/\r/g, "\n")
    .split(/\n| {2,}/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const text = rawLines.join(" ");
  const rncMatch = text.match(/\bRNC\s*[:#-]?\s*([0-9][0-9\s-]{7,15})/i);
  const supplierTaxId = cleanTaxId(rncMatch?.[1] || textAfterLabel(text, ["RNC", "RNC Emisor", "RNC proveedor"]));
  const rncLineIndex = rawLines.findIndex((line) => /\bRNC\b/i.test(line));
  const headerLines = (rncLineIndex > 0 ? rawLines.slice(0, rncLineIndex) : rawLines.slice(0, 8))
    .map(cleanSupplierName)
    .filter((line) => {
      if (!line) return false;
      if (/\b(av|ave|avenida|calle|c\/|tel|telefono|telÃ©fono|phone|fecha|hora|cedula|c[eÃ©]dula|cliente|comprador)\b/i.test(line)) return false;
      if (/\b(ncf|e-ncf|encf|factura|credito fiscal|cr[eÃ©]dito fiscal|itbis|total|pagar|masterca|visa)\b/i.test(line)) return false;
      if (/^[0-9\s().,+-]+$/.test(line)) return false;
      return true;
    });

  const supplierName = uniqueValues(headerLines)
    .slice(0, 3)
    .join(" / ");

  return {
    supplierName: cleanSupplierName(supplierName),
    supplierTaxId,
  };
}

function supplierNameFromImportedRow(row: any) {
  const direct = firstText(row, [
    "supplierName",
    "supplier_name",
    "vendorName",
    "vendor_name",
    "providerName",
    "provider_name",
    "issuerName",
    "issuer_name",
    "sellerName",
    "seller_name",
    "merchantName",
    "merchant_name",
    "companyName",
    "company_name",
    "businessName",
    "business_name",
    "razonSocialEmisor",
    "razon_social_emisor",
    "razÃ³n social emisor",
    "razon social emisor",
    "nombreORazonSocialEmisor",
    "nombre_o_razon_social_emisor",
    "nombre o razon social emisor",
    "nombre o razÃ³n social emisor",
    "razonSocial",
    "razon_social",
    "razÃ³n social",
    "razon social",
    "nombreEmisor",
    "nombre_emisor",
    "nombre emisor",
    "nombreProveedor",
    "nombre_proveedor",
    "nombre proveedor",
    "razonSocialProveedor",
    "razon_social_proveedor",
    "razon social proveedor",
    "nombreComercial",
    "nombre_comercial",
    "emisor",
    "proveedor",
    "vendedor",
    "vendor",
    "provider",
    "seller",
    "merchant",
    "issuer",
    "nombre",
    "contactName",
  ]);

  const nested =
    firstText(looseValue(row, "supplier") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName", "companyName"]) ||
    firstText(looseValue(row, "proveedor") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName", "companyName"]) ||
    firstText(looseValue(row, "emisor") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName", "companyName"]) ||
    firstText(looseValue(row, "issuer") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName", "companyName"]) ||
    firstText(looseValue(row, "seller") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName", "companyName"]) ||
    firstText(looseValue(row, "merchant") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName", "companyName"]);

  const labeled = textAfterLabel(textBag(row), [
    "Razon social emisor",
    "RazÃ³n social emisor",
    "Nombre o razon social emisor",
    "Nombre emisor",
    "Proveedor",
    "Vendedor",
    "Emisor",
    "Merchant",
    "Seller",
    "Vendor",
  ]);

  return cleanSupplierName(direct) || cleanSupplierName(nested) || cleanSupplierName(labeled);
}

function supplierTaxIdFromImportedRow(row: any) {
  const direct = firstText(row, [
    "supplierTaxId",
    "supplier_tax_id",
    "vendorTaxId",
    "vendor_tax_id",
    "providerTaxId",
    "provider_tax_id",
    "issuerTaxId",
    "issuer_tax_id",
    "sellerTaxId",
    "seller_tax_id",
    "merchantTaxId",
    "merchant_tax_id",
    "rncEmisor",
    "rnc_emisor",
    "rnc emisor",
    "rncemisor",
    "rncProveedor",
    "rnc_proveedor",
    "rnc proveedor",
    "cedulaEmisor",
    "cedula_emisor",
    "cedula emisor",
    "cÃ©dula emisor",
    "idTributarioEmisor",
    "id_tributario_emisor",
    "id tributario emisor",
    "taxId",
    "tax_id",
    "taxNumber",
    "tax_number",
    "vatNumber",
    "vat_number",
    "rnc",
    "cedula",
    "cÃ©dula",
    "ruc",
  ]);

  const nested =
    firstText(looseValue(row, "supplier") || {}, ["taxId", "tax_id", "rnc", "cedula", "cÃ©dula", "ruc", "vatNumber"]) ||
    firstText(looseValue(row, "proveedor") || {}, ["taxId", "tax_id", "rnc", "cedula", "cÃ©dula", "ruc", "vatNumber"]) ||
    firstText(looseValue(row, "emisor") || {}, ["taxId", "tax_id", "rnc", "cedula", "cÃ©dula", "ruc", "vatNumber"]) ||
    firstText(looseValue(row, "issuer") || {}, ["taxId", "tax_id", "rnc", "cedula", "cÃ©dula", "ruc", "vatNumber"]) ||
    firstText(looseValue(row, "seller") || {}, ["taxId", "tax_id", "rnc", "cedula", "cÃ©dula", "ruc", "vatNumber"]) ||
    firstText(looseValue(row, "merchant") || {}, ["taxId", "tax_id", "rnc", "cedula", "cÃ©dula", "ruc", "vatNumber"]);

  const labeled = textAfterLabel(textBag(row), [
    "RNC Emisor",
    "RNC proveedor",
    "Cedula emisor",
    "CÃ©dula emisor",
    "ID tributario emisor",
    "Tax ID",
    "VAT",
    "RUC",
  ]);

  const candidate = cleanTaxId(direct) || cleanTaxId(nested) || cleanTaxId(labeled);
  const buyerTaxId = cleanTaxId(firstText(row, [
    "buyerTaxId",
    "buyer_tax_id",
    "clientTaxId",
    "client_tax_id",
    "customerTaxId",
    "customer_tax_id",
    "rncComprador",
    "rnc_comprador",
    "rnc comprador",
  ]));

  if (candidate && buyerTaxId && normalizeProfileTaxId(candidate) === normalizeProfileTaxId(buyerTaxId)) return "";
  return candidate;
}

function isMissingSupplierName(value: string) {
  const cleaned = cleanSupplierName(value);
  return !cleaned || /proveedor sin identificar/i.test(cleaned);
}

function isMissingSupplierTaxId(value: string) {
  const cleaned = cleanTaxId(value);
  return !cleaned || /^(n\/a|na|null|none|sin rnc|no aplica)$/i.test(cleaned);
}

async function extractPurchaseSupplierFallback(
  apiKey: string,
  filePart: Awaited<ReturnType<typeof fileToGenerativePart>>
) {
  const prompt = `Analiza SOLO el encabezado superior del comprobante/factura/recibo y extrae los datos del EMISOR, PROVEEDOR o VENDEDOR.

Devuelve exclusivamente un array JSON con un objeto:
[{ "supplierName": "...", "supplierTaxId": "...", "supplierWebsiteUrl": "" }]

Reglas:
- supplierName es el negocio que emite la factura. Puede aparecer como tienda, mercado, comercio, proveedor, vendedor, emisor, merchant o seller.
- Si aparecen nombre comercial y razon social, combina ambos en supplierName. Ejemplo: "SIRENA MARKET COLINA C / GRUPO RAMOS S.A".
- supplierTaxId es el RNC/Tax ID/VAT/RUC del emisor/proveedor. En tickets dominicanos suele aparecer como "RNC:" en el encabezado.
- No uses cedula/RNC del comprador, cliente o consumidor.
- Si no hay RNC del emisor, supplierTaxId debe ser cadena vacia.
- No extraigas productos, totales ni datos de pago.`;

  const generated = await generateGeminiInvoiceRows({
    apiKey,
    prompt,
    filePart,
    schema: purchaseSupplierFallbackSchema,
  });

  if (!generated.success) {
    console.warn(`Gemini supplier fallback failed: ${generated.error}`);
    return null;
  }

  const row = generated.rows[0] || {};
  const supplierName = supplierNameFromImportedRow(row) || cleanSupplierName(firstText(row, ["supplierName", "name", "nombre"]));
  const supplierTaxId = supplierTaxIdFromImportedRow(row) || cleanTaxId(firstText(row, ["supplierTaxId", "taxId", "rnc"]));
  const supplierWebsiteUrl = firstText(row, ["supplierWebsiteUrl", "websiteUrl", "website", "url"]);

  if (!supplierName && !supplierTaxId) return null;
  return { supplierName, supplierTaxId, supplierWebsiteUrl };
}

async function extractPurchaseHeaderFallback(
  apiKey: string,
  filePart: Awaited<ReturnType<typeof fileToGenerativePart>>
) {
  const prompt = `Transcribe exactamente las lineas superiores/encabezado del comprobante antes de la descripcion de productos.

Incluye nombre del negocio, razon social, direccion, telefono, RNC/Tax ID y cualquier linea visible antes de los items.
No resumas ni inventes. Devuelve exclusivamente JSON:
{ "headerText": "linea 1\\nlinea 2\\n..." }`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const attempts: string[] = [];

  for (const modelName of configuredGeminiModels()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: purchaseHeaderFallbackSchema,
          temperature: 0.05,
        },
      });
      const result = await model.generateContent([prompt, filePart]);
      const parsed = JSON.parse(result.response.text());
      const headerText = typeof parsed?.headerText === "string" ? parsed.headerText : "";
      const parsedSupplier = headerSupplierFromText(headerText);
      if (parsedSupplier.supplierName || parsedSupplier.supplierTaxId) {
        return parsedSupplier;
      }
      attempts.push(`${modelName}: header sin proveedor/RNC reconocible`);
    } catch (error) {
      attempts.push(`${modelName}: ${summarizeGeminiError(error)}`);
    }
  }

  console.warn(`Gemini header fallback failed: ${attempts.join(" | ")}`);
  return null;
}

function normalizePurchaseSingleItem(row: any, fallbackDescription: string) {
  const sourceItems = normalizeImportedItems(row.items, fallbackDescription);
  const itemsSubtotal = sourceItems.reduce((sum, item) => sum + item.baseAmount, 0);
  const itemsTax = sourceItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const itemsTotal = itemsSubtotal + itemsTax;

  let total = firstMoney(row, ["total", "amount", "montoTotal", "totalAmount", "grandTotal"]);
  let subtotal = firstMoney(row, ["subtotal", "subTotal", "baseAmount", "base", "montoGravado", "taxableAmount"]);
  let taxAmount = firstMoney(row, ["taxAmount", "itbis", "totalItbis", "totalITBIS", "tax", "impuesto"]);
  let serviceChargeAmount = explicitServiceChargeAmount(row);

  if (subtotal <= 0 && itemsSubtotal > 0) subtotal = itemsSubtotal;
  if (taxAmount <= 0 && itemsTax > 0) taxAmount = itemsTax;
  if (total <= 0 && itemsTotal > 0) total = itemsTotal;

  if (serviceChargeAmount > 0 && serviceChargeAmount <= 20 && subtotal > 0) {
    const expectedServiceCharge = roundMoney(subtotal * (serviceChargeAmount / 100));
    const remainder = total > 0 ? total - subtotal - taxAmount : 0;
    if (remainder > 0 && moneyCloseTo(remainder, expectedServiceCharge)) {
      serviceChargeAmount = roundMoney(remainder);
    } else if (total > 0 && taxAmount <= 0) {
      const surcharge = total - subtotal;
      if (surcharge > expectedServiceCharge && moneyCloseTo(surcharge, expectedServiceCharge + subtotal * 0.18)) {
        serviceChargeAmount = expectedServiceCharge;
        taxAmount = roundMoney(Math.max(0, surcharge - serviceChargeAmount));
      }
    }
  }

  if (total > 0 && subtotal > 0 && taxAmount <= 0 && serviceChargeAmount <= 0) {
    const surcharge = total - subtotal;
    if (surcharge > 0 && moneyCloseTo(surcharge, subtotal * 0.1)) {
      serviceChargeAmount = roundMoney(surcharge);
    } else if (surcharge > 0 && moneyCloseTo(surcharge, subtotal * 0.28)) {
      serviceChargeAmount = roundMoney(subtotal * 0.1);
      taxAmount = roundMoney(Math.max(0, surcharge - serviceChargeAmount));
    }
  }

  if (total > 0 && subtotal > 0 && taxAmount > 0 && serviceChargeAmount <= 0) {
    const remainder = total - subtotal - taxAmount;
    if (remainder > 0 && moneyCloseTo(remainder, subtotal * 0.1)) {
      serviceChargeAmount = roundMoney(remainder);
    }
  }

  if (total > 0 && subtotal > 0 && taxAmount <= 0) {
    taxAmount = Math.max(0, total - subtotal - serviceChargeAmount);
  }

  if (total > 0 && taxAmount > 0 && subtotal <= 0) {
    subtotal = Math.max(0, total - taxAmount - serviceChargeAmount);
  }

  if (total <= 0 && subtotal > 0) {
    total = subtotal + taxAmount + serviceChargeAmount;
  }

  if (subtotal <= 0 && total > 0) {
    subtotal = Math.max(0, total - taxAmount - serviceChargeAmount);
  }

  const taxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;
  const itemDescription = firstText(row, [
    "description",
    "concept",
    "concepto",
    "invoiceDescription",
    "serviceDescription",
    "detalle",
    "descripcion",
  ]) || firstText(row.items?.[0] || {}, ["description", "descripcion", "concept", "concepto"]) || "Compra importada con IA";

  const items = [{
    description: itemDescription,
    quantity: 1,
    baseAmount: subtotal,
    taxAmount,
    price: subtotal,
    taxRate,
  }];

  if (serviceChargeAmount > 0) {
    items.push({
      description: "Propina legal 10%",
      quantity: 1,
      baseAmount: serviceChargeAmount,
      taxAmount: 0,
      price: serviceChargeAmount,
      taxRate: 0,
    });
  }

  return {
    total,
    items,
  };
}

function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "soporte";
}

async function savePurchaseEvidenceFile(file: File, _profileId: number) {
  const originalName = safeFileName(file.name || "soporte");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  return {
    fileName: file.name || originalName,
    mimeType,
    fileSize: file.size,
    storagePath: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}

async function purchaseAttachmentFromFile(file: File) {
  if (!(file instanceof File) || file.size <= 0) return null;

  const mimeType = file.type || "application/octet-stream";
  const problem = purchaseAttachmentProblem(mimeType, file.size);
  if (problem) throw new Error(problem);

  const originalName = safeFileName(file.name || "soporte");
  const bytes = Buffer.from(await file.arrayBuffer());

  return {
    fileName: file.name || originalName,
    mimeType,
    fileSize: file.size,
    storagePath: `data:${mimeType};base64,${bytes.toString("base64")}`,
    type: "ORIGINAL_INVOICE",
  };
}

function attachmentFromFormData(formData: FormData) {
  const storagePath = optionalText(formData, "attachmentStoragePath");
  const fileName = optionalText(formData, "attachmentFileName");
  const mimeType = optionalText(formData, "attachmentMimeType");
  const fileSize = numberValue(formData, "attachmentFileSize", 0);

  if (!storagePath || !fileName || !mimeType || fileSize <= 0) return null;
  if (!storagePath.startsWith("data:")) return null;

  return {
    fileName,
    mimeType,
    fileSize,
    storagePath,
    type: "ORIGINAL_INVOICE",
  };
}

async function paymentAttachmentFromFormData(formData: FormData) {
  const value = formData.get("attachment");
  if (!(value instanceof File) || value.size <= 0) return null;

  const originalName = safeFileName(value.name || "comprobante-pago");
  const bytes = Buffer.from(await value.arrayBuffer());
  const mimeType = value.type || "application/octet-stream";

  return {
    fileName: value.name || originalName,
    mimeType,
    fileSize: value.size,
    storagePath: `data:${mimeType};base64,${bytes.toString("base64")}`,
    type: "PAYMENT_PROOF",
  };
}

function purchaseTaxClassification(formData: FormData) {
  const purchaseType = text(formData, "type", "FORMAL");
  const taxTreatment = text(
    formData,
    "taxTreatment",
    purchaseType === "INFORMAL" ? "LOCAL_NO_CREDIT" : "LOCAL_CREDIT"
  );

  const isLocalCredit = taxTreatment === "LOCAL_CREDIT";
  const isForeign = taxTreatment === "FOREIGN_EXPENSE" || taxTreatment === "IMPORT_GOODS" || taxTreatment === "FOREIGN_WITHHOLDING";

  return {
    origin: isForeign ? "FOREIGN" : "LOCAL",
    taxTreatment,
    hasFiscalCredit: isLocalCredit,
    report606: isLocalCredit,
    report609: taxTreatment === "FOREIGN_WITHHOLDING",
    affectsISR: true,
  };
}

async function extractInvoicesWithGemini(formData: FormData | undefined, mode: "purchase" | "sale") {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return { success: false as const, error: "Falta configurar GEMINI_API_KEY en .env.", data: null };
  }

  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false as const, error: "Selecciona un PDF o imagen para procesar.", data: null };
  }

  if (file.size > 15 * 1024 * 1024) {
    return { success: false as const, error: "El archivo supera el limite de 15 MB.", data: null };
  }

  const profileId = await getActiveProfileId();
  const evidence = mode === "purchase" ? await savePurchaseEvidenceFile(file, profileId) : null;

  const prompt =
    mode === "purchase"
      ? `Extrae todas las facturas de compra o gastos del archivo. Responde exclusivamente JSON valido, sin Markdown ni explicaciones. La respuesta debe ser un array JSON, con un objeto por cada factura o comprobante, no por cada producto. No desgloses los productos de la factura.

Regla critica de proveedor:
- supplierName debe ser SIEMPRE el nombre legal/comercial del EMISOR/VENDEDOR/PROVEEDOR, nunca el comprador/cliente.
- Busca supplierName en etiquetas como "Razon social emisor", "Nombre emisor", "Emisor", "Proveedor", "Vendedor", "Seller", "Merchant", "Vendor", "Company" o el nombre grande del negocio que emite la factura.
- supplierTaxId debe ser SIEMPRE el RNC/Cedula/Tax ID/VAT/RUC del EMISOR/VENDEDOR/PROVEEDOR.
- Busca supplierTaxId en "RNC Emisor", "RNC proveedor", "Cedula emisor", "Tax ID", "VAT", "RUC". No uses "RNC comprador", "Cliente", "Customer" ni datos del comprador.
- Si el proveedor es internacional y no tiene RNC dominicano, supplierTaxId debe ser cadena vacia, nunca inventes un RNC.

Si aparece una URL oficial, dominio, sitio web del proveedor o plataforma, devuelve supplierWebsiteUrl. Nunca uses el nombre del proveedor como description del item. Cada factura debe traer exactamente un item resumen en items. El item debe tener description con el concepto principal de la compra si aparece en la factura; si no aparece usa "Compra importada con IA". El item debe tener quantity 1, baseAmount igual al subtotal/base imponible de la factura y taxAmount igual al ITBIS/impuesto total de la factura. Si aparece "Propina legal", "10% ley", "10% servicio", "servicio legal", "cargo por servicio" o equivalente de restaurantes/bares/comida, coloca ese monto en serviceChargeAmount; no lo sumes a taxAmount porque no es ITBIS. El total debe ser el monto total final de la factura, incluyendo subtotal, ITBIS y serviceChargeAmount si existe. Cada objeto debe tener: type ("FORMAL" o "INFORMAL"), supplierName, supplierTaxId, supplierWebsiteUrl, ncf, date YYYY-MM-DD, dueDate YYYY-MM-DD o null, costType "02" por defecto, category, subtotal, taxAmount, serviceChargeAmount, total, taxTreatment ("LOCAL_CREDIT", "LOCAL_NO_CREDIT", "FOREIGN_EXPENSE", "IMPORT_GOODS" o "FOREIGN_WITHHOLDING"), notes, items [{description, quantity, baseAmount, taxAmount}]. Si la factura no tiene ITBIS, usa taxAmount 0 y baseAmount igual al total menos serviceChargeAmount si existe. Si es proveedor internacional, plataforma digital o no corresponde 606, usa taxTreatment "FOREIGN_EXPENSE" y taxAmount 0. Si falta un dato usa cadena vacia o 0.
Regla critica de fecha: en comprobantes dominicanos, fechas como 11/01/26, 11-01-2026 o 03/05/2026 son DIA/MES/ANO, nunca MES/DIA/ANO. Convierte siempre a YYYY-MM-DD preservando ese orden. Ejemplo: 11/01/26 => 2026-01-11; 03/05/2026 => 2026-05-03.`
      : `Extrae todas las facturas de venta del archivo. Responde exclusivamente JSON valido, sin Markdown ni explicaciones. La respuesta debe ser un array JSON. Cada objeto debe tener: clientName, clientTaxId, ncf, date YYYY-MM-DD, dueDate YYYY-MM-DD o null, incomeType "01" por defecto, notes, items [{description, quantity, price, taxRate}]. taxRate debe ser porcentaje entero o decimal de porcentaje, por ejemplo 18 para ITBIS 18%, nunca 0.18. Regla critica de fecha: en comprobantes dominicanos, fechas como 11/01/26, 11-01-2026 o 03/05/2026 son DIA/MES/ANO, nunca MES/DIA/ANO. Convierte siempre a YYYY-MM-DD preservando ese orden. Si falta un dato usa cadena vacia o 0.`;

  const filePart = await fileToGenerativePart(file);
  const generated = await generateGeminiInvoiceRows({
    apiKey,
    prompt,
    filePart,
    schema: mode === "purchase" ? purchaseInvoiceSchema : saleInvoiceSchema,
  });

  if (!generated.success) {
    return { success: false as const, error: generated.error, data: null };
  }

  console.info(`Gemini invoice import completed with model ${generated.modelName}`);
  const rows = generated.rows;
  const needsPurchaseSupplierFallback =
    mode === "purchase" &&
    rows.length === 1 &&
    (
      isMissingSupplierName(supplierNameFromImportedRow(rows[0]) || firstText(rows[0], ["supplierName", "vendorName", "providerName"])) ||
      isMissingSupplierTaxId(supplierTaxIdFromImportedRow(rows[0]) || firstText(rows[0], ["supplierTaxId", "vendorTaxId", "providerTaxId", "rnc"]))
    );
  const firstPurchaseSupplierFallback = needsPurchaseSupplierFallback
    ? await extractPurchaseSupplierFallback(apiKey, filePart)
    : null;
  const purchaseHeaderFallback =
    needsPurchaseSupplierFallback &&
    (
      !firstPurchaseSupplierFallback ||
      isMissingSupplierName(firstPurchaseSupplierFallback.supplierName) ||
      isMissingSupplierTaxId(firstPurchaseSupplierFallback.supplierTaxId)
    )
      ? await extractPurchaseHeaderFallback(apiKey, filePart)
      : null;
  const purchaseSupplierFallback = firstPurchaseSupplierFallback || purchaseHeaderFallback
    ? {
        supplierName: firstPurchaseSupplierFallback?.supplierName || purchaseHeaderFallback?.supplierName || "",
        supplierTaxId: firstPurchaseSupplierFallback?.supplierTaxId || purchaseHeaderFallback?.supplierTaxId || "",
        supplierWebsiteUrl: firstPurchaseSupplierFallback?.supplierWebsiteUrl || "",
      }
    : null;
  const data =
      mode === "purchase"
        ? rows.map((row: any) => {
            const supplierName = firstText(row, [
              "supplierName",
              "vendorName",
              "providerName",
              "razonSocialEmisor",
              "razón social emisor",
              "razon social emisor",
              "razon_social_emisor",
              "nombre o razon social emisor",
              "nombre o razón social emisor",
              "razonSocial",
              "razón social",
              "razon social",
              "nombreEmisor",
              "nombre emisor",
              "emisor",
              "proveedor",
              "nombre proveedor",
              "razonSocialProveedor",
              "razon social proveedor",
              "contactName",
            ]) ||
              firstText(looseValue(row, "supplier") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName"]) ||
              firstText(looseValue(row, "proveedor") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName"]) ||
              firstText(looseValue(row, "emisor") || {}, ["name", "nombre", "razonSocial", "razon social", "businessName"]) ||
              "Proveedor sin identificar";
            const supplierTaxId = firstText(row, [
              "supplierTaxId",
              "vendorTaxId",
              "providerTaxId",
              "rncEmisor",
              "rnc emisor",
              "rnc_emisor",
              "rnc proveedor",
              "rncProveedor",
              "cedula emisor",
              "cedulaEmisor",
              "cédula emisor",
              "id tributario emisor",
              "rnc",
              "taxId",
              "cedula",
              "cédula",
            ]) ||
              firstText(looseValue(row, "supplier") || {}, ["taxId", "rnc", "cedula", "cédula"]) ||
              firstText(looseValue(row, "proveedor") || {}, ["taxId", "rnc", "cedula", "cédula"]) ||
              firstText(looseValue(row, "emisor") || {}, ["taxId", "rnc", "cedula", "cédula"]);
            const normalizedSupplierName = supplierNameFromImportedRow(row) || purchaseSupplierFallback?.supplierName || supplierName;
            const normalizedSupplierTaxId = supplierTaxIdFromImportedRow(row) || purchaseSupplierFallback?.supplierTaxId || supplierTaxId;
            const normalized = normalizePurchaseSingleItem(row, normalizedSupplierName);
            const supplierWebsiteUrl = firstText(row, [
              "supplierWebsiteUrl",
              "websiteUrl",
              "website",
              "vendorWebsite",
              "providerWebsite",
              "sitioWeb",
              "sitio web",
              "url",
              "dominio",
            ]) ||
              firstText(looseValue(row, "supplier") || {}, ["website", "websiteUrl", "url", "site"]) ||
              firstText(looseValue(row, "proveedor") || {}, ["website", "websiteUrl", "url", "site"]) ||
              firstText(looseValue(row, "emisor") || {}, ["website", "websiteUrl", "url", "site"]) ||
              purchaseSupplierFallback?.supplierWebsiteUrl;
            return {
              type: row.type === "INFORMAL" ? "INFORMAL" : "FORMAL",
              taxTreatment: String(row.taxTreatment || (row.type === "INFORMAL" ? "LOCAL_NO_CREDIT" : "LOCAL_CREDIT")),
              supplierName: normalizedSupplierName,
              supplierTaxId: normalizedSupplierTaxId,
              supplierWebsiteUrl,
              ncf: firstText(row, ["ncf", "encf", "eNCF", "e-ncf", "comprobante", "numero comprobante"]).toUpperCase(),
              date: normalizeDateString(firstText(row, ["date", "fecha", "fechaEmision", "fecha emision", "fecha de emision"])),
              dueDate: firstText(row, ["dueDate", "fechaVencimiento", "fecha vencimiento"])
                ? normalizeDateString(firstText(row, ["dueDate", "fechaVencimiento", "fecha vencimiento"]))
                : normalizeDateString(firstText(row, ["date", "fecha", "fechaEmision", "fecha emision", "fecha de emision"])),
              costType: firstText(row, ["costType", "tipoGasto", "tipo gasto"]) || "02",
              category: firstText(row, ["category", "categoria", "categoría"]) || "Otros",
              total: normalized.total,
              notes: row.notes ? String(row.notes) : "",
              items: normalized.items,
              attachment: evidence,
            };
          })
        : rows.map((row: any) => {
            const clientName = String(row.clientName || row.customerName || row.contactName || "Cliente sin identificar");
            const items = normalizeImportedItems(row.items, clientName).map((item) => ({
              description: item.description,
              quantity: item.quantity,
              price: item.price || item.baseAmount,
              taxRate: item.taxRate,
            }));
            return {
              clientName,
              clientTaxId: String(row.clientTaxId || row.taxId || ""),
              ncf: String(row.ncf || row.encf || "").toUpperCase(),
              date: normalizeDateString(row.date),
              dueDate: row.dueDate ? normalizeDateString(row.dueDate) : normalizeDateString(row.date),
              incomeType: String(row.incomeType || "01"),
              notes: row.notes ? String(row.notes) : "",
              items,
            };
          });

  return { success: true as const, data };
}

export async function setActiveProfile(profileId: number) {
  const exists = await prisma.accountProfile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!exists) return { success: false, error: "Perfil no encontrado" };

  // No lleva requireWriteAccess porque no escribe datos, solo la cookie de que perfil se
  // esta mirando. Pero el alcance si se comprueba: un invitado no puede pararse en un
  // perfil que no le dieron. Es la misma regla que aplica /api/active-profile.
  const allowed = await allowedProfileIds();
  if (allowed !== null && !allowed.includes(profileId)) {
    return { success: false, error: "No tienes acceso a ese perfil" };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFILE_COOKIE, String(profileId), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getCompanySettings() {
  return getScopedCompanySettings();
}

export async function updateCompanySettings(formData: FormData) {
  await requireWriteAccess();
  const settings = await getScopedCompanySettings();
  const incomingCoverImage = text(formData, "coverImageDataUrl");
  const coverImageData =
    incomingCoverImage && /^data:image\/(png|jpe?g|webp);base64,/i.test(incomingCoverImage) && incomingCoverImage.length < 2_500_000
      ? incomingCoverImage
      : undefined;
  const removeCoverImage = text(formData, "removeCoverImage") === "true";
  const coverImageUpdate =
    removeCoverImage ? { coverImageUrl: null } :
      coverImageData ? { coverImageUrl: coverImageData } :
        {};

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      name: text(formData, "name"),
      taxId: text(formData, "taxId"),
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      currency: text(formData, "currency", "RD$"),
      incomeTaxRegime: boundedText(formData, "incomeTaxRegime", ["LEGAL_ENTITY", "INDIVIDUAL", "CUSTOM"], "LEGAL_ENTITY"),
      incomeTaxRate: clampNumber(numberValue(formData, "incomeTaxRate", 27) / 100, 0, 1),
      coverImageFit: boundedText(formData, "coverImageFit", ["COVER", "CONTAIN"], "COVER"),
      coverImagePosition: boundedText(formData, "coverImagePosition", ["CENTER", "TOP", "BOTTOM", "LEFT", "RIGHT"], "CENTER"),
      coverOverlayOpacity: clampNumber(numberValue(formData, "coverOverlayOpacity", 0.35), 0, 0.85),
      coverTextPosition: boundedText(formData, "coverTextPosition", ["TOP_LEFT", "TOP_RIGHT", "CENTER", "BOTTOM_LEFT", "BOTTOM_RIGHT"], "BOTTOM_LEFT"),
      coverTextColor: text(formData, "coverTextColor", "#ffffff").match(/^#[0-9a-fA-F]{6}$/) ? text(formData, "coverTextColor") : "#ffffff",
      coverAccentColor: text(formData, "coverAccentColor", "#2563eb").match(/^#[0-9a-fA-F]{6}$/) ? text(formData, "coverAccentColor") : "#2563eb",
      coverShowLogo: checkboxValue(formData, "coverShowLogo"),
      coverShowClient: checkboxValue(formData, "coverShowClient"),
      coverShowDocumentNumber: checkboxValue(formData, "coverShowDocumentNumber"),
      coverShowDate: checkboxValue(formData, "coverShowDate"),
      coverShowProject: checkboxValue(formData, "coverShowProject"),
      ...coverImageUpdate,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/invoices", "layout");
  revalidatePath("/quotations", "layout");
  return { success: true };
}

export async function getCompanyIdentities() {
  const profileId = await getActiveProfileId();
  return prisma.companyIdentity.findMany({ where: { profileId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
}

export async function createCompanyIdentity(formData: FormData) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const isDefault = text(formData, "isDefault") === "true";
  if (isDefault) await prisma.companyIdentity.updateMany({ where: { profileId }, data: { isDefault: false } });
  await prisma.companyIdentity.create({
    data: {
      name: text(formData, "name"),
      taxId: text(formData, "taxId"),
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      logoUrl: optionalText(formData, "logoUrl"),
      isDefault,
      profileId,
    },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function updateCompanyIdentity(id: number, formData: FormData) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const isDefault = text(formData, "isDefault") === "true";
  if (isDefault) await prisma.companyIdentity.updateMany({ where: { profileId }, data: { isDefault: false } });
  const result = await prisma.companyIdentity.updateMany({
    where: { id, profileId },
    data: {
      name: text(formData, "name"),
      taxId: text(formData, "taxId"),
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      logoUrl: optionalText(formData, "logoUrl"),
      isDefault,
    },
  });
  if (result.count === 0) return { success: false, error: "Identidad no encontrada para el perfil activo." };
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteCompanyIdentity(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.companyIdentity.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Identidad no encontrada para el perfil activo." };
  revalidatePath("/settings");
  return { success: true };
}

export async function createAccountProfile(formData: FormData) {
  await requireWriteAccess();
  const isDefault = text(formData, "isDefault") === "true";
  if (isDefault) await prisma.accountProfile.updateMany({ data: { isDefault: false } });
  const profile = await prisma.accountProfile.create({
    data: {
      name: text(formData, "name"),
      taxId: text(formData, "taxId"),
      type: text(formData, "type", "BUSINESS"),
      isDefault,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      logoUrl: optionalText(formData, "logoUrl"),
    },
  });
  if (isDefault) await setActiveProfile(profile.id);
  revalidatePath("/settings");
  return { success: true, id: profile.id };
}

export async function updateAccountProfile(id: number, formData: FormData) {
  await requireWriteAccess();
  const isDefault = text(formData, "isDefault") === "true";
  if (isDefault) await prisma.accountProfile.updateMany({ where: { NOT: { id } }, data: { isDefault: false } });
  await prisma.accountProfile.update({
    where: { id },
    data: {
      name: text(formData, "name"),
      taxId: text(formData, "taxId"),
      type: text(formData, "type", "BUSINESS"),
      isDefault,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      logoUrl: optionalText(formData, "logoUrl"),
    },
  });
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteAccountProfile(id: number) {
  await requireWriteAccess();
  const totalProfiles = await prisma.accountProfile.count();
  if (totalProfiles <= 1) return { success: false, error: "Debe existir al menos un perfil." };

  const fallback = await prisma.accountProfile.findFirst({ where: { NOT: { id } }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
  if (!fallback) return { success: false, error: "No hay perfil de reemplazo." };

  await Promise.all([
    prisma.contact.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.project.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.quotation.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.invoice.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.purchase.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.numberingSequence.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.recurringInvoice.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.companyIdentity.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
    prisma.companySettings.updateMany({ where: { profileId: id }, data: { profileId: fallback.id } }),
  ]);
  await prisma.accountProfile.delete({ where: { id } });
  await setActiveProfile(fallback.id);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getContacts(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; type?: string; profileId?: number } & PeriodParams) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const period = getPeriodDateRange(options || {});
  const typeFilter =
    options?.type === "CLIENT"
      ? { OR: [{ type: "CLIENT" }, { type: "BOTH" }] }
      : options?.type === "SUPPLIER"
        ? { OR: [{ type: "SUPPLIER" }, { type: "BOTH" }] }
        : {};
  return prisma.contact.findMany({
    where: {
      profileId,
      ...typeFilter,
      ...(period.gte ? { createdAt: period } : {}),
      // Va dentro de un AND porque `typeFilter` ya ocupa el OR de este nivel: si la
      // busqueda pusiera otro OR aqui, el spread borraria el filtro por tipo.
      ...(options?.search
        ? {
            AND: [
              {
                OR: [
                  { name: likeTerm(options.search) },
                  { taxId: likeTerm(options.search) },
                  { email: likeTerm(options.search) },
                  { phone: likeTerm(options.search) },
                  { city: likeTerm(options.search) },
                ],
              },
            ],
          }
        : {}),
    },
    include: { contactPersons: true },
    orderBy: { [options?.sortBy || "name"]: options?.sortOrder || "asc" } as any,
  });
}

export async function getContact(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.contact.findFirst({ where: { id, profileId }, include: { contactPersons: true } });
}

export async function getContactLedger(id: number) {
  const profileId = await getActiveProfileId();
  const contact = await prisma.contact.findFirst({
    where: { id, profileId },
    include: {
      contactPersons: true,
      invoices: {
        include: { project: true, payments: { include: { withholdings: true } } },
        orderBy: { date: "desc" },
      },
      purchases: {
        include: { project: true, payments: true },
        orderBy: { date: "desc" },
      },
      quotations: {
        include: { project: true },
        orderBy: { date: "desc" },
      },
      proformaInvoices: {
        include: { project: true, payments: true },
        orderBy: { date: "desc" },
      },
      projects: {
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!contact) return null;

  const lookupTaxId = String(contact.taxId || "").replace(/\D/g, "");
  const extraPurchases = await prisma.purchase.findMany({
    where: {
      profileId,
      contactId: null,
      OR: [
        ...(lookupTaxId ? [{ supplierTaxId: { contains: lookupTaxId } }] : []),
        { supplierName: { equals: contact.name } },
      ],
    },
    include: { project: true, payments: true },
    orderBy: { date: "desc" },
  });

  const purchaseIds = new Set(contact.purchases.map((purchase) => purchase.id));
  const purchases = [
    ...contact.purchases,
    ...extraPurchases.filter((purchase) => !purchaseIds.has(purchase.id)),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return { ...contact, purchases };
}

export async function createContact(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const name = text(formData, "name");
  const taxId = optionalText(formData, "taxId");
  const duplicate = await findExistingContact(profileId, name, taxId);
  if (duplicate) {
    return {
      success: false,
      error: `Ya existe el contacto "${duplicate.name}"${duplicate.taxId ? ` (RNC ${duplicate.taxId})` : ""} en este perfil. Edita ese contacto en lugar de crear uno nuevo.`,
    };
  }

  const persons = JSON.parse(text(formData, "contactPersons", "[]")).filter((p: any) => p.name);
  const contact = await prisma.contact.create({
    data: {
      name,
      taxId,
      type: text(formData, "type", "CLIENT"),
      address: optionalText(formData, "address"),
      city: optionalText(formData, "city"),
      country: optionalText(formData, "country"),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      website: optionalText(formData, "website"),
      notes: optionalText(formData, "notes"),
      preferredNCF: optionalText(formData, "preferredNCF"),
      profileId,
      contactPersons: { create: persons },
    },
  });
  revalidatePath("/contacts");
  return { success: true, id: contact.id };
}

export async function updateContact(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const existing = await prisma.contact.findFirst({ where: { id, profileId }, select: { id: true } });
  if (!existing) return { success: false, error: "Contacto no encontrado para el perfil activo." };
  const name = text(formData, "name");
  const taxId = optionalText(formData, "taxId");
  const duplicate = await findExistingContact(profileId, name, taxId, id);
  if (duplicate) {
    return {
      success: false,
      error: `Ya existe otro contacto "${duplicate.name}"${duplicate.taxId ? ` (RNC ${duplicate.taxId})` : ""} con estos datos en este perfil.`,
    };
  }

  const persons = JSON.parse(text(formData, "contactPersons", "[]")).filter((p: any) => p.name);
  await prisma.contact.update({
    where: { id },
    data: {
      name,
      taxId,
      type: text(formData, "type", "CLIENT"),
      address: optionalText(formData, "address"),
      city: optionalText(formData, "city"),
      country: optionalText(formData, "country"),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      website: optionalText(formData, "website"),
      notes: optionalText(formData, "notes"),
      preferredNCF: optionalText(formData, "preferredNCF"),
      contactPersons: { deleteMany: {}, create: persons },
    },
  });
  revalidatePath("/contacts");
  return { success: true, id };
}

/**
 * Agrega UNA persona a un contacto ya existente sin tocar las demas.
 *
 * `updateContact` no sirve para esto: reemplaza la lista entera (`deleteMany` + `create`),
 * asi que un llamador que solo quiera sumar a alguien tendria que reenviar a todos los
 * demas, y si se le olvida uno lo borra sin aviso. El formulario web siempre manda la
 * lista completa, pero los llamadores MCP mandan solo lo que el usuario dijo.
 */
export async function addContactPerson(contactId: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await resolveExplicitOrActiveProfileId(formData);
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, profileId },
    include: { contactPersons: true },
  });
  if (!contact) return { success: false, error: "Contacto no encontrado para el perfil activo." };

  const name = text(formData, "name").trim();
  if (!name) return { success: false, error: "La persona necesita un nombre." };

  const duplicate = contact.contactPersons.find(
    (person) => normalizeContactName(person.name) === normalizeContactName(name)
  );
  if (duplicate) {
    return {
      success: false,
      error: `"${duplicate.name}" ya esta registrada en ${contact.name}. Editala en la ficha del contacto en vez de agregarla otra vez.`,
    };
  }

  const isMain = checkboxValue(formData, "isMain");
  const person = await prisma.$transaction(async (tx) => {
    // Solo puede haber una principal: si esta lo es, las demas dejan de serlo.
    if (isMain) {
      await tx.contactPerson.updateMany({ where: { contactId }, data: { isMain: false } });
    }
    return tx.contactPerson.create({
      data: {
        contactId,
        name,
        phone: optionalText(formData, "phone"),
        email: optionalText(formData, "email"),
        position: optionalText(formData, "position"),
        isMain,
      },
    });
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: true, id: person.id };
}

/** Documentos que apuntan a un contacto y que impiden borrarlo mientras existan. */
async function contactLinkCounts(contactId: number) {
  const [invoices, proformas, quotations, purchases, projects, recurring] = await Promise.all([
    prisma.invoice.count({ where: { contactId } }),
    prisma.proformaInvoice.count({ where: { contactId } }),
    prisma.quotation.count({ where: { contactId } }),
    prisma.purchase.count({ where: { contactId } }),
    prisma.project.count({ where: { contactId } }),
    prisma.recurringInvoice.count({ where: { contactId } }),
  ]);
  return { invoices, proformas, quotations, purchases, projects, recurring };
}

export type ContactLinkSummary = Awaited<ReturnType<typeof contactLinkCounts>> & { total: number };

export async function getContactLinks(id: number): Promise<ContactLinkSummary> {
  const profileId = await getActiveProfileId();
  const contact = await prisma.contact.findFirst({ where: { id, profileId }, select: { id: true } });
  if (!contact) throw new Error("Contacto no encontrado para el perfil activo.");

  const counts = await contactLinkCounts(id);
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

function describeContactLinks(counts: Awaited<ReturnType<typeof contactLinkCounts>>) {
  const parts: string[] = [];
  const label = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (counts.invoices) parts.push(label(counts.invoices, "factura", "facturas"));
  if (counts.proformas) parts.push(label(counts.proformas, "prefactura", "prefacturas"));
  if (counts.quotations) parts.push(label(counts.quotations, "cotización", "cotizaciones"));
  if (counts.purchases) parts.push(label(counts.purchases, "compra", "compras"));
  if (counts.projects) parts.push(label(counts.projects, "proyecto", "proyectos"));
  if (counts.recurring) parts.push(label(counts.recurring, "factura recurrente", "facturas recurrentes"));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * Borra un contacto. Si tiene documentos, `reassignToId` los pasa antes a otro contacto.
 *
 * Sin ese paso el borrado reventaba: los documentos apuntan al contacto con clave foranea
 * y la base lo rechaza. El boton existia y fallaba con un error crudo. Aqui nunca se borra
 * un documento para dejar libre al contacto - una factura emitida no se tira por limpiar
 * la agenda - asi que la unica salida es moverlos o dejarlo estar.
 */
export async function deleteContact(id: number, reassignToId?: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();

  const contact = await prisma.contact.findFirst({ where: { id, profileId }, select: { id: true, name: true } });
  if (!contact) return { success: false, error: "Contacto no encontrado para el perfil activo." };

  const counts = await contactLinkCounts(id);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  if (total > 0 && !reassignToId) {
    return {
      success: false,
      error: `"${contact.name}" tiene ${describeContactLinks(counts)}. Elige a qué contacto moverlos para poder eliminarlo.`,
      linked: total,
    };
  }

  if (reassignToId) {
    if (reassignToId === id) {
      return { success: false, error: "Elige un contacto distinto al que vas a eliminar." };
    }
    const target = await prisma.contact.findFirst({
      where: { id: reassignToId, profileId },
      select: { id: true },
    });
    if (!target) return { success: false, error: "El contacto de destino no existe en este perfil." };
  }

  await prisma.$transaction(async (tx) => {
    if (reassignToId) {
      await Promise.all([
        tx.invoice.updateMany({ where: { contactId: id }, data: { contactId: reassignToId } }),
        tx.proformaInvoice.updateMany({ where: { contactId: id }, data: { contactId: reassignToId } }),
        tx.quotation.updateMany({ where: { contactId: id }, data: { contactId: reassignToId } }),
        tx.purchase.updateMany({ where: { contactId: id }, data: { contactId: reassignToId } }),
        tx.project.updateMany({ where: { contactId: id }, data: { contactId: reassignToId } }),
        tx.recurringInvoice.updateMany({ where: { contactId: id }, data: { contactId: reassignToId } }),
      ]);
    }
    // Las personas de contacto caen solas: su relacion es en cascada.
    await tx.contact.delete({ where: { id } });
  });

  revalidatePath("/contacts");
  revalidatePath("/invoices");
  revalidatePath("/purchases");
  revalidatePath("/projects");
  return { success: true, moved: reassignToId ? total : 0 };
}

export async function getProjects(options?: PeriodParams & { profileId?: number; search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const period = getPeriodDateRange(options || {});
  const search = options?.search?.trim();
  const sortOrder = options?.sortOrder || "desc";
  const orderBy =
    options?.sortBy === "name"
      ? { name: sortOrder }
      : options?.sortBy === "startDate"
        ? { startDate: sortOrder }
        : { updatedAt: sortOrder };

  return prisma.project.findMany({
    where: {
      ...(period.gte ? { startDate: period } : {}),
      // El OR de nivel superior decide a que perfil pertenece el proyecto, asi que la
      // busqueda va dentro de un AND para no mezclarse con esa condicion.
      OR: [
        { profileId },
        { sharedWith: { some: { profileId } } },
      ],
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { name: likeTerm(search) },
                  { code: likeTerm(search) },
                  { description: likeTerm(search) },
                  { responsible: likeTerm(search) },
                  { contact: { name: likeTerm(search) } },
                ],
              },
            ],
          }
        : {}),
    },
    include: { contact: true, profile: true, sharedWith: { include: { profile: true } }, invoices: true, purchases: true, quotations: true },
    orderBy: orderBy as Prisma.ProjectOrderByWithRelationInput,
  });
}

export async function getProject(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.project.findFirst({
    where: {
      id,
      OR: [
        { profileId },
        { sharedWith: { some: { profileId } } },
      ],
    },
    include: {
      contact: true,
      profile: true,
      sharedWith: { include: { profile: true } },
      // Los items alimentan la columna Descripcion de "Transacciones Asociadas".
      invoices: { include: { contact: true, items: true, payments: { include: { withholdings: true } } } },
      purchases: { include: { contact: true, items: true, payments: { include: { withholdings: true } } } },
      quotations: true,
    },
  });
}

export async function createProject(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    const profileId = await getActiveProfileId();
    const shareIds = sharedProfileIds(formData, profileId);
    const validShares = shareIds.length
      ? await prisma.accountProfile.findMany({ where: { id: { in: shareIds } }, select: { id: true } })
      : [];
    const invoiceIds = formData.getAll("invoiceIds").map(Number).filter(Boolean);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const scopedInvoices = invoiceIds.length
      ? await prisma.invoice.findMany({ where: { profileId, id: { in: invoiceIds } }, select: { id: true } })
      : [];
    const project = await prisma.project.create({
      data: {
        code: await uniqueProjectCode(text(formData, "code")),
        name: text(formData, "name"),
        description: optionalText(formData, "description"),
        responsible: optionalText(formData, "responsible"),
        startDate: dateValue(formData, "startDate"),
        endDate: optionalDate(formData, "endDate"),
        status: text(formData, "status", "PROPOSAL"),
        contactId,
        budgetIncome: numberValue(formData, "budgetIncome"),
        budgetCost: numberValue(formData, "budgetCost"),
        profileId,
        invoices: scopedInvoices.length ? { connect: scopedInvoices.map(({ id }) => ({ id })) } : undefined,
        sharedWith: validShares.length ? { create: validShares.map(({ id }) => ({ profileId: id })) } : undefined,
      },
    });
    revalidatePath("/projects");
    return { success: true, id: project.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible crear el proyecto.";
    return { success: false, error: message };
  }
}

export async function updateProject(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const existing = await prisma.project.findFirst({ where: { id, profileId }, select: { id: true } });
  if (!existing) return { success: false, error: "Proyecto no encontrado para el perfil activo." };
  const shareIds = sharedProfileIds(formData, profileId);
  const validShares = shareIds.length
    ? await prisma.accountProfile.findMany({ where: { id: { in: shareIds } }, select: { id: true } })
    : [];
  const invoiceIds = formData.getAll("invoiceIds").map(Number).filter(Boolean);
  const scopedInvoices = invoiceIds.length
    ? await prisma.invoice.findMany({ where: { profileId, id: { in: invoiceIds } }, select: { id: true } })
    : [];
  await prisma.project.update({
    where: { id },
    data: {
      code: text(formData, "code"),
      name: text(formData, "name"),
      description: optionalText(formData, "description"),
      responsible: optionalText(formData, "responsible"),
      startDate: dateValue(formData, "startDate"),
      endDate: optionalDate(formData, "endDate"),
      status: text(formData, "status", "ACTIVE"),
      budgetIncome: numberValue(formData, "budgetIncome"),
      budgetCost: numberValue(formData, "budgetCost"),
      invoices: { set: scopedInvoices.map(({ id }) => ({ id })) },
      sharedWith: {
        deleteMany: {},
        create: validShares.map(({ id }) => ({ profileId: id })),
      },
    },
  });
  revalidatePath("/projects");
  return { success: true, id };
}

export async function deleteProject(id: number): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const existing = await prisma.project.findFirst({
    where: { id, profileId },
    select: { id: true },
  });
  if (!existing) return { success: false, error: "Proyecto no encontrado para el perfil activo." };

  await prisma.$transaction([
    prisma.invoice.updateMany({ where: { projectId: id, profileId }, data: { projectId: null } }),
    prisma.purchase.updateMany({ where: { projectId: id, profileId }, data: { projectId: null } }),
    prisma.quotation.updateMany({ where: { projectId: id, profileId }, data: { projectId: null } }),
    prisma.recurringInvoice.updateMany({ where: { projectId: id, profileId }, data: { projectId: null } }),
    prisma.subscription.updateMany({ where: { projectId: id, profileId }, data: { projectId: null } }),
    prisma.projectShare.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);

  revalidatePath("/projects");
  revalidatePath("/invoices");
  revalidatePath("/purchases");
  revalidatePath("/quotations");
  revalidatePath("/subscriptions");
  return { success: true, id };
}

export async function getUnlinkedInvoicesByContact(contactId: number) {
  const profileId = await getActiveProfileId();
  return prisma.invoice.findMany({
    where: { profileId, contactId, projectId: null },
    orderBy: { date: "desc" },
  });
}

export async function getProjectLinkCandidates(projectId: number) {
  const profileId = await getActiveProfileId();
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { profileId },
        { sharedWith: { some: { profileId } } },
      ],
    },
    select: { id: true, contactId: true },
  });

  if (!project) return null;

  const [invoices, purchases] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        profileId,
        contactId: project.contactId,
        OR: [{ projectId: null }, { projectId: project.id }],
      },
      include: { contact: true, project: true },
      orderBy: { date: "desc" },
    }),
    prisma.purchase.findMany({
      where: {
        profileId,
        OR: [{ projectId: null }, { projectId: project.id }],
      },
      include: { contact: true, project: true },
      orderBy: { date: "desc" },
    }),
  ]);

  return { projectId: project.id, invoices, purchases };
}

export async function setProjectDocumentLink(projectId: number, documentType: "invoice" | "purchase", documentId: number, linked: boolean): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { profileId },
        { sharedWith: { some: { profileId } } },
      ],
    },
    select: { id: true, contactId: true },
  });
  if (!project) return { success: false, error: "Proyecto no encontrado para el perfil activo." };

  if (documentType === "invoice") {
    const result = await prisma.invoice.updateMany({
      where: { id: documentId, profileId, contactId: project.contactId, ...(linked ? {} : { projectId }) },
      data: { projectId: linked ? projectId : null },
    });
    if (result.count === 0) return { success: false, error: "No se pudo vincular esta factura al proyecto." };
    revalidatePath("/invoices");
  } else {
    const result = await prisma.purchase.updateMany({
      where: { id: documentId, profileId, ...(linked ? {} : { projectId }) },
      data: { projectId: linked ? projectId : null },
    });
    if (result.count === 0) return { success: false, error: "No se pudo vincular esta compra al proyecto." };
    revalidatePath("/purchases");
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { success: true, id: documentId, projectId };
}

// Los NCF ya emitidos con ese prefijo mandan sobre el contador de la secuencia; la
// decision de cual numero toca vive en lib/ncf.ts.
async function nextFreeSequenceNumber(profileId: number, prefix: string, counter: number) {
  const cleanPrefix = String(prefix || "").trim();
  if (!cleanPrefix) return counter;

  const issued = await prisma.invoice.findMany({
    where: { profileId, ncf: { startsWith: cleanPrefix, mode: "insensitive" } },
    select: { ncf: true },
  });

  return nextFreeNumber(cleanPrefix, counter, issued.map((invoice) => invoice.ncf));
}

/**
 * Adelanta el contador de la secuencia a la que pertenece un NCF escrito a mano.
 *
 * Repetirlo ya era imposible sin esto: `nextFreeSequenceNumber` mira los NCF realmente
 * emitidos y `findInvoiceWithNcf` rechaza el duplicado al guardar. Lo que quedaba era el
 * contador guardado por detras de la realidad, que se ve mal en la pantalla de numeracion
 * y obliga a que cada emision lo recalcule. Con esto el contador dice la verdad.
 *
 * Recibe el cliente porque las conversiones lo llaman dentro de su transaccion.
 */
async function syncSequenceCounter(
  client: Prisma.TransactionClient | typeof prisma,
  profileId: number,
  ncf: string | null | undefined,
) {
  const parsed = splitNcf(ncf);
  if (!parsed) return;

  await client.numberingSequence.updateMany({
    where: { profileId, prefix: parsed.prefix, nextNumber: { lte: parsed.number } },
    data: { nextNumber: parsed.number + 1 },
  });
}

// Un NCF escrito a mano no pasa por la secuencia, asi que se comprueba contra las
// facturas ya emitidas del perfil. La DGII no permite repetir un comprobante.
async function findInvoiceWithNcf(profileId: number, ncf: string, excludeId?: number) {
  const clean = String(ncf || "").trim();
  if (!clean) return null;

  return prisma.invoice.findFirst({
    where: {
      profileId,
      ncf: { equals: clean, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, number: true },
  });
}

async function resolveSequenceNumber(sequenceId: number, profileId: number) {
  const sequence = await prisma.numberingSequence.findFirst({ where: { id: sequenceId, profileId } });
  if (!sequence) throw new Error("Secuencia no encontrada para el perfil activo.");

  const number = await nextFreeSequenceNumber(profileId, sequence.prefix, sequence.nextNumber);
  if (sequence.finalNumber && number > sequence.finalNumber) {
    throw new Error("Esta secuencia ya agotó su numeración.");
  }

  return { sequence, number };
}

export async function getNextNcf(sequenceId: number) {
  const profileId = await getActiveProfileId();
  const { sequence, number } = await resolveSequenceNumber(sequenceId, profileId);
  return formatNcf(sequence.prefix, number);
}

export async function getNcfPreview(sequenceId: number, profileId: number) {
  const { sequence, number } = await resolveSequenceNumber(sequenceId, profileId);
  return formatNcf(sequence.prefix, number);
}

// Atomically claims the next NCF for a sequence using optimistic-concurrency retry:
// the updateMany's where clause only matches (and thus only succeeds) for the caller
// that still sees the value it just read, so a losing concurrent call gets count 0
// and retries with a fresh read instead of silently reusing the same NCF as another call.
export async function issueNextNcf(sequenceId: number, profileId: number, maxRetries = 10) {
  await requireWriteAccess();
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const { sequence, number } = await resolveSequenceNumber(sequenceId, profileId);
    // El contador queda en el numero emitido + 1, no en un increment: asi tambien absorbe
    // el salto cuando venia por detras de las facturas ya emitidas.
    const result = await prisma.numberingSequence.updateMany({
      where: { id: sequenceId, nextNumber: sequence.nextNumber },
      data: { nextNumber: number + 1 },
    });
    if (result.count === 1) {
      return formatNcf(sequence.prefix, number);
    }
  }
  throw new Error("No fue posible asignar el siguiente NCF, intenta de nuevo.");
}

/**
 * NCF para las conversiones (cotizacion o prefactura a factura), que no preguntan por
 * numeracion: se usa la secuencia de facturas marcada como preferida, la misma que el
 * formulario de factura nueva preselecciona. Si no hay ninguna preferida pero existe una
 * sola secuencia, esa; con varias sin preferida no se adivina y la factura sale sin NCF,
 * para asignarlo al editarla.
 */
async function issuePreferredNcf(profileId: number) {
  const sequences = await prisma.numberingSequence.findMany({
    where: { profileId, docType: "INVOICE" },
    select: { id: true, isPreferred: true },
    orderBy: { id: "asc" },
  });

  const chosen = sequences.find((sequence) => sequence.isPreferred)
    || (sequences.length === 1 ? sequences[0] : null);
  if (!chosen) return null;

  return issueNextNcf(chosen.id, profileId);
}

export async function getNumberingSequences(docType = "INVOICE") {
  const profileId = await getActiveProfileId();
  return prisma.numberingSequence.findMany({
    where: { profileId, docType },
    orderBy: [{ isPreferred: "desc" }, { name: "asc" }],
  });
}

export async function createNumberingSequence(formData: FormData) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const docType = text(formData, "docType", "INVOICE");
  const isPreferred = text(formData, "isPreferred") === "true";
  if (isPreferred) await prisma.numberingSequence.updateMany({ where: { profileId, docType }, data: { isPreferred: false } });
  await prisma.numberingSequence.create({
    data: {
      name: text(formData, "name"),
      prefix: text(formData, "prefix"),
      initialNumber: numberValue(formData, "initialNumber", 1),
      nextNumber: numberValue(formData, "initialNumber", 1),
      finalNumber: optionalNumber(formData, "finalNumber"),
      expiryDate: optionalDate(formData, "expiryDate"),
      isPreferred,
      docType,
      type: text(formData, "type", "01"),
      branch: text(formData, "branch", "Principal"),
      footerText: optionalText(formData, "footerText"),
      profileId,
    },
  });
  revalidatePath("/settings/numbering");
  return { success: true };
}

export async function updateNumberingSequence(id: number, formData: FormData) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const docType = text(formData, "docType", "INVOICE");
  const isPreferred = text(formData, "isPreferred") === "true";
  if (isPreferred) await prisma.numberingSequence.updateMany({ where: { profileId, docType, NOT: { id } }, data: { isPreferred: false } });
  const result = await prisma.numberingSequence.updateMany({
    where: { id, profileId },
    data: {
      name: text(formData, "name"),
      prefix: text(formData, "prefix"),
      initialNumber: numberValue(formData, "initialNumber", 1),
      nextNumber: numberValue(formData, "nextNumber", numberValue(formData, "initialNumber", 1)),
      finalNumber: optionalNumber(formData, "finalNumber"),
      expiryDate: optionalDate(formData, "expiryDate"),
      isPreferred,
      docType,
      type: text(formData, "type", "01"),
      branch: text(formData, "branch", "Principal"),
      footerText: optionalText(formData, "footerText"),
    },
  });
  if (result.count === 0) return { success: false, error: "Secuencia no encontrada para el perfil activo." };
  revalidatePath("/settings/numbering");
  return { success: true };
}

export async function deleteNumberingSequence(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.numberingSequence.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Secuencia no encontrada para el perfil activo." };
  revalidatePath("/settings/numbering");
  return { success: true };
}

export async function getInvoices(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; profileId?: number } & PeriodParams) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const period = getPeriodDateRange(options || {});
  const orderBy =
    options?.sortBy === "client"
      ? { contact: { name: options.sortOrder || "asc" } }
      : { [options?.sortBy === "total" ? "total" : "date"]: options?.sortOrder || "desc" };
  return prisma.invoice.findMany({
    where: {
      profileId,
      ...(period.gte ? { date: period } : {}),
      ...(search
        ? {
            OR: [
              { number: likeTerm(search) },
              { ncf: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              { contact: { taxId: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true, project: true, items: true, payments: { include: { withholdings: true, attachments: true } } },
    orderBy: orderBy as any,
  });
}

export async function getInvoice(id: number) {
  const profileId = await getActiveProfileId();
  const invoice = await prisma.invoice.findFirst({
    where: { id, profileId },
    include: { contact: true, project: true, items: true, payments: { include: { withholdings: true, attachments: true }, orderBy: { date: "desc" } } },
  });
  return invoice ? { ...invoice, client: invoice.contact } : null;
}

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    const profileId = await resolveExplicitOrActiveProfileId(formData);
    const items = parseItems(formData);
    const total = totals(items);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const projectId = await resolveProject(formData, profileId, contactId);
    const ncfSequenceId = optionalNumber(formData, "ncfSequenceId");
    const manualNcf = ncfSequenceId ? null : normalizeNcf(optionalText(formData, "ncf"));

    if (manualNcf) {
      const clash = await findInvoiceWithNcf(profileId, manualNcf);
      if (clash) {
        return { success: false, error: `El NCF ${manualNcf} ya está usado en la factura ${clash.number}.` };
      }
    }

    const ncf = ncfSequenceId ? await issueNextNcf(ncfSequenceId, profileId) : manualNcf;

    let invoice;
    for (let attempt = 0; ; attempt += 1) {
      const number = await getNextInvoiceNumber();
      try {
        invoice = await prisma.invoice.create({
          data: {
            number,
            ncf,
            date: dateValue(formData, "date"),
            dueDate: dateValue(formData, "dueDate"),
            contactId,
            projectId,
            subtotal: total.subtotal,
            tax: total.tax,
            total: total.total,
            incomeType: text(formData, "incomeType", "01"),
            title: optionalText(formData, "title"),
            subtitle: optionalText(formData, "subtitle"),
            notes: optionalText(formData, "notes"),
            termsAndConditions: optionalText(formData, "termsAndConditions"),
            includeCoverPage: checkboxValue(formData, "includeCoverPage"),
            includeTermsPage: checkboxValue(formData, "includeTermsPage"),
            profileId,
            items: { create: invoiceItemsData(items) },
          },
        });
        break;
      } catch (error) {
        const isUniqueNumberClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (isUniqueNumberClash && attempt < 2) continue;
        throw error;
      }
    }

    // El emitido por secuencia ya dejo el contador donde toca; el escrito a mano no.
    if (manualNcf) await syncSequenceCounter(prisma, profileId, manualNcf);

    revalidatePath("/invoices");
    return { success: true, id: invoice.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible guardar la factura.";
    return { success: false, error: message };
  }
}

/**
 * Que NCF le queda a una factura que se esta editando.
 *
 * Devuelve `{ ncf }` con el que queda, o `{ error }` si hay que abortar el guardado. Van
 * en claves distintas a proposito: "sin NCF" es un resultado valido, y con un `null` suelto
 * como valor de fallo no habria forma de distinguirlo de un error.
 *
 * Lo importante aqui es NO quemar un comprobante en cada guardado. Al editar cualquier
 * cosa (una linea, la fecha) el formulario reenvia la numeracion tal cual la cargo; si eso
 * disparara una emision, cada retoque consumiria un NCF nuevo y dejaria un hueco en la
 * serie. Por eso solo se emite cuando el NCF que llega es distinto del que ya tiene.
 */
async function resolveUpdatedInvoiceNcf(
  formData: FormData,
  profileId: number,
  invoiceId: number,
  currentNcf: string | null,
): Promise<{ ncf: string | null } | { error: string }> {
  const sequenceId = optionalNumber(formData, "ncfSequenceId");
  const submitted = normalizeNcf(optionalText(formData, "ncf"));

  // Nada cambio en la numeracion: se deja como esta y no se toca ninguna secuencia.
  if (submitted === normalizeNcf(currentNcf)) return { ncf: currentNcf };

  if (sequenceId) {
    // El numero que mando el navegador era una vista previa. El de verdad se reclama
    // ahora, de forma atomica, para que dos facturas guardadas a la vez no choquen.
    try {
      return { ncf: await issueNextNcf(sequenceId, profileId) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No fue posible asignar el NCF." };
    }
  }

  if (!submitted) return { ncf: null };

  const clash = await findInvoiceWithNcf(profileId, submitted, invoiceId);
  if (clash) {
    return { error: `El NCF ${submitted} ya está usado en la factura ${clash.number}.` };
  }

  await syncSequenceCounter(prisma, profileId, submitted);
  return { ncf: submitted };
}

export async function updateInvoice(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    const profileId = await resolveExplicitOrActiveProfileId(formData);
    const existing = await prisma.invoice.findFirst({ where: { id, profileId }, select: { id: true, paidAmount: true, ncf: true } });
    if (!existing) return { success: false, error: "Factura no encontrada para el perfil activo." };

    const numbering = await resolveUpdatedInvoiceNcf(formData, profileId, id, existing.ncf);
    if ("error" in numbering) return { success: false, error: numbering.error };
    const ncf = numbering.ncf;

    const items = parseItems(formData);
    const total = totals(items);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const projectId = await resolveProject(formData, profileId, contactId);
    await prisma.invoice.update({
      where: { id },
      data: {
        ncf,
        date: dateValue(formData, "date"),
        dueDate: dateValue(formData, "dueDate"),
        contactId,
        projectId,
        subtotal: total.subtotal,
        tax: total.tax,
        total: total.total,
        status: statusFor(total.total, existing.paidAmount || 0),
        incomeType: text(formData, "incomeType", "01"),
        title: optionalText(formData, "title"),
        subtitle: optionalText(formData, "subtitle"),
        notes: optionalText(formData, "notes"),
        termsAndConditions: optionalText(formData, "termsAndConditions"),
        includeCoverPage: checkboxValue(formData, "includeCoverPage"),
        includeTermsPage: checkboxValue(formData, "includeTermsPage"),
        items: { deleteMany: {}, create: invoiceItemsData(items) },
      },
    });
    revalidatePath("/invoices");
    return { success: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible actualizar la factura.";
    return { success: false, error: message };
  }
}

export async function deleteInvoice(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.invoice.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Factura no encontrada para el perfil activo." };
  revalidatePath("/invoices");
  return { success: true };
}

export async function duplicateInvoice(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const source = await prisma.invoice.findFirst({ where: { id, profileId }, include: { items: true } });
  if (!source) return { success: false, error: "Factura no encontrada" };
  const created = await prisma.invoice.create({
    data: {
      number: `${source.number}-COPIA-${Date.now().toString().slice(-4)}`,
      date: new Date(),
      dueDate: source.dueDate,
      contactId: source.contactId,
      projectId: source.projectId,
      subtotal: source.subtotal,
      tax: source.tax,
      total: source.total,
      incomeType: source.incomeType,
      title: source.title,
      subtitle: source.subtitle,
      notes: source.notes,
      termsAndConditions: source.termsAndConditions,
      includeCoverPage: source.includeCoverPage,
      includeTermsPage: source.includeTermsPage,
      profileId: source.profileId,
      items: { create: invoiceItemsData(source.items) },
    },
  });
  revalidatePath("/invoices");
  return { success: true, id: created.id, newId: created.id };
}

export async function getProformas(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; profileId?: number } & PeriodParams) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const period = getPeriodDateRange(options || {});
  const orderBy =
    options?.sortBy === "client"
      ? { contact: { name: options.sortOrder || "asc" } }
      : { [options?.sortBy === "total" ? "total" : "date"]: options?.sortOrder || "desc" };
  return prisma.proformaInvoice.findMany({
    where: {
      profileId,
      ...(period.gte ? { date: period } : {}),
      ...(search
        ? {
            OR: [
              { number: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              { contact: { taxId: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true, project: true, items: true, payments: { include: { attachments: true, withholdings: true } }, invoices: true },
    orderBy: orderBy as any,
  });
}

export async function getProforma(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.proformaInvoice.findFirst({
    where: { id, profileId },
    include: {
      contact: true,
      project: true,
      items: true,
      invoices: true,
      payments: { include: { attachments: true, withholdings: true }, orderBy: { date: "desc" } },
    },
  });
}

export async function createProforma(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    const profileId = await resolveExplicitOrActiveProfileId(formData);
    const items = parseItems(formData);
    const total = totals(items);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const projectId = await resolveProject(formData, profileId, contactId);
    const number = await getNextProformaNumber(profileId);
    const proforma = await prisma.proformaInvoice.create({
      data: {
        number,
        date: dateValue(formData, "date"),
        dueDate: optionalDate(formData, "dueDate"),
        status: text(formData, "status", "DRAFT"),
        contactId,
        projectId,
        subtotal: total.subtotal,
        tax: total.tax,
        total: total.total,
        title: optionalText(formData, "title"),
        subtitle: optionalText(formData, "subtitle"),
        notes: optionalText(formData, "notes"),
        termsAndConditions: optionalText(formData, "termsAndConditions"),
        includeCoverPage: checkboxValue(formData, "includeCoverPage"),
        includeTermsPage: checkboxValue(formData, "includeTermsPage"),
        profileId,
        items: { create: invoiceItemsData(items) },
      },
    });
    revalidatePath("/proformas");
    return { success: true, id: proforma.id, proformaId: proforma.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible guardar la prefactura.";
    return { success: false, error: message };
  }
}

export async function updateProforma(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    const profileId = await resolveExplicitOrActiveProfileId(formData);
    const existing = await prisma.proformaInvoice.findFirst({ where: { id, profileId }, select: { id: true, paidAmount: true, status: true } });
    if (!existing) return { success: false, error: "Prefactura no encontrada para el perfil activo." };
    if (existing.status === "CONVERTED") return { success: false, error: "No se puede editar una prefactura ya convertida a factura fiscal." };
    const items = parseItems(formData);
    const total = totals(items);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const projectId = await resolveProject(formData, profileId, contactId);
    const requestedStatus = text(formData, "status", existing.status);
    await prisma.proformaInvoice.update({
      where: { id },
      data: {
        date: dateValue(formData, "date"),
        dueDate: optionalDate(formData, "dueDate"),
        status: proformaStatusFor(total.total, existing.paidAmount || 0, requestedStatus),
        contactId,
        projectId,
        subtotal: total.subtotal,
        tax: total.tax,
        total: total.total,
        title: optionalText(formData, "title"),
        subtitle: optionalText(formData, "subtitle"),
        notes: optionalText(formData, "notes"),
        termsAndConditions: optionalText(formData, "termsAndConditions"),
        includeCoverPage: checkboxValue(formData, "includeCoverPage"),
        includeTermsPage: checkboxValue(formData, "includeTermsPage"),
        items: { deleteMany: {}, create: invoiceItemsData(items) },
      },
    });
    revalidatePath("/proformas");
    revalidatePath(`/proformas/${id}`);
    return { success: true, id, proformaId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible actualizar la prefactura.";
    return { success: false, error: message };
  }
}

export async function deleteProforma(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const existing = await prisma.proformaInvoice.findFirst({ where: { id, profileId }, select: { status: true } });
  if (!existing) return { success: false, error: "Prefactura no encontrada para el perfil activo." };
  if (existing.status === "CONVERTED") return { success: false, error: "No se puede eliminar una prefactura convertida." };
  await prisma.proformaInvoice.delete({ where: { id } });
  revalidatePath("/proformas");
  return { success: true };
}

export async function convertProformaToInvoice(id: number, formData?: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = formData ? await resolveExplicitOrActiveProfileId(formData) : await getActiveProfileId();
  const proforma = await prisma.proformaInvoice.findFirst({
    where: { id, profileId },
    include: { items: true, payments: { include: { withholdings: true, attachments: true } } },
  });
  if (!proforma) return { success: false, error: "Prefactura no encontrada para el perfil activo." };
  if (proforma.status === "CONVERTED") return { success: false, error: "Esta prefactura ya fue convertida." };
  if ((proforma.paidAmount || 0) < proforma.total) return { success: false, error: "La prefactura debe estar pagada completa antes de emitir la factura fiscal." };
  // Un NCF explicito sigue mandando; si no viene, lo emite la secuencia preferida.
  const manualNcf = formData ? normalizeNcf(optionalText(formData, "ncf")) : null;
  if (manualNcf) {
    const clash = await findInvoiceWithNcf(profileId, manualNcf);
    if (clash) {
      return { success: false, error: `El NCF ${manualNcf} ya está usado en la factura ${clash.number}.` };
    }
  }

  let ncf: string | null;
  try {
    ncf = manualNcf || (await issuePreferredNcf(profileId));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No fue posible asignar el NCF." };
  }

  const number = await getNextInvoiceNumber();
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        number,
        ncf,
        date: formData ? dateValue(formData, "date") : new Date(),
        dueDate: formData ? dateValue(formData, "dueDate") : new Date(),
        status: "PAID",
        contactId: proforma.contactId,
        projectId: proforma.projectId,
        subtotal: proforma.subtotal,
        tax: proforma.tax,
        total: proforma.total,
        paidAmount: proforma.paidAmount,
        incomeType: formData ? text(formData, "incomeType", "01") : "01",
        title: proforma.title,
        subtitle: proforma.subtitle,
        notes: proforma.notes,
        termsAndConditions: proforma.termsAndConditions,
        includeCoverPage: proforma.includeCoverPage,
        includeTermsPage: proforma.includeTermsPage,
        proformaInvoiceId: proforma.id,
        profileId,
        items: { create: invoiceItemsData(proforma.items) },
      },
    });
    await tx.payment.updateMany({
      where: { proformaInvoiceId: proforma.id },
      data: { invoiceId: created.id },
    });
    await tx.proformaInvoice.update({ where: { id: proforma.id }, data: { status: "CONVERTED" } });
    // Solo para el NCF escrito a mano: el emitido por secuencia ya dejo el contador donde toca.
    if (manualNcf) await syncSequenceCounter(tx, profileId, manualNcf);
    return created;
  });
  revalidatePath("/proformas");
  revalidatePath("/invoices");
  return { success: true, id: invoice.id, invoiceId: invoice.id };
}

export async function getPurchases(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; profileId?: number } & PeriodParams) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const period = getPeriodDateRange(options || {});
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const sortOrder = options?.sortOrder || "desc";
  const orderBy =
    options?.sortBy === "supplier"
      ? { contact: { name: sortOrder } }
      : { [options?.sortBy === "createdAt" ? "createdAt" : options?.sortBy === "total" ? "total" : "date"]: sortOrder };

  return prisma.purchase.findMany({
    where: {
      profileId,
      ...(period.gte ? { date: period } : {}),
      // El proveedor puede venir de un contacto o escrito a mano en la compra, asi que se
      // buscan ambos. El monto solo entra al OR cuando el termino parece un numero.
      ...(search
        ? {
            OR: [
              { ncf: likeTerm(search) },
              { number: likeTerm(search) },
              { supplierName: likeTerm(search) },
              { supplierTaxId: likeTerm(search) },
              { notes: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              { contact: { taxId: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true, project: true, items: true, attachments: true, payments: { include: { withholdings: true, attachments: true } } },
    orderBy: orderBy as Prisma.PurchaseOrderByWithRelationInput,
  });
}

export async function getPurchase(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.purchase.findFirst({
    where: { id, profileId },
    include: { contact: true, project: true, items: true, attachments: true, payments: { include: { withholdings: true, attachments: true } } },
  });
}

// Sin exportar: en un archivo "use server" solo pueden exportarse funciones async.
// El cliente declara su propia copia en PurchaseAttachmentManager.
const DGII_CONSTANCIA_TYPE = "DGII_VERIFICATION";

/**
 * Consulta el timbre en la DGII y guarda el PDF de constancia como soporte adicional de
 * la compra. Convive con el soporte ORIGINAL_INVOICE: solo reemplaza una constancia previa.
 */
export async function attachDgiiConstancia(
  purchaseId: number,
  timbreUrl: string,
  explicitProfileId?: number,
): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    if (!isDgiiTimbreUrl(timbreUrl)) {
      return { success: false, error: "El enlace del timbre no corresponde al portal de la DGII." };
    }

    // Al registrar desde QR la compra puede caer en otro perfil que el activo, asi que el
    // llamador puede indicar cual es.
    const profileId = explicitProfileId ?? (await getActiveProfileId());
    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, profileId },
      select: {
        id: true,
        profile: {
          select: { name: true, taxId: true, companySettings: { select: { name: true } } },
        },
      },
    });
    if (!purchase) return { success: false, error: "Compra no encontrada para el perfil activo." };

    // El comprador es el perfil dueno de la compra, no el perfil activo: al registrar desde
    // un QR la compra puede caer en otro perfil.
    //
    // Como razon social del comprador va el nombre del PERFIL, que es quien responde por
    // ese RNC. El de CompanySettings es la marca con la que se emiten los documentos y
    // puede ser otra -en un perfil personal puede estar el nombre de la empresa-, asi que
    // usarla ahi falsearia de quien es la factura.
    const legalName = purchase.profile?.name || "";
    const brandName = purchase.profile?.companySettings?.name || legalName;
    const buyerTaxId = purchase.profile?.taxId || "";
    const { encf: _encf, estado: _estado, ...attachment } = await buildDgiiConstancia(timbreUrl, {
      companyName: brandName || undefined,
      buyer: legalName && buyerTaxId ? { name: legalName, taxId: buyerTaxId } : undefined,
    });

    await prisma.$transaction([
      prisma.purchaseAttachment.deleteMany({
        where: { purchaseId, type: DGII_CONSTANCIA_TYPE },
      }),
      prisma.purchaseAttachment.create({
        data: { purchaseId, ...attachment, type: DGII_CONSTANCIA_TYPE },
      }),
    ]);

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${purchaseId}`);
    return { success: true, id: purchaseId };
  } catch (error) {
    if (error instanceof ConstanciaError) {
      return { success: false, error: error.message };
    }

    console.error("attachDgiiConstancia failed:", error);
    return { success: false, error: "No fue posible generar la constancia de la DGII." };
  }
}

export async function replacePurchaseAttachment(purchaseId: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  try {
    // Explicito, no por cookie: las rutas MCP llaman aqui y no llevan ninguna. Con el
    // perfil activo por defecto, adjuntar el soporte de una compra del otro perfil
    // respondia "compra no encontrada".
    const profileId = await resolveExplicitOrActiveProfileId(formData);
    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, profileId },
      select: { id: true },
    });
    if (!purchase) return { success: false, error: "Compra no encontrada para el perfil activo." };

    const file = formData.get("attachment");
    if (!(file instanceof File) || file.size <= 0) {
      return { success: false, error: "Selecciona un PDF o imagen para adjuntar." };
    }

    const attachment = await purchaseAttachmentFromFile(file);
    if (!attachment) return { success: false, error: "No fue posible preparar el soporte." };

    await prisma.$transaction([
      prisma.purchaseAttachment.deleteMany({
        where: { purchaseId, type: "ORIGINAL_INVOICE" },
      }),
      prisma.purchaseAttachment.create({
        data: {
          purchaseId,
          ...attachment,
        },
      }),
    ]);

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${purchaseId}`);
    revalidatePath(`/purchases/${purchaseId}/edit`);
    return { success: true, id: purchaseId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible guardar el soporte.";
    return { success: false, error: message };
  }
}

/**
 * Quita un adjunto de una compra. Hasta ahora un soporte solo podia reemplazarse, asi que
 * una constancia o una foto equivocada se quedaba ahi para siempre.
 */
export async function deletePurchaseAttachment(attachmentId: number): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const attachment = await prisma.purchaseAttachment.findFirst({
    where: { id: attachmentId, purchase: { profileId } },
    select: { id: true, purchaseId: true },
  });
  if (!attachment) return { success: false, error: "Adjunto no encontrado para el perfil activo." };

  await prisma.purchaseAttachment.delete({ where: { id: attachment.id } });

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${attachment.purchaseId}`);
  revalidatePath(`/purchases/${attachment.purchaseId}/edit`);
  return { success: true, id: attachment.purchaseId };
}

export async function createPurchase(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await resolvePurchaseProfileId(formData);
  const items = parsePurchaseItems(formData);
  const { currency, exchangeRate } = moneyContext(formData);
  const sourceTotal = totals(items);
  const accountingItems = convertItemsToDop(items, exchangeRate);
  const total = totals(accountingItems);
  const contactId = optionalNumber(formData, "contactId");
  let finalContactId = contactId;
  if (text(formData, "contactId") === "new" && text(formData, "saveAsContact") === "true") {
    finalContactId = await resolveContact(formData, profileId, "SUPPLIER");
  }
  const projectId = await resolveProject(formData, profileId, finalContactId);
  const attachment = attachmentFromFormData(formData);
  const taxClassification = purchaseTaxClassification(formData);
  const ncf = optionalText(formData, "ncf")?.toUpperCase() || null;
  const supplierTaxId = await supplierTaxIdForPurchase(formData, finalContactId);
  const duplicate = await findDuplicatePurchase(profileId, ncf, supplierTaxId);
  if (duplicate) {
    return {
      success: false,
      error: `Esta compra ya existe en este perfil: ${ncf}${supplierTaxId ? ` / RNC ${supplierTaxId}` : ""}. Revisa la compra registrada antes de guardarla otra vez.`,
    };
  }

  const purchase = await prisma.purchase.create({
    data: {
      number: optionalText(formData, "number") || ncf,
      ncf,
      date: dateValue(formData, "date"),
      dueDate: optionalDate(formData, "dueDate"),
      type: text(formData, "type", "FORMAL"),
      supplierName: optionalText(formData, "contactName"),
      supplierTaxId,
      supplierWebsiteUrl: normalizeWebsiteUrl(optionalText(formData, "supplierWebsiteUrl")),
      currency,
      exchangeRate,
      sourceSubtotal: sourceTotal.subtotal,
      sourceTax: sourceTotal.tax,
      sourceTotal: sourceTotal.total,
      contactId: finalContactId,
      projectId,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      costType: text(formData, "costType", "02"),
      ...taxClassification,
      notes: purchaseNotes(formData),
      profileId,
      items: { create: accountingItems.map((item) => ({ ...item, taxRate: normalizeTaxRateValue(item.taxRate), total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + normalizeTaxRateValue(item.taxRate) / 100) })) },
      ...(attachment ? { attachments: { create: attachment } } : {}),
    },
  });
  // Compras que vienen del QR: se adjunta la constancia de la DGII sin bloquear el guardado.
  // Si la DGII falla, la compra queda igual y el usuario puede reintentar desde el detalle.
  const timbreUrl = optionalText(formData, "dgiiTimbreUrl");
  if (timbreUrl) {
    const constancia = await attachDgiiConstancia(purchase.id, timbreUrl, profileId);
    if (!constancia.success) {
      console.warn(`Constancia DGII no adjuntada en compra ${purchase.id}: ${constancia.error}`);
    }
  }

  revalidatePath("/purchases");
  return { success: true, id: purchase.id };
}

export async function updatePurchase(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await resolveExplicitOrActiveProfileId(formData);
  const existing = await prisma.purchase.findFirst({ where: { id, profileId }, select: { paidAmount: true, type: true } });
  if (!existing) return { success: false, error: "Compra no encontrada para el perfil activo." };
  const items = parsePurchaseItems(formData);
  const { currency, exchangeRate } = moneyContext(formData);
  const sourceTotal = totals(items);
  const accountingItems = convertItemsToDop(items, exchangeRate);
  const total = totals(accountingItems);
  const rawContactId = text(formData, "contactId");
  const contactId = rawContactId && rawContactId !== "manual" ? await resolveContact(formData, profileId, "SUPPLIER") : null;
  const projectId = await resolveProject(formData, profileId, contactId);
  const taxClassification = purchaseTaxClassification(formData);
  const ncf = optionalText(formData, "ncf")?.toUpperCase() || null;
  const supplierTaxId = await supplierTaxIdForPurchase(formData, contactId);
  const duplicate = await findDuplicatePurchase(profileId, ncf, supplierTaxId, id);
  if (duplicate) {
    return {
      success: false,
      error: `Ya existe otra compra con este NCF en este perfil: ${ncf}${supplierTaxId ? ` / RNC ${supplierTaxId}` : ""}.`,
    };
  }

  await prisma.purchase.update({
    where: { id },
    data: {
      ncf,
      date: dateValue(formData, "date"),
      dueDate: optionalDate(formData, "dueDate"),
      supplierName: optionalText(formData, "contactName"),
      supplierTaxId,
      supplierWebsiteUrl: normalizeWebsiteUrl(optionalText(formData, "supplierWebsiteUrl")),
      currency,
      exchangeRate,
      sourceSubtotal: sourceTotal.subtotal,
      sourceTax: sourceTotal.tax,
      sourceTotal: sourceTotal.total,
      contactId,
      projectId,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      status: statusFor(total.total, existing?.paidAmount || 0),
      costType: text(formData, "costType", "02"),
      // Sin esto el tipo se quedaba congelado: el formulario podia mandar INFORMAL pero la
      // actualizacion nunca lo escribia. El respaldo es el valor actual, no "FORMAL",
      // porque las rutas MCP no mandan `type` y convertirian los gastos en formales.
      type: text(formData, "type", existing.type),
      ...taxClassification,
      notes: purchaseNotes(formData),
      items: { deleteMany: {}, create: accountingItems.map((item) => ({ ...item, taxRate: normalizeTaxRateValue(item.taxRate), total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + normalizeTaxRateValue(item.taxRate) / 100) })) },
    },
  });
  revalidatePath("/purchases");
  return { success: true, id };
}

/**
 * El mismo proveedor en el perfil destino: se reusa si ya existe alli y se copia si no.
 * Un contacto pertenece a un solo perfil, asi que la compra no puede seguir apuntando al
 * del perfil de origen.
 */
async function supplierContactInProfile(profileId: number, contact: Prisma.ContactGetPayload<object>) {
  const existing = await findExistingContact(profileId, contact.name, contact.taxId);

  if (existing) {
    const type = mergeContactType(existing.type, contact.type || "SUPPLIER");
    if (type !== existing.type) {
      await prisma.contact.update({ where: { id: existing.id }, data: { type } });
    }
    return existing.id;
  }

  const created = await prisma.contact.create({
    data: {
      name: contact.name,
      taxId: contact.taxId,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      city: contact.city,
      country: contact.country,
      website: contact.website,
      type: contact.type || "SUPPLIER",
      profileId,
    },
  });

  return created.id;
}

/**
 * Mueve una compra al perfil que le corresponde, para cuando se registro en el equivocado.
 * El proyecto se desvincula: los proyectos tambien pertenecen a un perfil y el destino no
 * puede quedar apuntando a uno ajeno.
 */
export async function movePurchaseToProfile(purchaseId: number, targetProfileId: number): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, profileId },
    include: { contact: true },
  });
  if (!purchase) return { success: false, error: "Compra no encontrada para el perfil activo." };
  if (targetProfileId === profileId) return { success: false, error: "La compra ya esta en ese perfil." };

  const target = await prisma.accountProfile.findUnique({
    where: { id: targetProfileId },
    select: { id: true, name: true },
  });
  if (!target) return { success: false, error: "Perfil destino no encontrado." };

  const supplierTaxId = purchase.supplierTaxId || purchase.contact?.taxId || null;
  const duplicate = await findDuplicatePurchase(targetProfileId, purchase.ncf, supplierTaxId);
  if (duplicate) {
    return {
      success: false,
      error: `En ${target.name} ya hay una compra con el NCF ${purchase.ncf}. No se movio para no duplicarla.`,
    };
  }

  const contactId = purchase.contact
    ? await supplierContactInProfile(targetProfileId, purchase.contact)
    : null;

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { profileId: targetProfileId, contactId, projectId: null },
  });

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchase.id}`);
  return { success: true, id: purchase.id };
}

export async function deletePurchase(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.purchase.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Compra no encontrada para el perfil activo." };
  revalidatePath("/purchases");
  return { success: true };
}

export async function getSubscriptions(options?: PeriodParams & { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await getActiveProfileId();
  const period = getPeriodDateRange(options || {});
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const sortOrder = options?.sortOrder || "asc";
  // Por defecto se agrupan las activas primero y luego por proximo cobro; elegir un
  // criterio en la barra lo sustituye por completo.
  const orderBy = options?.sortBy
    ? [{ [options.sortBy === "amount" ? "amount" : options.sortBy === "name" ? "name" : "nextBillingDate"]: sortOrder }]
    : [{ status: "asc" as const }, { nextBillingDate: "asc" as const }, { name: "asc" as const }];

  return prisma.subscription.findMany({
    where: {
      profileId,
      ...(period.gte ? { createdAt: period } : {}),
      ...(search
        ? {
            OR: [
              { name: likeTerm(search) },
              { provider: likeTerm(search) },
              { description: likeTerm(search) },
              { notes: likeTerm(search) },
              ...(amount !== null ? [{ amount: amountFilter(amount) }] : []),
            ],
          }
        : {}),
    },
    include: { project: true },
    orderBy: orderBy as Prisma.SubscriptionOrderByWithRelationInput[],
  });
}

export async function createSubscription(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const { currency, exchangeRate } = moneyContext(formData);
  await prisma.subscription.create({
    data: {
      name: text(formData, "name"),
      description: optionalText(formData, "description"),
      category: text(formData, "category", "SOFTWARE"),
      provider: text(formData, "provider"),
      websiteUrl: optionalText(formData, "websiteUrl"),
      managementUrl: optionalText(formData, "managementUrl"),
      paymentMethod: text(formData, "paymentMethod", "CARD"),
      paymentAccount: optionalText(formData, "paymentAccount"),
      amount: numberValue(formData, "amount"),
      currency,
      exchangeRate,
      billingCycle: text(formData, "billingCycle", "MONTHLY"),
      startDate: optionalDate(formData, "startDate") || new Date(),
      nextBillingDate: optionalDate(formData, "nextBillingDate"),
      reminderDays: numberValue(formData, "reminderDays", 7),
      status: text(formData, "status", "ACTIVE"),
      notes: optionalText(formData, "notes"),
      projectId: optionalNumber(formData, "projectId"),
      profileId,
    },
  });
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function updateSubscription(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const { currency, exchangeRate } = moneyContext(formData);
  const result = await prisma.subscription.updateMany({
    where: { id, profileId },
    data: {
      name: text(formData, "name"),
      description: optionalText(formData, "description"),
      category: text(formData, "category", "SOFTWARE"),
      provider: text(formData, "provider"),
      websiteUrl: optionalText(formData, "websiteUrl"),
      managementUrl: optionalText(formData, "managementUrl"),
      paymentMethod: text(formData, "paymentMethod", "CARD"),
      paymentAccount: optionalText(formData, "paymentAccount"),
      amount: numberValue(formData, "amount"),
      currency,
      exchangeRate,
      billingCycle: text(formData, "billingCycle", "MONTHLY"),
      startDate: optionalDate(formData, "startDate") || new Date(),
      nextBillingDate: optionalDate(formData, "nextBillingDate"),
      reminderDays: numberValue(formData, "reminderDays", 7),
      status: text(formData, "status", "ACTIVE"),
      notes: optionalText(formData, "notes"),
      projectId: optionalNumber(formData, "projectId"),
    },
  });
  if (result.count === 0) return { success: false, error: "Suscripcion no encontrada para el perfil activo." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function updateSubscriptionStatus(id: number, status: string) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.subscription.updateMany({
    where: { id, profileId },
    data: { status },
  });
  if (result.count === 0) return { success: false, error: "Suscripcion no encontrada para el perfil activo." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function deleteSubscription(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.subscription.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Suscripcion no encontrada para el perfil activo." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function createExpense(formData: FormData) {
  await requireWriteAccess();
  formData.set("type", "INFORMAL");
  return createPurchase(formData);
}

export async function getExpenses(options?: PeriodParams & { profileId?: number; search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const period = getPeriodDateRange(options || {});
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const sortOrder = options?.sortOrder || "desc";

  return prisma.purchase.findMany({
    where: {
      profileId,
      type: "INFORMAL",
      ...(period.gte ? { date: period } : {}),
      ...(search
        ? {
            OR: [
              { number: likeTerm(search) },
              { supplierName: likeTerm(search) },
              { notes: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true, items: true, attachments: true },
    orderBy: { [options?.sortBy === "total" ? "total" : "date"]: sortOrder } as Prisma.PurchaseOrderByWithRelationInput,
  });
}

// El formulario web pide el numero antes de guardar y lo manda en el submit; los
// llamadores MCP no lo hacen, asi que createQuotation necesita generarlo por su cuenta
// con el perfil ya resuelto (que no siempre es el de la cookie).
async function nextQuotationNumber(profileId: number) {
  const last = await prisma.quotation.findFirst({ where: { profileId }, orderBy: { id: "desc" } });
  return `COT-${String((last?.id || 0) + 1).padStart(4, "0")}`;
}

export async function getNextQuotationNumber() {
  return nextQuotationNumber(await getActiveProfileId());
}

export async function getQuotations(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; profileId?: number } & PeriodParams) {
  const profileId = await resolveReadProfileId(options?.profileId);
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const period = getPeriodDateRange(options || {});
  const orderBy =
    options?.sortBy === "client"
      ? { contact: { name: options.sortOrder || "asc" } }
      : { [options?.sortBy === "total" ? "total" : "date"]: options?.sortOrder || "desc" };
  return prisma.quotation.findMany({
    where: {
      profileId,
      ...(period.gte ? { date: period } : {}),
      ...(search
        ? {
            OR: [
              { number: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              { contact: { taxId: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true, project: true, items: true },
    orderBy: orderBy as any,
  });
}

export async function getQuotation(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.quotation.findFirst({
    where: { id, profileId },
    include: { contact: true, project: true, items: true },
  });
}

export async function createQuotation(formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await resolveExplicitOrActiveProfileId(formData);
  const items = parseItems(formData);
  const total = totals(items);
  const contactId = await resolveContact(formData, profileId, "CLIENT");
  const projectId = await resolveProject(formData, profileId, contactId);
  const quotation = await prisma.quotation.create({
    data: {
      number: text(formData, "number") || (await nextQuotationNumber(profileId)),
      date: dateValue(formData, "date"),
      validUntil: optionalDate(formData, "validUntil"),
      status: text(formData, "status", "DRAFT"),
      contactId,
      projectId,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      title: optionalText(formData, "title"),
      subtitle: optionalText(formData, "subtitle"),
      notes: optionalText(formData, "notes"),
      termsAndConditions: optionalText(formData, "termsAndConditions"),
      includeCoverPage: checkboxValue(formData, "includeCoverPage"),
      includeTermsPage: checkboxValue(formData, "includeTermsPage"),
      profileId,
      items: { create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
    },
  });
  revalidatePath("/quotations");
  return { success: true, id: quotation.id };
}

export async function updateQuotation(id: number, formData: FormData): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await resolveExplicitOrActiveProfileId(formData);
  const existing = await prisma.quotation.findFirst({ where: { id, profileId }, select: { id: true, number: true } });
  if (!existing) return { success: false, error: "Cotización no encontrada para el perfil activo." };
  const items = parseItems(formData);
  const total = totals(items);
  const contactId = await resolveContact(formData, profileId, "CLIENT");
  const projectId = await resolveProject(formData, profileId, contactId);
  await prisma.quotation.update({
    where: { id },
    data: {
      // Sin el respaldo, un update que no mande `number` (los MCP no lo mandan) dejaria
      // la cotizacion con el numero en blanco y chocaria con la siguiente que hiciera igual.
      number: text(formData, "number") || existing.number,
      date: dateValue(formData, "date"),
      validUntil: optionalDate(formData, "validUntil"),
      status: text(formData, "status", "DRAFT"),
      contactId,
      projectId,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      title: optionalText(formData, "title"),
      subtitle: optionalText(formData, "subtitle"),
      notes: optionalText(formData, "notes"),
      termsAndConditions: optionalText(formData, "termsAndConditions"),
      includeCoverPage: checkboxValue(formData, "includeCoverPage"),
      includeTermsPage: checkboxValue(formData, "includeTermsPage"),
      items: { deleteMany: {}, create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
    },
  });
  revalidatePath("/quotations");
  return { success: true, id };
}

export async function deleteQuotation(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.quotation.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Cotización no encontrada para el perfil activo." };
  revalidatePath("/quotations");
  return { success: true };
}

export async function duplicateQuotation(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const source = await prisma.quotation.findFirst({ where: { id, profileId }, include: { items: true } });
  if (!source) return { success: false, error: "Cotización no encontrada" };
  const created = await prisma.quotation.create({
    data: {
      number: `${source.number}-COPIA-${Date.now().toString().slice(-4)}`,
      date: new Date(),
      validUntil: source.validUntil,
      status: "DRAFT",
      contactId: source.contactId,
      projectId: source.projectId,
      subtotal: source.subtotal,
      tax: source.tax,
      total: source.total,
      title: source.title,
      subtitle: source.subtitle,
      notes: source.notes,
      termsAndConditions: source.termsAndConditions,
      includeCoverPage: source.includeCoverPage,
      includeTermsPage: source.includeTermsPage,
      profileId: source.profileId,
      items: { create: source.items.map(({ id: _id, quotationId: _quotationId, ...item }) => item) },
    },
  });
  revalidatePath("/quotations");
  return { success: true, id: created.id, newId: created.id };
}

export async function convertQuotationToInvoice(id: number) {
  await requireWriteAccess();
  const activeProfileId = await getActiveProfileId();
  const quote = await prisma.quotation.findFirst({ where: { id, profileId: activeProfileId }, include: { items: true } });
  if (!quote) return { success: false, error: "Cotización no encontrada" };

  let ncf: string | null;
  try {
    ncf = await issuePreferredNcf(quote.profileId || activeProfileId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No fue posible asignar el NCF." };
  }

  const number = await getNextInvoiceNumber();
  const invoice = await prisma.invoice.create({
    data: {
      number,
      ncf,
      date: new Date(),
      dueDate: new Date(),
      contactId: quote.contactId,
      projectId: quote.projectId,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      title: quote.title,
      subtitle: quote.subtitle,
      notes: quote.notes,
      termsAndConditions: quote.termsAndConditions,
      includeCoverPage: quote.includeCoverPage,
      includeTermsPage: quote.includeTermsPage,
      profileId: quote.profileId,
      items: { create: invoiceItemsData(quote.items) },
    },
  });
  await prisma.quotation.update({ where: { id: quote.id }, data: { status: "INVOICED" } });
  revalidatePath("/quotations");
  revalidatePath("/invoices");
  return { success: true, id: invoice.id, invoiceId: invoice.id };
}

export async function convertQuotationToProject(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const quote = await prisma.quotation.findFirst({ where: { id, profileId } });
  if (!quote) return { success: false, error: "Cotización no encontrada" };
  const project = await prisma.project.create({
    data: {
      code: `PRJ-${Date.now().toString().slice(-6)}`,
      name: quote.title || `Proyecto ${quote.number}`,
      contactId: quote.contactId,
      budgetIncome: quote.total,
      profileId: quote.profileId,
      quotations: { connect: { id: quote.id } },
    },
  });
  revalidatePath("/projects");
  return { success: true, id: project.id, projectId: project.id };
}

export async function recordPayment(targetId: number, targetType: "INVOICE" | "PURCHASE" | "PROFORMA", formData: FormData) {
  await requireWriteAccess();
  const profileId = await resolveExplicitOrActiveProfileId(formData);
  const target =
    targetType === "INVOICE"
      ? await prisma.invoice.findFirst({ where: { id: targetId, profileId }, select: { id: true } })
      : targetType === "PURCHASE"
        ? await prisma.purchase.findFirst({ where: { id: targetId, profileId }, select: { id: true } })
        : await prisma.proformaInvoice.findFirst({ where: { id: targetId, profileId }, select: { id: true } });
  if (!target) return { success: false, error: "Documento no encontrado para el perfil activo." };

  const amount = numberValue(formData, "amount");
  const withholdings = JSON.parse(text(formData, "withholdings", "[]"));
  const attachment = await paymentAttachmentFromFormData(formData);
  const payment = await prisma.payment.create({
    data: {
      amount,
      date: dateValue(formData, "date"),
      method: text(formData, "method", "BANK_TRANSFER"),
      reference: optionalText(formData, "reference"),
      notes: optionalText(formData, "notes"),
      invoiceId: targetType === "INVOICE" ? targetId : null,
      purchaseId: targetType === "PURCHASE" ? targetId : null,
      proformaInvoiceId: targetType === "PROFORMA" ? targetId : null,
      withholdings: {
        create: withholdings.map((w: any) => ({ type: w.type, amount: Number(w.amount) || 0 })),
      },
      ...(attachment ? { attachments: { create: attachment } } : {}),
    },
  });
  await recomputePaid(targetId, targetType, profileId);
  revalidatePath(targetType === "INVOICE" ? "/invoices" : targetType === "PURCHASE" ? "/purchases" : "/proformas");
  return { success: true, id: payment.id };
}

export async function updatePayment(id: number, formData: FormData) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const existing = await prisma.payment.findFirst({
    where: {
      id,
      OR: [{ invoice: { profileId } }, { purchase: { profileId } }, { proformaInvoice: { profileId } }],
    },
  });
  if (!existing) return { success: false, error: "Pago no encontrado para el perfil activo." };
  const withholdings = JSON.parse(text(formData, "withholdings", "[]"));
  const attachment = await paymentAttachmentFromFormData(formData);
  await prisma.payment.update({
    where: { id },
    data: {
      amount: numberValue(formData, "amount"),
      date: dateValue(formData, "date"),
      method: text(formData, "method", "BANK_TRANSFER"),
      withholdings: { deleteMany: {}, create: withholdings.map((w: any) => ({ type: w.type, amount: Number(w.amount) || 0 })) },
      ...(attachment ? { attachments: { create: attachment } } : {}),
    },
  });
  if (existing?.invoiceId) await recomputePaid(existing.invoiceId, "INVOICE");
  if (existing?.purchaseId) await recomputePaid(existing.purchaseId, "PURCHASE");
  if (existing?.proformaInvoiceId) await recomputePaid(existing.proformaInvoiceId, "PROFORMA");
  revalidatePath("/");
  return { success: true };
}

export async function deletePayment(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const existing = await prisma.payment.findFirst({
    where: {
      id,
      OR: [{ invoice: { profileId } }, { purchase: { profileId } }, { proformaInvoice: { profileId } }],
    },
  });
  if (!existing) return { success: false, error: "Pago no encontrado para el perfil activo." };
  await prisma.payment.delete({ where: { id } });
  if (existing?.invoiceId) await recomputePaid(existing.invoiceId, "INVOICE");
  if (existing?.purchaseId) await recomputePaid(existing.purchaseId, "PURCHASE");
  if (existing?.proformaInvoiceId) await recomputePaid(existing.proformaInvoiceId, "PROFORMA");
  revalidatePath("/");
  return { success: true };
}

// El perfil llega explicito desde recordPayment, que puede venir de un llamador MCP sin
// cookie: sin eso el recalculo no encontraria el documento y el pago quedaria registrado
// pero sin mover el saldo ni el estado.
async function recomputePaid(id: number, type: "INVOICE" | "PURCHASE" | "PROFORMA", explicitProfileId?: number) {
  const profileId = explicitProfileId ?? (await getActiveProfileId());
  const where = type === "INVOICE" ? { invoiceId: id } : type === "PURCHASE" ? { purchaseId: id } : { proformaInvoiceId: id };
  const payments = await prisma.payment.findMany({
    where,
    include: { withholdings: true },
  });
  const paidAmount = payments.reduce((sum, payment) => sum + effectivePaymentAmount(payment), 0);
  if (type === "INVOICE") {
    const invoice = await prisma.invoice.findFirst({ where: { id, profileId } });
    if (invoice) await prisma.invoice.update({ where: { id }, data: { paidAmount, status: statusFor(invoice.total, paidAmount) } });
  } else if (type === "PURCHASE") {
    const purchase = await prisma.purchase.findFirst({ where: { id, profileId } });
    if (purchase) await prisma.purchase.update({ where: { id }, data: { paidAmount, status: statusFor(purchase.total, paidAmount) } });
  } else {
    const proforma = await prisma.proformaInvoice.findFirst({ where: { id, profileId } });
    if (proforma) await prisma.proformaInvoice.update({ where: { id }, data: { paidAmount, status: proformaStatusFor(proforma.total, paidAmount, proforma.status) } });
  }
}

export async function getReceivables(options?: PeriodParams & { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await getActiveProfileId();
  const dueDateRange = getPeriodDateRange(options || {});
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const sortOrder = options?.sortOrder || "asc";
  const orderBy =
    options?.sortBy === "client"
      ? { contact: { name: sortOrder } }
      : { [options?.sortBy === "total" ? "total" : "dueDate"]: sortOrder };
  const invoices = await prisma.invoice.findMany({
    where: {
      profileId,
      ...(Object.keys(dueDateRange).length ? { dueDate: dueDateRange } : {}),
      ...(search
        ? {
            OR: [
              { number: likeTerm(search) },
              { ncf: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true },
    orderBy: orderBy as Prisma.InvoiceOrderByWithRelationInput,
  });
  return invoices.filter((invoice) => invoice.total > invoice.paidAmount).map((invoice) => ({ ...invoice, client: invoice.contact }));
}

export async function getPayables(options?: PeriodParams & { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await getActiveProfileId();
  const dateRange = getPeriodDateRange(options || {});
  const search = options?.search?.trim();
  const amount = parseAmountTerm(search);
  const sortOrder = options?.sortOrder || "asc";
  const orderBy =
    options?.sortBy === "supplier"
      ? { contact: { name: sortOrder } }
      : { [options?.sortBy === "total" ? "total" : "dueDate"]: sortOrder };
  const purchases = await prisma.purchase.findMany({
    where: {
      profileId,
      ...(Object.keys(dateRange).length ? { date: dateRange } : {}),
      ...(search
        ? {
            OR: [
              { number: likeTerm(search) },
              { ncf: likeTerm(search) },
              { supplierName: likeTerm(search) },
              { contact: { name: likeTerm(search) } },
              ...(amount !== null ? [{ total: amountFilter(amount) }] : []),
              { items: { some: { description: likeTerm(search) } } },
            ],
          }
        : {}),
    },
    include: { contact: true },
    orderBy: orderBy as Prisma.PurchaseOrderByWithRelationInput,
  });
  return purchases.filter((purchase) => purchase.total > purchase.paidAmount);
}

export async function getDashboardStats() {
  const profileId = await getActiveProfileId();
  const [invoices, purchases] = await Promise.all([
    prisma.invoice.findMany({ where: { profileId }, include: { contact: true } }),
    prisma.purchase.findMany({ where: { profileId }, include: { contact: true } }),
  ]);
  const totalIncome = invoices.reduce((sum, item) => sum + item.total, 0);
  const totalExpenses = purchases.reduce((sum, item) => sum + item.total, 0);
  const totalReceivable = invoices.reduce((sum, item) => sum + Math.max(0, item.total - item.paidAmount), 0);
  const totalPayable = purchases.reduce((sum, item) => sum + Math.max(0, item.total - item.paidAmount), 0);
  const monthlyData = Array.from({ length: 12 }, (_, month) => ({
    name: new Date(2026, month, 1).toLocaleString("es", { month: "short" }),
    ingresos: invoices.filter((i) => i.date.getMonth() === month).reduce((sum, i) => sum + i.total, 0),
    gastos: purchases.filter((p) => p.date.getMonth() === month).reduce((sum, p) => sum + p.total, 0),
  }));
  const categoryData = Object.values(
    purchases.reduce((acc: Record<string, { name: string; value: number }>, purchase) => {
      const name = purchase.costType || "Otros";
      acc[name] = acc[name] || { name, value: 0 };
      acc[name].value += purchase.total;
      return acc;
    }, {})
  );
  const activity = [
    ...invoices.map((invoice) => ({ id: `i-${invoice.id}`, type: "INVOICE", title: invoice.number, subtitle: invoice.contact.name, amount: invoice.total, date: invoice.date })),
    ...purchases.map((purchase) => ({ id: `p-${purchase.id}`, type: "PURCHASE", title: purchase.number || purchase.ncf || "Compra", subtitle: purchase.contact?.name || purchase.supplierName || "Proveedor", amount: -purchase.total, date: purchase.date })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8);
  return { totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses, totalReceivable, totalPayable, monthlyData, categoryData, activity };
}

function periodRange(period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6)) - 1;
  return { gte: new Date(year, month, 1), lt: new Date(year, month + 1, 1) };
}

export async function getReportData(period: string) {
  const profileId = await getActiveProfileId();
  const range = periodRange(period);
  const [purchases, invoices] = await Promise.all([
    prisma.purchase.findMany({ where: { profileId, date: range, report606: true }, include: { contact: true, payments: { include: { withholdings: true } } }, orderBy: { date: "asc" } }),
    prisma.invoice.findMany({ where: { profileId, date: range }, include: { contact: true, payments: { include: { withholdings: true } } }, orderBy: { date: "asc" } }),
  ]);
  return { purchases, invoices };
}

export async function getIT1Data(period: string) {
  const { purchases, invoices } = await getReportData(period);
  const retenciones = [...purchases, ...invoices].flatMap((doc: any) => doc.payments || []).flatMap((p: any) => p.withholdings || []);
  const retencionesITBIS = retenciones.filter((w: any) => String(w.type).startsWith("ITBIS")).reduce((s: number, w: any) => s + w.amount, 0);
  const retencionesISR = retenciones.filter((w: any) => String(w.type).startsWith("ISR")).reduce((s: number, w: any) => s + w.amount, 0);
  const itbisFacturado = invoices.reduce((sum, invoice) => sum + invoice.tax, 0);
  const itbisPagado = purchases.reduce((sum, purchase) => sum + (purchase.hasFiscalCredit ? purchase.tax : 0), 0);
  return { itbisFacturado, itbisPagado, retencionesITBIS, retencionesISR, balance: itbisFacturado - itbisPagado - retencionesITBIS };
}

export async function createRecurringInvoice(formData: FormData) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const items = parseItems(formData);
  const recurringItems = recurringInvoiceItemsData(items);
  const contactId = await resolveContact(formData, profileId, "CLIENT");
  const projectId = await resolveProject(formData, profileId, contactId);
  const recurring = await prisma.recurringInvoice.create({
    data: {
      contactId,
      projectId,
      ncfSequenceId: optionalNumber(formData, "ncfSequenceId"),
      frequency: text(formData, "frequency", "MONTHLY"),
      dayOfMonth: optionalNumber(formData, "dayOfMonth"),
      startDate: dateValue(formData, "startDate"),
      endDate: optionalDate(formData, "endDate"),
      nextGeneration: dateValue(formData, "startDate"),
      dueDays: numberValue(formData, "dueDays", 30),
      title: optionalText(formData, "title"),
      subtitle: optionalText(formData, "subtitle"),
      notes: optionalText(formData, "notes"),
      profileId,
      items: { create: recurringItems },
    },
  });
  revalidatePath("/invoices/recurring");
  return { success: true, id: recurring.id };
}

export async function createRecurringInvoiceFromInvoice(id: number): Promise<ActionResult> {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const source = await prisma.invoice.findFirst({
    where: { id, profileId },
    include: { items: true },
  });

  if (!source) return { success: false, error: "Factura no encontrada para el perfil activo." };

  const recurringItems = recurringInvoiceItemsData(source.items);
  if (recurringItems.length === 0) {
    return { success: false, error: "La factura no tiene lineas facturables para convertir." };
  }

  const dayOfMonth = source.date.getDate();
  const nextGeneration = nextMonthlyDateForDay(dayOfMonth);
  const dueDays = daysBetween(source.date, source.dueDate) || 30;
  const recurring = await prisma.recurringInvoice.create({
    data: {
      contactId: source.contactId,
      projectId: source.projectId,
      frequency: "MONTHLY",
      dayOfMonth,
      startDate: nextGeneration,
      nextGeneration,
      dueDays,
      title: source.title,
      subtitle: source.subtitle,
      notes: source.notes,
      profileId,
      items: { create: recurringItems },
    },
  });

  revalidatePath("/invoices");
  revalidatePath("/invoices/recurring");
  return { success: true, id: recurring.id, recurringInvoiceId: recurring.id };
}

export async function getRecurringInvoices() {
  const profileId = await getActiveProfileId();
  const invoices = await prisma.recurringInvoice.findMany({
    where: { profileId },
    include: {
      contact: true,
      project: true,
      items: true,
      generatedInvoices: {
        select: { id: true, number: true, date: true, total: true, status: true },
        orderBy: { date: "desc" },
      },
    },
    orderBy: { nextGeneration: "asc" },
  });
  return invoices.map((invoice) => {
    const latestGeneratedInvoice = invoice.generatedInvoices[0] || null;
    const generatedTotal = invoice.generatedInvoices.reduce((sum, generatedInvoice) => sum + generatedInvoice.total, 0);

    return {
      ...invoice,
      client: invoice.contact,
      latestGeneratedInvoice,
      generatedCount: invoice.generatedInvoices.length,
      generatedTotal,
    };
  });
}

export async function toggleRecurringInvoiceStatus(id: number, currentStatus?: string) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const invoice = await prisma.recurringInvoice.findFirst({ where: { id, profileId } });
  if (!invoice) return { success: false, error: "Plantilla no encontrada" };
  const status = currentStatus || invoice.status;
  await prisma.recurringInvoice.update({ where: { id: invoice.id }, data: { status: status === "ACTIVE" ? "PAUSED" : "ACTIVE" } });
  revalidatePath("/invoices/recurring");
  return { success: true };
}

export async function deleteRecurringInvoice(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const result = await prisma.recurringInvoice.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Plantilla no encontrada para el perfil activo." };
  revalidatePath("/invoices/recurring");
  return { success: true };
}

async function createInvoiceFromRecurringTemplate(template: any, issueDate: Date, profileId: number) {
  const date = startOfLocalDay(issueDate);
  const existing = await prisma.invoice.findFirst({
    where: { profileId, recurringInvoiceId: template.id, date },
    select: { id: true },
  });

  if (existing) {
    return { generated: false, invoiceId: existing.id };
  }

  const total = totals(template.items);
  const number = await getNextInvoiceNumber();
  const ncf = template.ncfSequenceId ? await issueNextNcf(template.ncfSequenceId, profileId).catch(() => null) : null;

  const invoice = await prisma.invoice.create({
    data: {
      number,
      ncf,
      date,
      dueDate: addDays(date, Number(template.dueDays) || 30),
      contactId: template.contactId,
      projectId: template.projectId,
      recurringInvoiceId: template.id,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      title: template.title,
      subtitle: template.subtitle,
      notes: template.notes,
      profileId,
      items: {
        create: invoiceItemsData(template.items),
      },
    },
  });

  return { generated: true, invoiceId: invoice.id };
}

export async function generateRecurringInvoiceNow(id: number) {
  await requireWriteAccess();
  const profileId = await getActiveProfileId();
  const template = await prisma.recurringInvoice.findFirst({
    where: { id, profileId },
    include: { items: true },
  });

  if (!template) return { success: false, error: "Plantilla no encontrada para el perfil activo." };

  const result = await createInvoiceFromRecurringTemplate(template, new Date(), profileId);
  await prisma.recurringInvoice.update({
    where: { id: template.id },
    data: { lastGenerated: new Date() },
  });

  revalidatePath("/invoices");
  revalidatePath("/invoices/recurring");
  return { success: true, ...result };
}

export async function processRecurringInvoices() {
  await requireWriteAccess();
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { generatedCount: 0 };
  }

  const profileId = await getActiveProfileId();
  const now = new Date();
  const templates = await prisma.recurringInvoice.findMany({
    where: {
      profileId,
      status: "ACTIVE",
      nextGeneration: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: { items: true },
    orderBy: { nextGeneration: "asc" },
  });

  let generatedCount = 0;

  for (const template of templates) {
    let cursor = new Date(template.nextGeneration);

    while (cursor <= now && (!template.endDate || cursor <= template.endDate)) {
      const result = await createInvoiceFromRecurringTemplate(template, cursor, profileId);
      if (result.generated) generatedCount += 1;
      cursor = nextRecurringDate(cursor, template.frequency, template.dayOfMonth);
    }

    await prisma.recurringInvoice.update({
      where: { id: template.id },
      data: {
        lastGenerated: now,
        nextGeneration: cursor,
        status: template.endDate && cursor > template.endDate ? "COMPLETED" : template.status,
      },
    });
  }

  if (generatedCount > 0) {
    revalidatePath("/invoices");
    revalidatePath("/invoices/recurring");
  }

  return { generatedCount };
}

export async function processInvoiceAction(formData?: FormData) {
  await requireWriteAccess();
  return extractInvoicesWithGemini(formData, "purchase");
}

export async function processSalesInvoiceAction(formData?: FormData) {
  await requireWriteAccess();
  return extractInvoicesWithGemini(formData, "sale");
}

export async function processDGIIQR(qrText: string) {
  try {
    const param = qrParamReader(qrText);
    const moneyParam = (...names: string[]) => {
      for (const name of names) {
        const raw = param(name);
        if (!raw) continue;
        const value = normalizeMoney(raw);
        if (Number.isFinite(value) && value > 0) return value;
      }
      return 0;
    };
    const buyerTaxId = param(...BUYER_TAX_ID_PARAMS);
    const targetProfile = await profileForBuyerTaxId(buyerTaxId);
    const pageDetails = await fetchDgiiTimbreDetails(qrText);
    const targetProfileId = targetProfile?.id || await getActiveProfileId();
    const supplierTaxId = param("RncEmisor", "rnc");
    const ncf = param("eNCF", "ncf");
    const duplicate = await findDuplicatePurchase(targetProfileId, ncf, supplierTaxId);
    if (duplicate) {
      const profileName = targetProfile?.name ? ` en el perfil ${targetProfile.name}` : "";
      const constanciaCount = await prisma.purchaseAttachment.count({
        where: { purchaseId: duplicate.id, type: DGII_CONSTANCIA_TYPE },
      });

      return {
        success: false,
        error: `Esta factura ya fue registrada${profileName}: ${ncf}${supplierTaxId ? ` / RNC ${supplierTaxId}` : ""}. No se abrirá el formulario para evitar duplicarla.`,
        // El QR recien escaneado ya es el enlace del timbre, asi que desde el error se puede
        // adjuntar la constancia a la compra existente sin volver a escanear.
        duplicate: {
          purchaseId: duplicate.id,
          profileId: targetProfileId,
          profileName: targetProfile?.name || null,
          supplierName: duplicate.supplierName || duplicate.contact?.name || "",
          ncf: duplicate.ncf || ncf,
          total: duplicate.total,
          hasConstancia: constanciaCount > 0,
          timbreUrl: isDgiiTimbreUrl(qrText) ? qrText : "",
        },
      };
    }

    return {
      success: true,
      data: {
        supplierTaxId,
        supplierName: pageDetails.supplierName,
        buyerTaxId,
        targetProfileId: targetProfile?.id || null,
        targetProfileName: targetProfile?.name || null,
        ncf,
        total: pageDetails.total || moneyParam("MontoTotal", "Total"),
        taxAmount: pageDetails.taxAmount,
        date: param("FechaEmision"),
        // Se conserva para adjuntar despues la constancia de verificacion de la DGII.
        timbreUrl: isDgiiTimbreUrl(qrText) ? qrText : "",
      },
    };
  } catch {
    return { success: false, error: "El QR no contiene un enlace válido de DGII.", duplicate: null };
  }
}
