import * as cheerio from "cheerio";
import QRCode from "qrcode";

const DGII_URL =
  "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ncf.aspx";
const TIMBRE_URL = "https://ecf.dgii.gov.do/ecf/ConsultaTimbre";

const REQUEST_TIMEOUT_MS = Number(process.env.DGII_ENCF_TIMEOUT_MS || 25_000);
const DEFAULT_SWEEP_SECONDS = Number(process.env.DGII_ENCF_SWEEP_SECONDS || 15);
const SWEEP_CONCURRENCY = Math.max(1, Number(process.env.DGII_ENCF_SWEEP_CONCURRENCY || 6));
const TOTAL_BUDGET_MS = Number(process.env.DGII_ENCF_BUDGET_MS || 90_000);

const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-DO,es-ES;q=0.9,es;q=0.8,en;q=0.6",
};

export interface DgiiEncfInput {
  rncEmisor: string;
  encf: string;
  rncComprador: string;
  codigoSeguridad: string;
  horaFirma?: string;
  // Muchas facturas imprimen dos horas: la de la venta en el encabezado y la de la firma
  // digital junto al código de seguridad, que suelen diferir por segundos. Cualquiera de
  // las dos puede ser la que valida, así que se prueban ambas antes de barrer offsets.
  horaFirmaAlt?: string;
  // "second" cuando la hora vino completa (17:17:01) y "minute" cuando la factura
  // solo mostraba hora y minutos (17:17). Decide qué tan ancho es el barrido.
  horaFirmaPrecision?: "second" | "minute";
}

export interface DgiiEncfExtractedData {
  fechaEmision: string;
  montoTotal: string;
  fechaFirma: string;
  estado: string;
  totalItbis: string;
  razonSocialEmisor: string;
}

export interface DgiiEncfValidation {
  validated: boolean;
  mode: "date_only" | "dgii_hour" | "sweep" | "minute_sweep";
  attempted: number;
  matchedOffsetSeconds: number | null;
  horaFirmaUsada: string | null;
  fechaFirma: string;
  checkedUrl: string;
  message: string;
}

export interface DgiiEncfResult {
  message: string;
  elapsedMs: number;
  extracted: DgiiEncfExtractedData;
  validation: DgiiEncfValidation;
  timbreUrl: string;
  qrDataUrl: string;
  dgiiUrl: string;
}

/**
 * Distingue por qué rechazó la DGII, que es lo que decide si vale la pena buscar
 * variantes del código de seguridad:
 * - "bad_rnc_or_encf": el par RNC emisor + e-NCF no existe. Probar códigos es inútil.
 * - "not_found": ese par sí existe, pero el código de seguridad (o el RNC comprador)
 *   no coincide. Aquí sí tiene sentido buscar.
 */
export type DgiiEncfFailureKind = "not_found" | "bad_rnc_or_encf" | "other";

export class FriendlyError extends Error {
  readonly kind: DgiiEncfFailureKind;

  constructor(message: string, kind: DgiiEncfFailureKind = "other") {
    super(message);
    this.kind = kind;
  }
}

