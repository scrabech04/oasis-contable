"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_PROFILE_COOKIE,
  getActiveProfileId,
  getScopedCompanySettings,
  normalizeProfileTaxId,
} from "@/lib/account-profiles";
import { getPeriodDateRange, type PeriodParams } from "@/lib/list-period";

type ActionResult = { success: true; id?: number; newId?: number; invoiceId?: number; projectId?: number; recurringInvoiceId?: number; proformaId?: number } | { success: false; error: string };

function text(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : fallback;
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

  const contact = await prisma.contact.create({
    data: {
      name,
      taxId: optionalText(formData, "contactTaxId"),
      email: optionalText(formData, "contactEmail"),
      phone: optionalText(formData, "contactPhone"),
      website: optionalText(formData, "contactWebsiteUrl") || optionalText(formData, "supplierWebsiteUrl"),
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

async function resolvePurchaseProfileId(formData: FormData) {
  const requestedProfileId = Number(text(formData, "targetProfileId"));
  if (Number.isFinite(requestedProfileId) && requestedProfileId > 0) {
    const profile = await prisma.accountProfile.findUnique({
      where: { id: requestedProfileId },
      select: { id: true },
    });
    if (profile) return profile.id;
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

function normalizeDateString(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return raw.slice(0, 10);
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

  if (subtotal <= 0 && itemsSubtotal > 0) subtotal = itemsSubtotal;
  if (taxAmount <= 0 && itemsTax > 0) taxAmount = itemsTax;
  if (total <= 0 && itemsTotal > 0) total = itemsTotal;

  if (total > 0 && subtotal > 0 && taxAmount <= 0) {
    taxAmount = Math.max(0, total - subtotal);
  }

  if (total > 0 && taxAmount > 0 && subtotal <= 0) {
    subtotal = Math.max(0, total - taxAmount);
  }

  if (total <= 0 && subtotal > 0) {
    total = subtotal + taxAmount;
  }

  if (subtotal <= 0 && total > 0) {
    subtotal = Math.max(0, total - taxAmount);
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

  return {
    total,
    items: [{
      description: itemDescription,
      quantity: 1,
      baseAmount: subtotal,
      taxAmount,
      price: subtotal,
      taxRate,
    }],
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
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("El soporte supera el limite de 10 MB. Usa un PDF o imagen mas ligera.");
  }

  const mimeType = file.type || "application/octet-stream";
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(mimeType)) {
    throw new Error("Solo se permiten soportes en PDF, JPG, PNG o WEBP.");
  }

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

Si aparece una URL oficial, dominio, sitio web del proveedor o plataforma, devuelve supplierWebsiteUrl. Nunca uses el nombre del proveedor como description del item. Cada factura debe traer exactamente un item resumen en items. El item debe tener description con el concepto principal de la compra si aparece en la factura; si no aparece usa "Compra importada con IA". El item debe tener quantity 1, baseAmount igual al subtotal/base imponible de la factura y taxAmount igual al ITBIS/impuesto total de la factura. El total debe ser el monto total final de la factura. Cada objeto debe tener: type ("FORMAL" o "INFORMAL"), supplierName, supplierTaxId, supplierWebsiteUrl, ncf, date YYYY-MM-DD, dueDate YYYY-MM-DD o null, costType "02" por defecto, category, subtotal, taxAmount, total, taxTreatment ("LOCAL_CREDIT", "LOCAL_NO_CREDIT", "FOREIGN_EXPENSE", "IMPORT_GOODS" o "FOREIGN_WITHHOLDING"), notes, items [{description, quantity, baseAmount, taxAmount}]. Si la factura no tiene ITBIS, usa taxAmount 0 y baseAmount igual al total. Si es proveedor internacional, plataforma digital o no corresponde 606, usa taxTreatment "FOREIGN_EXPENSE" y taxAmount 0. Si falta un dato usa cadena vacia o 0.`
      : `Extrae todas las facturas de venta del archivo. Responde exclusivamente JSON valido, sin Markdown ni explicaciones. La respuesta debe ser un array JSON. Cada objeto debe tener: clientName, clientTaxId, ncf, date YYYY-MM-DD, dueDate YYYY-MM-DD o null, incomeType "01" por defecto, notes, items [{description, quantity, price, taxRate}]. taxRate debe ser porcentaje entero o decimal de porcentaje, por ejemplo 18 para ITBIS 18%, nunca 0.18. Si falta un dato usa cadena vacia o 0.`;

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
  const profileId = await getActiveProfileId();
  const result = await prisma.companyIdentity.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Identidad no encontrada para el perfil activo." };
  revalidatePath("/settings");
  return { success: true };
}

export async function createAccountProfile(formData: FormData) {
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

export async function getContacts(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; type?: string } & PeriodParams) {
  const profileId = await getActiveProfileId();
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
      ...(options?.search
        ? { name: { contains: options.search } }
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

export async function createContact(formData: FormData): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  const persons = JSON.parse(text(formData, "contactPersons", "[]")).filter((p: any) => p.name);
  const contact = await prisma.contact.create({
    data: {
      name: text(formData, "name"),
      taxId: optionalText(formData, "taxId"),
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
  const profileId = await getActiveProfileId();
  const existing = await prisma.contact.findFirst({ where: { id, profileId }, select: { id: true } });
  if (!existing) return { success: false, error: "Contacto no encontrado para el perfil activo." };
  const persons = JSON.parse(text(formData, "contactPersons", "[]")).filter((p: any) => p.name);
  await prisma.contact.update({
    where: { id },
    data: {
      name: text(formData, "name"),
      taxId: optionalText(formData, "taxId"),
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

export async function deleteContact(id: number) {
  const profileId = await getActiveProfileId();
  const result = await prisma.contact.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Contacto no encontrado para el perfil activo." };
  revalidatePath("/contacts");
  return { success: true };
}

export async function getProjects(options?: PeriodParams) {
  const profileId = await getActiveProfileId();
  const period = getPeriodDateRange(options || {});
  return prisma.project.findMany({
    where: {
      ...(period.gte ? { startDate: period } : {}),
      OR: [
        { profileId },
        { sharedWith: { some: { profileId } } },
      ],
    },
    include: { contact: true, profile: true, sharedWith: { include: { profile: true } }, invoices: true, purchases: true, quotations: true },
    orderBy: { updatedAt: "desc" },
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
      invoices: { include: { contact: true, payments: { include: { withholdings: true } } } },
      purchases: true,
      quotations: true,
    },
  });
}

export async function createProject(formData: FormData): Promise<ActionResult> {
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

export async function getNextNcf(sequenceId: number) {
  const profileId = await getActiveProfileId();
  const sequence = await prisma.numberingSequence.findFirst({ where: { id: sequenceId, profileId } });
  if (!sequence) throw new Error("Secuencia no encontrada para el perfil activo.");
  if (sequence.finalNumber && sequence.nextNumber > sequence.finalNumber) {
    throw new Error("Esta secuencia ya agotó su numeración.");
  }
  return `${sequence.prefix}${String(sequence.nextNumber).padStart(8, "0")}`;
}

export async function getNumberingSequences(docType = "INVOICE") {
  const profileId = await getActiveProfileId();
  return prisma.numberingSequence.findMany({
    where: { profileId, docType },
    orderBy: [{ isPreferred: "desc" }, { name: "asc" }],
  });
}

export async function createNumberingSequence(formData: FormData) {
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
  const profileId = await getActiveProfileId();
  const result = await prisma.numberingSequence.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Secuencia no encontrada para el perfil activo." };
  revalidatePath("/settings/numbering");
  return { success: true };
}

export async function getInvoices(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" } & PeriodParams) {
  const profileId = await getActiveProfileId();
  const search = options?.search;
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
              { number: { contains: search } },
              { ncf: { contains: search } },
              { contact: { name: { contains: search } } },
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
  try {
    const profileId = await getActiveProfileId();
    const items = parseItems(formData);
    const total = totals(items);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const projectId = await resolveProject(formData, profileId, contactId);
    const number = await getNextInvoiceNumber();
    const invoice = await prisma.invoice.create({
      data: {
        number,
        ncf: optionalText(formData, "ncf"),
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

    const ncf = text(formData, "ncf");
    if (ncf) {
      await prisma.numberingSequence.updateMany({
        where: { profileId, prefix: ncf.slice(0, 3), nextNumber: Number(ncf.slice(3)) },
        data: { nextNumber: { increment: 1 } },
      });
    }
    revalidatePath("/invoices");
    return { success: true, id: invoice.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible guardar la factura.";
    return { success: false, error: message };
  }
}

export async function updateInvoice(id: number, formData: FormData): Promise<ActionResult> {
  try {
    const profileId = await getActiveProfileId();
    const existing = await prisma.invoice.findFirst({ where: { id, profileId }, select: { id: true, paidAmount: true } });
    if (!existing) return { success: false, error: "Factura no encontrada para el perfil activo." };
    const items = parseItems(formData);
    const total = totals(items);
    const contactId = await resolveContact(formData, profileId, "CLIENT");
    const projectId = await resolveProject(formData, profileId, contactId);
    await prisma.invoice.update({
      where: { id },
      data: {
        ncf: optionalText(formData, "ncf"),
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
  const profileId = await getActiveProfileId();
  const result = await prisma.invoice.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Factura no encontrada para el perfil activo." };
  revalidatePath("/invoices");
  return { success: true };
}

export async function duplicateInvoice(id: number) {
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

export async function getProformas(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" } & PeriodParams) {
  const profileId = await getActiveProfileId();
  const search = options?.search;
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
              { number: { contains: search } },
              { contact: { name: { contains: search } } },
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
  try {
    const profileId = await getActiveProfileId();
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
  try {
    const profileId = await getActiveProfileId();
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
  const profileId = await getActiveProfileId();
  const existing = await prisma.proformaInvoice.findFirst({ where: { id, profileId }, select: { status: true } });
  if (!existing) return { success: false, error: "Prefactura no encontrada para el perfil activo." };
  if (existing.status === "CONVERTED") return { success: false, error: "No se puede eliminar una prefactura convertida." };
  await prisma.proformaInvoice.delete({ where: { id } });
  revalidatePath("/proformas");
  return { success: true };
}

export async function convertProformaToInvoice(id: number, formData?: FormData): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  const proforma = await prisma.proformaInvoice.findFirst({
    where: { id, profileId },
    include: { items: true, payments: { include: { withholdings: true, attachments: true } } },
  });
  if (!proforma) return { success: false, error: "Prefactura no encontrada para el perfil activo." };
  if (proforma.status === "CONVERTED") return { success: false, error: "Esta prefactura ya fue convertida." };
  if ((proforma.paidAmount || 0) < proforma.total) return { success: false, error: "La prefactura debe estar pagada completa antes de emitir la factura fiscal." };
  const ncf = formData ? optionalText(formData, "ncf") : null;
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
    if (ncf) {
      await tx.numberingSequence.updateMany({
        where: { profileId, prefix: ncf.slice(0, 3), nextNumber: Number(ncf.slice(3)) },
        data: { nextNumber: { increment: 1 } },
      });
    }
    return created;
  });
  revalidatePath("/proformas");
  revalidatePath("/invoices");
  return { success: true, id: invoice.id, invoiceId: invoice.id };
}

export async function getPurchases(options?: { sortBy?: string; sortOrder?: "asc" | "desc" } & PeriodParams) {
  const profileId = await getActiveProfileId();
  const period = getPeriodDateRange(options || {});
  return prisma.purchase.findMany({
    where: { profileId, ...(period.gte ? { date: period } : {}) },
    include: { contact: true, project: true, items: true, attachments: true, payments: { include: { withholdings: true, attachments: true } } },
    orderBy: { [options?.sortBy === "createdAt" ? "createdAt" : "date"]: options?.sortOrder || "desc" } as any,
  });
}

export async function getPurchase(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.purchase.findFirst({
    where: { id, profileId },
    include: { contact: true, project: true, items: true, attachments: true, payments: { include: { withholdings: true, attachments: true } } },
  });
}

export async function replacePurchaseAttachment(purchaseId: number, formData: FormData): Promise<ActionResult> {
  try {
    const profileId = await getActiveProfileId();
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

export async function createPurchase(formData: FormData): Promise<ActionResult> {
  const profileId = await resolvePurchaseProfileId(formData);
  const items = parseItems(formData);
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
      supplierWebsiteUrl: optionalText(formData, "supplierWebsiteUrl"),
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
      notes: optionalText(formData, "notes"),
      profileId,
      items: { create: accountingItems.map((item) => ({ ...item, taxRate: normalizeTaxRateValue(item.taxRate), total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + normalizeTaxRateValue(item.taxRate) / 100) })) },
      ...(attachment ? { attachments: { create: attachment } } : {}),
    },
  });
  revalidatePath("/purchases");
  return { success: true, id: purchase.id };
}

export async function updatePurchase(id: number, formData: FormData): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  const existing = await prisma.purchase.findFirst({ where: { id, profileId }, select: { paidAmount: true } });
  if (!existing) return { success: false, error: "Compra no encontrada para el perfil activo." };
  const items = parseItems(formData);
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
      supplierWebsiteUrl: optionalText(formData, "supplierWebsiteUrl"),
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
      ...taxClassification,
      notes: optionalText(formData, "notes"),
      items: { deleteMany: {}, create: accountingItems.map((item) => ({ ...item, taxRate: normalizeTaxRateValue(item.taxRate), total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + normalizeTaxRateValue(item.taxRate) / 100) })) },
    },
  });
  revalidatePath("/purchases");
  return { success: true, id };
}

export async function deletePurchase(id: number) {
  const profileId = await getActiveProfileId();
  const result = await prisma.purchase.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Compra no encontrada para el perfil activo." };
  revalidatePath("/purchases");
  return { success: true };
}

export async function getSubscriptions(options?: PeriodParams) {
  const profileId = await getActiveProfileId();
  const period = getPeriodDateRange(options || {});
  return prisma.subscription.findMany({
    where: { profileId, ...(period.gte ? { createdAt: period } : {}) },
    include: { project: true },
    orderBy: [
      { status: "asc" },
      { nextBillingDate: "asc" },
      { name: "asc" },
    ],
  });
}

export async function createSubscription(formData: FormData): Promise<ActionResult> {
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
  const profileId = await getActiveProfileId();
  const result = await prisma.subscription.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Suscripcion no encontrada para el perfil activo." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function createExpense(formData: FormData) {
  formData.set("type", "INFORMAL");
  return createPurchase(formData);
}

export async function getExpenses(options?: PeriodParams) {
  const profileId = await getActiveProfileId();
  const period = getPeriodDateRange(options || {});
  return prisma.purchase.findMany({
    where: { profileId, type: "INFORMAL", ...(period.gte ? { date: period } : {}) },
    include: { contact: true, items: true, attachments: true },
    orderBy: { date: "desc" },
  });
}

export async function getNextQuotationNumber() {
  const profileId = await getActiveProfileId();
  const last = await prisma.quotation.findFirst({ where: { profileId }, orderBy: { id: "desc" } });
  return `COT-${String((last?.id || 0) + 1).padStart(4, "0")}`;
}

export async function getQuotations(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" } & PeriodParams) {
  const profileId = await getActiveProfileId();
  const search = options?.search;
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
              { number: { contains: search } },
              { contact: { name: { contains: search } } },
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
  const profileId = await getActiveProfileId();
  const items = parseItems(formData);
  const total = totals(items);
  const contactId = await resolveContact(formData, profileId, "CLIENT");
  const projectId = await resolveProject(formData, profileId, contactId);
  const quotation = await prisma.quotation.create({
    data: {
      number: text(formData, "number"),
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
  const profileId = await getActiveProfileId();
  const existing = await prisma.quotation.findFirst({ where: { id, profileId }, select: { id: true } });
  if (!existing) return { success: false, error: "Cotización no encontrada para el perfil activo." };
  const items = parseItems(formData);
  const total = totals(items);
  const contactId = await resolveContact(formData, profileId, "CLIENT");
  const projectId = await resolveProject(formData, profileId, contactId);
  await prisma.quotation.update({
    where: { id },
    data: {
      number: text(formData, "number"),
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
  const profileId = await getActiveProfileId();
  const result = await prisma.quotation.deleteMany({ where: { id, profileId } });
  if (result.count === 0) return { success: false, error: "Cotización no encontrada para el perfil activo." };
  revalidatePath("/quotations");
  return { success: true };
}

export async function duplicateQuotation(id: number) {
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
  const activeProfileId = await getActiveProfileId();
  const quote = await prisma.quotation.findFirst({ where: { id, profileId: activeProfileId }, include: { items: true } });
  if (!quote) return { success: false, error: "Cotización no encontrada" };
  const number = await getNextInvoiceNumber();
  const invoice = await prisma.invoice.create({
    data: {
      number,
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
  const profileId = await getActiveProfileId();
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
  await recomputePaid(targetId, targetType);
  revalidatePath(targetType === "INVOICE" ? "/invoices" : targetType === "PURCHASE" ? "/purchases" : "/proformas");
  return { success: true, id: payment.id };
}

export async function updatePayment(id: number, formData: FormData) {
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

async function recomputePaid(id: number, type: "INVOICE" | "PURCHASE" | "PROFORMA") {
  const profileId = await getActiveProfileId();
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

export async function getReceivables(options?: PeriodParams) {
  const profileId = await getActiveProfileId();
  const dueDateRange = getPeriodDateRange(options || {});
  const invoices = await prisma.invoice.findMany({
    where: {
      profileId,
      ...(Object.keys(dueDateRange).length ? { dueDate: dueDateRange } : {}),
    },
    include: { contact: true },
    orderBy: { dueDate: "asc" },
  });
  return invoices.filter((invoice) => invoice.total > invoice.paidAmount).map((invoice) => ({ ...invoice, client: invoice.contact }));
}

export async function getPayables(options?: PeriodParams) {
  const profileId = await getActiveProfileId();
  const dateRange = getPeriodDateRange(options || {});
  const purchases = await prisma.purchase.findMany({
    where: {
      profileId,
      ...(Object.keys(dateRange).length ? { date: dateRange } : {}),
    },
    include: { contact: true },
    orderBy: { dueDate: "asc" },
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
  const profileId = await getActiveProfileId();
  const invoice = await prisma.recurringInvoice.findFirst({ where: { id, profileId } });
  if (!invoice) return { success: false, error: "Plantilla no encontrada" };
  const status = currentStatus || invoice.status;
  await prisma.recurringInvoice.update({ where: { id: invoice.id }, data: { status: status === "ACTIVE" ? "PAUSED" : "ACTIVE" } });
  revalidatePath("/invoices/recurring");
  return { success: true };
}

export async function deleteRecurringInvoice(id: number) {
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
  let ncf: string | null = null;

  if (template.ncfSequenceId) {
    const sequence = await prisma.numberingSequence.findFirst({
      where: { id: template.ncfSequenceId, profileId },
    });

    if (sequence && (!sequence.finalNumber || sequence.nextNumber <= sequence.finalNumber)) {
      ncf = `${sequence.prefix}${String(sequence.nextNumber).padStart(8, "0")}`;
      await prisma.numberingSequence.update({
        where: { id: sequence.id },
        data: { nextNumber: { increment: 1 } },
      });
    }
  }

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
  return extractInvoicesWithGemini(formData, "purchase");
}

export async function processSalesInvoiceAction(formData?: FormData) {
  return extractInvoicesWithGemini(formData, "sale");
}

export async function processDGIIQR(qrText: string) {
  try {
    const url = new URL(qrText);
    const params = url.searchParams;
    const moneyParam = (...names: string[]) => {
      for (const name of names) {
        const raw = params.get(name);
        if (!raw) continue;
        const value = normalizeMoney(raw);
        if (Number.isFinite(value) && value > 0) return value;
      }
      return 0;
    };
    const buyerTaxId =
      params.get("RncComprador") ||
      params.get("RNCComprador") ||
      params.get("RncReceptor") ||
      params.get("RNCReceptor") ||
      params.get("RncCliente") ||
      params.get("RNCCliente") ||
      "";
    const normalizedBuyerTaxId = normalizeProfileTaxId(buyerTaxId);
    const profiles = normalizedBuyerTaxId
      ? await prisma.accountProfile.findMany({
          select: { id: true, name: true, taxId: true },
        })
      : [];
    const targetProfile = profiles.find(
      (profile) => normalizeProfileTaxId(profile.taxId) === normalizedBuyerTaxId,
    );
    const pageDetails = await fetchDgiiTimbreDetails(qrText);
    const targetProfileId = targetProfile?.id || await getActiveProfileId();
    const supplierTaxId = params.get("RncEmisor") || params.get("rnc") || "";
    const ncf = params.get("eNCF") || params.get("ENCF") || params.get("encf") || params.get("ncf") || "";
    const duplicate = await findDuplicatePurchase(targetProfileId, ncf, supplierTaxId);
    if (duplicate) {
      const profileName = targetProfile?.name ? ` en el perfil ${targetProfile.name}` : "";
      return {
        success: false,
        error: `Esta factura ya fue registrada${profileName}: ${ncf}${supplierTaxId ? ` / RNC ${supplierTaxId}` : ""}. No se abrirá el formulario para evitar duplicarla.`,
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
        total: pageDetails.total || moneyParam("MontoTotal", "Total", "total"),
        taxAmount: pageDetails.taxAmount,
        date: params.get("FechaEmision") || "",
      },
    };
  } catch {
    return { success: false, error: "El QR no contiene un enlace válido de DGII." };
  }
}
