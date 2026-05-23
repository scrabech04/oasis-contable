import { NextResponse } from "next/server";
import { rebuildDgiiEncfTimbre, sanitizeDgiiEncfInput } from "@/lib/dgii-encf";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sanitized = sanitizeDgiiEncfInput(body);

  if (!sanitized.ok) {
    return NextResponse.json({ success: false, error: sanitized.message }, { status: 400 });
  }

  try {
    const data = await rebuildDgiiEncfTimbre(sanitized.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No fue posible consultar la DGII." },
      { status: 500 }
    );
  }
}
