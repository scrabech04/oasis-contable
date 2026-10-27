/**
 * Guarda y lee el certificado .p12 de cada perfil.
 *
 * El archivo y su contrasena se cifran con AES-256-GCM usando ECF_CERT_KEY (32 bytes en
 * base64, guardada como secreto en Firebase). Quien tenga la base de datos pero no esa
 * llave no puede firmar en nombre de la empresa.
 *
 * Para generar la llave una vez:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CertificateError, loadP12, type SigningCertificate } from "./sign";

function encryptionKey() {
  const raw = process.env.ECF_CERT_KEY || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new CertificateError("Falta configurar ECF_CERT_KEY (32 bytes en base64) para guardar certificados.");
  }
  return key;
}

function encrypt(data: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

function decrypt(value: string) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new CertificateError("El certificado guardado esta danado.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]);
  } catch {
    throw new CertificateError("No se pudo descifrar el certificado: ECF_CERT_KEY cambio o el dato esta danado.");
  }
}

/**
 * Valida el .p12 (abre con la contrasena, trae llave, no esta vencido) y lo guarda cifrado.
 * Reemplaza el que hubiera. Devuelve los datos visibles del certificado.
 */
export async function saveProfileCertificate(profileId: number, p12: Buffer, password: string) {
  const cert = loadP12(p12, password);
  if (cert.validTo.getTime() < Date.now()) throw new CertificateError("El certificado esta vencido.");

  const data = {
    encryptedP12: encrypt(p12),
    encryptedPassword: encrypt(Buffer.from(password, "utf8")),
    subject: cert.subject,
    serialNumber: cert.serialNumber,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
  };
  await prisma.ecfCertificate.upsert({
    where: { profileId },
    create: { profileId, ...data },
    update: data,
  });
  return { subject: cert.subject, serialNumber: cert.serialNumber, validFrom: cert.validFrom, validTo: cert.validTo };
}

/** Certificado listo para firmar, o error claro si el perfil no tiene uno valido. */
export async function loadProfileCertificate(profileId: number): Promise<SigningCertificate> {
  const row = await prisma.ecfCertificate.findUnique({ where: { profileId } });
  if (!row) throw new CertificateError("Este perfil no tiene certificado digital cargado.");
  const cert = loadP12(decrypt(row.encryptedP12), decrypt(row.encryptedPassword).toString("utf8"));
  if (cert.validTo.getTime() < Date.now()) throw new CertificateError("El certificado digital de este perfil esta vencido.");
  return cert;
}
