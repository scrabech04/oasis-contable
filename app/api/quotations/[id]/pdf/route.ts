import { NextResponse } from "next/server";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { QuotationPDF } from "@/components/pdf/QuotationPDF";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId, getScopedCompanySettings } from "@/lib/account-profiles";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const profileId = await getActiveProfileId();
  const quotation = await prisma.quotation.findFirst({
    where: { id: Number(id), profileId },
    include: { contact: true, project: true, items: true },
  });

  if (!quotation) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  const company = await getScopedCompanySettings();
  const searchParams = new URL(request.url).searchParams;
  const optionValue = (key: string, fallback: boolean) => {
    const value = searchParams.get(key);
    if (value === null) return fallback;
    return value === "1" || value === "true";
  };
  const options = {
    includeCoverPage: optionValue("cover", quotation.includeCoverPage),
    includeTermsPage: optionValue("terms", quotation.includeTermsPage),
  };

  const filename = `${quotation.number || `cotizacion-${quotation.id}`}.pdf`;
  const useHtmlRenderer = searchParams.get("renderer") === "html";

  if (useHtmlRenderer) {
    const params = new URLSearchParams({
      pdf: "1",
      cover: options.includeCoverPage ? "1" : "0",
      terms: options.includeTermsPage ? "1" : "0",
    });

    try {
      const { renderRouteToPdfResponse } = await import("@/lib/html-pdf");
      return await renderRouteToPdfResponse(request, `/quotations/${quotation.id}?${params.toString()}`, filename);
    } catch (error) {
      console.error("HTML quotation PDF render failed, falling back to react-pdf:", error);
    }
  }

  const blob = await pdf(createElement(QuotationPDF, { quotation, company, options }) as any).toBlob();

  return new Response(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-PDF-Renderer": "react-pdf-fallback",
    },
  });
}
