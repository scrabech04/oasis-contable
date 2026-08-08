import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireConfirm, requireProfileId, toFormData } from "@/lib/mcp";
import { createPurchase, getPurchases } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const purchases = await getPurchases({
      profileId,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
    });
    return NextResponse.json({ purchases });
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

    // Force FORMAL explicitly - this is the formal-purchase route, never let a stray
    // body.type sneak an INFORMAL (expense) row in through here.
    const formData = toFormData({ ...body, targetProfileId: profileId, type: "FORMAL" });
    const result = await createPurchase(formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
