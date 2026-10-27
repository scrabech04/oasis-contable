/**
 * Generadores de los XML de facturacion electronica, en el orden exacto de los XSD v1.0.
 *
 * Cada funcion devuelve el XML sin firmar. La firma (sign.ts) se agrega despues como ultimo
 * hijo del elemento raiz, que es donde los XSD dejan el comodin xs:any.
 *
 * Solo se escriben los campos que OFlow usa hoy. Los opcionales que no aplican (transporte,
 * impuestos selectivos, otra moneda, retenciones, paginacion) se omiten, que es lo correcto:
 * un tag sin valor provoca rechazo.
 */
import { clip, cleanTaxId, dgiiDate, dgiiDateTime, money, quantity, unitPrice } from "./format";
import { computeLines, computeTotals, ITBIS_RATES } from "./totals";
import { leaf, node, toXml, type XmlNode } from "./xml";
import {
  CONSUMO_SUMMARY_LIMIT,
  ecfTypeFromEncf,
  type EcfComputedLine,
  type EcfDocumentInput,
  type EcfTotals,
} from "./types";

export class EcfValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
  }
}

/** Reglas de negocio del Formato e-CF que el XSD por si solo no atrapa. */
export function validateDocument(doc: EcfDocumentInput, totals: EcfTotals) {
  const problems: string[] = [];
  const type = doc.type;

  if (ecfTypeFromEncf(doc.encf) !== type) {
    problems.push(`El e-NCF ${doc.encf} no corresponde a un comprobante tipo ${type}.`);
  }
  if (cleanTaxId(doc.issuer.rnc).length !== 9 && cleanTaxId(doc.issuer.rnc).length !== 11) {
    problems.push("El RNC del emisor no es valido.");
  }
  if (!clip(doc.issuer.razonSocial, 150)) problems.push("Falta la razon social del emisor.");
  if (!clip(doc.issuer.direccion, 100)) problems.push("Falta la direccion del emisor.");
  if (!/^0[1-6]$/.test(doc.incomeType)) problems.push("El tipo de ingreso debe ser 01 a 06.");

  const needsExpiry = type !== 32 && type !== 34;
  if (needsExpiry && !doc.sequenceExpiry) {
    problems.push("Falta la fecha de vencimiento de la secuencia e-NCF.");
  }

  const buyerRnc = cleanTaxId(doc.buyer?.rnc);
  const buyerName = clip(doc.buyer?.razonSocial, 150);
  if (type === 31 || type === 45) {
    if (buyerRnc.length !== 9 && buyerRnc.length !== 11) {
      problems.push(`El comprobante tipo ${type} requiere el RNC o cedula del comprador.`);
    }
    if (!buyerName) problems.push(`El comprobante tipo ${type} requiere el nombre o razon social del comprador.`);
  }
  if (type === 32 && totals.montoTotal >= CONSUMO_SUMMARY_LIMIT) {
    if (!buyerRnc && !clip(doc.buyer?.identificadorExtranjero, 20)) {
      problems.push("Una factura de consumo de RD$250,000 o mas requiere el RNC/cedula o la identificacion del comprador.");
    }
    if (!buyerName) problems.push("Una factura de consumo de RD$250,000 o mas requiere el nombre del comprador.");
  }
  if (buyerRnc && buyerRnc.length !== 9 && buyerRnc.length !== 11) {
    problems.push("El RNC o cedula del comprador debe tener 9 u 11 digitos.");
  }

  if (type === 33 || type === 34) {
    if (!doc.reference) problems.push("Las notas de debito y credito requieren el comprobante que modifican.");
  }
  if (doc.paymentType === 2 && doc.paymentDueDate && doc.paymentDueDate < doc.issueDate) {
    problems.push("La fecha limite de pago no puede ser anterior a la fecha de emision.");
  }
  if (doc.lines.length > (type === 32 && totals.montoTotal < CONSUMO_SUMMARY_LIMIT ? 10000 : 1000)) {
    problems.push("El comprobante excede la cantidad maxima de lineas.");
  }

  if (problems.length) throw new EcfValidationError(problems);
}

