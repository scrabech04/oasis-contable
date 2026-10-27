// Servicio de autenticacion del receptor: recibe la semilla firmada y devuelve un token.
// Responde JSON o XML segun el Accept, con fechas yyyy-MM-ddTHH:mm:ssZ.
import { environmentFromSegment, universalDate, validateSignedSeed } from "@/lib/ecf/receptor";
import { readXmlFromRequest } from "@/lib/ecf/parse";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ ambiente: string }> }) {
  const env = environmentFromSegment((await params).ambiente);
  if (!env) return new Response("Ambiente no valido.", { status: 404 });
  const xml = await readXmlFromRequest(request).catch(() => null);
  if (!xml) return Response.json({ error: "Falta el archivo xml." }, { status: 400 });

  const result = validateSignedSeed(env, xml);
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

  const expira = universalDate(result.expires);
  const expedido = universalDate(result.issued);
  if ((request.headers.get("accept") || "").toLowerCase().includes("xml")) {
    return new Response(
      `<?xml version="1.0" encoding="utf-8"?><RespuestaAutenticacion><token>${result.token}</token><expira>${expira}</expira><expedido>${expedido}</expedido></RespuestaAutenticacion>`,
      { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } },
    );
  }
  return Response.json({ token: result.token, expira, expedido });
}
