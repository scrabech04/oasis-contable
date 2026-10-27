# XSD oficiales de la DGII (v1.0)

Se descargaron el 27-10-2026 de [Documentación sobre e-CF → Documentación Técnica (XSD)](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx).

| Archivo | Original |
|---|---|
| `ecf-31.xsd` … `ecf-45.xsd` | `e-CF 31 v.1.0.xsd` … `e-CF 45 v.1.0.xsd` |
| `rfce-32.xsd` | `RFCE 32 v.1.0.xsd` |
| `arecf.xsd` | `ARECF v1.0.xsd` |
| `acecf.xsd` | `ACECF v.1.0.xsd` |
| `anecf.xsd` | `ANECF v.1.0.xsd` |
| `semilla.xsd` | `Semilla v.1.0.xsd` |

Los originales están escritos para el validador de .NET, que usa la DGII. libxml2, el validador que usamos aquí, no los acepta tal cual. Se hicieron dos ajustes que no cambian lo que se valida:

1. **`(?:` → `(`** en los patrones de `rfce-32.xsd` y `acecf.xsd`. Los grupos sin captura no existen en las expresiones regulares de XSD.
2. En `ecf-31.xsd`, **`name=" IndicadorServicioTodoIncluidoType"` pierde el espacio inicial**. Con el espacio, el tipo no se encuentra.

Después de cambiar un XSD hay que correr `node scripts/ecf-embed-xsd.mjs` para regenerar `schemas.ts`.
