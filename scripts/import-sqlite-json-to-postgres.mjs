import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const TABLES = [
  "AccountProfile",
  "CompanySettings",
  "CompanyIdentity",
  "Contact",
  "ContactPerson",
  "Project",
  "ProjectShare",
  "NumberingSequence",
  "RecurringInvoice",
  "RecurringInvoiceItem",
  "Quotation",
  "QuotationItem",
  "Invoice",
  "InvoiceItem",
  "Purchase",
  "PurchaseItem",
  "PurchaseAttachment",
  "Payment",
  "Withholding",
  "Subscription",
];

const BOOLEAN_FIELDS = {
  AccountProfile: ["isDefault"],
  CompanyIdentity: ["isDefault"],
  ContactPerson: ["isMain"],
  Invoice: ["includeCoverPage", "includeTermsPage"],
  NumberingSequence: ["isPreferred"],
  Purchase: ["hasFiscalCredit", "report606", "report609", "affectsISR"],
  Quotation: ["includeCoverPage", "includeTermsPage"],
};

const DATE_FIELDS = {
  AccountProfile: ["createdAt", "updatedAt"],
  CompanyIdentity: ["createdAt", "updatedAt"],
  CompanySettings: ["updatedAt"],
  Contact: ["createdAt", "updatedAt"],
  ContactPerson: ["createdAt", "updatedAt"],
  Invoice: ["date", "dueDate", "createdAt", "updatedAt"],
  NumberingSequence: ["expiryDate", "createdAt", "updatedAt"],
  Payment: ["date", "createdAt", "updatedAt"],
  Project: ["startDate", "endDate", "createdAt", "updatedAt"],
  ProjectShare: ["createdAt"],
  Purchase: ["date", "dueDate", "createdAt", "updatedAt"],
  PurchaseAttachment: ["createdAt"],
  PurchaseItem: [],
  Quotation: ["date", "validUntil", "createdAt", "updatedAt"],
  RecurringInvoice: ["startDate", "endDate", "lastGenerated", "nextGeneration", "createdAt", "updatedAt"],
  Subscription: ["startDate", "nextBillingDate", "createdAt", "updatedAt"],
  Withholding: ["createdAt", "updatedAt"],
};

function hasArg(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeValue(table, column, value) {
  if (value === null || value === undefined) return null;
  if ((BOOLEAN_FIELDS[table] || []).includes(column)) return Boolean(value);
  if ((DATE_FIELDS[table] || []).includes(column)) {
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string" && value.trim()) return new Date(value);
  }
  return value;
}

async function tableCount(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)}`);
  return Number(rows[0]?.count || 0);
}

async function resetSequence(prisma, table) {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('${quoteIdent(table)}', 'id'),
      COALESCE((SELECT MAX("id") FROM ${quoteIdent(table)}), 1),
      (SELECT MAX("id") FROM ${quoteIdent(table)}) IS NOT NULL
    )
  `);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Define la URL de Supabase antes de importar.");
  }

  const file = path.resolve(argValue("--file", "tmp_migration/sqlite-export.json"));
  const wipe = hasArg("--wipe");

  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo de exportacion: ${file}`);
  }

  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const prisma = new PrismaClient();

  try {
    const existingCounts = {};
    for (const table of TABLES) existingCounts[table] = await tableCount(prisma, table);
    const hasExistingData = Object.values(existingCounts).some((count) => count > 0);

    if (hasExistingData && !wipe) {
      console.log("La base destino ya tiene datos:");
      for (const [table, count] of Object.entries(existingCounts)) {
        if (count > 0) console.log(`- ${table}: ${count}`);
      }
      throw new Error("Vuelve a correr con --wipe si quieres reemplazar esos datos por la data local.");
    }

    if (wipe) {
      const tableList = TABLES.map(quoteIdent).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
      console.log("Base destino limpiada.");
    }

    for (const table of TABLES) {
      const rows = payload.tables?.[table] || [];
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((column) => normalizeValue(table, column, row[column]));
        const columnSql = columns.map(quoteIdent).join(", ");
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        await prisma.$executeRawUnsafe(
          `INSERT INTO ${quoteIdent(table)} (${columnSql}) VALUES (${placeholders})`,
          ...values,
        );
      }
      await resetSequence(prisma, table);
      console.log(`${table}: ${rows.length} importados`);
    }

    console.log("Migracion completada.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
