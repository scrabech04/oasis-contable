import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";

/**
 * Tope real de lo que se puede adjuntar, y es mas bajo de lo que parece.
 *
 * El archivo viaja en base64 dentro del JSON, y base64 infla ~37%. El servidor corta los
 * cuerpos de peticion alrededor de los 10 MB, asi que un archivo de mas de ~7 MB llega
 * truncado y revienta al interpretar el JSON, con un error ilegible en vez de un aviso
 * claro. Comprobandolo aqui el usuario se entera antes de que nada salga por la red.
 */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

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
