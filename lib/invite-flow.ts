import { prisma } from "@/lib/prisma";
import { hashInviteToken, inviteHashMatches, inviteIsUsable } from "@/lib/invitations";

/** Guarda el token mientras la persona se va a Google y vuelve. */
export const INVITE_COOKIE = "oasis_pending_invite";

export type InvitePreview = {
  email: string;
  role: string;
  profileNames: string[];
  invitedByEmail: string | null;
};

/**
 * Lee la invitacion para mostrarsela a quien abre el enlace, sin activarla todavia.
 * Devuelve null si el token no existe, ya se uso o se vencio.
 */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const user = await findInvitedUserByToken(token);
  if (!user) return null;
  return {
    email: user.email,
    role: user.role,
    profileNames: user.profiles.map((row) => row.profile.name),
    invitedByEmail: user.invitedByEmail,
  };
}

/**
 * Activa la invitacion, pero solo si el correo con el que la persona acaba de autenticarse
 * en Google es exactamente el que se invito.
 *
 * Ese cotejo es lo que impide que el enlace sirva si se reenvia o se filtra: quien lo tenga
 * necesita ademas la cuenta de Google de ese correo.
 */
export async function acceptPendingInvite(token: string, googleEmail: string, name: string) {
  const user = await findInvitedUserByToken(token);
  if (!user) return false;
  if (user.email !== googleEmail.trim().toLowerCase()) return false;

  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      status: "ACTIVE",
      acceptedAt: new Date(),
      name: user.name || name,
      // El token se quema al usarlo: el enlace no sirve una segunda vez.
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
  return true;
}

async function findInvitedUserByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const user = await prisma.appUser.findUnique({
    where: { inviteTokenHash: tokenHash },
    include: { profiles: { include: { profile: { select: { name: true } } } } },
  });
  if (!user || !user.inviteTokenHash) return null;
  // El findUnique ya acerto por hash; la comparacion en tiempo constante es por si algun
  // dia se busca de otra forma, para no volver el token adivinable por tiempos.
  if (!inviteHashMatches(user.inviteTokenHash, tokenHash)) return null;
  if (!inviteIsUsable(user)) return null;
  return user;
}
