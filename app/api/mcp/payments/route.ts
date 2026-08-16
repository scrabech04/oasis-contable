import { NextRequest, NextResponse } from "next/server";
import {
  assertMcpApiKey,
  fileFromMcpAttachment,
  McpBadRequestError,
  mcpErrorResponse,
  requireConfirm,
  requireProfileId,
  toFormData,
} from "@/lib/mcp";
import { recordPayment } from "@/app/actions";

const TARGET_TYPES = ["INVOICE", "PURCHASE", "PROFORMA"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

export async function POST(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const body = await request.json();
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    const targetType = String(body.targetType || "") as TargetType;
    if (!TARGET_TYPES.includes(targetType)) {
      throw new McpBadRequestError(`targetType must be one of ${TARGET_TYPES.join(", ")}`);
    }
    const targetId = Number(body.targetId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      throw new McpBadRequestError("targetId is required");
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new McpBadRequestError("amount must be a positive number");
    }

    const { attachment, targetType: _type, targetId: _id, ...rest } = body;
    const formData = toFormData({ ...rest, amount, targetProfileId: profileId });

    // El soporte es el punto de todo esto: si viene un archivo ilegible o demasiado
    // grande, mejor fallar aqui que registrar el pago y perderlo silenciosamente.
    const file = fileFromMcpAttachment(attachment);
    if (file) formData.set("attachment", file);

    const result = await recordPayment(targetId, targetType, formData);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
