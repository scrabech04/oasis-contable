import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, getAppUrl } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(getAppUrl("/login", request));
  response.cookies.delete(AUTH_SESSION_COOKIE);
  return response;
}