function idDoc(doc: EcfDocumentInput, totals: EcfTotals) {
  const type = doc.type;
  const hasTaxed = totals.hasI1 || totals.hasI2 || totals.hasI3;
  const isNote = type === 33 || type === 34;
  const forms = (doc.paymentForms || []).slice(0, 7).map((f) => ({ form: f.form, amount: f.amount ?? totals.montoTotal }));

  return node("IdDoc", [
    leaf("TipoeCF", type),
    leaf("eNCF", doc.encf.toUpperCase()),
    type !== 32 && type !== 34 && doc.sequenceExpiry ? leaf("FechaVencimientoSecuencia", dgiiDate(doc.sequenceExpiry)) : null,
    type === 34 ? leaf("IndicadorNotaCredito", doc.creditNoteOver30Days ? 1 : 0) : null,
    // Los precios de OFlow no traen el ITBIS incluido. Solo se declara si hay algo gravado.
    hasTaxed ? leaf("IndicadorMontoGravado", 0) : null,
    leaf("TipoIngresos", doc.incomeType),
    leaf("TipoPago", doc.paymentType),
    doc.paymentType === 2 && doc.paymentDueDate ? leaf("FechaLimitePago", dgiiDate(doc.paymentDueDate)) : null,
    !isNote ? leaf("TerminoPago", clip(doc.paymentTerm, 15) || null) : null,
    !isNote && forms.length
      ? node(
          "TablaFormasPago",
          forms.map((f) => node("FormaDePago", [leaf("FormaPago", f.form), leaf("MontoPago", money(f.amount))])),
        )
      : null,
  ]);
}

function emisor(doc: EcfDocumentInput) {
  const issuer = doc.issuer;
  const phones = (issuer.telefonos || []).filter((p) => /^\d{3}-\d{3}-\d{4}$/.test(p)).slice(0, 3);
  return node("Emisor", [
    leaf("RNCEmisor", cleanTaxId(issuer.rnc)),
    leaf("RazonSocialEmisor", clip(issuer.razonSocial, 150)),
    leaf("NombreComercial", clip(issuer.nombreComercial, 150)),
    leaf("Sucursal", clip(issuer.sucursal, 20)),
    leaf("DireccionEmisor", clip(issuer.direccion, 100)),
    leaf("Municipio", issuer.municipio),
    leaf("Provincia", issuer.provincia),
    phones.length ? node("TablaTelefonoEmisor", phones.map((p) => leaf("TelefonoEmisor", p))) : null,
    leaf("CorreoEmisor", clip(issuer.correo, 80)),
    leaf("WebSite", clip(issuer.website, 50)),
    leaf("NumeroFacturaInterna", clip(issuer.numeroFacturaInterna, 20)),
    leaf("FechaEmision", dgiiDate(doc.issueDate)),
  ]);
}

function comprador(doc: EcfDocumentInput) {
  const buyer = doc.buyer || {};
  const rnc = cleanTaxId(buyer.rnc);
  // El identificador extranjero solo existe en 32, 33 y 34, y solo cuando no hay RNC.
  const foreignAllowed = doc.type === 32 || doc.type === 33 || doc.type === 34;
  const children = [
    leaf("RNCComprador", rnc || null),
    foreignAllowed && !rnc ? leaf("IdentificadorExtranjero", clip(buyer.identificadorExtranjero, 20)) : null,
    leaf("RazonSocialComprador", clip(buyer.razonSocial, 150)),
    leaf("ContactoComprador", clip(buyer.contacto, 80)),
    leaf("CorreoComprador", clip(buyer.correo, 80)),
    leaf("DireccionComprador", clip(buyer.direccion, 100)),
  ];
  // En la 32 el XSD exige el contenedor aunque el consumidor final no tenga datos.
  // En la 34 el contenedor es opcional y en las demas siempre lleva RNC y nombre.
  return node("Comprador", children, { keepEmpty: doc.type === 32 });
}

