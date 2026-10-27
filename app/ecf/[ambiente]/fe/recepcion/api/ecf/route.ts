// Servicio de recepcion de e-CF (obligatorio): otro emisor nos envia un e-CF y le
// devolvemos el acuse de recibo (ARECF) firmado.
import { environmentFromSegment, isValidReceptorToken, receiveEcf, receptorRequiresAuth } from "@/lib/ecf/receptor";
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
    const outcome = await receiveEcf(env, xml);
    return new Response(outcome.body, { status: outcome.status, headers: { "content-type": outcome.contentType } });
  } catch (error) {
    console.error("[ecf] recepcion", error);
    return new Response("Error interno al recibir el e-CF.", { status: 500 });
  }
}
