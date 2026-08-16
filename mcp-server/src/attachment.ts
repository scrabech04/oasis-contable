import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";

// Espejo del tope del lado del servidor (lib/mcp.ts). Se comprueba aqui tambien para no
// leer y viajar 40 MB por la red antes de que la API los rechace.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".txt": "text/plain",
};

export type LoadedAttachment = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

/**
 * Lee el comprobante desde el disco de quien corre el servidor MCP. La ruta viaja en la
 * llamada, no el archivo: asi el modelo no tiene que escupir megabytes de base64 en la
 * conversacion para adjuntar un soporte que ya esta en la maquina.
 */
export async function loadAttachment(path: string): Promise<LoadedAttachment> {
  const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);

  let info;
  try {
    info = await stat(absolute);
  } catch {
    throw new Error(`No such file: ${absolute}. Pass the full path to the receipt on this machine.`);
  }
  if (!info.isFile()) {
    throw new Error(`${absolute} is not a file.`);
  }
  if (info.size === 0) {
    throw new Error(`${absolute} is empty - nothing to attach as proof.`);
  }
  if (info.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `${absolute} is ${(info.size / 1024 / 1024).toFixed(1)} MB - the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`
    );
  }

  const bytes = await readFile(absolute);
  return {
    fileName: basename(absolute),
    mimeType: MIME_BY_EXTENSION[extname(absolute).toLowerCase()] || "application/octet-stream",
    contentBase64: bytes.toString("base64"),
  };
}
