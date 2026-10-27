// Servicio de aprobacion comercial (obligatorio): el comprador nos dice si acepta o rechaza
// un e-CF que le emitimos. 200 si se recibio bien, 400 si no.
import { environmentFromSegment, isValidReceptorToken, receiveCommercialApproval, receptorRequiresAuth } from "@/lib/ecf/receptor";
import { readXmlFromRequest } from "@/lib/ecf/parse";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ ambiente: string }> }) {
  const env = environmentFromSegment((await params).ambiente);
  if (!env) return new Response("Ambiente no valido.", { status: 404 });
  if (receptorRequiresAuth() && !isValidReceptorToken(env, request.headers.get("authorization"))) {
    return new Response("No autorizado.", { status: 401 });
  }
  const xml = await readXmlFromRequest(request).catch(() => null);
  if (!xml) return new Response("Falta el archivo xml.", { status: 400 });

  try {
    const result = await receiveCommercialApproval(env, xml);
    return new Response(result.message, { status: result.ok ? 200 : 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (error) {
    console.error("[ecf] aprobacion comercial", error);
    return new Response("Error interno.", { status: 500 });
  }
}
