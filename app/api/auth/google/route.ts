import { NextRequest, NextResponse } from "next/server";
import { AUTH_STATE_COOKIE, getAppUrl, getGoogleCallbackUrl } from "@/lib/auth";
import { INVITE_COOKIE } from "@/lib/invite-flow";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(getAppUrl("/login?error=auth_config", request));
  }

  const state = crypto.randomUUID();
  const redirectUri = getGoogleCallbackUrl(request);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // El token de invitacion se recoge aqui y no en la pagina /invite: una pagina es un
  // Server Component y Next no deja escribir cookies durante el render, asi que hacerlo
  // alli dejaba la pantalla colgada en "Preparando la pantalla...".
  const invite = request.nextUrl.searchParams.get("invite");
  if (invite) {
    response.cookies.set(INVITE_COOKIE, invite, {
      httpOnly: true,
      maxAge: 60 * 15,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
