/**
 * Cuanto pesa la base y cuanto de eso son archivos.
 *
 * Los soportes se guardan como data URI dentro de la propia fila, asi que el tamano de
 * la base y el espacio libre del plan de Supabase dependen sobre todo de cuantos PDFs y
 * fotos se hayan adjuntado. Este script separa una cosa de la otra.
 *
 * Uso (PowerShell):
 *   $env:DATABASE_URL = (firebase apphosting:secrets:access DATABASE_URL --project oasis-contable)
 *   node scripts/medir-base.mjs
 */

import { PrismaClient } from "@prisma/client";

const LIMITE_PLAN_GRATIS = 500 * 1024 * 1024;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Exportala antes de correr el script.");
  process.exit(1);
}

const prisma = new PrismaClient();

function mb(bytes) {
  return `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const [{ total }] = await prisma.$queryRaw`SELECT pg_database_size(current_database()) AS total`;

  const tablas = await prisma.$queryRaw`
    SELECT relname AS tabla, pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 12
  `;

  const [compras] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(LENGTH("storagePath")), 0)::bigint AS bytes
    FROM "PurchaseAttachment"
  `;
  const [pagos] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(LENGTH("storagePath")), 0)::bigint AS bytes
    FROM "PaymentAttachment"
  `;
  const [imagenes] = await prisma.$queryRaw`
    SELECT COALESCE(SUM(LENGTH(COALESCE("coverImageUrl", '')) + LENGTH(COALESCE("logo", ''))), 0)::bigint AS bytes
    FROM "CompanySettings"
  `;

  const archivos = Number(compras.bytes) + Number(pagos.bytes) + Number(imagenes.bytes);

  console.log(`\nBase completa:        ${mb(total)}`);
  console.log(`Limite plan gratis:   ${mb(LIMITE_PLAN_GRATIS)} (${((Number(total) / LIMITE_PLAN_GRATIS) * 100).toFixed(1)}% usado)`);
  console.log(`\nArchivos embebidos en filas: ${mb(archivos)}`);
  console.log(`  Soportes de compra:  ${compras.cantidad} archivos, ${mb(compras.bytes)}`);
  console.log(`  Soportes de pago:    ${pagos.cantidad} archivos, ${mb(pagos.bytes)}`);
  console.log(`  Portadas y logos:    ${mb(imagenes.bytes)}`);
  console.log(`\nTablas mas pesadas:`);
  for (const fila of tablas) {
    console.log(`  ${String(fila.tabla).padEnd(24)} ${mb(fila.bytes)}`);
  }

  const adjuntoMayor = await prisma.$queryRaw`
    SELECT "fileName", LENGTH("storagePath") AS bytes FROM "PurchaseAttachment"
    UNION ALL
    SELECT "fileName", LENGTH("storagePath") AS bytes FROM "PaymentAttachment"
    ORDER BY bytes DESC
    LIMIT 5
  `;
  if (adjuntoMayor.length > 0) {
    console.log(`\nAdjuntos mas pesados:`);
    for (const fila of adjuntoMayor) {
      console.log(`  ${mb(fila.bytes).padStart(9)}  ${fila.fileName}`);
    }
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error("No se pudo medir la base:", error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
