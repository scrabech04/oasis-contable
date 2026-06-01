import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  AUTH_STATE_COOKIE,
  createSessionToken,
  decodeJwtPayload,
  getAppUrl,
  getAuthSecret,
  getGoogleCallbackUrl,
  isEmailAllowed,
} from "@/lib/auth";

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

  if (!isEmailAllowed(email)) {
    return loginRedirect(request, "not_allowed");
  }

  const sessionToken = await createSessionToken({
    email,
    name: typeof profile?.name === "string" ? profile.name : email,
    picture: typeof profile?.picture === "string" ? profile.picture : undefined,
  }, authSecret);

  const response = NextResponse.redirect(getAppUrl("/", request));
  response.cookies.set(AUTH_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.delete(AUTH_STATE_COOKIE);
  return response;
}
