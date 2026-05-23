import path from "path";
import fs from "fs/promises";
import QRCode from "qrcode";
import { chromium, type BrowserContext, type Page } from "playwright";

const HEADLESS = process.env.DGII_ENCF_HEADLESS === "true";
const SLOW_MO = Number(process.env.DGII_ENCF_SLOW_MO || 125);
const DEFAULT_SWEEP_SECONDS = Number(process.env.DGII_ENCF_SWEEP_SECONDS || 15);
const DGII_URL =
  "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ncf.aspx";
const CACHE_DIR = path.join(process.cwd(), ".cache", "dgii-encf");
const SCREENSHOT_DIR = path.join(CACHE_DIR, "screenshots");
const USER_DATA_DIR = path.join(CACHE_DIR, "playwright-profile");
const CHROME_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
];

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
  headless: boolean;
  elapsedMs: number;
  extracted: DgiiEncfExtractedData;
  validation: DgiiEncfValidation;
  timbreUrl: string;
  qrDataUrl: string;
  dgiiUrl: string;
}

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
      message: "Completa RNC emisor, e-NCF, RNC comprador y código de seguridad antes de consultar.",
    };
  }

  if (data.horaFirma && !/^\d{2}:\d{2}:\d{2}$/.test(data.horaFirma)) {
    return {
      ok: false as const,
      message: "La hora de firma debe tener formato HH:mm:ss, por ejemplo 17:17:01.",
    };
  }

  return { ok: true as const, data };
}

export async function rebuildDgiiEncfTimbre(input: DgiiEncfInput): Promise<DgiiEncfResult> {
  const startedAt = Date.now();
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    await fs.mkdir(USER_DATA_DIR, { recursive: true });

    context = await createStealthContext();
    page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(45_000);

    await prepareStealthPage(page);
    await page.bringToFront().catch(() => undefined);

    await humanNavigate(page, DGII_URL);
    await assertNotBlocked(page);
    await waitForForm(page);
    await runConsultaFlow(page, input);

    const outcome = await waitForOutcome(page);
    if (!outcome.success) {
      throw new FriendlyError(outcome.message);
    }

    const validation = await validateOrSweepTimbre({
      context,
      input,
      extracted: outcome.data,
    });

    const timbreUrl = buildTimbreUrl({
      rncEmisor: input.rncEmisor,
      rncComprador: input.rncComprador,
      encf: input.encf,
      fechaEmision: outcome.data.fechaEmision,
      montoTotal: outcome.data.montoTotal,
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
      headless: HEADLESS,
      elapsedMs: Date.now() - startedAt,
      extracted: outcome.data,
      validation,
      timbreUrl,
      qrDataUrl,
      dgiiUrl: DGII_URL,
    };
  } catch (error) {
    if (page) {
      await captureFailureScreenshot(page).catch(() => undefined);
    }

    if (error instanceof FriendlyError) {
      throw error;
    }

    throw new FriendlyError(
      "No fue posible completar la consulta en DGII. Intenta nuevamente en unos segundos."
    );
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
  }
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

  return compact;
}

async function createStealthContext() {
  const userAgent =
    CHROME_USER_AGENTS[Math.floor(Math.random() * CHROME_USER_AGENTS.length)];

  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    slowMo: SLOW_MO,
    locale: "es-DO",
    timezoneId: "America/Santo_Domingo",
    viewport: { width: 1366, height: 900 },
    userAgent,
    colorScheme: "light",
    extraHTTPHeaders: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "es-DO,es-ES;q=0.9,es;q=0.8,en;q=0.6",
      "Cache-Control": "max-age=0",
      DNT: "1",
      "Upgrade-Insecure-Requests": "1",
    },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-default-browser-check",
      "--disable-features=IsolateOrigins,site-per-process",
      "--start-maximized",
    ],
  });
}

async function prepareStealthPage(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["es-DO", "es-ES", "es", "en-US"],
    });

    Object.defineProperty(navigator, "platform", {
      get: () => "Win32",
    });

    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => 8,
    });

    Object.defineProperty(navigator, "deviceMemory", {
      get: () => 8,
    });

    const chromeStub = {
      runtime: {},
      app: {},
      csi: () => undefined,
      loadTimes: () => undefined,
    };

    Object.defineProperty(window, "chrome", {
      value: chromeStub,
      configurable: true,
    });

    const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = ((parameters: PermissionDescriptor) =>
      parameters && parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters)) as typeof window.navigator.permissions.query;
  });
}

