#!/usr/bin/env node
/**
 * Prueba local de "Reconstruir e-NCF / QR" sin necesidad de base de datos ni login de Google.
 *
 * Firma una cookie de sesion con el mismo HMAC que lib/auth.ts, la envia al endpoint
 * y muestra el resultado. El servidor de desarrollo debe estar corriendo con el mismo
 * AUTH_SECRET que use este script.
 *
 *   Terminal 1:  AUTH_SECRET=dev-local npm run dev
 *   Terminal 2:  AUTH_SECRET=dev-local node scripts/probar-encf-local.mjs \
 *                  --rnc 130463417 --encf E310000014390 \
 *                  --comprador 40200448476 --codigo RpmbNr [--hora 17:17:01]
 *
 * --hora acepta HH:mm:ss cuando se conoce el segundo exacto (barrido de +-15s) y HH:mm
 * cuando la factura solo imprime hora y minutos (barrido de los 60 segundos del minuto).
 *
 * Con --cookie imprime la cookie para pegarla en el navegador (DevTools > Console)
 * y poder abrir la interfaz en /purchases/rebuild-encf.
 */

const args = process.argv.slice(2);

function arg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const secret = process.env.AUTH_SECRET || arg("secret", "dev-local");
const baseUrl = arg("url", process.env.BASE_URL || "http://localhost:3000");
const email = arg("email", process.env.AUTH_EMAIL || "dev@local");

const encoder = new TextEncoder();

const base64Url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

async function mintSessionCookie() {
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        email: email.toLowerCase(),
        name: "Prueba local",
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      })
    )
  );

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

const token = await mintSessionCookie();

if (args.includes("--cookie")) {
  console.log("Pega esto en la consola del navegador (DevTools) estando en el sitio local:\n");
  console.log(`document.cookie = "oasis_session=${token}; path=/"`);
  console.log("\nLuego recarga la pagina y podras entrar sin login de Google.");
  process.exit(0);
}

const body = {
  rncEmisor: arg("rnc"),
  encf: arg("encf"),
  rncComprador: arg("comprador"),
  codigoSeguridad: arg("codigo"),
};

const hora = arg("hora");
if (hora) {
  body.horaFirma = hora;
}

if (!body.rncEmisor || !body.encf || !body.rncComprador || !body.codigoSeguridad) {
  console.error("Faltan datos. Ejemplo:\n");
  console.error(
    "  node scripts/probar-encf-local.mjs --rnc 130463417 --encf E310000014390 --comprador 40200448476 --codigo RpmbNr"
  );
  process.exit(1);
}

console.log(`POST ${baseUrl}/api/purchases/rebuild-encf`);
console.log(`   e-NCF ${body.encf} | emisor ${body.rncEmisor}${hora ? ` | hora base ${hora}` : ""}\n`);

const startedAt = Date.now();

const response = await fetch(`${baseUrl}/api/purchases/rebuild-encf`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: `oasis_session=${token}` },
  body: JSON.stringify(body),
});

const raw = await response.text();
const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error(`HTTP ${response.status} en ${seconds}s - respuesta no JSON:\n`);
  console.error(raw.slice(0, 500));
  process.exit(1);
}

if (!data.ok) {
  console.error(`HTTP ${response.status} en ${seconds}s`);
  console.error(`Error: ${data.message || data.error}`);
  process.exit(1);
}

console.log(`HTTP ${response.status} en ${seconds}s`);
console.log(`${data.message}\n`);
console.log(`  Estado DGII    ${data.extracted.estado || "-"}`);
console.log(`  Fecha emision  ${data.extracted.fechaEmision}`);
console.log(`  Monto total    RD$${data.extracted.montoTotal}`);
console.log(`  Total ITBIS    ${data.extracted.totalItbis || "-"}`);
console.log(`  Fecha firma    ${data.validation.fechaFirma}`);
console.log(
  `  Validacion     ${data.validation.validated ? "VALIDADO" : "sin validar"} (${data.validation.attempted} intento(s))`
);
console.log(`                 ${data.validation.message}`);
console.log(`\n  QR             imagen PNG de ${data.qrDataUrl.length} caracteres (data URL)`);
console.log(`  Enlace timbre  ${data.timbreUrl}`);
