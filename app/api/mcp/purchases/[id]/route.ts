import { NextRequest, NextResponse } from "next/server";
import {
  assertMcpApiKey,
  mcpErrorResponse,
  readMcpJson,
  purchaseAttachmentFormData,
  purchaseUpdateDefaults,
  requireConfirm,
  requireProfileId,
  toFormData,
} from "@/lib/mcp";
import { replacePurchaseAttachment, updatePurchase } from "@/app/actions";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertMcpApiKey(request);
    const { id } = await context.params;
    const body = await readMcpJson(request);
    const profileId = await requireProfileId(body.profileId);
    requireConfirm(body);

    const { attachment, ...rest } = body;
    const attachmentForm = purchaseAttachmentFormData(attachment, profileId);

    const defaults = await purchaseUpdateDefaults(Number(id), profileId);
    const formData = toFormData({ ...defaults, ...rest, targetProfileId: profileId });
    const result = await updatePurchase(Number(id), formData);
    if (!result.success) return NextResponse.json(result, { status: 400 });

    // Reemplaza el soporte anterior, no lo suma: una compra tiene una sola factura de
    // proveedor. Es la misma accion que usa el gestor de adjuntos de la pantalla.
    if (attachmentForm) {
      const attached = await replacePurchaseAttachment(Number(id), attachmentForm);
      if (!attached.success) {
        return NextResponse.json(
          { ...result, attachmentError: attached.error, warning: "La compra se actualizó, pero el soporte no pudo adjuntarse." },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ...result, attached: Boolean(attachmentForm) });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
