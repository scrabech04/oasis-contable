// Servicio de autenticacion del receptor (opcional en el estandar DGII): entrega la semilla.
import { environmentFromSegment, issueSeed } from "@/lib/ecf/receptor";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ ambiente: string }> }) {
  const env = environmentFromSegment((await params).ambiente);
  if (!env) return new Response("Ambiente no valido.", { status: 404 });
  return new Response(issueSeed(env), { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } });
}
