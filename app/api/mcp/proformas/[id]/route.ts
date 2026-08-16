import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, proformaUpdateDefaults, requireConfirm, requireProfileId, toFormData } from "@/lib/mcp";
import { updateProforma } from "@/app/actions";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertMcpApiKey(request);
    const { id } = await context.params;
    const body = await request.json();
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    const defaults = await proformaUpdateDefaults(Number(id), profileId);
    const formData = toFormData({ ...defaults, ...body, targetProfileId: profileId });
    const result = await updateProforma(Number(id), formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
