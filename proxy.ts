import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, getAuthSecret, isAccountantSession, verifySessionToken } from "@/lib/auth";
import { ACCOUNTANT_HOME, accountantCanOpen, isServerActionRequest } from "@/lib/access";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/logout",
  // La invitacion se abre sin sesion a proposito: quien la recibe todavia no tiene una.
  // El token se valida en la pagina, no aqui.
  "/invite",
  // MCP routes enforce their own x-api-key auth (see lib/mcp.ts) instead of the
  // browser session cookie - an external MCP server process has no cookie to send.
  "/api/mcp",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** El contador necesita cerrar sesion y cambiar de perfil; nada mas bajo /api. */
function accountantCanCallApi(pathname: string) {
  return pathname === "/api/auth/logout" || pathname === "/api/active-profile";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/images/")
  ) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(AUTH_SESSION_COOKIE)?.value, getAuthSecret());

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAccountantSession(session)) {
    // Toda server action es un POST con la cabecera `next-action`. Rechazarlas en bloque es
    // lo que hace que la cuenta sea de solo lectura sin tener que enumerar las mas de
    // cincuenta acciones que existen ni acordarse de las que se agreguen despues.
    if (isServerActionRequest(request)) {
      return NextResponse.json({ error: "Tu cuenta es de solo lectura." }, { status: 403 });
    }

    if (pathname.startsWith("/api/")) {
      if (!accountantCanCallApi(pathname)) {
        return NextResponse.json({ error: "Tu cuenta es de solo lectura." }, { status: 403 });
      }
      return NextResponse.next();
    }

    if (!accountantCanOpen(pathname)) {
      return NextResponse.redirect(new URL(ACCOUNTANT_HOME, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
