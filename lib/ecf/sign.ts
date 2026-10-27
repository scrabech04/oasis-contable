/**
 * Firma digital de los XML de la DGII (XMLDSig enveloped), segun "Firmado de e-CF".
 *
 *   CanonicalizationMethod  http://www.w3.org/TR/2001/REC-xml-c14n-20010315   (inclusiva)
 *   SignatureMethod         http://www.w3.org/2001/04/xmldsig-more#rsa-sha256
 *   Reference URI=""        con el transform enveloped-signature
 *   DigestMethod            http://www.w3.org/2001/04/xmlenc#sha256
 *   KeyInfo                 X509Data/X509Certificate
 *
 * La <Signature> va como ultimo hijo del elemento raiz y el XML se firma sin espacios entre
 * elementos (preserveWhitespace = false). Despues de firmado no se puede tocar ni un byte.
 */
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { DOMParser, XMLSerializer, type Node as XmlDomNode } from "@xmldom/xmldom";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export type SigningCertificate = {
  privateKeyPem: string;
  certificatePem: string;
  /** El certificado en base64 sin cabeceras PEM, tal como va en <X509Certificate>. */
  certificateBase64: string;
  subject: string;
  /** Atributo SN del sujeto: la cedula, RNC o pasaporte del titular. */
  serialNumber: string | null;
  validFrom: Date;
  validTo: Date;
};

export class CertificateError extends Error {}

function pemBody(pem: string) {
  return pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
}

function subjectText(cert: forge.pki.Certificate) {
  return cert.subject.attributes.map((a) => `${a.shortName || a.name || a.type}=${a.value}`).join(", ");
}

function subjectSerial(cert: forge.pki.Certificate) {
  const attr = cert.subject.attributes.find((a) => a.type === "2.5.4.5" || a.name === "serialNumber");
  return attr ? String(attr.value) : null;
}

/**
 * Lee un certificado .p12 / .pfx. Toma la llave privada y el certificado que le corresponde
 * (un .p12 puede traer tambien la cadena de la entidad certificadora).
 */
export function loadP12(p12: Buffer | Uint8Array, password: string): SigningCertificate {
  let parsed: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(Buffer.from(p12).toString("binary"));
    parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password);
  } catch {
    throw new CertificateError("No se pudo abrir el certificado. Revisa el archivo .p12 y su contrasena.");
  }

  const keyBags = [
    ...(parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(parsed.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const key = keyBags.find((bag) => bag.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new CertificateError("El certificado no trae la llave privada.");

  const certs = (parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));
  const cert = certs.find((c) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return pub.n && pub.n.equals(key.n) && pub.e.equals(key.e);
  });
  if (!cert) throw new CertificateError("El certificado no corresponde a la llave privada del archivo.");

  const certificatePem = forge.pki.certificateToPem(cert);
  return {
    privateKeyPem: forge.pki.privateKeyToPem(key),
    certificatePem,
    certificateBase64: pemBody(certificatePem),
    subject: subjectText(cert),
    serialNumber: subjectSerial(cert),
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
  };
}

function parseXml(xml: string) {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(message);
    },
  }).parseFromString(xml, "text/xml");
  if (errors.length || !doc.documentElement) {
    throw new Error(`XML mal formado: ${errors[0] || "sin elemento raiz"}`);
  }
  return doc;
}

/** Quita los nodos de texto que solo tienen espacios, como hace .NET con PreserveWhitespace=false. */
function stripWhitespace(n: XmlDomNode) {
  for (let child = n.firstChild; child; ) {
    const next = child.nextSibling;
    if (child.nodeType === 3 && !(child.nodeValue || "").trim()) {
      n.removeChild(child);
    } else if (child.nodeType === 1) {
      stripWhitespace(child);
    }
    child = next;
  }
}

/** Serializa sin espacios entre elementos y sin declaracion duplicada. */
export function normalizeXml(xml: string) {
  const doc = parseXml(xml);
  stripWhitespace(doc);
  const body = new XMLSerializer().serializeToString(doc.documentElement!);
  return `<?xml version="1.0" encoding="utf-8"?>${body}`;
}

/** Firma un XML (e-CF, RFCE, ARECF, ACECF, ANECF o la semilla) con el certificado. */
export function signXml(xml: string, cert: SigningCertificate) {
  const clean = normalizeXml(xml);
  const signer = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certificatePem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${cert.certificateBase64}</X509Certificate></X509Data>`,
  });
  signer.addReference({
    xpath: "/*",
    transforms: [ENVELOPED],
    digestAlgorithm: SHA256,
    isEmptyUri: true,
  });
  signer.computeSignature(clean, { location: { reference: "/*", action: "append" } });
  const signed = signer.getSignedXml();
  return signed.startsWith("<?xml") ? signed : `<?xml version="1.0" encoding="utf-8"?>${signed}`;
}

function signatureValueOf(xml: string) {
  const match = /<SignatureValue[^>]*>([\s\S]*?)<\/SignatureValue>/.exec(xml);
  return match ? match[1].replace(/\s+/g, "") : null;
}

/**
 * Codigo de seguridad del e-CF: los primeros seis caracteres del SignatureValue. Va en el QR,
 * debajo del QR en la representacion impresa y en el RFCE.
 */
export function securityCodeOf(signedXml: string) {
  const value = signatureValueOf(signedXml);
  if (!value || value.length < 6) throw new Error("El XML no tiene SignatureValue.");
  return value.slice(0, 6);
}

export type SignatureCheck = {
  valid: boolean;
  /** Certificado con el que se firmo, en base64. */
  certificateBase64: string | null;
  /** SN del titular del certificado (cedula, RNC o pasaporte). */
  signerSerial: string | null;
  error?: string;
};

/**
 * Verifica la firma de un XML que nos llega (e-CF de un proveedor, aprobacion comercial,
 * semilla firmada). Usa el certificado incluido en el propio KeyInfo: confirma que el
 * documento no se altero y quien lo firmo. Que ese firmante este autorizado por la DGII para
 * el RNC emisor lo valida la DGII, no nosotros.
 */
export function verifyXmlSignature(xml: string): SignatureCheck {
  try {
    const doc = parseXml(xml);
    const signatures = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    if (signatures.length !== 1) return { valid: false, certificateBase64: null, signerSerial: null, error: "El XML no trae una firma." };
    const signature = signatures[0];
    const certNode = signature.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "X509Certificate")[0];
    const certificateBase64 = certNode?.textContent?.replace(/\s+/g, "") || null;
    if (!certificateBase64) return { valid: false, certificateBase64: null, signerSerial: null, error: "La firma no trae el certificado." };

    const pem = `-----BEGIN CERTIFICATE-----\n${certificateBase64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
    let signerSerial: string | null = null;
    try {
      signerSerial = subjectSerial(forge.pki.certificateFromPem(pem));
    } catch {
      // Certificados con algoritmos que node-forge no lee: la firma se valida igual.
    }

    const verifier = new SignedXml({ publicCert: pem, getCertFromKeyInfo: () => null });
    verifier.loadSignature(signature as unknown as Node);
    const valid = verifier.checkSignature(xml);
    return { valid, certificateBase64, signerSerial, error: valid ? undefined : "La firma no corresponde al contenido." };
  } catch (error) {
    return {
      valid: false,
      certificateBase64: null,
      signerSerial: null,
      error: error instanceof Error ? error.message : "No se pudo verificar la firma.",
    };
  }
}