async function humanNavigate(page: Page, url: string) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  await randomPause(1200, 2200);
}

async function assertNotBlocked(page: Page) {
  const currentUrl = page.url();
  const pageText = normalizeVisibleText(await page.locator("body").innerText().catch(() => ""));

  if (
    pageText.match(/acceso denegado|error 403|solicitud fue bloqueada|servicios de seguridad/i) ||
    currentUrl.toLowerCase().includes("error")
  ) {
    throw new FriendlyError(
      "La DGII bloqueó temporalmente la consulta con un error 403. Espera unos minutos e intenta de nuevo."
    );
  }
}

async function waitForForm(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const totalInputs = await countVisibleTextInputs(page);

  if (totalInputs < 2) {
    throw new FriendlyError(
      "La página de DGII cargó, pero no expuso los campos mínimos esperados del formulario."
    );
  }
}

async function runConsultaFlow(page: Page, input: DgiiEncfInput) {
  const initialCount = await countVisibleTextInputs(page);

  if (initialCount >= 4) {
    await fillVisibleFields(page, [
      input.rncEmisor,
      input.encf,
      input.rncComprador,
      input.codigoSeguridad,
    ]);
    await submitConsulta(page);
    return;
  }

  if (initialCount >= 2) {
    await fillVisibleFields(page, [input.rncEmisor, input.encf]);
    await submitConsulta(page);

    const followUp = await waitForExpandedForm(page);
    if (followUp.state === "expanded") {
      await fillVisibleFields(page, [
        input.rncEmisor,
        input.encf,
        input.rncComprador,
        input.codigoSeguridad,
      ]);
      await submitConsulta(page);
      return;
    }

    if (followUp.state === "result" || followUp.state === "error") {
      return;
    }

    throw new FriendlyError(
      "DGII no mostró los campos adicionales ni devolvió resultado después de la primera búsqueda."
    );
  }

  throw new FriendlyError(
    "No fue posible determinar el flujo correcto del formulario de DGII en esta sesión."
  );
}

async function fillVisibleFields(page: Page, values: string[]) {
  const result = await page.evaluate(async (payload) => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (element: Element | null) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const candidates = Array.from(document.querySelectorAll("input")).filter((input) => {
      const type = (input.getAttribute("type") || "text").toLowerCase();
      return (type === "text" || type === "") && isVisible(input);
    });

    const fields = candidates.slice(0, payload.length);
    if (fields.length < payload.length) {
      return {
        ok: false,
        reason: `Solo se detectaron ${fields.length} campos visibles para ${payload.length} valores.`,
      };
    }

    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      field.focus();
      field.value = "";
      field.dispatchEvent(new Event("focus", { bubbles: true }));

      for (const char of String(payload[index] || "")) {
        field.value += char;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
        await sleep(45 + Math.floor(Math.random() * 50));
      }

      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.dispatchEvent(new Event("blur", { bubbles: true }));
      await sleep(150 + Math.floor(Math.random() * 120));
    }

    return { ok: true };
  }, values);

  if (!result.ok) {
    throw new FriendlyError(`No fue posible llenar el formulario de DGII. ${result.reason}`);
  }
}

async function submitConsulta(page: Page) {
  const submitResult = await page.evaluate(() => {
    const isVisible = (element: Element | null) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const candidates = Array.from(
      document.querySelectorAll("button, input[type='submit'], input[type='button'], input[type='image'], a")
    ).filter(isVisible);

    const preferred = candidates.find((element) => {
      const rawElement = element as HTMLButtonElement | HTMLInputElement | HTMLAnchorElement;
      const text = (
        rawElement.innerText ||
        rawElement.getAttribute("value") ||
        rawElement.getAttribute("title") ||
        ""
      )
        .trim()
        .toLowerCase();

      return /consultar|buscar|consulta/.test(text);
    });

    const target = preferred || candidates[0] || null;
    if (target) {
      (target as HTMLElement).click();
      return { ok: true };
    }

    const form = document.querySelector("form") as HTMLFormElement | null;
    if (form) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
      return { ok: true };
    }

    return { ok: false, reason: "No se encontró botón ni formulario." };
  });

  if (!submitResult.ok) {
    throw new FriendlyError(
      `No se encontró una forma válida de enviar el formulario de DGII. ${submitResult.reason}`
    );
  }
}

