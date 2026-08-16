import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { allowedProfileIds } from "@/lib/authz";

export const ACTIVE_PROFILE_COOKIE = "active_profile_id";

type ProfileLike = {
  id: number;
  name: string;
  taxId: string;
  type: string;
  isDefault: boolean;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
};

export async function ensureAccountProfilesSetup() {
  const legacySettings = await prisma.companySettings.findFirst({
    where: { profileId: null },
    orderBy: { id: "asc" },
  });

  let profiles = await prisma.accountProfile.findMany({
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  if (profiles.length === 0) {
    const created = await prisma.accountProfile.create({
      data: {
        name: legacySettings?.name || "Mi Perfil Principal",
        taxId: legacySettings?.taxId || "131-XXXXX-X",
        type: "PERSON",
        isDefault: true,
        email: legacySettings?.email || null,
        phone: legacySettings?.phone || null,
        address: legacySettings?.address || null,
        logoUrl: legacySettings?.logo || null,
      },
    });

    profiles = [created];
  }

  let defaultProfile = profiles.find((profile) => profile.isDefault) || profiles[0];

  if (!profiles.some((profile) => profile.isDefault)) {
    defaultProfile = await prisma.accountProfile.update({
      where: { id: defaultProfile.id },
      data: { isDefault: true },
    });
  }

  await Promise.all([
    prisma.contact.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.project.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.quotation.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.invoice.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.purchase.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.numberingSequence.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.recurringInvoice.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
    prisma.companyIdentity.updateMany({
      where: { profileId: null },
      data: { profileId: defaultProfile.id },
    }),
  ]);

  const scopedSettings = await prisma.companySettings.findFirst({
    where: { profileId: defaultProfile.id },
  });

  if (!scopedSettings) {
    if (legacySettings) {
      await prisma.companySettings.update({
        where: { id: legacySettings.id },
        data: { profileId: defaultProfile.id },
      });
    } else {
      await prisma.companySettings.create({
        data: {
          name: defaultProfile.name,
          taxId: defaultProfile.taxId,
          email: defaultProfile.email,
          phone: defaultProfile.phone,
          address: defaultProfile.address,
          logo: defaultProfile.logoUrl,
          currency: "RD$",
          incomeTaxRegime: defaultProfile.type === "PERSON" ? "INDIVIDUAL" : "LEGAL_ENTITY",
          incomeTaxRate: defaultProfile.type === "PERSON" ? 0.25 : 0.27,
          profileId: defaultProfile.id,
        },
      });
    }
  }

  return defaultProfile;
}

export async function getAccountProfiles() {
  await ensureAccountProfilesSetup();
  const allowed = await allowedProfileIds();
  return prisma.accountProfile.findMany({
    where: allowed === null ? undefined : { id: { in: allowed } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function getActiveProfileId() {
  const defaultProfile = await ensureAccountProfilesSetup();
  const cookieStore = await cookies();
  const rawId = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
  const parsedId = Number(rawId);

  // `null` = dueno, llega a todos los perfiles. Una lista = invitado, y entonces la cookie
  // no decide nada por si sola: es el unico sitio por el que pasan TODAS las consultas de
  // la aplicacion, asi que aqui es donde el alcance por perfil se sostiene de verdad.
  // Sin esto, un invitado cambiaba la cookie a mano y leia el otro perfil entero.
  const allowed = await allowedProfileIds();
  if (allowed !== null) {
    if (allowed.length === 0) {
      throw new Error("Tu cuenta no tiene ningún perfil asignado. Pídele acceso a quien te invitó.");
    }
    return allowed.includes(parsedId) ? parsedId : allowed[0];
  }

  if (!rawId || Number.isNaN(parsedId)) {
    return defaultProfile.id;
  }

  const exists = await prisma.accountProfile.findUnique({
    where: { id: parsedId },
    select: { id: true },
  });

  return exists?.id || defaultProfile.id;
}

export async function getActiveProfile() {
  const profileId = await getActiveProfileId();
  return prisma.accountProfile.findUniqueOrThrow({
    where: { id: profileId },
  });
}

export async function getScopedCompanySettings() {
  const profile = await getActiveProfile();

  const settings = await prisma.companySettings.findFirst({
    where: { profileId: profile.id },
  });

  if (settings) {
    return settings;
  }

  return prisma.companySettings.create({
    data: {
      name: profile.name,
      taxId: profile.taxId,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      logo: profile.logoUrl,
      currency: "RD$",
      incomeTaxRegime: profile.type === "PERSON" ? "INDIVIDUAL" : "LEGAL_ENTITY",
      incomeTaxRate: profile.type === "PERSON" ? 0.25 : 0.27,
      profileId: profile.id,
    },
  });
}

export function withProfileId<T extends Record<string, unknown>>(profileId: number, where?: T) {
  return {
    ...(where || {}),
    profileId,
  };
}

export function normalizeProfileTaxId(taxId: string | null | undefined) {
  return String(taxId || "").replace(/\D/g, "");
}
