import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireConfirm, requireProfileId, toFormData } from "@/lib/mcp";
import { createQuotation, getQuotations } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const search = searchParams.get("search") || undefined;
    const quotations = await getQuotations({
      profileId,
      search,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
    });
    return NextResponse.json({ quotations });
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

    const formData = toFormData({ ...body, targetProfileId: profileId });
    const result = await createQuotation(formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