function totales(totals: EcfTotals) {
  return node("Totales", [
    totals.hasI1 || totals.hasI2 || totals.hasI3 ? leaf("MontoGravadoTotal", money(totals.montoGravadoTotal)) : null,
    totals.hasI1 ? leaf("MontoGravadoI1", money(totals.montoGravadoI1)) : null,
    totals.hasI2 ? leaf("MontoGravadoI2", money(totals.montoGravadoI2)) : null,
    totals.hasI3 ? leaf("MontoGravadoI3", money(totals.montoGravadoI3)) : null,
    totals.hasExento ? leaf("MontoExento", money(totals.montoExento)) : null,
    totals.hasI1 ? leaf("ITBIS1", ITBIS_RATES[1]) : null,
    totals.hasI2 ? leaf("ITBIS2", ITBIS_RATES[2]) : null,
    totals.hasI3 ? leaf("ITBIS3", ITBIS_RATES[3]) : null,
    totals.hasI1 || totals.hasI2 || totals.hasI3 ? leaf("TotalITBIS", money(totals.totalItbis)) : null,
    totals.hasI1 ? leaf("TotalITBIS1", money(totals.totalItbis1)) : null,
    totals.hasI2 ? leaf("TotalITBIS2", money(totals.totalItbis2)) : null,
    totals.hasI3 ? leaf("TotalITBIS3", money(totals.totalItbis3)) : null,
    leaf("MontoTotal", money(totals.montoTotal)),
    totals.hasNoFacturable ? leaf("MontoNoFacturable", money(totals.montoNoFacturable)) : null,
  ]);
}

function item(line: EcfComputedLine) {
  const description = line.description && line.description !== line.name ? clip(line.description, 1000) : null;
  return node("Item", [
    leaf("NumeroLinea", line.lineNumber),
    leaf("IndicadorFacturacion", line.billingIndicator),
    leaf("NombreItem", clip(line.name, 80)),
    leaf("IndicadorBienoServicio", line.goodOrService),
    leaf("DescripcionItem", description),
    leaf("CantidadItem", quantity(line.quantity)),
    leaf("PrecioUnitarioItem", unitPrice(line.unitPrice)),
    line.discount > 0 ? leaf("DescuentoMonto", money(line.discount)) : null,
    line.discount > 0
      ? node("TablaSubDescuento", [
          node("SubDescuento", [leaf("TipoSubDescuento", "$"), leaf("MontoSubDescuento", money(line.discount))]),
        ])
      : null,
    leaf("MontoItem", money(line.amount)),
  ]);
}

function informacionReferencia(doc: EcfDocumentInput) {
  const ref = doc.reference;
  if (!ref) return null;
  return node("InformacionReferencia", [
    leaf("NCFModificado", ref.ncf.toUpperCase()),
    leaf("RNCOtroContribuyente", cleanTaxId(ref.rncOtroContribuyente) || null),
    leaf("FechaNCFModificado", dgiiDate(ref.fecha)),
    leaf("CodigoModificacion", ref.codigo),
    // RazonModificacion solo existe en las notas.
    doc.type === 33 || doc.type === 34 ? leaf("RazonModificacion", clip(ref.razon, 90)) : null,
  ]);
}

export type BuiltEcf = {
  xml: string;
  lines: EcfComputedLine[];
  totals: EcfTotals;
  /** True cuando es una factura de consumo por debajo de RD$250,000: a la DGII va el RFCE. */
  sendsSummary: boolean;
};

/**
 * Arma el e-CF sin firmar. `signedAt` es la FechaHoraFirma: debe ser el mismo instante en
 * que se firma, porque la DGII la compara con la firma y la imprime en la RI.
 */
