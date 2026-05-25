"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_PROFILE_COOKIE,
  getActiveProfileId,
  getScopedCompanySettings,
  normalizeProfileTaxId,
} from "@/lib/account-profiles";

type ActionResult = { success: true; id?: number; newId?: number; invoiceId?: number; projectId?: number } | { success: false; error: string };

const PURCHASE_UPLOAD_DIR = path.join(process.cwd(), "uploads", "purchases");

function text(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
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

function totals(items: any[]) {
  const subtotal = items.reduce((sum, item) => {
    if (item.itemType && item.itemType !== "ITEM") return sum;
    return sum + (Number(item.quantity) || 0) * (Number(item.price) || 0);
  }, 0);
  const tax = items.reduce((sum, item) => {
    if (item.itemType && item.itemType !== "ITEM") return sum;
    const line = (Number(item.quantity) || 0) * (Number(item.price) || 0);
    return sum + line * ((Number(item.taxRate) || 0) / 100);
  }, 0);
  return { subtotal, tax, total: subtotal + tax };
}

function statusFor(total: number, paidAmount: number) {
  if (paidAmount <= 0) return "OPEN";
  if (paidAmount >= total) return "PAID";
  return "PARTIAL";
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
      type: fallbackType,
      profileId,
    },
  });

  return contact.id;
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
        "user-agent": "Mozilla/5.0 compatible; OasisContable/1.0",
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
    const taxRate = Number.isFinite(Number(item.taxRate))
      ? Number(item.taxRate)
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
    const value = normalizeMoney(row?.[key]);
    if (value > 0) return value;
  }
  return 0;
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
  return {
    total,
    items: [{
      description: String(row.description || row.category || fallbackDescription || "Compra importada con IA"),
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

async function savePurchaseEvidenceFile(file: File, profileId: number) {
  const profileDir = path.join(PURCHASE_UPLOAD_DIR, String(profileId));
  await mkdir(profileDir, { recursive: true });

  const originalName = safeFileName(file.name || "soporte");
  const ext = path.extname(originalName);
  const base = ext ? originalName.slice(0, -ext.length) : originalName;
  const storedName = `${Date.now()}-${randomUUID()}-${base}${ext}`;
  const storagePath = path.join(profileDir, storedName);

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(storagePath, bytes);

  return {
    fileName: file.name || originalName,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    storagePath,
  };
}

function attachmentFromFormData(formData: FormData) {
  const storagePath = optionalText(formData, "attachmentStoragePath");
  const fileName = optionalText(formData, "attachmentFileName");
  const mimeType = optionalText(formData, "attachmentMimeType");
  const fileSize = numberValue(formData, "attachmentFileSize", 0);

  if (!storagePath || !fileName || !mimeType || fileSize <= 0) return null;

  return {
    fileName,
    mimeType,
    fileSize,
    storagePath,
    type: "ORIGINAL_INVOICE",
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

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const prompt =
    mode === "purchase"
      ? `Extrae todas las facturas de compra o gastos del archivo. Responde exclusivamente JSON valido, sin Markdown ni explicaciones. La respuesta debe ser un array JSON, con un objeto por cada factura o comprobante, no por cada producto. No desgloses los productos de la factura. Cada factura debe traer exactamente un item resumen en items. El item debe tener description "Compra importada con IA", quantity 1, baseAmount igual al subtotal/base imponible de la factura y taxAmount igual al ITBIS/impuesto total de la factura. El total debe ser el monto total final de la factura. Cada objeto debe tener: type ("FORMAL" o "INFORMAL"), supplierName, supplierTaxId, ncf, date YYYY-MM-DD, dueDate YYYY-MM-DD o null, costType "02" por defecto, category, subtotal, taxAmount, total, taxTreatment ("LOCAL_CREDIT", "LOCAL_NO_CREDIT", "FOREIGN_EXPENSE", "IMPORT_GOODS" o "FOREIGN_WITHHOLDING"), notes, items [{description, quantity, baseAmount, taxAmount}]. Si la factura no tiene ITBIS, usa taxAmount 0 y baseAmount igual al total. Si es proveedor internacional, plataforma digital o no corresponde 606, usa taxTreatment "FOREIGN_EXPENSE" y taxAmount 0. Si falta un dato usa cadena vacia o 0.`
      : `Extrae todas las facturas de venta del archivo. Responde exclusivamente JSON valido, sin Markdown ni explicaciones. La respuesta debe ser un array JSON. Cada objeto debe tener: clientName, clientTaxId, ncf, date YYYY-MM-DD, dueDate YYYY-MM-DD o null, incomeType "01" por defecto, notes, items [{description, quantity, price, taxRate}]. Si falta un dato usa cadena vacia o 0.`;

  try {
    const result = await model.generateContent([prompt, await fileToGenerativePart(file)]);
    const responseText = result.response.text();
    const rows = extractJsonArray(responseText);
    if (rows.length === 0) {
      return {
        success: false as const,
        error: `No se detectaron facturas en el archivo. El modelo ${modelName} respondió, pero no devolvió un JSON de facturas reconocible.`,
        data: null,
      };
    }

    const data =
      mode === "purchase"
        ? rows.map((row: any) => {
            const supplierName = String(row.supplierName || row.vendorName || row.contactName || "Proveedor sin identificar");
            const normalized = normalizePurchaseSingleItem(row, supplierName);
            return {
              type: row.type === "INFORMAL" ? "INFORMAL" : "FORMAL",
              taxTreatment: String(row.taxTreatment || (row.type === "INFORMAL" ? "LOCAL_NO_CREDIT" : "LOCAL_CREDIT")),
              supplierName,
              supplierTaxId: String(row.supplierTaxId || row.taxId || ""),
              ncf: String(row.ncf || row.encf || "").toUpperCase(),
              date: normalizeDateString(row.date),
              dueDate: row.dueDate ? normalizeDateString(row.dueDate) : normalizeDateString(row.date),
              costType: String(row.costType || "02"),
              category: String(row.category || "Otros"),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false as const, error: `No fue posible procesar el archivo con IA usando ${modelName}: ${message}`, data: null };
  }
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
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      name: text(formData, "name"),
      taxId: text(formData, "taxId"),
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      currency: text(formData, "currency", "RD$"),
    },
  });
  revalidatePath("/settings");
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

export async function getContacts(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc"; type?: string }) {
  const profileId = await getActiveProfileId();
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

export async function getProjects() {
  const profileId = await getActiveProfileId();
  return prisma.project.findMany({
    where: {
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
    include: { contact: true, profile: true, sharedWith: { include: { profile: true } }, invoices: { include: { contact: true } }, purchases: true, quotations: true },
  });
}

export async function createProject(formData: FormData): Promise<ActionResult> {
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
      code: text(formData, "code"),
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

export async function getInvoices(options?: { search?: string; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await getActiveProfileId();
  const search = options?.search;
  const orderBy =
    options?.sortBy === "client"
      ? { contact: { name: options.sortOrder || "asc" } }
      : { [options?.sortBy === "total" ? "total" : "date"]: options?.sortOrder || "desc" };
  return prisma.invoice.findMany({
    where: {
      profileId,
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
    include: { contact: true, project: true, items: true, payments: { include: { withholdings: true } } },
    orderBy: orderBy as any,
  });
}

export async function getInvoice(id: number) {
  const profileId = await getActiveProfileId();
  const invoice = await prisma.invoice.findFirst({
    where: { id, profileId },
    include: { contact: true, project: true, items: true, payments: { include: { withholdings: true }, orderBy: { date: "desc" } } },
  });
  return invoice ? { ...invoice, client: invoice.contact } : null;
}

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const profileId = await getActiveProfileId();
  const items = parseItems(formData);
  const total = totals(items);
  const contactId = await resolveContact(formData, profileId, "CLIENT");
  const projectId = await resolveProject(formData, profileId, contactId);
  const last = await prisma.invoice.findFirst({ where: { profileId }, orderBy: { id: "desc" } });
  const invoice = await prisma.invoice.create({
    data: {
      number: `INV-${String((last?.id || 0) + 1).padStart(4, "0")}`,
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
      items: { create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
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
}

export async function updateInvoice(id: number, formData: FormData): Promise<ActionResult> {
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
      items: { deleteMany: {}, create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
    },
  });
  revalidatePath("/invoices");
  return { success: true, id };
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
      items: { create: source.items.map(({ id: _id, invoiceId: _invoiceId, ...item }) => item) },
    },
  });
  revalidatePath("/invoices");
  return { success: true, id: created.id, newId: created.id };
}

export async function getPurchases(options?: { sortBy?: string; sortOrder?: "asc" | "desc" }) {
  const profileId = await getActiveProfileId();
  return prisma.purchase.findMany({
    where: { profileId },
    include: { contact: true, project: true, items: true, attachments: true, payments: { include: { withholdings: true } } },
    orderBy: { [options?.sortBy === "createdAt" ? "createdAt" : "date"]: options?.sortOrder || "desc" } as any,
  });
}

export async function getPurchase(id: number) {
  const profileId = await getActiveProfileId();
  return prisma.purchase.findFirst({
    where: { id, profileId },
    include: { contact: true, project: true, items: true, attachments: true, payments: { include: { withholdings: true } } },
  });
}

export async function createPurchase(formData: FormData): Promise<ActionResult> {
  const profileId = await resolvePurchaseProfileId(formData);
  const items = parseItems(formData);
  const total = totals(items);
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
      contactId: finalContactId,
      projectId,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      costType: text(formData, "costType", "02"),
      ...taxClassification,
      notes: optionalText(formData, "notes"),
      profileId,
      items: { create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
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
  const total = totals(items);
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
      contactId,
      projectId,
      subtotal: total.subtotal,
      tax: total.tax,
      total: total.total,
      status: statusFor(total.total, existing?.paidAmount || 0),
      costType: text(formData, "costType", "02"),
      ...taxClassification,
      notes: optionalText(formData, "notes"),
      items: { deleteMany: {}, create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
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

export async function getSubscriptions() {
  const profileId = await getActiveProfileId();
  return prisma.subscription.findMany({
    where: { profileId },
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
      currency: text(formData, "currency", "RD$"),
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

export async function getExpenses() {
  const profileId = await getActiveProfileId();
  return prisma.purchase.findMany({
    where: { profileId, type: "INFORMAL" },
    include: { contact: true, items: true, attachments: true },
    orderBy: { date: "desc" },
  });
}

export async function getNextQuotationNumber() {
  const profileId = await getActiveProfileId();
  const last = await prisma.quotation.findFirst({ where: { profileId }, orderBy: { id: "desc" } });
  return `COT-${String((last?.id || 0) + 1).padStart(4, "0")}`;
}

export async function getQuotations() {
  const profileId = await getActiveProfileId();
  return prisma.quotation.findMany({
    where: { profileId },
    include: { contact: true, project: true, items: true },
    orderBy: { date: "desc" },
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
  const last = await prisma.invoice.findFirst({ where: { profileId: quote.profileId }, orderBy: { id: "desc" } });
  const invoice = await prisma.invoice.create({
    data: {
      number: `INV-${String((last?.id || 0) + 1).padStart(4, "0")}`,
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
      items: { create: quote.items.map(({ id: _id, quotationId: _quotationId, ...item }) => item) },
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

export async function recordPayment(targetId: number, targetType: "INVOICE" | "PURCHASE", formData: FormData) {
  const profileId = await getActiveProfileId();
  const target =
    targetType === "INVOICE"
      ? await prisma.invoice.findFirst({ where: { id: targetId, profileId }, select: { id: true } })
      : await prisma.purchase.findFirst({ where: { id: targetId, profileId }, select: { id: true } });
  if (!target) return { success: false, error: "Documento no encontrado para el perfil activo." };

  const amount = numberValue(formData, "amount");
  const withholdings = JSON.parse(text(formData, "withholdings", "[]"));
  const payment = await prisma.payment.create({
    data: {
      amount,
      date: dateValue(formData, "date"),
      method: text(formData, "method", "BANK_TRANSFER"),
      reference: optionalText(formData, "reference"),
      notes: optionalText(formData, "notes"),
      invoiceId: targetType === "INVOICE" ? targetId : null,
      purchaseId: targetType === "PURCHASE" ? targetId : null,
      withholdings: {
        create: withholdings.map((w: any) => ({ type: w.type, amount: Number(w.amount) || 0 })),
      },
    },
  });
  await recomputePaid(targetId, targetType);
  revalidatePath(targetType === "INVOICE" ? "/invoices" : "/purchases");
  return { success: true, id: payment.id };
}

export async function updatePayment(id: number, formData: FormData) {
  const profileId = await getActiveProfileId();
  const existing = await prisma.payment.findFirst({
    where: {
      id,
      OR: [{ invoice: { profileId } }, { purchase: { profileId } }],
    },
  });
  if (!existing) return { success: false, error: "Pago no encontrado para el perfil activo." };
  const withholdings = JSON.parse(text(formData, "withholdings", "[]"));
  await prisma.payment.update({
    where: { id },
    data: {
      amount: numberValue(formData, "amount"),
      date: dateValue(formData, "date"),
      method: text(formData, "method", "BANK_TRANSFER"),
      withholdings: { deleteMany: {}, create: withholdings.map((w: any) => ({ type: w.type, amount: Number(w.amount) || 0 })) },
    },
  });
  if (existing?.invoiceId) await recomputePaid(existing.invoiceId, "INVOICE");
  if (existing?.purchaseId) await recomputePaid(existing.purchaseId, "PURCHASE");
  revalidatePath("/");
  return { success: true };
}

export async function deletePayment(id: number) {
  const profileId = await getActiveProfileId();
  const existing = await prisma.payment.findFirst({
    where: {
      id,
      OR: [{ invoice: { profileId } }, { purchase: { profileId } }],
    },
  });
  if (!existing) return { success: false, error: "Pago no encontrado para el perfil activo." };
  await prisma.payment.delete({ where: { id } });
  if (existing?.invoiceId) await recomputePaid(existing.invoiceId, "INVOICE");
  if (existing?.purchaseId) await recomputePaid(existing.purchaseId, "PURCHASE");
  revalidatePath("/");
  return { success: true };
}

async function recomputePaid(id: number, type: "INVOICE" | "PURCHASE") {
  const profileId = await getActiveProfileId();
  const where = type === "INVOICE" ? { invoiceId: id } : { purchaseId: id };
  const aggregate = await prisma.payment.aggregate({ where, _sum: { amount: true } });
  const paidAmount = aggregate._sum.amount || 0;
  if (type === "INVOICE") {
    const invoice = await prisma.invoice.findFirst({ where: { id, profileId } });
    if (invoice) await prisma.invoice.update({ where: { id }, data: { paidAmount, status: statusFor(invoice.total, paidAmount) } });
  } else {
    const purchase = await prisma.purchase.findFirst({ where: { id, profileId } });
    if (purchase) await prisma.purchase.update({ where: { id }, data: { paidAmount, status: statusFor(purchase.total, paidAmount) } });
  }
}

export async function getReceivables() {
  const profileId = await getActiveProfileId();
  const invoices = await prisma.invoice.findMany({
    where: { profileId },
    include: { contact: true },
    orderBy: { dueDate: "asc" },
  });
  return invoices.filter((invoice) => invoice.total > invoice.paidAmount).map((invoice) => ({ ...invoice, client: invoice.contact }));
}

export async function getPayables() {
  const profileId = await getActiveProfileId();
  const purchases = await prisma.purchase.findMany({
    where: { profileId },
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
      items: { create: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.price) || 0) * (1 + (Number(item.taxRate) || 0) / 100) })) },
    },
  });
  revalidatePath("/invoices/recurring");
  return { success: true, id: recurring.id };
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
  const last = await prisma.invoice.findFirst({ where: { profileId }, orderBy: { id: "desc" } });
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
      number: `INV-${String((last?.id || 0) + 1).padStart(4, "0")}`,
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
        create: template.items.map(({ id: _id, recurringInvoiceId: _recurringInvoiceId, ...item }: any) => item),
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

    return {
      success: true,
      data: {
        supplierTaxId: params.get("RncEmisor") || params.get("rnc") || "",
        supplierName: pageDetails.supplierName,
        buyerTaxId,
        targetProfileId: targetProfile?.id || null,
        targetProfileName: targetProfile?.name || null,
        ncf: params.get("eNCF") || params.get("ENCF") || params.get("encf") || params.get("ncf") || "",
        total: pageDetails.total || moneyParam("MontoTotal", "Total", "total"),
        taxAmount: pageDetails.taxAmount,
        date: params.get("FechaEmision") || "",
      },
    };
  } catch {
    return { success: false, error: "El QR no contiene un enlace válido de DGII." };
  }
}
