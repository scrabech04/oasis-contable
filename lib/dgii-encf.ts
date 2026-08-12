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

export class FriendlyError extends Error {}

export function sanitizeDgiiEncfInput(body: Partial<DgiiEncfInput>) {
  const data: DgiiEncfInput = {
    rncEmisor: normalizeTaxId(body.rncEmisor),
    encf: normalizeCompact(body.encf).toUpperCase(),
    rncComprador: normalizeTaxId(body.rncComprador),
    codigoSeguridad: normalizeCompact(body.codigoSeguridad),
    horaFirma: normalizeTime(body.horaFirma),
  };

  if (!data.rncEmisor || !data.encf || !data.rncComprador || !data.codigoSeguridad) {
    return {
      ok: false as const,
      message:
        "Completa RNC emisor, e-NCF, RNC comprador y código de seguridad antes de consultar.",
    };
  }

  if (data.horaFirma) {
    if (!/^([0-1]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(data.horaFirma)) {
      return {
        ok: false as const,
        message:
          "La hora de firma debe tener formato HH:mm:ss (17:17:01) o HH:mm (17:17) si la factura no muestra los segundos.",
      };
    }

    data.horaFirmaPrecision = data.horaFirma.length === 5 ? "minute" : "second";
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
    throw new FriendlyError(buildNotFoundMessage($));
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
  };
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
      : describeMiss({ horaDgii, horaBase, horaEscrita: input.horaFirma, minuteOnly }),
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

  if (minuteOnly) {
    return `El enlace fue validado con la hora ${candidate.hora}: la firma cayó en el segundo ${String(
      candidate.offsetSeconds
    ).padStart(2, "0")} del minuto indicado.`;
  }

  return candidate.offsetSeconds === 0
    ? "El enlace fue validado con la hora base indicada."
    : `El enlace fue validado ajustando ${formatOffset(candidate.offsetSeconds ?? 0)} respecto a la hora base.`;
}

function describeMiss({
  horaDgii,
  horaBase,
  horaEscrita,
  minuteOnly,
}: {
  horaDgii: HoraFirmaDgii | null;
  horaBase: string;
  horaEscrita?: string;
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

  if (horaBase) {
    intentos.push(
      minuteOnly
        ? `los 60 segundos del minuto ${horaEscrita}`
        : `un barrido de ±${DEFAULT_SWEEP_SECONDS} segundos alrededor de ${horaBase}`
    );
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
  source: "dgii" | "base";
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
  rangeSeconds,
  minuteOnly,
}: {
  fechaFirma: string;
  horaDgii: HoraFirmaDgii | null;
  horaBase: string;
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

  if (horaDgii?.hasSeconds) {
    add(horaDgii.hora, "dgii", null);
  } else if (horaDgii) {
    for (let second = 0; second < 60; second += 1) {
      add(`${horaDgii.hora}:${String(second).padStart(2, "0")}`, "dgii", null);
    }
  }

  if (horaBase) {
    const base = parseTimeToSeconds(horaBase);
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
        add(formatSecondsAsTime(total), "base", offsetSeconds);
      }
    }
  }

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
