/**
 * URL del timbre (el QR de la representacion impresa).
 *
 * Al leer el QR, la DGII muestra si el comprobante es valido. Hay dos variantes:
 *  - e-CF enviado completo (31, 33, 34, 45 y la 32 de RD$250,000 o mas): ConsultaTimbre con
 *    emisor, comprador, e-NCF, fecha de emision, monto, fecha de firma y codigo de seguridad.
 *  - Factura de consumo por debajo de RD$250,000 (enviada como RFCE): ConsultaTimbreFC con
 *    emisor, e-NCF, monto y codigo de seguridad.
 *
 * El codigo de seguridad sale del SignatureValue (base64), asi que puede traer "+" o "/";
 * encodeURIComponent los convierte a %2B y %2F como pide la DGII.
 */
import { cleanTaxId, dgiiDate, dgiiDateTime, money } from "./format";
import { dgiiEndpoints } from "./endpoints";
import type { EcfEnvironment } from "./types";

export function timbreUrl(input: {
  environment: EcfEnvironment;
  summary: boolean;
  rncEmisor: string;
  rncComprador?: string | null;
  encf: string;
  issueDate: Date;
  total: number;
  signedAt: Date;
  securityCode: string;
}) {
  const urls = dgiiEndpoints(input.environment);
  // Los dos puntos de la hora se dejan tal cual, como en el ejemplo de la DGII
  // (fechafirma=10-10-2020%2009:00:00): asi el enlace cabe en un QR version 8.
  const q = (pairs: Array<[string, string]>) =>
    pairs.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%3A/gi, ":")}`).join("&");

  if (input.summary) {
    return `${urls.timbreFc}?${q([
      ["RncEmisor", cleanTaxId(input.rncEmisor)],
      ["ENCF", input.encf.toUpperCase()],
      ["MontoTotal", money(input.total)],
      ["CodigoSeguridad", input.securityCode],
    ])}`;
  }

  const pairs: Array<[string, string]> = [["RncEmisor", cleanTaxId(input.rncEmisor)]];
  const buyer = cleanTaxId(input.rncComprador);
  if (buyer) pairs.push(["RncComprador", buyer]);
  pairs.push(
    ["ENCF", input.encf.toUpperCase()],
    ["FechaEmision", dgiiDate(input.issueDate)],
    ["MontoTotal", money(input.total)],
    ["FechaFirma", dgiiDateTime(input.signedAt)],
    ["CodigoSeguridad", input.securityCode],
  );
  return `${urls.timbre}?${q(pairs)}`;
}
