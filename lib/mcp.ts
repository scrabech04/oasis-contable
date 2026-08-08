import { prisma } from "@/lib/prisma";

export class McpAuthError extends Error {
  status = 401;
}

export class McpBadRequestError extends Error {
  status = 400;
}

// Same char-code XOR loop as the private signaturesMatch() in lib/auth.ts.
function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function assertMcpApiKey(request: Request) {
  const provided = request.headers.get("x-api-key") || "";
  const expected = process.env.MCP_API_KEY || "";
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    throw new McpAuthError("Unauthorized");
  }
}

// MCP callers never carry the web UI's active_profile_id cookie, so profileId must
// always be explicit here - never fall back to a cookie-derived default profile.
export async function requireProfileId(rawValue: unknown): Promise<number> {
  const id = Number(rawValue);
  if (!Number.isFinite(id) || id <= 0) {
    throw new McpBadRequestError("profileId is required");
  }
  const profile = await prisma.accountProfile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) {
    throw new McpBadRequestError("profileId not found");
  }
  return profile.id;
}

export function requireConfirm(body: Record<string, unknown>) {
  if (body.confirm !== true) {
    throw new McpBadRequestError("confirm must be true - show the user a full summary and get explicit approval first");
  }
}

export function toFormData(body: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return formData;
}

export function mcpErrorResponse(error: unknown) {
  const status = error instanceof McpAuthError ? 401 : error instanceof McpBadRequestError ? 400 : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}
