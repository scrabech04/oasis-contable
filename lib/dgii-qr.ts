/**
 * Lectura de los parametros del QR de una factura electronica.
 *
 * Cada emisor arma el enlace del timbre a su manera: unos mandan `RncComprador` y otros
 * `rnccomprador`. URLSearchParams.get distingue mayusculas, asi que buscar por el nombre
 * exacto dejaba el RNC comprador vacio en las facturas del segundo grupo, y la compra
 * terminaba en el perfil activo en vez del suyo.
 */
export function qrParamReader(qrText: string) {
  const params = new URL(qrText).searchParams;
  const byLowerName = new Map<string, string>();

  for (const [key, value] of params) {
    const name = key.toLowerCase();
    // El primero gana: si un QR repite el parametro, se respeta el orden del enlace.
    if (value && !byLowerName.has(name)) byLowerName.set(name, value);
  }

  return (...names: string[]) => {
    for (const name of names) {
      const value = byLowerName.get(name.toLowerCase());
      if (value) return value;
    }
    return "";
  };
}

/** Nombres con los que los emisores rotulan el RNC del comprador. */
export const BUYER_TAX_ID_PARAMS = ["RncComprador", "RncReceptor", "RncCliente"];
