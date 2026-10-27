// Prueba de punta a punta del modulo e-CF con un certificado autofirmado: arma los XML de
// 31, 32, 34 y 45 (y RFCE, ARECF, ACECF, ANECF, semilla), los firma, verifica las firmas y
// los valida contra los XSD oficiales. No toca la base de datos ni la DGII.
//   npx tsx scripts/ecf-selftest.ts <carpeta-de-salida>
import fs from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { buildEcf, buildRfce, buildArecf, buildAcecf, buildAnecf } from "../lib/ecf/build";
import { loadP12, signXml, securityCodeOf, verifyXmlSignature } from "../lib/ecf/sign";
import type { EcfDocumentInput } from "../lib/ecf/types";
import { validateAgainstXsd, type XsdKind } from "../lib/ecf/xsd-validate";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

// Certificado autofirmado de prueba con SN = cedula ficticia.
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date(Date.now() - 86400000);
cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
const attrs = [{ name: "commonName", value: "PRUEBA OFLOW" }, { type: "2.5.4.5", value: "00112345678" }];
cert.setSubject(attrs as forge.pki.CertificateField[]);
cert.setIssuer(attrs as forge.pki.CertificateField[]);
cert.sign(keys.privateKey, forge.md.sha256.create());
const p12Der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "clave", { algorithm: "3des" })).getBytes();
const p12 = Buffer.from(p12Der, "binary");
fs.writeFileSync(path.join(out, "test.p12"), p12);
const signing = loadP12(p12, "clave");
console.log("cert SN:", signing.serialNumber, signing.subject);

const issuer = { rnc: "133647461", razonSocial: "OASIS GATE SRL", nombreComercial: "Oasis Gate", direccion: "Calle Prueba #1, Santo Domingo", telefonos: ["809-555-0123"], correo: "info@oasisgaterd.com" };
const base = { issueDate: new Date(Date.UTC(2026, 9, 27)), incomeType: "01", issuer };
const docs: Record<string, EcfDocumentInput> = {
  "31": { ...base, type: 31, encf: "E310000000001", sequenceExpiry: new Date(Date.UTC(2028, 11, 31)), paymentType: 2, paymentDueDate: new Date(Date.UTC(2026, 10, 27)),
    buyer: { rnc: "131880738", razonSocial: "CLIENTE & ASOCIADOS <SRL>" },
    lines: [ { name: "Experiencia VR evento", quantity: 1, unitPrice: 150000, taxRate: 18, goodOrService: 2 }, { name: "Alquiler visores", description: "10 visores Meta Quest", quantity: 10, unitPrice: 1234.5678, taxRate: 18, goodOrService: 2 }, { name: "Libro exento", quantity: 3, unitPrice: 333.33, taxRate: 0, goodOrService: 1 } ],
    globalDiscount: 5000 },
  "32": { ...base, type: 32, encf: "E320000000001", paymentType: 1, paymentForms: [{ form: 3, amount: 1180 }], lines: [ { name: "Entrada VR", quantity: 2, unitPrice: 500, taxRate: 18, goodOrService: 2 } ] },
  "32big": { ...base, type: 32, encf: "E320000000002", paymentType: 1, buyer: { rnc: "00112345678", razonSocial: "Juan Perez" }, lines: [ { name: "Paquete evento", quantity: 1, unitPrice: 300000, taxRate: 18, goodOrService: 2 } ] },
  "34": { ...base, type: 34, encf: "E340000000001", paymentType: 1, buyer: { rnc: "131880738", razonSocial: "CLIENTE SRL" }, reference: { ncf: "E310000000001", fecha: new Date(Date.UTC(2026, 9, 20)), codigo: 3, razon: "Descuento posterior" }, lines: [ { name: "Ajuste de precio", quantity: 1, unitPrice: 1000, taxRate: 18, goodOrService: 2 } ] },
  "45": { ...base, type: 45, encf: "E450000000001", sequenceExpiry: new Date(Date.UTC(2028, 11, 31)), paymentType: 2, buyer: { rnc: "401505679", razonSocial: "MINISTERIO DE EDUCACION SUPERIOR" }, lines: [ { name: "Avatares digitales", quantity: 1, unitPrice: 250000, taxRate: 18, goodOrService: 2 } ] },
};

