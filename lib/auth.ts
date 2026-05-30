export const AUTH_SESSION_COOKIE = "oasis_session";
export const AUTH_STATE_COOKIE = "oasis_oauth_state";

export type AuthSession = {
  email: string;
  name?: string;
  picture?: string;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlEncode(value: string) {
  return bytesToBase64(encoder.encode(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return decoder.decode(base64ToBytes(padded));
}

async function hmacSignature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function signaturesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export function getAllowedAuthEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS || process.env.GOOGLE_ALLOWED_EMAILS || process.env.GOOGLE_AUTH_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string) {
  const allowedEmails = getAllowedAuthEmails();
  if (allowedEmails.length === 0) return false;
  return allowedEmails.includes(email.trim().toLowerCase());
}

export function getAuthOrigin(request: { url: string; headers: { get(name: string): string | null } }) {
  const configuredOrigin = process.env.AUTH_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "";
  if (configuredOrigin) return configuredOrigin.replace(/\/+$/g, "");

  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(request.url).origin;
}

export function getGoogleCallbackUrl(request: { url: string; headers: { get(name: string): string | null } }) {
  return `${getAuthOrigin(request)}/api/auth/google/callback`;
}

export async function createSessionToken(
  input: Omit<AuthSession, "exp">,
  secret: string,
  maxAgeSeconds = 60 * 60 * 24 * 30
) {
  const payload = base64UrlEncode(JSON.stringify({
    ...input,
    email: input.email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }));
  const signature = await hmacSignature(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, secret: string) {
  if (!token || !secret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = await hmacSignature(payload, secret);
  if (!signaturesMatch(signature, expectedSignature)) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as AuthSession;
    if (!session.email || !session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(base64UrlDecode(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
