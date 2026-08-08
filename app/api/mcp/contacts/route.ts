import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireProfileId } from "@/lib/mcp";
import { getContacts } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const search = searchParams.get("search") || undefined;
    const type = searchParams.get("type") || undefined;
    const contacts = await getContacts({ profileId, search, type });
    return NextResponse.json({ contacts });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
