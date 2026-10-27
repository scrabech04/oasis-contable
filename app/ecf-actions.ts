"use server";

/**
 * Acciones de facturacion electronica (e-CF) que usan las pantallas.
 * La logica vive en lib/ecf; aqui solo se resuelve el perfil activo y los permisos.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveProfileId } from "@/lib/account-profiles";
import { requireWriteAccess } from "@/lib/authz";
import { saveProfileCertificate } from "@/lib/ecf/certificate-store";
import { emissionMessages, emitInvoice, EcfEmissionError, refreshEmissionStatus } from "@/lib/ecf/emit";
import { environmentSegment } from "@/lib/ecf/endpoints";
import { CertificateError } from "@/lib/ecf/sign";
import { isEcfEnvironment, isEncf } from "@/lib/ecf/types";

type Result<T = object> = ({ success: true } & T) | { success: false; error: string; details?: string[] };

function failure(error: unknown): { success: false; error: string; details?: string[] } {
  if (error instanceof EcfEmissionError) return { success: false, error: error.message, details: error.details };
  if (error instanceof CertificateError) return { success: false, error: error.message };
  console.error("[ecf]", error);
  return { success: false, error: error instanceof Error ? error.message : "Ocurrio un error inesperado." };
}

/** Direccion publica de la app, para mostrar las URL que se registran en la DGII. */
async function publicOrigin() {
  if (process.env.ECF_PUBLIC_ORIGIN) return process.env.ECF_PUBLIC_ORIGIN.replace(/\/+$/, "");
  if (process.env.AUTH_ORIGIN) return process.env.AUTH_ORIGIN.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function getEcfSettings() {
  const profileId = await getActiveProfileId();
  const profile = await prisma.accountProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: { ecfCertificate: { select: { subject: true, serialNumber: true, validFrom: true, validTo: true, updatedAt: true } } },
  });
  const origin = await publicOrigin();
  const urls = (["TesteCF", "CerteCF", "eCF"] as const).map((env) => {
    const base = `${origin}/ecf/${environmentSegment(env)}`;
    return {
      environment: env,
      base,
      recepcion: `${base}/fe/recepcion/api/ecf`,
      aprobacion: `${base}/fe/aprobacioncomercial/api/ecf`,
      autenticacion: `${base}/fe/autenticacion/api/semilla`,
    };
  });
  return {
    profileName: profile.name,
    taxId: profile.taxId,
    environment: profile.ecfEnvironment,
    commercialName: profile.ecfCommercialName,
    municipality: profile.ecfMunicipality,
    province: profile.ecfProvince,
    certificate: profile.ecfCertificate,
    keyConfigured: Buffer.from(process.env.ECF_CERT_KEY || "", "base64").length === 32,
    urls,
  };
}

export async function saveEcfSettings(formData: FormData): Promise<Result> {
  try {
    await requireWriteAccess();
    const profileId = await getActiveProfileId();
    const env = String(formData.get("environment") || "");
    const code = (key: string) => {
      const value = String(formData.get(key) || "").replace(/\D/g, "");
      return value.length === 6 ? value : null;
    };
    await prisma.accountProfile.update({
      where: { id: profileId },
      data: {
        ecfEnvironment: isEcfEnvironment(env) ? env : null,
        ecfCommercialName: String(formData.get("commercialName") || "").trim() || null,
        ecfMunicipality: code("municipality"),
        ecfProvince: code("province"),
      },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadEcfCertificate(formData: FormData): Promise<Result<{ subject: string; validTo: string }>> {
  try {
    await requireWriteAccess();
    const profileId = await getActiveProfileId();
    const file = formData.get("certificate");
    const password = String(formData.get("password") || "");
    if (!(file instanceof Blob) || file.size === 0) return { success: false, error: "Selecciona el archivo .p12 del certificado." };
    if (file.size > 100_000) return { success: false, error: "El archivo es demasiado grande para ser un certificado .p12." };
    const info = await saveProfileCertificate(profileId, Buffer.from(await file.arrayBuffer()), password);
    revalidatePath("/settings");
    return { success: true, subject: info.subject, validTo: info.validTo.toISOString() };
  } catch (error) {
    return failure(error);
  }
}

export type InvoiceEcfStatus = {
  applicable: boolean;
  environment: string | null;
  emission: {
    status: string;
    trackId: string | null;
    securityCode: string;
    signedAt: string;
    isSummary: boolean;
    sequenceUsed: boolean | null;
    messages: string[];
    receiverStatus: string | null;
    receiverMessage: string | null;
    commercialStatus: string | null;
    commercialReason: string | null;
    lastCheckedAt: string | null;
  } | null;
};

export async function getInvoiceEcfStatus(invoiceId: number): Promise<InvoiceEcfStatus> {
  const profileId = await getActiveProfileId();
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, profileId },
    select: { ncf: true, profile: { select: { ecfEnvironment: true } }, ecfEmission: true },
  });
  if (!invoice) return { applicable: false, environment: null, emission: null };
  const e = invoice.ecfEmission;
  return {
    applicable: isEncf(invoice.ncf),
    environment: invoice.profile?.ecfEnvironment ?? null,
    emission: e
      ? {
          status: e.status,
          trackId: e.trackId,
          securityCode: e.securityCode,
          signedAt: e.signedAt.toISOString(),
          isSummary: e.isSummary,
          sequenceUsed: e.sequenceUsed,
          messages: emissionMessages(e.dgiiMessages),
          receiverStatus: e.receiverStatus,
          receiverMessage: e.receiverMessage,
          commercialStatus: e.commercialStatus,
          commercialReason: e.commercialReason,
          lastCheckedAt: e.lastCheckedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function emitInvoiceEcf(invoiceId: number): Promise<Result<{ status: string }>> {
  try {
    await requireWriteAccess();
    const profileId = await getActiveProfileId();
    const emission = await emitInvoice(invoiceId, profileId);
    revalidatePath(`/invoices/${invoiceId}`);
    return { success: true, status: emission.status };
  } catch (error) {
    revalidatePath(`/invoices/${invoiceId}`);
    return failure(error);
  }
}

export async function refreshInvoiceEcf(invoiceId: number): Promise<Result<{ status: string }>> {
  try {
    const profileId = await getActiveProfileId();
    const emission = await prisma.ecfEmission.findFirst({ where: { invoiceId, profileId } });
    if (!emission) return { success: false, error: "Esta factura todavia no se ha enviado a la DGII." };
    const updated = await refreshEmissionStatus(emission.id);
    revalidatePath(`/invoices/${invoiceId}`);
    return { success: true, status: updated.status };
  } catch (error) {
    return failure(error);
  }
}