async function waitForExpandedForm(page: Page) {
  const timeoutMs = 20_000;
  const pollMs = 700;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(pollMs);

    const visibleCount = await countVisibleTextInputs(page);
    if (visibleCount >= 4) {
      return { state: "expanded" as const, visibleCount };
    }

    const text = normalizeVisibleText(await page.locator("body").innerText());
    if (parseSuccessFields(text)) {
      return { state: "result" as const, visibleCount };
    }

    const blockedMessage = detectBlockMessage(text);
    if (blockedMessage) {
      return { state: "error" as const, visibleCount, message: blockedMessage };
    }

    const errorMessage = detectKnownError(text);
    if (errorMessage) {
      return { state: "error" as const, visibleCount, message: errorMessage };
    }
  }

  return { state: "timeout" as const, visibleCount: await countVisibleTextInputs(page) };
}

async function waitForOutcome(page: Page) {
  const timeoutMs = 35_000;
  const pollMs = 900;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(pollMs);

    const text = normalizeVisibleText(await page.locator("body").innerText());
    const parsed = parseSuccessFields(text);
    if (parsed) {
      return { success: true as const, data: parsed };
    }

    const blockedMessage = detectBlockMessage(text);
    if (blockedMessage) {
      return { success: false as const, message: blockedMessage };
    }

    const errorMessage = detectKnownError(text);
    if (errorMessage) {
      return { success: false as const, message: errorMessage };
    }
  }

  throw new FriendlyError(
    "DGII no respondió dentro del tiempo esperado. Revisa la conectividad o vuelve a intentarlo."
  );
}

async function countVisibleTextInputs(page: Page) {
  return page.evaluate(() => {
    const isVisible = (element: Element | null) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    return Array.from(document.querySelectorAll("input")).filter((input) => {
      const type = (input.getAttribute("type") || "text").toLowerCase();
      return (type === "text" || type === "") && isVisible(input);
    }).length;
  });
}

