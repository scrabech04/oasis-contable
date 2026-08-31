import { NextResponse } from "next/server";
import {
  FriendlyError,
  rebuildDgiiEncfTimbre,
  sanitizeDgiiEncfInput,
  searchCodigoSeguridad,
} from "@/lib/dgii-encf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * El historial alimenta la fase futura que ordena la búsqueda por emisor, así que no
 * debe poder tumbar una búsqueda que ya salió bien. Si la migración todavía no corrió en
 * la base, esto falla en silencio y el usuario igual recibe su código.
 */
async function registrarIncidencia(datos: {
  rncEmisor: string;
  encf: string;
  codigoLeido: string;
  codigoCorrecto: string;
  intentos: number;
}) {
  try {
    await prisma.dgiiSecurityCodeFix.create({ data: datos });
  } catch (error) {
    console.error("No se pudo registrar la incidencia de codigo de seguridad:", error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sanitized = sanitizeDgiiEncfInput(body);

  if (!sanitized.ok) {
    return NextResponse.json({ ok: false, message: sanitized.message }, { status: 400 });
  }

  const codigoLeido = sanitized.data.codigoSeguridad;

  try {
    const busqueda = await searchCodigoSeguridad(sanitized.data);

    if (!busqueda.encontrado) {
      const mensajes: Record<typeof busqueda.motivo, string> = {
        hallado: "",
        sin_candidatos: "Ese código no tiene caracteres que se puedan confundir, así que no hay variantes que probar. Revisa el e-NCF y el RNC del emisor.",
        agotado: `Se probaron las ${busqueda.intentos} variantes posibles y ninguna validó. Lo más probable es que el código tenga un carácter leído mal que no está entre los parecidos habituales.`,
        tope: `Se probaron ${busqueda.intentos} variantes sin acertar. Hay demasiados caracteres dudosos: corrige en el formulario los que sí distingas y vuelve a buscar.`,
        rnc_o_encf: "El RNC del emisor o el e-NCF no corresponden a ningún comprobante, así que el código de seguridad no es el problema.",
      };

      return NextResponse.json({
        ok: false,
        encontrado: false,
        message: mensajes[busqueda.motivo],
        intentos: busqueda.intentos,
        candidatosTotales: busqueda.candidatosTotales,
      });
    }

    const codigo = busqueda.codigo as string;
    const data = await rebuildDgiiEncfTimbre({ ...sanitized.data, codigoSeguridad: codigo });

    if (codigo !== codigoLeido) {
      await registrarIncidencia({
        rncEmisor: sanitized.data.rncEmisor,
        encf: sanitized.data.encf,
        codigoLeido,
        codigoCorrecto: codigo,
        intentos: busqueda.intentos,
      });
    }

    return NextResponse.json({
      ok: true,
      encontrado: true,
      codigoSeguridad: codigo,
      intentos: busqueda.intentos,
      candidatosTotales: busqueda.candidatosTotales,
      ...data,
    });
  } catch (error) {
    // searchCodigoSeguridad corta apenas la DGII dice que el par RNC + e-NCF no existe.
    if (error instanceof FriendlyError && error.kind === "bad_rnc_or_encf") {
      return NextResponse.json({
        ok: false,
        encontrado: false,
        message: `${error.message} Corrige el RNC del emisor o el e-NCF: el código de seguridad no es el problema.`,
      });
    }

    if (!(error instanceof FriendlyError)) {
      console.error("search-code failed:", error);
    }

    const message =
      error instanceof FriendlyError
        ? error.message
        : "No fue posible completar la búsqueda en DGII. Intenta nuevamente en unos segundos.";

    return NextResponse.json({ ok: false, encontrado: false, message }, { status: 502 });
  }
}