export function sanitizeDgiiEncfInput(body: Partial<DgiiEncfInput>) {
  const data: DgiiEncfInput = {
    rncEmisor: normalizeTaxId(body.rncEmisor),
    encf: normalizeCompact(body.encf).toUpperCase(),
    rncComprador: normalizeTaxId(body.rncComprador),
    codigoSeguridad: normalizeCompact(body.codigoSeguridad),
    horaFirma: normalizeTime(body.horaFirma),
    horaFirmaAlt: normalizeTime(body.horaFirmaAlt),
  };

  if (!data.rncEmisor || !data.encf || !data.rncComprador || !data.codigoSeguridad) {
    return {
      ok: false as const,
      message:
        "Completa RNC emisor, e-NCF, RNC comprador y código de seguridad antes de consultar.",
    };
  }

  const horaPattern = /^([0-1]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  for (const [etiqueta, valor] of [
    ["hora de firma", data.horaFirma],
    ["segunda hora", data.horaFirmaAlt],
  ] as const) {
    if (valor && !horaPattern.test(valor)) {
      return {
        ok: false as const,
        message: `La ${etiqueta} debe tener formato HH:mm:ss (17:17:01) o HH:mm (17:17) si la factura no muestra los segundos.`,
      };
    }
  }

  // La precisión decide el ancho del barrido. Si solo vino la hora alterna, es ella la
  // que se va a barrer, así que manda su propio formato.
  const horaParaPrecision = data.horaFirma || data.horaFirmaAlt;

  if (horaParaPrecision) {
    data.horaFirmaPrecision = horaParaPrecision.length === 5 ? "minute" : "second";
  }

  return { ok: true as const, data };
}

export async function rebuildDgiiEncfTimbre(input: DgiiEncfInput): Promise<DgiiEncfResult> {
  const startedAt = Date.now();
  const deadline = startedAt + TOTAL_BUDGET_MS;

  const extracted = await consultarEncf(input);

  const validation = await validateOrSweepTimbre({ input, extracted, deadline });

  const timbreUrl = buildTimbreUrl({
    rncEmisor: input.rncEmisor,
    rncComprador: input.rncComprador,
    encf: input.encf,
    fechaEmision: extracted.fechaEmision,
    montoTotal: extracted.montoTotal,
    fechaFirma: validation.fechaFirma,
    codigoSeguridad: input.codigoSeguridad,
  });

  const qrDataUrl = await QRCode.toDataURL(timbreUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });

  // Solo cuando el enlace quedó validado: si no lo está, la página del timbre no muestra
  // la factura y la consulta sería un viaje perdido contra un servicio del gobierno.
  if (validation.validated) {
    extracted.razonSocialEmisor = await fetchRazonSocialEmisor(timbreUrl);
  }

  return {
    message: "Factura encontrada. Se reconstruyó el enlace oficial del timbre DGII.",
    elapsedMs: Date.now() - startedAt,
    extracted,
    validation,
    timbreUrl,
    qrDataUrl,
    dgiiUrl: DGII_URL,
  };
}

async function dgiiFetch(url: string, init: RequestInit, label: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { ...BASE_HEADERS, ...(init.headers as Record<string, string> | undefined) },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new FriendlyError(
        `La DGII no respondió a tiempo durante ${label}. Intenta nuevamente en unos segundos.`
      );
    }

    throw new FriendlyError(
      `No fue posible conectar con la DGII durante ${label}. Revisa la conexión e intenta de nuevo.`
    );
  } finally {
    clearTimeout(timer);
  }
}

