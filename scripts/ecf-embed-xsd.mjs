// Copia los XSD de lib/ecf/xsd/ dentro de lib/ecf/xsd/schemas.ts como texto.
//
// Asi la validacion funciona igual en local que en Firebase: el servidor desplegado no
// tiene garantizado ver archivos sueltos del repositorio, pero si el codigo compilado.
// Correr de nuevo si la DGII publica XSD nuevos:  node scripts/ecf-embed-xsd.mjs
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "lib", "ecf", "xsd");
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".xsd")).sort();

const entries = files.map((name) => {
  const key = name.replace(/\.xsd$/, "");
  const contents = fs.readFileSync(path.join(dir, name), "utf8").replace(/^﻿/, "");
  return `  ${JSON.stringify(key)}: ${JSON.stringify(contents)},`;
});

const out = `// Generado por scripts/ecf-embed-xsd.mjs a partir de los XSD oficiales de la DGII (v1.0).
// No editar a mano. Ver lib/ecf/xsd/LEEME.md para los ajustes hechos a los originales.
export const ECF_SCHEMAS: Record<string, string> = {
${entries.join("\n")}
};
`;

fs.writeFileSync(path.join(dir, "schemas.ts"), out);
console.log(`schemas.ts: ${files.length} esquemas`);
