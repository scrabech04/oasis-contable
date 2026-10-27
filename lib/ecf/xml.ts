/**
 * Un serializador de XML minimo para los formatos de la DGII.
 *
 * Existe para cumplir dos reglas que una libreria generica no garantiza:
 *  - Ningun tag vacio. La DGII rechaza los elementos sin valor ("no deberan incluirse tags
 *    vacios en los XML"), asi que un campo null, undefined o "" desaparece del documento.
 *  - Sin espacios ni saltos de linea entre elementos. La firma se calcula sin preservar
 *    espacios en blanco; un XML indentado se firmaria con nodos de texto que la DGII no ve.
 *
 * El orden de los hijos es el orden en que se pasan: quien arma el documento es responsable
 * de seguir la secuencia del XSD.
 */

export type XmlNode = {
  name: string;
  text?: string;
  children?: XmlNode[];
  /** Un contenedor obligatorio (por ejemplo <Comprador> en la 32) se escribe aunque quede vacio. */
  keepEmpty?: boolean;
};

type Child = XmlNode | null | undefined | false;

/** Elemento con valor. Devuelve null cuando no hay valor, para que se omita. */
export function leaf(name: string, value: string | number | null | undefined): XmlNode | null {
  if (value === null || value === undefined) return null;
  const textValue = String(value);
  if (textValue.trim() === "") return null;
  return { name, text: textValue };
}

/** Elemento contenedor. Si todos sus hijos se omiten, se omite el tambien. */
export function node(name: string, children: Child[], options: { keepEmpty?: boolean } = {}): XmlNode | null {
  const kept = children.filter((child): child is XmlNode => Boolean(child));
  if (kept.length === 0 && !options.keepEmpty) return null;
  return { name, children: kept, keepEmpty: options.keepEmpty };
}

/**
 * Escapa texto para XML. Ademas de los cinco caracteres reservados, la DGII pide escribir
 * (c), euro y (r) como referencias; se usan las numericas porque &copy; no existe en XML.
 */
export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/©/g, "&#169;")
    .replace(/€/g, "&#8364;")
    .replace(/®/g, "&#174;");
}

function render(n: XmlNode): string {
  if (n.children) {
    return `<${n.name}>${n.children.map(render).join("")}</${n.name}>`;
  }
  return `<${n.name}>${escapeXml(n.text ?? "")}</${n.name}>`;
}

export function toXml(root: XmlNode | null) {
  if (!root) throw new Error("El documento XML quedo vacio.");
  return `<?xml version="1.0" encoding="utf-8"?>${render(root)}`;
}