export function buildEcf(doc: EcfDocumentInput, signedAt: Date): BuiltEcf {
  const lines = computeLines(doc.lines, doc.globalDiscount);
  const totals = computeTotals(lines);
  validateDocument(doc, totals);

  const root = node("ECF", [
    node("Encabezado", [leaf("Version", "1.0"), idDoc(doc, totals), emisor(doc), comprador(doc), totales(totals)]),
    node("DetallesItems", lines.map(item)),
    informacionReferencia(doc),
    leaf("FechaHoraFirma", dgiiDateTime(signedAt)),
  ]);

  return {
    xml: toXml(root),
    lines,
    totals,
    sendsSummary: doc.type === 32 && totals.montoTotal < CONSUMO_SUMMARY_LIMIT,
  };
}

/**
 * Resumen de factura de consumo (RFCE) para las 32 por debajo de RD$250,000. Lleva el
 * codigo de seguridad del e-CF completo, que ya tiene que estar firmado.
 */
export function buildRfce(doc: EcfDocumentInput, totals: EcfTotals, securityCode: string) {
  if (doc.type !== 32) throw new Error("El resumen RFCE solo aplica a facturas de consumo (32).");
  const forms = (doc.paymentForms || []).slice(0, 7).map((f) => ({ form: f.form, amount: f.amount ?? totals.montoTotal }));
  const buyerRnc = cleanTaxId(doc.buyer?.rnc);

  const root = node("RFCE", [
    node("Encabezado", [
      leaf("Version", "1.0"),
      node("IdDoc", [
        leaf("TipoeCF", 32),
        leaf("eNCF", doc.encf.toUpperCase()),
        leaf("TipoIngresos", doc.incomeType),
        leaf("TipoPago", doc.paymentType),
        forms.length
          ? node(
              "TablaFormasPago",
              forms.map((f) => node("FormaDePago", [leaf("FormaPago", f.form), leaf("MontoPago", money(f.amount))])),
            )
          : null,
      ]),
      node("Emisor", [
        leaf("RNCEmisor", cleanTaxId(doc.issuer.rnc)),
        leaf("RazonSocialEmisor", clip(doc.issuer.razonSocial, 150)),
        leaf("FechaEmision", dgiiDate(doc.issueDate)),
      ]),
      node(
        "Comprador",
        [
          leaf("RNCComprador", buyerRnc || null),
          !buyerRnc ? leaf("IdentificadorExtranjero", clip(doc.buyer?.identificadorExtranjero, 20)) : null,
          leaf("RazonSocialComprador", clip(doc.buyer?.razonSocial, 150)),
        ],
        { keepEmpty: true },
      ),
      node("Totales", [
        totals.hasI1 || totals.hasI2 || totals.hasI3 ? leaf("MontoGravadoTotal", money(totals.montoGravadoTotal)) : null,
        totals.hasI1 ? leaf("MontoGravadoI1", money(totals.montoGravadoI1)) : null,
        totals.hasI2 ? leaf("MontoGravadoI2", money(totals.montoGravadoI2)) : null,
        totals.hasI3 ? leaf("MontoGravadoI3", money(totals.montoGravadoI3)) : null,
        totals.hasExento ? leaf("MontoExento", money(totals.montoExento)) : null,
        totals.hasI1 || totals.hasI2 || totals.hasI3 ? leaf("TotalITBIS", money(totals.totalItbis)) : null,
        totals.hasI1 ? leaf("TotalITBIS1", money(totals.totalItbis1)) : null,
        totals.hasI2 ? leaf("TotalITBIS2", money(totals.totalItbis2)) : null,
        totals.hasI3 ? leaf("TotalITBIS3", money(totals.totalItbis3)) : null,
        leaf("MontoTotal", money(totals.montoTotal)),
        totals.hasNoFacturable ? leaf("MontoNoFacturable", money(totals.montoNoFacturable)) : null,
      ]),
      leaf("CodigoSeguridadeCF", securityCode),
    ]),
  ]);
  return toXml(root);
}

