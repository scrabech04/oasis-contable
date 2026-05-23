import { NextResponse } from "next/server";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { QuotationPDF } from "@/components/pdf/QuotationPDF";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId, getScopedCompanySettings } from "@/lib/account-profiles";

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
  const blob = await pdf(createElement(QuotationPDF, { quotation, company, options }) as any).toBlob();

  return new Response(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotation.number || `cotizacion-${quotation.id}`}.pdf"`,
    },
  });
}
