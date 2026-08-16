import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireConfirm, requireProfileId, toFormData } from "@/lib/mcp";
import { convertProformaToInvoice } from "@/app/actions";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertMcpApiKey(request);
    const { id } = await context.params;
    const body = await request.json();
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    const formData = toFormData({ ...body, targetProfileId: profileId });
    const result = await convertProformaToInvoice(Number(id), formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