/** Acuse de recibo que devolvemos al emisor cuando nos llega un e-CF. */
export function buildArecf(input: {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  received: boolean;
  /** 1 especificacion, 2 firma, 3 duplicado, 4 RNC comprador no corresponde. */
  reason?: 1 | 2 | 3 | 4;
  at: Date;
}) {
  return toXml(
    node("ARECF", [
      node("DetalleAcusedeRecibo", [
        leaf("Version", "1.0"),
        leaf("RNCEmisor", cleanTaxId(input.rncEmisor)),
        leaf("RNCComprador", cleanTaxId(input.rncComprador)),
        leaf("eNCF", input.encf.toUpperCase()),
        leaf("Estado", input.received ? 0 : 1),
        !input.received ? leaf("CodigoMotivoNoRecibido", input.reason ?? 1) : null,
        leaf("FechaHoraAcuseRecibo", dgiiDateTime(input.at)),
      ]),
    ]),
  );
}

/** Aprobacion o rechazo comercial de un e-CF que recibimos. */
export function buildAcecf(input: {
  rncEmisor: string;
  encf: string;
  issueDate: Date;
  total: number;
  rncComprador: string;
  approved: boolean;
  reason?: string | null;
  at: Date;
}) {
  if (!input.approved && !clip(input.reason, 250)) {
    throw new Error("El rechazo comercial requiere el motivo.");
  }
  return toXml(
    node("ACECF", [
      node("DetalleAprobacionComercial", [
        leaf("Version", "1.0"),
        leaf("RNCEmisor", cleanTaxId(input.rncEmisor)),
        leaf("eNCF", input.encf.toUpperCase()),
        leaf("FechaEmision", dgiiDate(input.issueDate)),
        leaf("MontoTotal", money(input.total)),
        leaf("RNCComprador", cleanTaxId(input.rncComprador)),
        leaf("Estado", input.approved ? 1 : 2),
        !input.approved ? leaf("DetalleMotivoRechazo", clip(input.reason, 250)) : null,
        leaf("FechaHoraAprobacionComercial", dgiiDateTime(input.at)),
      ]),
    ]),
  );
}

export type AnnulmentRange = { type: number; from: number; to: number };

/** Anulacion de rangos de e-NCF que no se usaron o que se firmaron y nunca se enviaron. */
export function buildAnecf(rncEmisor: string, ranges: AnnulmentRange[], at: Date) {
  const byType = new Map<number, AnnulmentRange[]>();
  for (const range of ranges) {
    if (range.from < 1 || range.to < range.from) throw new Error("Rango de anulacion invalido.");
    byType.set(range.type, [...(byType.get(range.type) || []), range]);
  }
  if (byType.size === 0 || byType.size > 10) throw new Error("La anulacion admite de 1 a 10 tipos de e-CF.");

  const encf = (type: number, n: number) => `E${String(type).padStart(2, "0")}${String(n).padStart(10, "0")}`;
  const count = (list: AnnulmentRange[]) => list.reduce((acc, r) => acc + (r.to - r.from + 1), 0);
  let line = 0;
  const total = [...byType.values()].reduce((acc, list) => acc + count(list), 0);

  const detail: XmlNode[] = [...byType.entries()].map(([type, list]) =>
    node("Anulacion", [
      leaf("NoLinea", ++line),
      leaf("TipoeCF", type),
      node(
        "TablaRangoSecuenciasAnuladaseNCF",
        list.map((r) => node("Secuencias", [leaf("SecuenciaeNCFDesde", encf(type, r.from)), leaf("SecuenciaeNCFHasta", encf(type, r.to))])),
      ),
      leaf("CantidadeNCFAnulados", count(list)),
    ]) as XmlNode,
  );

  return toXml(
    node("ANECF", [
      node("Encabezado", [
        leaf("Version", "1.0"),
        leaf("RncEmisor", cleanTaxId(rncEmisor)),
        leaf("CantidadeNCFAnulados", total),
        leaf("FechaHoraAnulacioneNCF", dgiiDateTime(at)),
      ]),
      node("DetalleAnulacion", detail),
    ]),
  );
}

/** Nombre de archivo que pide la DGII: RNC + e-NCF. */
export function ecfFileName(rnc: string, encf: string) {
  return `${cleanTaxId(rnc)}${encf.toUpperCase()}.xml`;
}
