import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  AUTH_STATE_COOKIE,
  ROLE_ACCOUNTANT,
  createSessionToken,
  decodeJwtPayload,
  getAppUrl,
  getAuthSecret,
  getGoogleCallbackUrl,
} from "@/lib/auth";
import { markLogin, resolveLoginRole } from "@/lib/authz";
import { ACCOUNTANT_HOME } from "@/lib/access";
import { INVITE_COOKIE, acceptPendingInvite } from "@/lib/invite-flow";

function loginRedirect(request: NextRequest, error: string) {
  return NextResponse.redirect(getAppUrl(`/login?error=${error}`, request));
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const authSecret = getAuthSecret();

  if (!clientId || !clientSecret || !authSecret) {
    return loginRedirect(request, "auth_config");
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(AUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginRedirect(request, "invalid_state");
  }

  const redirectUri = getGoogleCallbackUrl(request);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return loginRedirect(request, "token_exchange");
  }

  const tokenData = await tokenResponse.json() as { id_token?: string };
  if (!tokenData.id_token) {
    return loginRedirect(request, "missing_identity");
  }

  const profile = decodeJwtPayload(tokenData.id_token);
  const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : "";
  const emailVerified = profile?.email_verified === true || profile?.email_verified === "true";
  const audience = typeof profile?.aud === "string" ? profile.aud : "";
  const issuer = typeof profile?.iss === "string" ? profile.iss : "";
  const expiresAt = typeof profile?.exp === "number" ? profile.exp : 0;

  if (
    !email ||
    !emailVerified ||
    audience !== clientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(issuer) ||
    expiresAt < Math.floor(Date.now() / 1000)
  ) {
    return loginRedirect(request, "invalid_identity");
  }

  const displayName = typeof profile?.name === "string" ? profile.name : email;

  // Si venia de un enlace de invitacion, se activa aqui: solo despues de que Google
  // confirmo que quien esta al otro lado es dueno del correo al que se invito.
  const pendingInviteToken = request.cookies.get(INVITE_COOKIE)?.value;
  if (pendingInviteToken) {
    await acceptPendingInvite(pendingInviteToken, email, displayName);
  }

  const role = await resolveLoginRole(email);
  if (!role) {
    return loginRedirect(request, "not_allowed");
  }

  const sessionToken = await createSessionToken({
    email,
    name: displayName,
    picture: typeof profile?.picture === "string" ? profile.picture : undefined,
    role,
  }, authSecret);

  await markLogin(email);

  const landing = role === ROLE_ACCOUNTANT ? ACCOUNTANT_HOME : "/";
  const response = NextResponse.redirect(getAppUrl(landing, request));
  response.cookies.set(AUTH_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.delete(AUTH_STATE_COOKIE);
  response.cookies.delete(INVITE_COOKIE);
  return response;
}