function normalizeVisibleText(text: string) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function parseSuccessFields(text: string): DgiiEncfExtractedData | null {
  const fechaEmision = extractField(
    text,
    /Fecha\s*(?:de\s+)?Emisi[oó]n\s*:?\s*((?:\d{4}[/-][0-1]?\d[/-][0-3]?\d)|(?:[0-3]?\d[/-][0-1]?\d[/-]\d{4}))/i
  );
  const montoTotal = extractField(
    text,
    /Monto\s+Total\s*:?\s*(RD\$\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    2
  );
  const fechaFirma = extractField(
    text,
    /Fecha\s*(?:de\s+)?Firma\s*:?\s*((?:\d{4}[/-][0-1]?\d[/-][0-3]?\d)|(?:[0-3]?\d[/-][0-1]?\d[/-]\d{4}))(?:\s+([0-2]?\d:\d{2}:\d{2}))?/i,
    1
  );

  if (!fechaEmision || !montoTotal || !fechaFirma) {
    return null;
  }

  return {
    fechaEmision: normalizeDate(fechaEmision),
    montoTotal: normalizeAmount(montoTotal),
    fechaFirma: normalizeDateTime(fechaFirma),
  };
}

function extractField(text: string, regex: RegExp, group = 1) {
  const match = text.match(regex);
  return match ? match[group].trim() : null;
}

function detectKnownError(text: string) {
  const messages = [
    /no se encontraron datos/i,
    /no existe/i,
    /no fue encontrado/i,
    /comprobante.*inv[áa]lido/i,
    /rnc digitado es inv[áa]lido/i,
    /formato inv[áa]lido/i,
    /debe introducir/i,
    /ocurrió un error/i,
  ];

  for (const regex of messages) {
    const match = text.match(regex);
    if (match) {
      return `DGII respondió que no fue posible validar la factura: ${match[0]}.`;
    }
  }

  return null;
}

function detectBlockMessage(text: string) {
  const messages = [
    /acceso denegado/i,
    /error 403/i,
    /solicitud fue bloqueada/i,
    /servicios de seguridad/i,
  ];

  for (const regex of messages) {
    if (regex.test(text)) {
      return "La DGII bloqueó temporalmente esta consulta con un error 403. Espera un poco y vuelve a intentar.";
    }
  }

  return null;
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
  const [datePart, timePart] = value.split(/\s+/);
  const normalizedDate = normalizeDate(datePart);
  return timePart ? `${normalizedDate} ${timePart}` : normalizedDate;
}

function combineFechaFirma(fechaFirma: string, horaFirma?: string) {
  const normalizedDate = normalizeDateTime(fechaFirma).split(" ")[0];
  return horaFirma ? `${normalizedDate} ${horaFirma}` : normalizedDate;
}

async function validateOrSweepTimbre({
  context,
  input,
  extracted,
}: {
  context: BrowserContext;
  input: DgiiEncfInput;
  extracted: DgiiEncfExtractedData;
}) {
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
      mode: "date_only" as const,
      attempted: 1,
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

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const candidateUrl = buildTimbreUrl({
      rncEmisor: input.rncEmisor,
      rncComprador: input.rncComprador,
      encf: input.encf,
      fechaEmision: extracted.fechaEmision,
      montoTotal: extracted.montoTotal,
      fechaFirma: candidate.fechaFirma,
      codigoSeguridad: input.codigoSeguridad,
    });

    const result = await validateTimbreUrl(context, candidateUrl);
    if (result.valid) {
      return {
        validated: true,
        mode: "sweep" as const,
        attempted: index + 1,
        matchedOffsetSeconds: candidate.offsetSeconds,
        horaFirmaUsada: candidate.hora,
        fechaFirma: candidate.fechaFirma,
        checkedUrl: candidateUrl,
        message:
          candidate.offsetSeconds === 0
            ? "El enlace fue validado con la hora base indicada."
            : `El enlace fue validado ajustando ${formatOffset(candidate.offsetSeconds)} respecto a la hora base.`,
      };
    }
  }

  return {
    validated: false,
    mode: "sweep" as const,
    attempted: candidates.length,
    matchedOffsetSeconds: null,
    horaFirmaUsada: input.horaFirma,
    fechaFirma: baseFechaFirma,
    checkedUrl: baseUrl,
    message: `No se validó el enlace con un barrido de ±${DEFAULT_SWEEP_SECONDS} segundos alrededor de la hora base.`,
  };
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
      return {
        offsetSeconds,
        hora,
        fechaFirma: `${normalizedDate} ${hora}`,
      };
    })
    .filter((candidate): candidate is { offsetSeconds: number; hora: string; fechaFirma: string } => Boolean(candidate));
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
  return value.replace(/,/g, "");
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

  return `https://ecf.dgii.gov.do/ecf/ConsultaTimbre?${queryString}`;
}

async function validateTimbreUrl(context: BrowserContext, url: string) {
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const text = normalizeVisibleText(await page.locator("body").innerText().catch(() => ""));

    if (/No fue encontrada la factura \(e-CF\) con los valores suministrados\./i.test(text)) {
      return { valid: false, reason: "not_found" };
    }

    if (
      /Verificación e-NCF/i.test(text) &&
      /RNC Emisor/i.test(text) &&
      /e-NCF/i.test(text) &&
      /Monto Total/i.test(text) &&
      /Estado/i.test(text)
    ) {
      return { valid: true };
    }

    return { valid: false, reason: "unknown_response" };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function captureFailureScreenshot(page: Page) {
  const fileName = `dgii-fallo-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  const fullPath = path.join(SCREENSHOT_DIR, fileName);
  await page.screenshot({ path: fullPath, fullPage: true });
  return fullPath;
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomPause(min: number, max: number) {
  await new Promise((resolve) => setTimeout(resolve, randomBetween(min, max)));
}

export class FriendlyError extends Error {}
