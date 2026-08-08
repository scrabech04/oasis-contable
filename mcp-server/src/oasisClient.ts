const BASE_URL = process.env.OASIS_API_BASE_URL;
const API_KEY = process.env.OASIS_MCP_API_KEY;

function requireConfig() {
  if (!BASE_URL) throw new Error("OASIS_API_BASE_URL is not set - check mcp-server/.env");
  if (!API_KEY) throw new Error("OASIS_MCP_API_KEY is not set - check mcp-server/.env");
  return { BASE_URL, API_KEY };
}

async function handleResponse(response: Response) {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? (body as { error: string }).error : text;
    throw new Error(`Oasis API ${response.status}: ${message}`);
  }
  return body;
}

export async function oasisGet(path: string, params: Record<string, unknown> = {}) {
  const { BASE_URL, API_KEY } = requireConfig();
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { "x-api-key": API_KEY } });
  return handleResponse(response);
}

export async function oasisPost(path: string, body: Record<string, unknown>) {
  const { BASE_URL, API_KEY } = requireConfig();
  const url = new URL(path, BASE_URL);
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export function defaultProfileId(): number | undefined {
  const raw = process.env.OASIS_DEFAULT_PROFILE_ID;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
