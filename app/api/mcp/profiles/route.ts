import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse } from "@/lib/mcp";
import { getAccountProfiles } from "@/lib/account-profiles";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const profiles = await getAccountProfiles();
    return NextResponse.json({ profiles });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
