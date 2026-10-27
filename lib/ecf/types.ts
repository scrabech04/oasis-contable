/**
 * Modelo de un comprobante fiscal electronico independiente de la base de datos.
 *
 * El generador de XML trabaja con esto y no con las filas de Prisma: asi se puede probar sin
 * base de datos y el mapeo desde una factura de OFlow vive en un solo sitio (from-invoice.ts).
 */

/** Tipos de e-CF que OFlow emite hoy. El formato admite tambien 41, 43, 44, 46 y 47. */
export type EcfType = 31 | 32 | 33 | 34 | 45;

export const ECF_TYPE_NAMES: Record<number, string> = {
  31: "Factura de Crédito Fiscal Electrónica",
  32: "Factura de Consumo Electrónica",
  33: "Nota de Débito Electrónica",
  34: "Nota de Crédito Electrónica",
  41: "Comprobante Electrónico de Compras",
  43: "Comprobante Electrónico para Gastos Menores",
  44: "Comprobante Electrónico para Regímenes Especiales",
  45: "Comprobante Electrónico Gubernamental",
  46: "Comprobante Electrónico para Exportaciones",
  47: "Comprobante Electrónico para Pagos al Exterior",
};

/** Monto a partir del cual la factura de consumo deja de ir como resumen (RFCE). */
export const CONSUMO_SUMMARY_LIMIT = 250_000;

/** 0 no facturable, 1 ITBIS 18%, 2 ITBIS 16%, 3 ITBIS 0%, 4 exento. */
export type BillingIndicator = 0 | 1 | 2 | 3 | 4;

/** 1 contado, 2 credito, 3 gratuito. */
export type PaymentType = 1 | 2 | 3;

/**
 * 1 efectivo, 2 cheque/transferencia/deposito, 3 tarjeta, 4 venta a credito,
 * 5 bonos o certificados de regalo, 6 permuta, 7 nota de credito, 8 otras.
 */
export type PaymentForm = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 1 anula, 2 corrige texto, 3 corrige montos, 4 reemplazo de NCF de contingencia, 5 referencia factura de consumo. */
export type ModificationCode = 1 | 2 | 3 | 4 | 5;

export type EcfIssuer = {
  rnc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  sucursal?: string | null;
  direccion: string;
  /** Codigos de 6 digitos de la Tabla III del Formato e-CF. */
  municipio?: string | null;
  provincia?: string | null;
  telefonos?: string[];
  correo?: string | null;
  website?: string | null;
  numeroFacturaInterna?: string | null;
};

export type EcfBuyer = {
  rnc?: string | null;
  identificadorExtranjero?: string | null;
  razonSocial?: string | null;
  contacto?: string | null;
  correo?: string | null;
  direccion?: string | null;
};

/** Linea tal como la da el usuario: precio sin ITBIS, igual que en OFlow. */
export type EcfLineInput = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  /** 18, 16 o 0. */
  taxRate: number;
  /** Fuerza el indicador; si no viene, 18->1, 16->2 y 0->4 (exento). */
  billingIndicator?: BillingIndicator;
  /** 1 bien, 2 servicio. Obligatorio en el formato. */
  goodOrService: 1 | 2;
  /** Descuento de la linea en monto. */
  discount?: number;
};

export type EcfReference = {
  /** NCF o e-NCF afectado. */
  ncf: string;
  fecha: Date;
  codigo: ModificationCode;
  razon?: string | null;
  rncOtroContribuyente?: string | null;
};

export type EcfDocumentInput = {
  type: EcfType;
  encf: string;
  /** Obligatoria salvo en 32 y 34. */
  sequenceExpiry?: Date | null;
  issueDate: Date;
  /** "01".."06". */
  incomeType: string;
  paymentType: PaymentType;
  paymentDueDate?: Date | null;
  paymentTerm?: string | null;
  /** Sin monto = el total del comprobante. */
  paymentForms?: Array<{ form: PaymentForm; amount?: number }>;
  issuer: EcfIssuer;
  buyer?: EcfBuyer | null;
  lines: EcfLineInput[];
  /** Descuento global en monto, se reparte entre las lineas antes del ITBIS. */
  globalDiscount?: number;
  reference?: EcfReference | null;
  /** Solo notas de credito: 1 si el comprobante afectado tiene mas de 30 dias. */
  creditNoteOver30Days?: boolean;
};

export type EcfComputedLine = {
  lineNumber: number;
  name: string;
  description: string | null;
  billingIndicator: BillingIndicator;
  goodOrService: 1 | 2;
  quantity: number;
  unitPrice: number;
  discount: number;
  amount: number;
};

export type EcfTotals = {
  montoGravadoTotal: number;
  montoGravadoI1: number;
  montoGravadoI2: number;
  montoGravadoI3: number;
  montoExento: number;
  totalItbis: number;
  totalItbis1: number;
  totalItbis2: number;
  totalItbis3: number;
  montoNoFacturable: number;
  montoTotal: number;
  hasI1: boolean;
  hasI2: boolean;
  hasI3: boolean;
  hasExento: boolean;
  hasNoFacturable: boolean;
};

export type EcfEnvironment = "TesteCF" | "CerteCF" | "eCF";

export const ECF_ENVIRONMENTS: EcfEnvironment[] = ["TesteCF", "CerteCF", "eCF"];

export function isEcfEnvironment(value: unknown): value is EcfEnvironment {
  return value === "TesteCF" || value === "CerteCF" || value === "eCF";
}

/** Tipo de e-CF a partir del e-NCF: "E310000000001" -> 31. */
export function ecfTypeFromEncf(encf: string | null | undefined): number | null {
  const match = /^E(\d{2})\d{10}$/i.exec(String(encf || "").trim());
  return match ? Number(match[1]) : null;
}

export function isEncf(value: string | null | undefined) {
  return /^E\d{12}$/i.test(String(value || "").trim());
}
