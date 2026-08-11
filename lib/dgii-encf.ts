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
  mode: "date_only" | "sweep";
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

  if (data.horaFirma && !/^([0-1]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(data.horaFirma)) {
    return {
      ok: false as const,
      message: "La hora de firma debe tener formato HH:mm:ss, por ejemplo 17:17:01.",
    };
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
  const baseFechaFirma = combineFechaFirma(extracted.fechaFirma, input.horaFirma);
  const baseUrl = buildTimbreUrl({
    rncEmisor: input.rncEmisor,
    rncComprador: input.rncComprador,
    encf: input.encf,
    fechaEmision: extracted.fechaEmision,
    montoTotal: extracted.montoTotal,
    fechaFirma: baseFechaFirma,
    codigoSeguridad: input.codigoSeguridad,
  });

  if (!input.horaFirma) {
    return {
      validated: false,
      mode: "date_only",
      attempted: 0,
      matchedOffsetSeconds: null,
      horaFirmaUsada: null,
      fechaFirma: extracted.fechaFirma,
      checkedUrl: baseUrl,
      message:
        "Se generó el enlace con la fecha de firma de DGII, pero no se pudo validar porque no se indicó una hora base.",
    };
  }

  const candidates = buildSweepCandidates(
    extracted.fechaFirma,
    input.horaFirma,
    DEFAULT_SWEEP_SECONDS
  );

  let attempted = 0;

  for (let start = 0; start < candidates.length; start += SWEEP_CONCURRENCY) {
    if (Date.now() > deadline) {
      break;
    }

    const batch = candidates.slice(start, start + SWEEP_CONCURRENCY);
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
        mode: "sweep",
        attempted,
        matchedOffsetSeconds: candidate.offsetSeconds,
        horaFirmaUsada: candidate.hora,
        fechaFirma: candidate.fechaFirma,
        checkedUrl: urls[hitIndex],
        message:
          candidate.offsetSeconds === 0
            ? "El enlace fue validado con la hora base indicada."
            : `El enlace fue validado ajustando ${formatOffset(candidate.offsetSeconds)} respecto a la hora base.`,
      };
    }
  }

  const incomplete = attempted < candidates.length;

  return {
    validated: false,
    mode: "sweep",
    attempted,
    matchedOffsetSeconds: null,
    horaFirmaUsada: input.horaFirma,
    fechaFirma: baseFechaFirma,
    checkedUrl: baseUrl,
    message: incomplete
      ? `Se agotó el tiempo disponible tras ${attempted} intentos sin validar el enlace. Verifica la hora de firma exacta.`
      : `No se validó el enlace con un barrido de ±${DEFAULT_SWEEP_SECONDS} segundos alrededor de la hora base.`,
  };
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

function buildSweepCandidates(fechaFirma: string, horaBase: string, rangeSeconds: number) {
  const normalizedDate = normalizeDateTime(fechaFirma).split(" ")[0];
  const base = parseTimeToSeconds(horaBase);
  const offsets = [0];

  for (let step = 1; step <= rangeSeconds; step += 1) {
    offsets.push(step, -step);
  }

  return offsets
    .map((offsetSeconds) => {
      const total = base + offsetSeconds;
      if (total < 0 || total > 86_399) {
        return null;
      }

      const hora = formatSecondsAsTime(total);
      return { offsetSeconds, hora, fechaFirma: `${normalizedDate} ${hora}` };
    })
    .filter(
      (candidate): candidate is { offsetSeconds: number; hora: string; fechaFirma: string } =>
        candidate !== null
    );
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

  const parts = compact.split(":");
  if (parts.length === 3 && parts.every((part) => /^\d{1,2}$/.test(part))) {
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
