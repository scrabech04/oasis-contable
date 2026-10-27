# Facturación electrónica (e-CF) — módulo `lib/ecf`

Implementa la facturación electrónica de la DGII según su documentación oficial: Formato e-CF v1.0, Descripción Técnica de Servicios DGII y de Emisores Electrónicos, Firmado de e-CF e Informe Técnico. Por ahora emite los tipos 31, 32, 33, 34 y 45.

## Qué hace cada archivo

| Archivo | Para qué |
|---|---|
| `types.ts` | Modelo del comprobante, independiente de la base de datos |
| `format.ts` | Fechas, montos y redondeo como los pide la DGII |
| `totals.ts` | Líneas y totales (indicador de facturación, ITBIS, reparto del descuento global) |
| `xml.ts` | Serializador sin tags vacíos y sin espacios entre elementos |
| `build.ts` | XML de e-CF, RFCE, ARECF, ACECF y ANECF en el orden de los XSD |
| `sign.ts` | Lectura del .p12, firma XMLDSig (C14N inclusiva, RSA-SHA256), verificación y código de seguridad |
| `xsd-validate.ts`, `xsd/` | Validación contra los XSD oficiales (ver `xsd/LEEME.md`) |
| `endpoints.ts`, `dgii-client.ts` | Servicios de la DGII por ambiente: token, envío, consultas, directorio y anulación |
| `certificate-store.ts` | Certificado de cada perfil, guardado cifrado |
| `from-invoice.ts` | Conversión de una factura de OFlow en e-CF |
| `emit.ts` | Flujo completo: firmar, validar, guardar, enviar, consultar y entregar al comprador |
| `deliver.ts` | Entrega del e-CF al comprador electrónico y lectura de su acuse |
| `receptor.ts` | Lo que hacemos como receptor: semilla y token, recepción con ARECF y aprobaciones comerciales |
| `representation.ts`, `timbre.ts` | Datos de la representación impresa (QR, código de seguridad, totales del XML) |

Rutas públicas, sin sesión: `app/ecf/[ambiente]/fe/...`. Pantallas: `components/ecf/` y `app/ecf-actions.ts`.

## Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `ECF_CERT_KEY` | Sí | Llave de 32 bytes en base64 para cifrar los certificados. Se genera con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **No cambiarla**: los certificados guardados quedarían ilegibles. |
| `ECF_PUBLIC_ORIGIN` | No | Dirección pública con la que se muestran las URL a registrar, por ejemplo `https://fe.oasisgaterd.com`. Si falta, se usa `AUTH_ORIGIN`. |
| `ECF_RECEPTOR_REQUIRE_AUTH` | No | `1` para exigir token en recepción y aprobación. Por defecto no se exige, porque la autenticación es opcional en el estándar. |
| `ECF_RECEPTOR_SECRET` | No | Secreto para firmar semillas y tokens del receptor. Si falta, se usa `AUTH_SECRET`. |
| `ECF_DGII_TIMEOUT_MS` | No | Tiempo de espera de las llamadas a la DGII. Por defecto, 30000. |

## Antes de desplegar esta rama

1. Aplicar en Supabase `prisma/migrations/20261027000100_add_ecf/migration.sql`. Solo agrega columnas y tablas, así que es segura con la app actual.
2. Crear el secreto `ECF_CERT_KEY` en Firebase y agregarlo a `apphosting.yaml`, igual que los demás secretos.
3. Apuntar el dominio de recepción (por ejemplo `fe.oasisgaterd.com`) a Firebase App Hosting.
4. Durante la certificación, conviene `minInstances: 1`, para que la DGII no encuentre el servidor dormido en las pruebas de comunicación.

## Probar sin DGII ni base de datos

```
npx tsx scripts/ecf-selftest.ts <carpeta-de-salida>
```

La prueba crea un certificado de mentira y arma los XML de todos los tipos. Luego los firma, verifica las firmas (y que una alteración las rompe) y los valida contra los XSD oficiales.
