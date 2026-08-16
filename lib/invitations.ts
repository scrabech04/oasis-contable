import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Cuanto vale un enlace de invitacion antes de vencerse. */
export const INVITE_TTL_DAYS = 7;

/**
 * En la base solo se guarda el hash. El token en claro existe una sola vez: en el enlace
 * que el dueno le entrega a la persona. Si alguien lee la base no puede fabricar el enlace.
 */
export function createInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiryFromNow(days = INVITE_TTL_DAYS) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function inviteIsUsable(user: { status: string; inviteExpiresAt: Date | null }) {
  if (user.status !== "INVITED") return false;
  if (!user.inviteExpiresAt) return false;
  return user.inviteExpiresAt.getTime() > Date.now();
}

/**
 * Comparacion en tiempo constante de dos hashes hex, para no filtrar por cuanto tarda en
 * fallar cuantos caracteres del token acerto quien lo intenta.
 */
export function inviteHashMatches(left: string, right: string) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.length !== rightBytes.length || leftBytes.length === 0) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function inviteUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/g, "")}/invite/${token}`;
}
