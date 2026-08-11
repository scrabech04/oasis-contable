import { NextResponse } from "next/server";
import { FriendlyError, rebuildDgiiEncfTimbre, sanitizeDgiiEncfInput } from "@/lib/dgii-encf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sanitized = sanitizeDgiiEncfInput(body);

  if (!sanitized.ok) {
    return NextResponse.json(
      { ok: false, success: false, message: sanitized.message, error: sanitized.message },
      { status: 400 }
    );
  }

  try {
    const data = await rebuildDgiiEncfTimbre(sanitized.data);
    return NextResponse.json({ ok: true, success: true, ...data });
  } catch (error) {
    if (!(error instanceof FriendlyError)) {
      console.error("rebuild-encf failed:", error);
    }

    const message =
      error instanceof FriendlyError
        ? error.message
        : "No fue posible completar la consulta en DGII. Intenta nuevamente en unos segundos.";

    return NextResponse.json(
      { ok: false, success: false, message, error: message },
      { status: 502 }
    );
  }
}
