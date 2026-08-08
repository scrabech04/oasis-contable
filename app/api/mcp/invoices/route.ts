import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireConfirm, requireProfileId, toFormData } from "@/lib/mcp";
import { createInvoice, getInvoices } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const search = searchParams.get("search") || undefined;
    const invoices = await getInvoices({
      profileId,
      search,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
    });
    return NextResponse.json({ invoices });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const body = await request.json();
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    // Never accept a free-typed ncf string on the write path - only ncfSequenceId,
    // so issueNextNcf() is the sole source of truth for fiscal numbering.
    const { ncf: _ignoredNcf, ...rest } = body;
    const formData = toFormData({ ...rest, targetProfileId: profileId });
    const result = await createInvoice(formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
