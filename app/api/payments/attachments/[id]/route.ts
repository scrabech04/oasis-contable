import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId } from "@/lib/account-profiles";

function readInlineAttachment(storagePath: string) {
  const match = storagePath.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  try {
    return {
      mimeType: match[1],
      file: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const attachmentId = Number(id);

  if (!Number.isFinite(attachmentId)) {
    return NextResponse.json({ error: "Adjunto invalido" }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  const attachment = await prisma.paymentAttachment.findFirst({
    where: {
      id: attachmentId,
      payment: {
        OR: [
          { invoice: { profileId } },
          { purchase: { profileId } },
          { proformaInvoice: { profileId } },
        ],
      },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }

  const inlineAttachment = readInlineAttachment(attachment.storagePath);
  if (!inlineAttachment) {
    return NextResponse.json({ error: "No se pudo leer el archivo adjunto" }, { status: 404 });
  }

  return new NextResponse(inlineAttachment.file, {
    headers: {
      "Content-Type": attachment.mimeType || inlineAttachment.mimeType,
      "Content-Length": String(inlineAttachment.file.byteLength),
      "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
    },
  });
}
