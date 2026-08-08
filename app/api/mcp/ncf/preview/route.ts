import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireProfileId } from "@/lib/mcp";
import { getNcfPreview } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const sequenceId = Number(searchParams.get("sequenceId"));
    if (!Number.isFinite(sequenceId) || sequenceId <= 0) {
      return NextResponse.json({ error: "sequenceId is required" }, { status: 400 });
    }
    const ncf = await getNcfPreview(sequenceId, profileId);
    return NextResponse.json({ ncf });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
