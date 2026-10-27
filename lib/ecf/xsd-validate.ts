/**
 * Validacion de los XML contra los XSD oficiales antes de enviarlos.
 *
 * La DGII valida lo mismo, pero un rechazo por estructura gasta un viaje y deja el
 * comprobante en "Rechazado". Validar aqui da un error claro en pantalla y no toca la DGII.
 */
import { validateXML } from "xmllint-wasm";
import { ECF_SCHEMAS } from "./xsd/schemas";

export type XsdKind = "ecf-31" | "ecf-32" | "ecf-33" | "ecf-34" | "ecf-45" | "rfce-32" | "arecf" | "acecf" | "anecf" | "semilla";

export function xsdForEcfType(type: number): XsdKind {
  const kind = `ecf-${type}`;
  if (!(kind in ECF_SCHEMAS)) throw new Error(`No hay XSD para el tipo de e-CF ${type}.`);
  return kind as XsdKind;
}

export type XsdResult = { valid: true } | { valid: false; errors: string[] };

export async function validateAgainstXsd(xml: string, kind: XsdKind): Promise<XsdResult> {
  const schema = ECF_SCHEMAS[kind];
  if (!schema) throw new Error(`No hay XSD ${kind}.`);
  const result = await validateXML({
    xml: [{ fileName: "documento.xml", contents: xml }],
    schema: [{ fileName: `${kind}.xsd`, contents: schema }],
  });
  if (result.valid) return { valid: true };
  return { valid: false, errors: result.errors.map((error) => error.message || error.rawMessage) };
}
