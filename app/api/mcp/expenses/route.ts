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
import { createExpense, getExpenses, replacePurchaseAttachment } from "@/app/actions";

export async function GET(request: NextRequest) {
  try {
    assertMcpApiKey(request);
    const { searchParams } = new URL(request.url);
    const profileId = await requireProfileId(searchParams.get("profileId"));
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const expenses = await getExpenses({
      profileId,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
    });
    return NextResponse.json({ expenses });
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

    // Igual que en compras: el soporte se comprueba antes de crear nada.
    const { attachment, ...rest } = body;
    const attachmentForm = purchaseAttachmentFormData(attachment, profileId);

    const formData = toFormData({ ...rest, targetProfileId: profileId });
    const result = await createExpense(formData);
    if (!result.success) return NextResponse.json(result, { status: 400 });

    if (attachmentForm && result.id) {
      const attached = await replacePurchaseAttachment(result.id, attachmentForm);
      if (!attached.success) {
        return NextResponse.json(
          { ...result, attachmentError: attached.error, warning: "El gasto se guardó, pero el soporte no pudo adjuntarse." },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ...result, attached: Boolean(attachmentForm) });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
