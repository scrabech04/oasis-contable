import { NextRequest, NextResponse } from "next/server";
import {
  assertMcpApiKey,
  mcpErrorResponse,
  readMcpJson,
  purchaseAttachmentFormData,
  requireConfirm,
  requireProfileId,
  toFormData,
} from "@/lib/mcp";
import { createPurchase, getPurchases, replacePurchaseAttachment } from "@/app/actions";

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
    const body = await readMcpJson(request);
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    // Se valida antes de crear nada: si el soporte no sirve, no queremos la compra
    // registrada y el archivo fuera.
    const { attachment, ...rest } = body;
    const attachmentForm = purchaseAttachmentFormData(attachment, profileId);

    // Force FORMAL explicitly - this is the formal-purchase route, never let a stray
    // body.type sneak an INFORMAL (expense) row in through here.
    const formData = toFormData({ ...rest, targetProfileId: profileId, type: "FORMAL" });
    const result = await createPurchase(formData);
    if (!result.success) return NextResponse.json(result, { status: 400 });

    if (attachmentForm && result.id) {
      const attached = await replacePurchaseAttachment(result.id, attachmentForm);
      if (!attached.success) {
        return NextResponse.json(
          { ...result, attachmentError: attached.error, warning: "La compra se guardó, pero el soporte no pudo adjuntarse." },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ...result, attached: Boolean(attachmentForm) });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
