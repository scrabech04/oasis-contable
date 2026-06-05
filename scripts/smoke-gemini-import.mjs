import fs from "node:fs";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

loadDotEnv();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  console.error("NO_KEY: falta GEMINI_API_KEY o GOOGLE_GENERATIVE_AI_API_KEY.");
  process.exitCode = 2;
  throw new Error("Missing Gemini API key");
}

const models = uniqueValues([
  process.env.GEMINI_MODEL || "gemini-2.5-flash",
  ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(","),
]);

const schema = {
  type: SchemaType.ARRAY,
  minItems: 1,
  items: {
    type: SchemaType.OBJECT,
    required: ["supplierName", "ncf", "date", "items", "total"],
    properties: {
      supplierName: { type: SchemaType.STRING },
      supplierTaxId: { type: SchemaType.STRING },
      ncf: { type: SchemaType.STRING },
      date: { type: SchemaType.STRING },
      total: { type: SchemaType.NUMBER },
      items: {
        type: SchemaType.ARRAY,
        minItems: 1,
        items: {
          type: SchemaType.OBJECT,
          required: ["description", "quantity", "baseAmount", "taxAmount"],
          properties: {
            description: { type: SchemaType.STRING },
            quantity: { type: SchemaType.NUMBER },
            baseAmount: { type: SchemaType.NUMBER },
            taxAmount: { type: SchemaType.NUMBER },
          },
        },
      },
    },
  },
};

const prompt = [
  "Extrae esta factura de prueba como JSON.",
  "Proveedor ACME SRL, RNC 101000001, NCF E310000000001, fecha 2026-06-05.",
  "Subtotal 1000, ITBIS 180, total 1180, descripcion Servicio de prueba.",
].join(" ");

const ai = new GoogleGenerativeAI(apiKey);
const failures = [];

for (const modelName of models) {
  try {
    const model = ai.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1,
      },
    });
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    if (Array.isArray(parsed) && parsed.length && Number(parsed[0].total) === 1180) {
      console.log(`OK_MODEL=${modelName}`);
      console.log(`OK_TOTAL=${parsed[0].total}`);
      process.exitCode = 0;
      failures.length = 0;
      break;
    }
    failures.push(`${modelName}: JSON sin filas validas`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${modelName}: ${message.replace(/\s+/g, " ").slice(0, 260)}`);
  }
}

if (failures.length > 0) {
  console.error(`FAILED_MODELS=${failures.join(" | ")}`);
  process.exitCode = 1;
}
