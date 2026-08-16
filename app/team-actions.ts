"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ROLE_ACCOUNTANT, ROLE_OWNER } from "@/lib/auth";
import { getCurrentUser, requireWriteAccess } from "@/lib/authz";
import { createInviteToken, inviteExpiryFromNow, inviteUrl } from "@/lib/invitations";

export type TeamMember = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  status: string;
  profileNames: string[];
  invitedByEmail: string | null;
  inviteExpiresAt: Date | null;
  lastLoginAt: Date | null;
};

export type InviteResult =
  | { success: true; url: string; email: string }
  | { success: false; error: string };

/** El origen publico, para armar el enlace que el dueno va a copiar y enviar. */
async function currentOrigin() {
  const configured = process.env.AUTH_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  await requireWriteAccess();
  const users = await prisma.appUser.findMany({
    include: { profiles: { include: { profile: { select: { name: true } } } } },
    orderBy: [{ status: "asc" }, { email: "asc" }],
  });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    profileNames: user.profiles.map((row) => row.profile.name),
    invitedByEmail: user.invitedByEmail,
    inviteExpiresAt: user.inviteExpiresAt,
    lastLoginAt: user.lastLoginAt,
  }));
}

export async function inviteAccountant(formData: FormData): Promise<InviteResult> {
  await requireWriteAccess();
  const inviter = await getCurrentUser();

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Escribe un correo válido." };
  }

  const profileIds = formData
    .getAll("profileIds")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (profileIds.length === 0) {
    return { success: false, error: "Elige al menos un perfil al que tendrá acceso." };
  }

  const existingProfiles = await prisma.accountProfile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true },
  });
  if (existingProfiles.length !== profileIds.length) {
    return { success: false, error: "Alguno de los perfiles seleccionados ya no existe." };
  }

  const existing = await prisma.appUser.findUnique({ where: { email }, select: { id: true, status: true } });
  if (existing?.status === "ACTIVE") {
    return { success: false, error: `${email} ya tiene acceso. Revócalo primero si quieres volver a invitarlo.` };
  }

  const { token, tokenHash } = createInviteToken();
  const data = {
    email,
    role: ROLE_ACCOUNTANT,
    status: "INVITED",
    inviteTokenHash: tokenHash,
    inviteExpiresAt: inviteExpiryFromNow(),
    invitedByEmail: inviter?.email ?? null,
  };

  await prisma.appUser.upsert({
    where: { email },
    // Reinvitar reemplaza el acceso anterior en vez de sumarle perfiles, para que lo que se
    // ve en pantalla sea exactamente lo que se acaba de conceder.
    update: { ...data, profiles: { deleteMany: {}, create: profileIds.map((profileId) => ({ profileId })) } },
    create: { ...data, profiles: { create: profileIds.map((profileId) => ({ profileId })) } },
  });

  revalidatePath("/settings");
  return { success: true, url: inviteUrl(await currentOrigin(), token), email };
}

export async function revokeTeamMember(id: number) {
  await requireWriteAccess();
  const user = await prisma.appUser.findUnique({ where: { id }, select: { role: true } });
  if (!user) return { success: false, error: "Usuario no encontrado." };
  if (user.role === ROLE_OWNER) {
    return { success: false, error: "No se puede revocar a un dueño desde aquí." };
  }

  // Se conserva la fila para que quede el rastro de quien tuvo acceso y hasta cuando; lo
  // que se corta es la entrada y cualquier invitacion pendiente.
  await prisma.appUser.update({
    where: { id },
    data: { status: "DISABLED", inviteTokenHash: null, inviteExpiresAt: null },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteTeamMember(id: number) {
  await requireWriteAccess();
  await prisma.appUser.deleteMany({ where: { id, role: { not: ROLE_OWNER } } });
  revalidatePath("/settings");
  return { success: true };
}
