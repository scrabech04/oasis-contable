import { NextResponse } from "next/server";
import { rebuildDgiiEncfTimbre, sanitizeDgiiEncfInput } from "@/lib/dgii-encf";

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
    const message = error instanceof Error ? error.message : "No fue posible consultar la DGII.";
    return NextResponse.json(
      { ok: false, success: false, message, error: message },
      { status: 500 }
    );
  }
}
