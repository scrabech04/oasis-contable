import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId } from "@/lib/account-profiles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const attachmentId = Number(id);

  if (!Number.isFinite(attachmentId)) {
    return NextResponse.json({ error: "Adjunto inválido" }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  const attachment = await prisma.purchaseAttachment.findFirst({
    where: {
      id: attachmentId,
      purchase: { profileId },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }

  try {
    const file = await readFile(attachment.storagePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.fileSize),
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo adjunto" }, { status: 404 });
  }
}