function readCookies(response: Response) {
  const jar = response.headers.getSetCookie?.() ?? [];
  if (jar.length > 0) {
    return jar.map((cookie) => cookie.split(";")[0]).join("; ");
  }

  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

async function consultarEncf(input: DgiiEncfInput): Promise<DgiiEncfExtractedData> {
  const formResponse = await dgiiFetch(DGII_URL, {}, "la carga del formulario");

  if (!formResponse.ok) {
    throw new FriendlyError(
      `La página de consulta de DGII respondió con un error ${formResponse.status}. Intenta más tarde.`
    );
  }

  const formHtml = await formResponse.text();
  const cookies = readCookies(formResponse);
  const $ = cheerio.load(formHtml);
  const hiddenValue = (name: string) => $(`input[name="${name}"]`).attr("value") || "";

  const viewState = hiddenValue("__VIEWSTATE");
  if (!viewState) {
    throw new FriendlyError(
      "La página de consulta de DGII cambió su estructura y no expuso el formulario esperado."
    );
  }

  const payload = new URLSearchParams({
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    __VIEWSTATE: viewState,
    __VIEWSTATEGENERATOR: hiddenValue("__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hiddenValue("__EVENTVALIDATION"),
    "ctl00$cphMain$txtRNC": input.rncEmisor,
    "ctl00$cphMain$txtNCF": input.encf,
    "ctl00$cphMain$txtRncComprador": input.rncComprador,
    "ctl00$cphMain$txtCodigoSeg": input.codigoSeguridad,
    "ctl00$cphMain$btnConsultar": "Buscar",
  });

  const consultaResponse = await dgiiFetch(
    DGII_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://dgii.gov.do",
        Referer: DGII_URL,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: payload.toString(),
    },
    "la consulta del e-NCF"
  );

  if (!consultaResponse.ok) {
    throw new FriendlyError(
      `La DGII respondió con un error ${consultaResponse.status} al consultar el e-NCF.`
    );
  }

  return parseConsultaResult(await consultaResponse.text());
}

function parseConsultaResult(html: string): DgiiEncfExtractedData {
  const $ = cheerio.load(html);
  const label = (id: string) => cleanText($(`#${id}`).text());

  const encf = label("cphMain_lblencf");

  if (!encf) {
    const message = buildNotFoundMessage($);
    throw new FriendlyError(message, classifyNotFound(message));
  }

  const fechaEmision = label("cphMain_lblFechaEmision");
  const montoTotal = label("cphMain_lblMontoTotal");
  const fechaFirma = label("cphMain_lblFechaFirma");

  if (!fechaEmision || !montoTotal || !fechaFirma) {
    throw new FriendlyError(
      "La DGII encontró el comprobante pero no devolvió fecha de emisión, monto o fecha de firma."
    );
  }

  return {
    fechaEmision: normalizeDate(fechaEmision),
    montoTotal: normalizeAmount(montoTotal),
    fechaFirma: normalizeDateTime(fechaFirma),
    estado: label("cphMain_lblEstadoFe"),
    totalItbis: normalizeAmount(label("cphMain_lblTotalItbis")),
    // ncf.aspx no publica el nombre del emisor, solo su RNC. Se rellena después desde la
    // página del timbre, que sí lo trae. Verificado contra el sitio real el 2026-08-31.
    razonSocialEmisor: "",
  };
}

const EMISOR_NAME_LABEL = /(raz[oó]n\s*social|nombre)[^a-z]*emisor/i;

/**
 * La página del timbre arma sus datos como filas de dos celdas
 * (`<th>Razón social emisor</th><td>ACABADOS AUTOMOTRICES SAS</td>`), el mismo formato
 * que lee la constancia. Es best-effort a propósito: si la DGII renombra el rótulo o la
 * página no carga, la reconstrucción sigue saliendo completa y lo único que falta es el
 * nombre, que el formulario de compra deja escribir a mano.
 */
async function fetchRazonSocialEmisor(url: string): Promise<string> {
  try {
    const response = await dgiiFetch(url, {}, "la lectura del emisor");
    if (!response.ok) return "";

    const $ = cheerio.load(await response.text());
    $("script, style").remove();

    let found = "";

    $("tr").each((_, row) => {
      if (found) return;

      const cells = $(row).find("th, td");
      if (cells.length !== 2) return;
      if (!EMISOR_NAME_LABEL.test(cleanText($(cells[0]).text()))) return;

      found = cleanText($(cells[1]).text());
    });

    return found;
  } catch {
    return "";
  }
}

// La DGII usa dos mensajes distintos y esa diferencia es la única señal disponible para
// saber qué campo está mal. Verificado el 2026-08-31 consultando a propósito con cada
// campo corrompido por separado.
function classifyNotFound(message: string): DgiiEncfFailureKind {
  if (/no corresponde a este rnc|comprobante fiscal ingresado no es correcto/i.test(message)) {
    return "bad_rnc_or_encf";
  }

  if (/no encontrado|no devolvió datos/i.test(message)) {
    return "not_found";
  }

  return "other";
}

function buildNotFoundMessage($: cheerio.CheerioAPI) {
  const notices: string[] = [];

  $("#cphMain_lblInformacion, span[id^='cphMain_rfv'], span[id^='cphMain_rev']").each((_, el) => {
    const element = $(el);
    const style = (element.attr("style") || "").replace(/\s+/g, "").toLowerCase();

    if (style.includes("display:none") || style.includes("visibility:hidden")) {
      return;
    }

    const text = cleanText(element.text());
    if (text && !notices.includes(text)) {
      notices.push(text);
    }
  });

  if (notices.length === 0) {
    return "La DGII no devolvió datos para ese comprobante. Verifica el RNC emisor, el e-NCF y el código de seguridad.";
  }

  return `DGII respondió: ${notices.join(" ")}`;
}

async function validateOrSweepTimbre({
  input,
  extracted,
  deadline,
}: {
  input: DgiiEncfInput;
  extracted: DgiiEncfExtractedData;
  deadline: number;
}): Promise<DgiiEncfValidation> {
  const minuteOnly = input.horaFirmaPrecision === "minute";
  const horaBase = expandHora(input.horaFirma);
  const horaAlt = expandHora(input.horaFirmaAlt);
  const horaDgii = extractHoraFirmaDgii(extracted.fechaFirma);
  const baseFechaFirma = combineFechaFirma(
    extracted.fechaFirma,
    horaBase || expandHora(horaDgii?.hora)
  );
  const baseUrl = buildTimbreUrl({
    rncEmisor: input.rncEmisor,
    rncComprador: input.rncComprador,
    encf: input.encf,
    fechaEmision: extracted.fechaEmision,
    montoTotal: extracted.montoTotal,
    fechaFirma: baseFechaFirma,
    codigoSeguridad: input.codigoSeguridad,
  });

  const candidates = buildSweepCandidates({
    fechaFirma: extracted.fechaFirma,
    horaDgii,
    horaBase,
    horaAlt,
    rangeSeconds: DEFAULT_SWEEP_SECONDS,
    minuteOnly,
  });

  if (candidates.length === 0) {
    return {
      validated: false,
      mode: "date_only",
      attempted: 0,
      matchedOffsetSeconds: null,
      horaFirmaUsada: null,
      fechaFirma: extracted.fechaFirma,
      checkedUrl: baseUrl,
      message:
        "Se generó el enlace con la fecha de firma de DGII, pero no se pudo validar: la DGII no devolvió la hora de la firma y tampoco se indicó una.",
    };
  }

  const mode: DgiiEncfValidation["mode"] = horaBase
    ? minuteOnly
      ? "minute_sweep"
      : "sweep"
    : "dgii_hour";

  let attempted = 0;

  for (const batch of buildBatches(candidates, Boolean(horaDgii?.hasSeconds))) {
    if (Date.now() > deadline) {
      break;
    }

    const urls = batch.map((candidate) =>
      buildTimbreUrl({
        rncEmisor: input.rncEmisor,
        rncComprador: input.rncComprador,
        encf: input.encf,
        fechaEmision: extracted.fechaEmision,
        montoTotal: extracted.montoTotal,
        fechaFirma: candidate.fechaFirma,
        codigoSeguridad: input.codigoSeguridad,
      })
    );

    const results = await Promise.all(urls.map((url) => isTimbreValid(url, input.encf)));
    attempted += batch.length;

    const hitIndex = results.findIndex(Boolean);
    if (hitIndex !== -1) {
      const candidate = batch[hitIndex];

      return {
        validated: true,
        mode,
        attempted,
        matchedOffsetSeconds: candidate.offsetSeconds,
        horaFirmaUsada: candidate.hora,
        fechaFirma: candidate.fechaFirma,
        checkedUrl: urls[hitIndex],
        message: describeHit(candidate, minuteOnly),
      };
    }
  }

  const incomplete = attempted < candidates.length;

  return {
    validated: false,
    mode,
    attempted,
    matchedOffsetSeconds: null,
    horaFirmaUsada: horaBase || horaDgii?.hora || null,
    fechaFirma: baseFechaFirma,
    checkedUrl: baseUrl,
    message: incomplete
      ? `Se agotó el tiempo disponible tras ${attempted} intentos sin validar el enlace. Verifica la hora de firma exacta.`
      : describeMiss({
          horaDgii,
          horaBase,
          horaAlt,
          horaEscrita: input.horaFirma,
          horaEscritaAlt: input.horaFirmaAlt,
          minuteOnly,
        }),
  };
}

// Cuando la DGII dio la hora exacta, esa candidata va sola en la primera tanda: casi
// siempre acierta y no tiene sentido lanzarle cinco consultas más en paralelo para
// terminar descartándolas. El resto sí va en tandas de SWEEP_CONCURRENCY.
function buildBatches(candidates: SweepCandidate[], leadAlone: boolean) {
  const batches: SweepCandidate[][] = [];
  const rest = leadAlone ? candidates.slice(1) : candidates;

  if (leadAlone) {
    batches.push([candidates[0]]);
  }

  for (let start = 0; start < rest.length; start += SWEEP_CONCURRENCY) {
    batches.push(rest.slice(start, start + SWEEP_CONCURRENCY));
  }

  return batches;
}

function describeHit(candidate: SweepCandidate, minuteOnly: boolean) {
  if (candidate.source === "dgii") {
    return `El enlace fue validado con la hora de firma que devolvió la DGII (${candidate.hora}).`;
  }

  const cual = candidate.source === "alt" ? "la segunda hora de la factura" : "la hora base indicada";

  if (minuteOnly) {
    return `El enlace fue validado con la hora ${candidate.hora}: la firma cayó en el segundo ${String(
      candidate.offsetSeconds
    ).padStart(2, "0")} del minuto de ${cual}.`;
  }

  return candidate.offsetSeconds === 0
    ? `El enlace fue validado con ${cual} (${candidate.hora}).`
    : `El enlace fue validado ajustando ${formatOffset(
        candidate.offsetSeconds ?? 0
      )} respecto a ${cual}.`;
}

function describeMiss({
  horaDgii,
  horaBase,
  horaAlt,
  horaEscrita,
  horaEscritaAlt,
  minuteOnly,
}: {
  horaDgii: HoraFirmaDgii | null;
  horaBase: string;
  horaAlt: string;
  horaEscrita?: string;
  horaEscritaAlt?: string;
  minuteOnly: boolean;
}) {
  const intentos: string[] = [];

  if (horaDgii) {
    intentos.push(
      horaDgii.hasSeconds
        ? `la hora de firma que devolvió la DGII (${horaDgii.hora})`
        : `los 60 segundos del minuto ${horaDgii.hora} que devolvió la DGII`
    );
  }

  const describirBarrido = (hora: string, escrita: string | undefined, etiqueta: string) =>
    minuteOnly
      ? `los 60 segundos del minuto ${escrita || hora} (${etiqueta})`
      : `un barrido de ±${DEFAULT_SWEEP_SECONDS} segundos alrededor de ${hora} (${etiqueta})`;

  if (horaBase) {
    intentos.push(describirBarrido(horaBase, horaEscrita, "hora de firma"));
  }

  if (horaAlt) {
    intentos.push(describirBarrido(horaAlt, horaEscritaAlt, "segunda hora"));
  }

  return `No se validó el enlace probando ${intentos.join(" y ")}.`;
}

// DGII devuelve HTTP 200 tanto para el timbre válido como para el inválido: hay que
// mirar el contenido. La página de "no encontrada" nunca repite el e-NCF consultado
// (verificado contra el sitio real), así que ese eco es la señal positiva más estable:
// no depende de las etiquetas en español del panel de resultado, que pueden cambiar.
async function isTimbreValid(url: string, encf: string) {
  try {
    const response = await dgiiFetch(url, {}, "la validación del timbre");

    if (!response.ok) {
      return false;
    }

    const $ = cheerio.load(await response.text());
    $("script, style").remove();
    const text = cleanText($("body").text());

    if (/No fue encontrada la factura/i.test(text)) {
      return false;
    }

    return text.toUpperCase().includes(encf.toUpperCase());
  } catch {
    return false;
  }
}

interface SweepCandidate {
  hora: string;
  fechaFirma: string;
  // Segundos de ajuste respecto a la hora escrita por el usuario; null cuando la hora
  // salió de la propia DGII y no de un ajuste.
  offsetSeconds: number | null;
  // "base" es la hora de firma digital y "alt" la otra hora impresa en la factura.
  source: "dgii" | "base" | "alt";
}

interface HoraFirmaDgii {
  hora: string;
  hasSeconds: boolean;
}

// La consulta de DGII normalmente devuelve la fecha de firma con su hora ("13-05-2025
// 17:17:01"). Esa hora sale del XML firmado, así que es la candidata con más
// probabilidad de validar y conviene probarla antes que cualquier ajuste manual.
function extractHoraFirmaDgii(fechaFirma: string): HoraFirmaDgii | null {
  const text = cleanText(fechaFirma);
  // La fecha viene como DD-MM-YYYY, sin dos puntos, así que el primer match es la hora.
  const match = text.match(/(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);

  if (/p\.?\s?m\.?/i.test(text) && hours < 12) {
    hours += 12;
  } else if (/a\.?\s?m\.?/i.test(text) && hours === 12) {
    hours = 0;
  }

  if (hours > 23) {
    return null;
  }

  const hhmm = `${String(hours).padStart(2, "0")}:${match[2]}`;

  return match[3]
    ? { hora: `${hhmm}:${match[3]}`, hasSeconds: true }
    : { hora: hhmm, hasSeconds: false };
}

// Orden de prueba: primero la hora que dio la DGII (suele acertar al primer intento) y
// después la hora escrita por el usuario. Con hora al segundo se abre en abanico a su
// alrededor; con hora al minuto (la factura solo imprimió 17:17) el segundo es
// desconocido y se recorre el minuto entero, porque barrer ±rangeSeconds desde :00
// dejaría fuera más de media vuelta del reloj.
function buildSweepCandidates({
  fechaFirma,
  horaDgii,
  horaBase,
  horaAlt,
  rangeSeconds,
  minuteOnly,
}: {
  fechaFirma: string;
  horaDgii: HoraFirmaDgii | null;
  horaBase: string;
  horaAlt: string;
  rangeSeconds: number;
  minuteOnly: boolean;
}) {
  const normalizedDate = normalizeDateTime(fechaFirma).split(" ")[0];
  const candidates: SweepCandidate[] = [];
  const seen = new Set<string>();

  const add = (hora: string, source: SweepCandidate["source"], offsetSeconds: number | null) => {
    if (seen.has(hora)) {
      return;
    }

    seen.add(hora);
    candidates.push({ hora, source, offsetSeconds, fechaFirma: `${normalizedDate} ${hora}` });
  };

  // Primero las horas tal como vinieron: la que devolvió la DGII y las dos que trae
  // impresas la factura. Una de ellas acierta casi siempre, y probarlas antes de barrer
  // evita cientos de consultas cuando la hora buena estaba escrita desde el principio.
  if (horaDgii?.hasSeconds) {
    add(horaDgii.hora, "dgii", null);
  }

  if (!minuteOnly) {
    if (horaBase) {
      add(horaBase, "base", 0);
    }

    if (horaAlt) {
      add(horaAlt, "alt", 0);
    }
  }

  // La DGII dio hora pero sin segundos: hay que recorrer el minuto completo.
  if (horaDgii && !horaDgii.hasSeconds) {
    for (let second = 0; second < 60; second += 1) {
      add(`${horaDgii.hora}:${String(second).padStart(2, "0")}`, "dgii", null);
    }
  }

  const sweepDesde = (hora: string, source: "base" | "alt") => {
    if (!hora) {
      return;
    }

    const base = parseTimeToSeconds(hora);
    const offsets: number[] = [];

    if (minuteOnly) {
      for (let second = 0; second < 60; second += 1) {
        offsets.push(second);
      }
    } else {
      offsets.push(0);

      for (let step = 1; step <= rangeSeconds; step += 1) {
        offsets.push(step, -step);
      }
    }

    for (const offsetSeconds of offsets) {
      const total = base + offsetSeconds;

      if (total >= 0 && total <= 86_399) {
        add(formatSecondsAsTime(total), source, offsetSeconds);
      }
    }
  };

  // El barrido de cada hora va completo antes de pasar al de la otra: si la firma quedó
  // a un par de segundos de la hora buena, se encuentra sin agotar el presupuesto.
  sweepDesde(horaBase, "base");
  sweepDesde(horaAlt, "alt");

  return candidates;
}

function buildTimbreUrl(data: {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  fechaEmision: string;
  montoTotal: string;
  fechaFirma: string;
  codigoSeguridad: string;
}) {
  const params = [
    ["RncEmisor", data.rncEmisor],
    ["RncComprador", data.rncComprador],
    ["ENCF", data.encf],
    ["FechaEmision", data.fechaEmision],
    ["MontoTotal", data.montoTotal],
    ["FechaFirma", data.fechaFirma],
    ["CodigoSeguridad", data.codigoSeguridad],
  ];

  const queryString = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${TIMBRE_URL}?${queryString}`;
}

function cleanText(value: string) {
  return String(value || "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function normalizeTaxId(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeTime(value: unknown) {
  const compact = String(value || "").trim();
  if (!compact) {
    return "";
  }

  if (/^\d{6}$/.test(compact)) {
    return `${compact.slice(0, 2)}:${compact.slice(2, 4)}:${compact.slice(4, 6)}`;
  }

  if (/^\d{4}$/.test(compact)) {
    return `${compact.slice(0, 2)}:${compact.slice(2, 4)}`;
  }

  const parts = compact.split(":");
  if (
    (parts.length === 3 || parts.length === 2) &&
    parts.every((part) => /^\d{1,2}$/.test(part))
  ) {
    return parts.map((part) => part.padStart(2, "0")).join(":");
  }

  return compact;
}

function normalizeDate(value: string) {
  const normalized = value.replace(/\//g, "-").trim();

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
  }

  const localMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (localMatch) {
    const [, day, month, year] = localMatch;
    return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
  }

  return normalized;
}

function normalizeDateTime(value: string) {
  const [datePart, timePart] = cleanText(value).split(" ");
  const normalizedDate = normalizeDate(datePart);
  return timePart ? `${normalizedDate} ${timePart}` : normalizedDate;
}

// "17:17" describe un minuto entero; para armar una URL concreta hace falta un segundo,
// y el minuto siempre empieza en :00.
function expandHora(horaFirma?: string) {
  if (!horaFirma) {
    return "";
  }

  return horaFirma.length === 5 ? `${horaFirma}:00` : horaFirma;
}

function combineFechaFirma(fechaFirma: string, horaFirma?: string) {
  const normalizedDate = normalizeDateTime(fechaFirma).split(" ")[0];
  return horaFirma ? `${normalizedDate} ${horaFirma}` : normalizedDate;
}

function parseTimeToSeconds(value: string) {
  const [hours, minutes, seconds] = String(value).split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSecondsAsTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatOffset(offsetSeconds: number) {
  return `${offsetSeconds > 0 ? "+" : ""}${offsetSeconds} segundos`;
}

function normalizeAmount(value: string) {
  return cleanText(value).replace(/RD\$/gi, "").replace(/,/g, "").trim();
}

/**
 * El código de seguridad son los primeros 6 caracteres de la firma digital, que va en
 * Base64: el alfabeto es A-Z, a-z, 0-9, "+" y "/". Como no excluye ningún carácter, no
 * hay forma de descartar una lectura por el alfabeto, y en impresión térmica pequeña
 * varios pares quedan idénticos. Cada entrada lista las alternativas plausibles para un
 * carácter leído, ordenadas de más a menos probable.
 */
const CONFUSIONES: Record<string, string[]> = {
  I: ["l", "1"], l: ["I", "1"], "1": ["l", "I", "7"],
  O: ["0", "o", "Q"], "0": ["O", "o", "D"], o: ["O", "0"], Q: ["O", "0"],
  S: ["5", "s"], "5": ["S", "s"], s: ["S", "5"],
  Z: ["2", "z"], "2": ["Z", "z"], z: ["Z", "2"],
  B: ["8"], "8": ["B", "S"],
  G: ["6", "C"], "6": ["G", "b"], b: ["6", "h"],
  q: ["g", "9"], g: ["q", "9"], "9": ["g", "q"],
  U: ["V", "u"], V: ["U", "v", "Y"], u: ["U", "v", "n"], v: ["V", "u", "y"],
  D: ["0", "O"], "7": ["1", "/"], "/": ["7", "1"], "+": ["t"], t: ["+", "f"],
  c: ["e"], e: ["c"], n: ["h", "u"], h: ["n", "b"], m: ["rn"], Y: ["V", "y"], y: ["v", "Y"],
  C: ["G"], f: ["t"], j: ["i"], i: ["j", "l"],
};

export interface CodigoSearchProgress {
  intentos: number;
  total: number;
}

export interface CodigoSearchResult {
  encontrado: boolean;
  // Motivo por el que no se buscó o no se halló, para explicárselo al usuario.
  motivo: "hallado" | "sin_candidatos" | "agotado" | "tope" | "rnc_o_encf";
  codigo: string | null;
  intentos: number;
  candidatosTotales: number;
}

/**
 * Genera variantes del código ordenadas por cantidad de sustituciones: primero el código
 * tal como se leyó, después las de un solo cambio, luego dos, y así. Un OCR se equivoca
 * en pocos caracteres, de modo que ese orden encuentra el correcto mucho antes de agotar
 * el espacio, que crece muy rápido con la longitud.
 */
export function buildCodigoCandidates(codigo: string, maxCandidatos = 200) {
  const base = [...codigo];
  const alternativas = base.map((ch) => CONFUSIONES[ch] || []);
  const posicionesDudosas = alternativas.reduce((total, alts) => total + (alts.length > 0 ? 1 : 0), 0);
  const candidatos: string[] = [codigo];
  const vistos = new Set([codigo]);

  const combinar = (posiciones: number[], indice: number, actual: string[]) => {
    if (candidatos.length >= maxCandidatos) return;

    if (indice === posiciones.length) {
      const texto = actual.join("");
      if (!vistos.has(texto)) {
        vistos.add(texto);
        candidatos.push(texto);
      }
      return;
    }

    const pos = posiciones[indice];
    for (const alt of alternativas[pos]) {
      const siguiente = [...actual];
      siguiente[pos] = alt;
      combinar(posiciones, indice + 1, siguiente);
      if (candidatos.length >= maxCandidatos) return;
    }
  };

  const elegirPosiciones = (distancia: number, desde: number, elegidas: number[]) => {
    if (candidatos.length >= maxCandidatos) return;

    if (elegidas.length === distancia) {
      combinar(elegidas, 0, base);
      return;
    }

    for (let pos = desde; pos < base.length; pos += 1) {
      if (alternativas[pos].length === 0) continue;
      elegirPosiciones(distancia, pos + 1, [...elegidas, pos]);
      if (candidatos.length >= maxCandidatos) return;
    }
  };

  for (let distancia = 1; distancia <= posicionesDudosas; distancia += 1) {
    elegirPosiciones(distancia, 0, []);
    if (candidatos.length >= maxCandidatos) break;
  }

  return candidatos;
}

/**
 * Prueba variantes del código de seguridad contra la DGII hasta que una devuelva la
 * factura. Solo corre cuando la DGII ya confirmó que el RNC emisor y el e-NCF existen:
 * si el problema fuera ese par, ninguna variante del código serviría y se estarían
 * gastando cientos de consultas para nada.
 */
export async function searchCodigoSeguridad(
  input: DgiiEncfInput,
  opciones: { maxCandidatos?: number; concurrencia?: number; onProgress?: (p: CodigoSearchProgress) => void } = {}
): Promise<CodigoSearchResult> {
  const maxCandidatos = Math.max(1, Math.min(opciones.maxCandidatos ?? 200, 400));
  const concurrencia = Math.max(1, Math.min(opciones.concurrencia ?? 4, 6));
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const candidatos = buildCodigoCandidates(input.codigoSeguridad, maxCandidatos);

  if (candidatos.length <= 1) {
    return { encontrado: false, motivo: "sin_candidatos", codigo: null, intentos: 0, candidatosTotales: candidatos.length };
  }

  let intentos = 0;

  for (let i = 0; i < candidatos.length; i += concurrencia) {
    if (Date.now() > deadline) {
      return { encontrado: false, motivo: "tope", codigo: null, intentos, candidatosTotales: candidatos.length };
    }

    const lote = candidatos.slice(i, i + concurrencia);
    const resultados = await Promise.all(
      lote.map(async (codigo) => {
        try {
          await consultarEncf({ ...input, codigoSeguridad: codigo });
          return codigo;
        } catch (error) {
          // El par RNC + e-NCF está mal: ninguna variante del código va a servir.
          if (error instanceof FriendlyError && error.kind === "bad_rnc_or_encf") {
            throw error;
          }
          return null;
        }
      })
    );

    intentos += lote.length;
    opciones.onProgress?.({ intentos, total: candidatos.length });

    const hallado = resultados.find(Boolean);
    if (hallado) {
      return { encontrado: true, motivo: "hallado", codigo: hallado, intentos, candidatosTotales: candidatos.length };
    }
  }

  return {
    encontrado: false,
    motivo: candidatos.length >= maxCandidatos ? "tope" : "agotado",
    codigo: null,
    intentos,
    candidatosTotales: candidatos.length,
  };
}
