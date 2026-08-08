import { NextRequest, NextResponse } from "next/server";
import { assertMcpApiKey, mcpErrorResponse, requireProfileId } from "@/lib/mcp";
import { getProjects } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const projects = await getProjects({
      profileId,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
