import { NextResponse } from "next/server";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId, getScopedCompanySettings } from "@/lib/account-profiles";
import { readFile } from "fs/promises";
import path from "path";

/**
 * El logo se configura pegando una URL, pero la unica guardada apuntaba a un dominio que
 * responde 404 y el PDF salia sin logo y sin avisar. Una ruta que empieza por "/" se sirve
 * desde `public/` y aqui se incrusta leyendo el fichero, sin pedirsela por HTTP al propio
 * servidor: asi no depende de que el asset sea publico ni de que dominio se este sirviendo.
 */
async function embeddedLogo(logo: unknown) {
  if (typeof logo !== "string" || !logo.startsWith("/")) return logo;

  try {
    const file = await readFile(path.join(process.cwd(), "public", logo.replace(/^\/+/, "")));
    const ext = path.extname(logo).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${file.toString("base64")}`;
  } catch (error) {
    console.error("No se pudo leer el logo de la empresa:", logo, error);
    return "";
  }
}

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const profileId = await getActiveProfileId();
  const invoice = await prisma.invoice.findFirst({
    where: { id: Number(id), profileId },
    include: { contact: true, project: true, items: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  }

  /**
   * La factura guarda el NCF como texto y no apunta a su secuencia, asi que el vencimiento
   * se busca por el prefijo (`B0100000005` -> `B01`) dentro del mismo perfil. Si esa serie
   * no existe o no tiene fecha, se manda null y el PDF no imprime la linea: una fecha
   * fiscal inventada es peor que no ponerla.
   */
  const ncfPrefix = invoice.ncf ? invoice.ncf.trim().toUpperCase().slice(0, 3) : null;
  const ncfSequence = ncfPrefix
    ? await prisma.numberingSequence.findFirst({
        where: { profileId, prefix: ncfPrefix, expiryDate: { not: null } },
        orderBy: [{ isPreferred: "desc" }, { id: "asc" }],
      })
    : null;

  const company = await getScopedCompanySettings();
  const identity = await prisma.companyIdentity.findFirst({
    where: { profileId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  const pdfCompany = identity
    ? {
        ...company,
        name: identity.name || company.name,
        taxId: identity.taxId || company.taxId,
        email: identity.email || company.email,
        phone: identity.phone || company.phone,
        address: identity.address || company.address,
        logo: identity.logoUrl || company.logo,
        logoUrl: identity.logoUrl || company.logo,
      }
    : company;
  const configuredLogo = ("logoUrl" in pdfCompany ? pdfCompany.logoUrl : null) || pdfCompany.logo;
  const logo = await embeddedLogo(configuredLogo);
  const companyWithLogo = { ...pdfCompany, logo, logoUrl: logo };

  const searchParams = new URL(request.url).searchParams;
  const optionValue = (key: string, fallback: boolean) => {
    const value = searchParams.get(key);
    if (value === null) return fallback;
    return value === "1" || value === "true";
  };
  const options = {
    includeCoverPage: optionValue("cover", invoice.includeCoverPage),
    includeTermsPage: optionValue("terms", invoice.includeTermsPage),
  };

  const filename = `${invoice.number || `factura-${invoice.id}`}.pdf`;
  const useHtmlRenderer = searchParams.get("renderer") === "html";

  if (useHtmlRenderer) {
    const params = new URLSearchParams({
      pdf: "1",
      cover: options.includeCoverPage ? "1" : "0",
      terms: options.includeTermsPage ? "1" : "0",
    });

    try {
      const { renderRouteToPdfResponse } = await import("@/lib/html-pdf");
      return await renderRouteToPdfResponse(request, `/invoices/${invoice.id}?${params.toString()}`, filename);
    } catch (error) {
      console.error("HTML invoice PDF render failed, falling back to react-pdf:", error);
    }
  }

  const blob = await pdf(createElement(InvoicePDF, { invoice: { ...invoice, ncfExpiresAt: ncfSequence?.expiryDate ?? null }, company: companyWithLogo, options }) as any).toBlob();

  return new Response(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-PDF-Renderer": "react-pdf-fallback",
    },
  });
}
