import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, invoiceUpdateDefaults, mcpErrorResponse, requireConfirm, requireProfileId, toFormData } from "@/lib/mcp";
import { updateInvoice } from "@/app/actions";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertMcpApiKey(request);
    const { id } = await context.params;
    const body = await request.json();
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    // Same free-typed-ncf restriction as the create route - ncf on an invoice can only
    // come from issueNextNcf() via a sequence, never a caller-supplied string.
    const { ncf: _ignoredNcf, ...rest } = body;
    const defaults = await invoiceUpdateDefaults(Number(id), profileId);
    const formData = toFormData({ ...defaults, ...rest, targetProfileId: profileId });
    const result = await updateInvoice(Number(id), formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
