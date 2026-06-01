import { NextResponse } from "next/server";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId, getScopedCompanySettings } from "@/lib/account-profiles";

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

  const company = await getScopedCompanySettings();
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

  const blob = await pdf(createElement(InvoicePDF, { invoice, company, options }) as any).toBlob();

  return new Response(blob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-PDF-Renderer": "react-pdf-fallback",
    },
  });
}
