import { cookies } from "next/headers";
import { chromium } from "playwright";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return url.origin;
}

export async function renderRouteToPdfResponse(request: Request, route: string, filename: string) {
  const origin = requestOrigin(request);
  const targetUrl = new URL(route, origin);
  const cookieStore = await cookies();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      colorScheme: "light",
      ignoreHTTPSErrors: true,
      locale: "es-DO",
      timezoneId: "America/Santo_Domingo",
      viewport: { width: 1240, height: 1754 },
    });

    const authCookies = cookieStore.getAll().map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: origin,
    }));

    if (authCookies.length > 0) {
      await context.addCookies(authCookies);
    }

    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(targetUrl.toString(), { waitUntil: "networkidle" });
    await page.emulateMedia({ colorScheme: "light", media: "print" });
    await page.addStyleTag({
      content: `
        html, body { background: #ffffff !important; }
        .no-print { display: none !important; }
      `,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
      printBackground: true,
    });

    await context.close();

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-PDF-Renderer": "html-playwright",
      },
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