const at = new Date();
for (const [name, doc] of Object.entries(docs)) {
  const built = buildEcf(doc, at);
  const signed = signXml(built.xml, signing);
  const code = securityCodeOf(signed);
  const check = verifyXmlSignature(signed);
  fs.writeFileSync(path.join(out, `ecf-${name}.xml`), signed);
  console.log(name, "total", built.totals.montoTotal, "itbis", built.totals.totalItbis, "summary", built.sendsSummary, "code", code, "verify", check.valid, check.signerSerial, check.error ?? "");
  if (built.sendsSummary) {
    const rfce = signXml(buildRfce(doc, built.totals, code), signing);
    fs.writeFileSync(path.join(out, `rfce-${name}.xml`), rfce);
    console.log("  rfce verify", verifyXmlSignature(rfce).valid);
  }
}
const arecf = signXml(buildArecf({ rncEmisor: "131880738", rncComprador: "133647461", encf: "E310000000099", received: true, at }), signing);
fs.writeFileSync(path.join(out, "arecf.xml"), arecf);
const arecfNo = signXml(buildArecf({ rncEmisor: "131880738", rncComprador: "133647461", encf: "E310000000099", received: false, reason: 2, at }), signing);
fs.writeFileSync(path.join(out, "arecf-no.xml"), arecfNo);
const acecf = signXml(buildAcecf({ rncEmisor: "131880738", encf: "E310000000099", issueDate: new Date(Date.UTC(2026, 9, 1)), total: 1180, rncComprador: "133647461", approved: false, reason: "Monto incorrecto", at }), signing);
fs.writeFileSync(path.join(out, "acecf.xml"), acecf);
const anecf = signXml(buildAnecf("133647461", [{ type: 31, from: 5, to: 50 }, { type: 31, from: 60, to: 60 }, { type: 32, from: 3, to: 9 }], at), signing);
fs.writeFileSync(path.join(out, "anecf.xml"), anecf);
const semilla = `<?xml version="1.0" encoding="utf-8"?>\r\n<SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <valor>abc123+/==</valor>\r\n  <fecha>2026-10-27T14:33:32.8617792-04:00</fecha>\r\n</SemillaModel>`;
const semillaSigned = signXml(semilla, signing);
fs.writeFileSync(path.join(out, "semilla.xml"), semillaSigned);
for (const f of ["arecf", "arecf-no", "acecf", "anecf", "semilla"]) console.log(f, "verify", verifyXmlSignature(fs.readFileSync(path.join(out, `${f}.xml`), "utf8")).valid);
// Manipulacion: cambiar un monto debe invalidar la firma
const tampered = fs.readFileSync(path.join(out, "ecf-31.xml"), "utf8").replace("<MontoTotal>", "<MontoTotal>1");
console.log("tampered verify (debe ser false):", verifyXmlSignature(tampered).valid);

// Validacion contra los XSD oficiales (los mismos que usa la app antes de enviar).
const pairs: Array<[string, XsdKind]> = [
  ["ecf-31", "ecf-31"], ["ecf-32", "ecf-32"], ["ecf-32big", "ecf-32"], ["ecf-34", "ecf-34"], ["ecf-45", "ecf-45"],
  ["rfce-32", "rfce-32"], ["arecf", "arecf"], ["arecf-no", "arecf"], ["acecf", "acecf"], ["anecf", "anecf"], ["semilla", "semilla"],
];
(async () => {
  let failures = 0;
  for (const [file, kind] of pairs) {
    const result = await validateAgainstXsd(fs.readFileSync(path.join(out, `${file}.xml`), "utf8"), kind);
    if (!result.valid) failures++;
    console.log("xsd", file, result.valid ? "OK" : result.errors.join(" | "));
  }
  if (failures) process.exitCode = 1;
})();
