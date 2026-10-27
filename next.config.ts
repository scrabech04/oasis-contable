import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Facturacion electronica: xmllint-wasm carga su .wasm desde su propia carpeta y la firma
  // necesita los modulos tal cual; se dejan fuera del bundle y se cargan de node_modules.
  serverExternalPackages: ["xmllint-wasm", "xml-crypto", "@xmldom/xmldom", "node-forge"],
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
