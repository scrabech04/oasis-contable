/**
 * Convierte una factura de OFlow en el modelo de e-CF.
 *
 * Decisiones que conviene tener a la vista:
 *  - Los encabezados y subtitulos de la factura (itemType HEADING/SUBHEADING) no van al
 *    e-CF: son solo presentacion del PDF.
 *  - Contado o credito sale de las fechas: si vence despues de la emision es credito.
 *  - Una linea con 0% de ITBIS se declara exenta (indicador 4), que es el caso normal en
 *    servicios locales; la tasa cero (indicador 3) es propia de exportaciones.
 *  - El nombre del item admite 80 caracteres; si la descripcion es mas larga, el resto va
 *    en DescripcionItem.
 */
import type { AccountProfile, Contact, Invoice, InvoiceItem } from "@prisma/client";
import { clip } from "./format";
import { ecfTypeFromEncf, type EcfDocumentInput, type EcfType, type PaymentForm } from "./types";

export const SUPPORTED_ECF_TYPES: EcfType[] = [31, 32, 33, 34, 45];

export type InvoiceForEcf = Invoice & {
  items: InvoiceItem[];
  contact: Contact;
  profile: AccountProfile | null;
};

/** "8095550123" o "(809) 555-0123" -> "809-555-0123"; cualquier otra forma se descarta. */
export function dgiiPhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : null;
}

function sameDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Datos del emisor tal como salen en las facturas (identidad o ajustes del perfil). */
export type IssuerOverride = { name?: string | null; address?: string | null; phone?: string | null; email?: string | null };

export function invoiceToEcf(
  invoice: InvoiceForEcf,
  options: { sequenceExpiry: Date | null; issuer?: IssuerOverride },
): EcfDocumentInput {
  const profile = invoice.profile;
  if (!profile) throw new Error("La factura no tiene perfil emisor.");
  const encf = String(invoice.ncf || "").toUpperCase();
  const type = ecfTypeFromEncf(encf);
  if (!type || !SUPPORTED_ECF_TYPES.includes(type as EcfType)) {
    throw new Error("La factura no tiene un e-NCF de tipo 31, 32, 33, 34 o 45.");
  }

  const credit = invoice.dueDate.getTime() > invoice.date.getTime() && !sameDay(invoice.dueDate, invoice.date);
  const paymentForm = (invoice.ecfPaymentForm as PaymentForm | null) ?? (credit ? 4 : null);

  const lines = invoice.items
    .filter((item) => !item.itemType || item.itemType === "ITEM")
    .map((item) => {
      const full = String(item.description || "").trim() || "Servicio";
      const name = clip(full, 80);
      return {
        name,
        description: full.length > 80 ? full : null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.price),
        taxRate: Number(item.taxRate) || 0,
        goodOrService: (item.goodOrService === 1 ? 1 : 2) as 1 | 2,
      };
    });

  const isNote = type === 33 || type === 34;
  const referenceDate = invoice.referenceDate;
  const over30 =
    type === 34 && referenceDate ? (invoice.date.getTime() - referenceDate.getTime()) / 86_400_000 > 30 : false;

  return {
    type: type as EcfType,
    encf,
    sequenceExpiry: options.sequenceExpiry,
    issueDate: invoice.date,
    incomeType: /^0[1-6]$/.test(invoice.incomeType || "") ? invoice.incomeType! : "01",
    paymentType: credit ? 2 : 1,
    paymentDueDate: credit ? invoice.dueDate : null,
    paymentForms: paymentForm && !isNote ? [{ form: paymentForm }] : [],
    issuer: {
      // El RNC siempre es el del perfil: es el que esta certificado y el del certificado.
      rnc: profile.taxId,
      razonSocial: options.issuer?.name || profile.name,
      nombreComercial: profile.ecfCommercialName,
      direccion: options.issuer?.address || profile.address || "",
      municipio: profile.ecfMunicipality,
      provincia: profile.ecfProvince,
      telefonos: [dgiiPhone(options.issuer?.phone || profile.phone)].filter((p): p is string => Boolean(p)),
      correo: options.issuer?.email || profile.email,
      numeroFacturaInterna: invoice.number,
    },
    buyer: {
      rnc: invoice.contact.taxId,
      razonSocial: invoice.contact.name,
      correo: invoice.contact.email,
      direccion: invoice.contact.address,
    },
    lines,
    globalDiscount: Number(invoice.discount) || 0,
    reference:
      isNote && invoice.referenceNcf && referenceDate
        ? {
            ncf: invoice.referenceNcf,
            fecha: referenceDate,
            codigo: (invoice.modificationCode as 1 | 2 | 3 | 4 | 5 | null) ?? 3,
            razon: invoice.modificationReason,
          }
        : null,
    creditNoteOver30Days: over30,
  };
}
