import { readFile } from "fs/promises";
import { extname } from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId } from "@/lib/account-profiles";
import { createZip, safeZipName, type ZipEntry } from "@/lib/zip";

const EXT_POR_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
};

/** Lee el adjunto, ya venga incrustado como data: o de un despliegue viejo con ruta. */
async function readAttachment(storagePath: string) {
  const inline = storagePath.match(/^data:[^;]+;base64,([\s\S]+)$/);
  if (inline) return Buffer.from(inline[1], "base64");

  try {
    return await readFile(storagePath);
  } catch {
    return null;
  }
}

function periodRange(period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6)) - 1;
  return { gte: new Date(year, month, 1), lt: new Date(year, month + 1, 1) };
}

/**
 * Devuelve en un ZIP los soportes de las compras que entran al 606 del periodo, junto a un
 * indice y la lista de las que van a declararse sin comprobante detras. Es el expediente
 * que pide la DGII si revisa: el CSV dice que declaraste y esto lo respalda.
 */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "";
  if (!/^\d{6}$/.test(period)) {
    return NextResponse.json({ error: "Periodo invalido. Se espera AAAAMM." }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  const purchases = await prisma.purchase.findMany({
    where: { profileId, report606: true, date: periodRange(period) },
    include: { contact: true, attachments: true },
    orderBy: { date: "asc" },
  });

  const entries: ZipEntry[] = [];
  const indice = ["fecha,rnc,ncf,proveedor,subtotal,itbis,compra_id,archivo"];
  const faltantes: string[] = [];
  const usados = new Set<string>();

  for (const purchase of purchases) {
    const fecha = purchase.date.toISOString().slice(0, 10);
    const rnc = (purchase.contact?.taxId || purchase.supplierTaxId || "").replace(/\D/g, "");
    const proveedor = purchase.contact?.name || purchase.supplierName || "Sin proveedor";
    const etiqueta = `${fecha} · ${purchase.ncf || "sin NCF"} · ${proveedor} · RD$${purchase.total.toFixed(2)}`;

    if (purchase.attachments.length === 0) {
      faltantes.push(`${etiqueta} — no tiene ningun soporte adjunto`);
      indice.push([fecha, rnc, purchase.ncf || "", proveedor, purchase.subtotal.toFixed(2), purchase.tax.toFixed(2), purchase.id, "SIN SOPORTE"].map(csvCell).join(","));
      continue;
    }

    for (const attachment of purchase.attachments) {
      const contenido = await readAttachment(attachment.storagePath);
      if (!contenido?.length) {
        faltantes.push(`${etiqueta} — el archivo "${attachment.fileName}" ya no esta disponible, hay que volver a subirlo`);
        indice.push([fecha, rnc, purchase.ncf || "", proveedor, purchase.subtotal.toFixed(2), purchase.tax.toFixed(2), purchase.id, "ARCHIVO PERDIDO"].map(csvCell).join(","));
        continue;
      }

      const ext = extname(attachment.fileName).toLowerCase() || EXT_POR_MIME[attachment.mimeType] || ".bin";
      const base = [fecha, safeZipName(proveedor, 45), safeZipName(purchase.ncf || purchase.number || "", 25), `compra-${purchase.id}`]
        .filter(Boolean)
        .join(" _ ");

      // Una compra puede llevar la factura y ademas la constancia de la DGII, asi que el
      // nombre se desempata en vez de pisarse dentro del ZIP.
      let nombre = `${base}${ext}`;
      let n = 2;
      while (usados.has(nombre.toLowerCase())) nombre = `${base} (${n++})${ext}`;
      usados.add(nombre.toLowerCase());

      entries.push({ name: `606-${period}/${nombre}`, content: contenido, date: purchase.date });
      indice.push([fecha, rnc, purchase.ncf || "", proveedor, purchase.subtotal.toFixed(2), purchase.tax.toFixed(2), purchase.id, nombre].map(csvCell).join(","));
    }
  }

  // El BOM es para que Excel abra el indice con las tildes bien.
  entries.push({ name: `606-${period}/indice.csv`, content: Buffer.from("﻿" + indice.join("\r\n"), "utf8") });

  const resumen = faltantes.length
    ? [`Compras del 606 de ${period} sin soporte utilizable: ${faltantes.length}`, "", ...faltantes].join("\r\n")
    : `Todas las compras del 606 de ${period} tienen su soporte descargado.`;
  entries.push({ name: `606-${period}/faltantes.txt`, content: Buffer.from(resumen + "\r\n", "utf8") });

  const zip = createZip(entries);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": `attachment; filename="Soportes_606_${period}.zip"`,
    },
  });
}

function csvCell(value: string | number) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
