import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/account-profiles";
import { allowedProfileIds, getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * Cambio de perfil como POST de formulario normal, no como server action.
 *
 * El contador tiene todas las server actions bloqueadas en el middleware, y esa regla no
 * quiero perforarla con excepciones. Esta ruta es la unica escritura que se le permite, y
 * lo unico que escribe es la cookie de que perfil esta mirando.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const profileId = Number(formData.get("profileId"));
  if (!Number.isFinite(profileId) || profileId <= 0) {
    return NextResponse.json({ error: "Perfil no válido" }, { status: 400 });
  }

  const exists = await prisma.accountProfile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }

  // Un invitado solo puede pararse en los perfiles que le dieron. Sin esto, cambiar la
  // cookie a mano seria suficiente para mirar el otro perfil.
  const allowed = await allowedProfileIds();
  if (allowed !== null && !allowed.includes(profileId)) {
    return NextResponse.json({ error: "No tienes acceso a ese perfil" }, { status: 403 });
  }

  const back = formData.get("returnTo");
  const target = typeof back === "string" && back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const response = NextResponse.redirect(new URL(target, request.url), { status: 303 });
  response.cookies.set(ACTIVE_PROFILE_COOKIE, String(profileId), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
