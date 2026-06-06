import { readFile } from "fs/promises";
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

  const inlineAttachment = readInlineAttachment(attachment.storagePath);
  if (inlineAttachment) {
    return new NextResponse(inlineAttachment.file, {
      headers: {
        "Content-Type": attachment.mimeType || inlineAttachment.mimeType,
        "Content-Length": String(inlineAttachment.file.byteLength),
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
      },
    });
  }

  if (attachment.storagePath.startsWith("/workspace/.next/standalone/uploads/")) {
    return NextResponse.json(
      {
        error:
          "Este soporte fue guardado en almacenamiento temporal de un despliegue anterior. Vuelve a subir el PDF o la foto desde el detalle de la compra para dejarlo persistente.",
      },
      { status: 410 }
    );
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
