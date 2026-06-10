# Changelog

Bitacora de cambios del proyecto oFlow by Oasis. Mantener aqui las funciones nuevas, ajustes de UI, migraciones y puntos que necesitan prueba funcional.

## 2026-06-10 - Refinamiento visual de proyectos

### Agregado
- En el detalle de proyecto se agrega la accion `Vincular` para asociar facturas de venta o compras existentes al proyecto sin crear documentos nuevos.
- El modal de vinculacion permite alternar entre facturas y compras, ver documentos ya vinculados y desvincularlos si hace falta.

### Mejorado
- El detalle de proyecto recibe un header superior mas limpio, con acciones compactas para editar/eliminar y botones principales para compra/factura.
- El resumen del proyecto y las metricas financieras se redisenan con tarjetas mas claras, iconos por bloque y divisores internos.
- La estimacion fiscal se separa como seccion propia con tarjetas de ITBIS/ISR y una tarjeta destacada para caja despues de impuestos.
- Los graficos y transacciones asociadas usan contenedores mas consistentes y jerarquia visual mas clara.
- Se agregan micro-animaciones sutiles reutilizables (`premium-enter` y `premium-card`) con soporte para `prefers-reduced-motion`.

### Pendiente de prueba
- Revisar un proyecto real en desktop y mobile para confirmar que las tarjetas no se sienten demasiado altas y que las acciones superiores quedan comodas.
- Validar modo oscuro en el detalle de proyecto, especialmente la seccion fiscal y las transacciones asociadas.

## 2026-06-10 - Expediente de contactos

### Agregado
- Se crea la vista `/contacts/[id]` para ver el detalle completo de un contacto/cliente/proveedor.
- El expediente muestra datos del contacto, metricas de facturado/cobrado/compras/cotizaciones, proyectos asociados, facturas de venta, compras/gastos, cotizaciones y prefacturas.
- Las compras importadas sin contacto enlazado tambien pueden aparecer si coinciden por nombre o RNC del proveedor.
- Desde el listado de contactos se puede abrir el detalle con el nombre o el icono de vista.
- En el listado de facturas de venta, el nombre del cliente ahora enlaza al expediente del contacto.

### Pendiente de prueba
- Abrir un cliente desde `Facturacion` y confirmar que muestra facturas, cotizaciones, prefacturas y proyectos.
- Abrir un proveedor desde `Contactos` y confirmar que muestra compras asociadas, incluyendo compras importadas con IA.

## 2026-06-08 - ISR configurable por perfil

### Agregado
- En `Configuracion` se agrega `Regimen ISR para estimaciones` por perfil: persona juridica, persona fisica progresiva o tasa personalizada.
- La estimacion fiscal del detalle de proyecto deja de usar 27% fijo y ahora lee la configuracion del perfil activo.
- Para persona fisica se agrega calculo progresivo anual con los tramos DGII: exento, 15%, 20% y 25%.

### Migracion
- Se agregan `incomeTaxRegime` e `incomeTaxRate` a `CompanySettings`.
- Los perfiles tipo `PERSON` se inicializan como persona fisica progresiva; los demas quedan como persona juridica 27%.

### Pendiente de prueba
- Aplicar la migracion SQL en Supabase antes del deploy.
- Revisar un proyecto en perfil persona juridica y otro en perfil persona fisica para confirmar el ISR estimado.
- Confirmar con el contador si para cada perfil conviene usar escala progresiva o una tasa personalizada.

## 2026-06-06 - Propina legal 10% en importacion IA

### Mejorado
- La importacion de compras con IA ahora reconoce la propina legal/cargo por servicio del 10% en facturas de restaurantes, bares y establecimientos de comida.
- Ese 10% se guarda como una linea separada `Propina legal 10%` con impuesto 0, para que el total de la compra cuadre sin inflar el ITBIS acreditable.
- Si Gemini devuelve el 10% como porcentaje en vez de monto, el sistema lo convierte al monto real usando subtotal, ITBIS y total.

### Pendiente de prueba
- Importar una factura de restaurante con subtotal + ITBIS + propina legal y confirmar que se crean dos lineas: consumo con ITBIS y propina legal sin ITBIS.
- Validar que una factura sin propina legal se siga importando como un solo item resumen.

## 2026-06-06 - Unificacion de paginas madre

### Mejorado
- Se agrega una barra compartida de busqueda y ordenamiento para listados principales.
- `Facturacion`, `Compras y Gastos`, `Cotizaciones` y `Prefacturas` ahora comparten estructura visual de header, filtros, busqueda/ordenamiento y contenedores de lista.
- `Cotizaciones` ahora permite busqueda por numero/cliente y ordenamiento por fecha, cliente o monto.
- `Cuentas por Cobrar` y `Cuentas por Pagar` ahora usan el filtro compartido por mes/ano y cargan como paginas servidor, manteniendo las acciones de cobrar/pagar en componentes cliente.
- `Proyectos` se actualiza al mismo lenguaje visual de cards mobile, metricas y tabla desktop; se retiran componentes de tabla/card del estilo anterior.

### Pendiente de prueba
- Revisar en mobile y desktop: facturas, compras, cotizaciones, prefacturas, cuentas por cobrar, cuentas por pagar y proyectos.
- Confirmar que registrar cobros/pagos desde cuentas por cobrar/pagar refresca la lista correctamente.
- Probar busqueda y ordenamiento nuevo en cotizaciones.

## 2026-06-06 - Deteccion automatica de bordes en facturas

### Mejorado
- La deteccion automatica de bordes en `Compras > Importar con IA` deja de usar solo proyecciones de pixeles claros y ahora intenta aislar el documento como componente principal de papel.
- El recorte automatico ahora devuelve un cuadrilatero con esquinas, mas parecido a un escaner de documentos, para luego enderezar la factura antes de enviarla a IA.
- Se agregan filtros contra componentes que ocupan casi toda la foto, evitando aceptar fondo/mesa/sabana como si fuera la factura.

### Pendiente de prueba
- Tomar foto con fondo visible alrededor de una factura y confirmar que las esquinas caen sobre el papel, no sobre la foto completa.
- Probar una factura blanca sobre fondo claro; si no detecta bien, ajustar manualmente y usar como caso de calibracion.

## 2026-06-06 - Fechas en importacion IA

### Corregido
- La normalizacion de fechas importadas por IA ahora soporta `DD/MM/AA`, `DD-MM-AA`, `DD/MM/YYYY`, fechas con hora y fechas con texto alrededor.
- Se evita enviar fechas crudas o invalidas al formulario cuando Gemini/OCR no devuelve una fecha limpia.
- El prompt de Gemini ahora especifica que las fechas dominicanas se leen como dia/mes/ano, nunca mes/dia/ano.

### Pendiente de prueba
- Escanear facturas con fechas tipo `11/01/26`, `03/05/2026` y validar que el formulario muestre `2026-01-11` y `2026-05-03` respectivamente.

## 2026-06-06 - Proveedor en importacion IA

### Mejorado
- En `Compras > Importar con IA`, las imagenes ahora abren una vista previa de recorte manual antes de enviarse a Gemini; PDFs siguen procesandose directo.
- El recorte permite mover/redimensionar el area de la factura, reiniciar, usar la imagen original o procesar solo el recorte limpio.
- La vista de recorte ahora intenta detectar automaticamente los bordes de la factura y ofrece un boton para recalcularlos.
- El recorte de imagen ahora permite ajustar las cuatro esquinas de la factura y genera una imagen enderezada antes de enviarla a Gemini.
- Se unifican las pantallas de nueva compra, nueva factura, nueva cotizacion y nueva prefactura: se eliminan contenedores externos duplicados, se normalizan headers, botones, grids y cards.
- Las rutas de edicion de compra, factura y prefactura ya no envuelven el formulario en una card adicional, evitando el efecto de cajas anidadas.
- La importacion de compras con IA ahora reconoce mas variantes para proveedor/emisor: issuer, seller, merchant, vendor, vendedor, emisor y razon social emisor.
- Se agregan rescates desde texto libre cuando Gemini coloca el proveedor o RNC dentro de notas, descripcion o estructuras anidadas.
- Se filtra el RNC del comprador para evitar guardarlo como RNC del proveedor.
- El prompt y `responseSchema` ahora especifican con mas fuerza que `supplierName` y `supplierTaxId` pertenecen al emisor/vendedor, no al comprador.
- Si una compra individual llega sin proveedor o RNC, se ejecuta un segundo pase de IA enfocado solo en el encabezado del comprobante para extraer emisor/RNC.
- Se agrega un tercer fallback de OCR de encabezado: transcribe las primeras lineas del comprobante y parsea nombre/RNC del emisor localmente.
- El formulario de nueva compra ahora fuerza modo `emisor manual` para importaciones IA y muestra los campos de proveedor aunque el dato llegue incompleto.
- El formulario de compra ahora conserva en estado interno el proveedor/RNC detectado por IA y lo usa para rellenar los campos de emisor o enlazar un proveedor existente si coincide por RNC/nombre.
- Se retira el diagnostico temporal de proveedor en las notas de compras importadas con IA ahora que el flujo ya fue validado.

### Pendiente de prueba
- Importar una factura local con RNC emisor y confirmar que proveedor/RNC llegan al formulario.
- Importar una factura internacional y confirmar que trae proveedor pero deja RNC vacio si no existe.

## 2026-06-05 - Adjuntos persistentes de compras importadas

### Mejorado
- Los adjuntos nuevos de compras importadas con IA ya no aceptan rutas temporales del servidor; solo se guardan como evidencia persistente inline en la base.
- El endpoint de adjuntos de compras ahora detecta soportes antiguos guardados en `/workspace/.next/standalone/uploads` y muestra un mensaje claro para resubir el archivo.
- En el detalle de una compra se agrega opcion para subir o reemplazar el soporte PDF/imagen, util para reparar adjuntos antiguos que quedaron en almacenamiento temporal.

### Pendiente de prueba
- Resubir soporte en una compra antigua con error de adjunto y confirmar que abre desde el boton `Soporte`.
- Importar una compra nueva con IA desde PDF/foto, guardarla y abrir el adjunto desde el detalle.

## 2026-06-05 - Estimacion fiscal por proyecto

### Agregado
- En el detalle de cada proyecto se agrega una tarjeta de estimacion fiscal basada en ventas y compras asociadas.
- El calculo muestra ITBIS cobrado en facturas, ITBIS acreditable de compras con credito fiscal, ITBIS neto estimado a pagar, ISR estimado y ganancia real estimada.
- Tambien se muestra una lectura de caja despues de impuestos, restando compras, ITBIS neto e ISR estimado.

### Pendiente de prueba
- Verificar proyectos con compras locales con credito fiscal, gastos internacionales sin ITBIS y compras sin credito fiscal.
- Confirmar con el contador si la tasa ISR por defecto de 27% debe quedar configurable por perfil.

## 2026-06-05 - Prefacturas / facturas proforma

### Agregado
- Nuevo modulo `/proformas` para crear prefacturas sin NCF/e-NCF y fuera del flujo fiscal.
- Las prefacturas tienen estados propios: borrador, enviada, pago parcial, pagada, convertida y cancelada.
- Se pueden registrar anticipos sobre una prefactura sin mezclarla con facturas fiscales ni reportes 607/IT-1.
- Una prefactura pagada completa puede convertirse en factura fiscal, copiando cliente, proyecto, items, terminos, notas y pagos recibidos.
- Navegacion agregada en sidebar y menu mobile.

### Migracion
- Se agregan `ProformaInvoice`, `ProformaInvoiceItem`, `Invoice.proformaInvoiceId` y `Payment.proformaInvoiceId`.

### Pendiente de prueba
- Aplicar la migracion SQL en Supabase antes del deploy.
- Crear prefactura, registrar anticipo parcial, completar pago y convertir a factura fiscal.
- Confirmar que las prefacturas no aparecen en reportes 607/IT-1 hasta convertirse.

## 2026-06-05 - Importacion IA robusta

### Mejorado
- La importacion de facturas con IA ahora usa `gemini-2.5-flash` por defecto.
- Se agregan modelos fallback configurables con `GEMINI_FALLBACK_MODELS` para evitar caidas cuando Google retire o cambie disponibilidad de modelos.
- Gemini ahora recibe `responseSchema` con salida JSON estructurada para compras y ventas, reduciendo respuestas no parseables.
- Los errores de importacion IA ahora incluyen los modelos probados y el motivo resumido de fallo.
- Se agrega `scripts/smoke-gemini-import.mjs` para probar rapidamente modelo principal, fallback y `responseSchema` sin imprimir secretos.

## 2026-06-04 - Suscripciones activas

### Mejorado
- La pantalla de `Suscripciones activas` ya no muestra el formulario de nueva suscripcion abierto por defecto.
- Se agrega un boton `Anadir suscripcion` para desplegar el formulario solo cuando el usuario quiera registrar una nueva.

## 2026-06-04 - Detalle de compras

### Agregado
- Se agrega la vista `/purchases/[id]` para revisar una compra con proveedor, RNC/NCF, proyecto, clasificacion fiscal, items, totales, notas, adjuntos y pagos registrados.
- El listado de compras ahora incluye acceso directo para abrir el detalle en mobile y desktop.

## 2026-06-03 - Responsive mobile fase 1 y 2

### Mejorado
- `Cuentas por cobrar` ahora usa tarjetas en mobile con cliente, factura/NCF, vencimiento, total, cobrado, pendiente y accion de cobro sin deslizamiento horizontal.
- `Cuentas por pagar` ahora usa tarjetas en mobile con proveedor, compra/NCF, fecha, total, pagado, pendiente y accion de pago sin deslizamiento horizontal.
- `Proyectos` ahora muestra tarjetas compactas en mobile con estado, cliente, facturado, costos, ganancia, margen y acciones principales.
- Las metricas superiores de `Proyectos` y del detalle de proyecto se compactan en dos columnas en mobile para reducir scroll vertical.
- `Transacciones Asociadas` dentro del detalle de proyecto ahora usa tarjetas clickeables en mobile para ventas y compras, manteniendo la tabla solo en desktop.
- El dashboard de proyecto mejora su responsive: encabezado mas compacto, metricas con montos que no rompen el ancho, graficos con menor altura en mobile y tooltips compatibles con modo oscuro.
- El dashboard de proyecto ahora aplica estilos dark mode consistentes en encabezado, metricas, graficos, tabla desktop y tarjetas de transacciones.
- Los formularios de `Nueva Compra`, `Nueva Factura` y `Nueva Cotizacion` ahora muestran los items como tarjetas editables en mobile, evitando tablas con deslizamiento horizontal.
- Las tablas de items se conservan solo para desktop, manteniendo el flujo amplio donde si aporta valor.
- `Cuentas por cobrar` y `Cuentas por pagar` ahora piden al servidor solo el periodo seleccionado al filtrar por mes/ano, reduciendo datos enviados al cliente.

### Pendiente de prueba
- Verificar en celular real que las tarjetas no quedan tapadas por el menu inferior y que los botones `Cobrar`, `Pagar`, `Ver factura`, `Ver compra` y `Ver proyecto` abren el flujo correcto.
- Verificar en celular real el detalle de proyecto en modo claro/oscuro para confirmar que los graficos se leen bien y no ocupan demasiado alto.
- Verificar en celular real la edicion de items en compra, factura y cotizacion: descripcion, cantidad, precio, impuesto y eliminacion.
- Verificar que los filtros de cuentas por cobrar/pagar siguen mostrando el conteo y total pendiente correcto al cambiar mes/ano.

## 2026-06-03 - Plantilla editable de portada PDF

### Agregado
- En `Configuracion` se agrega un apartado `Plantilla de portada` para facturas y cotizaciones.
- La portada ahora puede usar una imagen de fondo subida por el usuario, optimizada en el navegador antes de guardarse.
- Se agregan presets para ajuste de imagen, foco de imagen, posicion de datos, opacidad de overlay, color de texto y color de acento.
- Se puede mostrar u ocultar marca/logo, cliente, numero de documento, fecha y proyecto en la portada.
- La vista HTML imprimible y los PDFs estables de facturas/cotizaciones leen la misma plantilla de portada.

### Migracion
- Se agregan campos de portada a `CompanySettings`: imagen, ajuste, foco, overlay, posicion, colores y switches de visibilidad.

### Pendiente de prueba
- Aplicar la migracion SQL en Supabase antes del deploy.
- Probar subir una imagen real de portada y exportar una cotizacion/factura con portada en PDF.

## 2026-06-01 - Moneda en compras y suscripciones

### Agregado
- Las suscripciones ahora pueden registrarse y editarse en RD$ o US$, con tasa cambiaria.
- La lista de suscripciones calcula el estimado mensual en RD$ aunque el costo original este en dolares.
- Cada suscripcion creada puede abrir un bloque de edicion para cambiar proveedor, proyecto, monto, moneda, tasa, fechas, metodo de pago, URLs y estado.
- Las compras ahora permiten seleccionar moneda RD$/US$ y tasa cambiaria.
- Cuando una compra se registra en USD, el sistema conserva el monto original y guarda los totales contables convertidos a RD$ para dashboard, reportes y cuentas por pagar.
- El listado de compras muestra el total contable en RD$ y, cuando aplica, el monto original en US$ con la tasa usada.

### Migracion
- Se agregan `currency`, `exchangeRate`, `sourceSubtotal`, `sourceTax` y `sourceTotal` a `Purchase`.
- Se agrega `exchangeRate` a `Subscription` y se normaliza la moneda anterior `RD$` a `DOP`.

## 2026-06-01 - Acciones desde proyectos

### Agregado
- Desde el panel de un proyecto ahora hay accesos directos para crear una factura o una compra vinculada a ese proyecto.
- Al crear una factura desde un proyecto, se preselecciona el proyecto y el cliente cuando el contacto pertenece al perfil activo.
- Al crear una compra desde un proyecto, se preselecciona el proyecto y al guardar vuelve al panel del proyecto.
- Los proyectos propios ahora pueden eliminarse desde el listado y desde el panel del proyecto.
- En el detalle de proyecto, las transacciones asociadas ahora son clickeables: ventas abren su factura y compras abren su registro.

## 2026-06-02 - PDF e impresion de facturas

### Corregido
- El PDF estable de facturas se rediseña para alinearse con la vista visual del sistema: marca oFlow, datos reales de identidad fiscal, encabezado limpio, tabla con espaciado correcto, notas separadas, total destacado y footer profesional.
- El endpoint PDF de facturas ahora toma la identidad fiscal predeterminada del perfil activo, evitando caer en datos genericos como `Mi Empresa S.R.L.`.
- El boton `Imprimir` ahora abre la vista HTML imprimible del documento y dispara la impresion automaticamente, usando el diseno bonito de pantalla.

### Corregido
- En `Nueva Compra`, se elimina el campo duplicado `Proyecto Relacionado` dentro de `Detalles del documento`; queda solo `Proyecto (Opcional)`.
- En `Nueva Compra`, los controles `Moneda` y `Tasa` se mueven a la franja de `Proveedor Seleccionado`, justo antes de los items de compra.

### Nota
- Al eliminar un proyecto no se eliminan sus facturas, compras, cotizaciones, suscripciones ni facturas recurrentes; solo se desvinculan del proyecto para conservar la contabilidad.

## 2026-06-01 - UI comprobantes de pago

### Corregido
- El modal de registrar pago/cobro ya no se deforma cuando el comprobante adjunto tiene un nombre de archivo muy largo.
- Los nombres de comprobantes se muestran truncados con tooltip, manteniendo visible el boton `Elegir`.
- El nombre del cliente/proveedor en el resumen del pago tambien se trunca para no romper el ancho del modal.

## 2026-06-01 - Compras internacionales

### Agregado
- Las compras/gastos internacionales, importaciones y pagos al exterior ahora pueden guardar el sitio web oficial del proveedor.
- El formulario permite dejar vacio el RNC cuando el proveedor es internacional, sin forzar datos fiscales dominicanos que no aplican.
- El listado de compras muestra `RNC: No aplica` para compras internacionales y agrega acceso a `Sitio oficial` cuando existe.

### Corregido
- Las compras internacionales ya no muestran el icono de advertencia por faltar RNC dominicano.
- El reporte DGII 606 muestra `No aplica` para el RNC de compras internacionales en vez de marcarlas como incompletas.

### Migracion
- Se agrega la columna `supplierWebsiteUrl` a `Purchase`.

## 2026-06-01 - Estabilizacion temporal de PDFs

### Corregido
- Los botones normales de imprimir/descargar facturas y cotizaciones vuelven a usar el generador PDF estable anterior para evitar errores 500 en produccion.
- El render HTML con Playwright queda disponible solo de forma opt-in usando `renderer=html`, evitando cargar Chromium en el flujo normal mientras se valida Firebase App Hosting.

## 2026-06-01 - Nuevo contacto desde proyectos

### Agregado
- En la pantalla de nuevo/editar proyecto, el campo `Contacto / Cliente` ahora permite seleccionar `+ Nuevo Contacto` y crear el cliente en el mismo formulario.
- El contacto nuevo puede guardarse con nombre, RNC/cedula, telefono y email.

### Corregido
- La creacion de proyectos ya no falla cuando el codigo autogenerado coincide con otro proyecto existente; el servidor genera un codigo unico agregando sufijo.
- El formulario evita consultar facturas vinculables cuando el contacto seleccionado es `+ Nuevo Contacto`.
- Si ocurre una excepcion al guardar el proyecto, la alerta intenta mostrar el mensaje real del error.

## 2026-06-01 - Redirect OAuth en App Hosting

### Corregido
- El login, callback y logout de Google ahora construyen redirecciones internas con `AUTH_ORIGIN`, evitando volver a hosts internos de Firebase como `https://0.0.0.0:8080/`.

## 2026-06-01 - PDFs desde HTML imprimible

### Cambiado
- La exportacion PDF de facturas y cotizaciones ahora intenta renderizar la misma vista HTML bonita usando Chromium/Playwright, en vez de depender solo del diseno separado de `@react-pdf/renderer`.
- Las paginas de detalle aceptan modo `pdf=1` para renderizar portada opcional, documento y terminos opcionales con estructura imprimible.
- Los endpoints PDF conservan un fallback al generador anterior si Chromium no puede generar el PDF en el servidor.

### Pendiente de prueba funcional
- Exportar una factura con y sin portada/terminos y comparar visualmente contra la vista de pantalla.
- Exportar una cotizacion con y sin portada/terminos y validar que el PDF mantiene espaciado, colores y tabla.
- Confirmar en Firebase App Hosting que Playwright puede generar PDF en produccion; si cae al fallback, revisar header `X-PDF-Renderer`.

## 2026-05-31 - Estabilidad PWA y cache

### Corregido
- El service worker dejo de cachear paginas dinamicas, rutas autenticadas y assets de Next (`/_next`) para evitar pantallas en blanco por mezclar builds viejos con deploys nuevos.
- La PWA ahora fuerza actualizacion del service worker y recarga una vez cuando toma control una version nueva.

### Pendiente de prueba funcional
- Despues del proximo deploy, abrir la app en navegador y PWA instalada, navegar entre dashboard, facturacion, compras y reportes, y confirmar que no queda el contenido en blanco.
- Si un dispositivo ya tenia la app instalada, cerrar y abrir la PWA una vez despues del deploy para que tome el nuevo service worker.

## 2026-05-31 - Facturas a recurrentes

### Agregado
- Las facturas existentes ahora pueden convertirse en plantillas recurrentes desde el detalle de factura y desde el listado.
- La conversion copia cliente, proyecto, titulo, subtitulo, notas e items facturables, dejando intacta la factura original.
- La plantilla creada queda mensual por defecto, con proxima emision calculada por el dia de la factura original y vencimiento basado en los dias originales de credito.

### Corregido
- La creacion de facturas recurrentes ahora sanitiza los items para enviar a Prisma solo los campos soportados por la tabla recurrente.

### Pendiente de prueba funcional
- Convertir una factura real en recurrente y generar una factura desde esa plantilla para confirmar cliente, proyecto, montos e items.

## 2026-05-30 - Exportacion TXT 607 DGII

### Cambiado
- Se comparo el exportador 607 contra la herramienta oficial `Herramienta de Envio Formato 607.xls` de DGII.
- El reporte 607 ahora descarga un archivo `.TXT` con nombre `DGII_F_607_RNC_PERIODO.TXT`, alineado al nombre generado por la herramienta DGII.
- El contenido del 607 ahora usa separador `|` y no incluye una fila de encabezados de columnas, dejando solo la linea de control y los registros.
- El orden de campos del detalle se mantiene igual al de la herramienta oficial, incluyendo las columnas de formas de venta 17 a 23.

### Pendiente de prueba funcional
- Descargar un 607 real desde la app y cargarlo en la herramienta de pre-validacion de DGII.

## 2026-05-30 - Marca oFlow y retenciones 607

### Cambiado
- La aplicacion pasa de la marca generica `ContableApp` a `oFlow by Oasis` en metadata, login, sidebar, PWA, documentos PDF y vistas imprimibles.

### Corregido
- El exportador 607 ahora refleja `ITBIS_Retenido`, `Retencion_Renta` y `Fecha_Retencion` usando las retenciones registradas en los pagos de facturas de venta.
- El exportador 607 ahora incluye las formas de venta 17 a 23 del instructivo DGII: efectivo, transferencia/cheque/deposito, tarjeta, credito, bonos, permuta y otras formas de venta.

## 2026-05-28 - Seguridad y soportes de compras

### Agregado
- Se agrego login con Google OAuth para proteger la aplicacion en produccion.
- Se agrego middleware de sesion para bloquear paginas y APIs privadas cuando no hay usuario autenticado.
- Se agrego cierre de sesion desde el menu lateral.
- Se agregaron comprobantes adjuntos a los pagos/cobros, visibles desde el detalle de la factura.

### Corregido
- Los soportes PDF/foto importados con IA ya no dependen del disco temporal del servidor; se guardan en el registro del adjunto para poder abrirlos en Firebase/App Hosting.
- Las retenciones en pagos/cobros ahora cuentan como parte del monto aplicado a la factura o compra, evitando que documentos saldados aparezcan como pagos parciales.
- El detalle de pagos de facturas ahora muestra el total aplicado, el monto recibido por transferencia y cada retencion ITBIS/ISR registrada.

### Pendiente de configuracion
- Configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` y `AUTH_ALLOWED_EMAILS` en Firebase App Hosting antes de desplegar.

## 2026-05-25 - Actualizacion modelo Gemini IA

### Corregido
- El escaneo de facturas con IA deja de usar `gemini-1.5-flash`, que puede devolver 404 en la API actual de Gemini.
- El importador de facturas ahora usa `gemini-2.0-flash` por defecto para `generateContent`.
- El parser de respuestas de Gemini ahora acepta array JSON directo y respuestas envueltas como `{ invoices: [...] }`, `{ facturas: [...] }` o `{ data: [...] }`.
- El parser ahora acepta una sola factura devuelta como objeto JSON (`{ invoice: {...} }`, `{ factura: {...} }` o el objeto directo).
- La importacion con IA de una sola compra abre automaticamente el formulario de nueva compra con los datos prellenados.
- El formulario de nueva compra ahora conserva el archivo subido por IA como adjunto al guardar.
- Si Gemini detecta total pero no desglose de items, se crea una linea base para evitar formularios con monto cero.
- La importacion con IA de compras ahora fuerza una sola linea por factura: subtotal/base imponible como precio, ITBIS total como impuesto y total final cuadrado.
- El uploader de compras separa "Tomar foto" de "Galeria/PDF" y reinicia el input despues de cada seleccion para que la camara movil dispare el procesamiento.
- Las fotos tomadas desde camara se normalizan a JPEG antes de enviarse a Gemini para evitar fallos con formatos moviles.
- La IA de compras ahora refuerza la extraccion de razon social/RNC del proveedor y evita usar el proveedor como descripcion del item.
- El footer del formulario de compras deja los creditos debajo de los botones y el boton inferior de registrar mantiene apariencia activa.
- El escaneo QR de DGII vuelve a validar duplicados antes de abrir el formulario, usando el perfil destino detectado por RNC comprador cuando aplique.
- La reconstruccion e-NCF/QR ahora devuelve la respuesta en el formato esperado por la interfaz, usa Playwright headless por defecto y guarda cache temporal en una ruta escribible para despliegues en la nube.
- Se agregaron filtros por mes/ano y contador de registros en listados principales: facturas, compras, cotizaciones, gastos, contactos, proyectos, suscripciones, cuentas por cobrar y cuentas por pagar.
- Se corrigio la generacion del numero interno de facturas para evitar choques entre perfiles al crear facturas, convertir cotizaciones o generar recurrentes.
- Se corrigio el guardado de facturas de venta sanitizando los items antes de enviarlos a Prisma y evitando que campos de UI como `itemType` rompan el guardado.
- La importacion IA de ventas ahora detiene el lote y muestra el error real si una factura no se pudo guardar.
- La importacion IA de compras ahora reconoce claves con acentos/espacios como "RNC Emisor" y "Razon social emisor", y permite editar el proveedor en la revision por lotes antes de guardar.
- Se corrigio la importacion IA de facturas de venta cuando Gemini devuelve ITBIS como `0.18`; ahora se normaliza a `18%` antes de calcular y guardar.

### Cambiado
- Se agrego soporte opcional para `GEMINI_MODEL`, permitiendo cambiar el modelo desde variables de entorno sin editar codigo.
- Los errores de IA ahora incluyen el modelo usado para diagnosticar rapido si Google cambia disponibilidad.
- La solicitud a Gemini pide `responseMimeType: application/json` para reducir respuestas en Markdown/texto.
- El uploader muestra un error claro si Gemini responde pero no devuelve facturas revisables.

### Verificado
- TypeScript.
- Build de Next.js.

## 2026-05-24 - Correccion QR compras y totales NaN

### Corregido
- El flujo de escaneo QR ya no genera `NaN` cuando el timbre DGII trae `MontoTotal` pero no trae un campo de ITBIS.
- El formulario de compras protege los calculos de subtotal, impuesto y total contra valores no numericos.
- El formato de moneda muestra `0.00` si recibe un valor no numerico, evitando que la UI muestre `NaN`.
- El parser de montos del QR acepta formatos con coma o punto decimal, incluyendo `RD$1,234.56` y `1.234,56`.
- El parser QR ahora reconoce `eNCF`, ademas de `ENCF`, `encf` y `ncf`.
- El flujo QR mantiene el modal abierto con loader mientras procesa la informacion, cambia de perfil y abre el formulario de compra.
- El loader QR se mantiene visible durante la navegacion al formulario para evitar que se vea fugazmente el listado de compras.
- El escaneo QR intenta extraer el nombre o razon social del emisor desde la pagina DGII y lo pasa al formulario de compra.
- Se corrigio la extraccion de razon social para no confundir `RNC Emisor` con `Razon social emisor` y para decodificar entidades HTML como `&#xF3;`.
- El registro de compras valida duplicados por perfil, NCF y RNC del proveedor antes de crear o actualizar.
- Las compras creadas desde QR usan el perfil del comprador detectado como respaldo en el backend, aunque el cambio visual de perfil tarde en reflejarse.

### Cambiado
- El QR se usa como entrada al timbre DGII, pero los montos contables se intentan leer desde la pagina de validacion de DGII.
- El sistema prioriza `Monto Total` y `Total de ITBIS` extraidos desde la pagina DGII.
- El `MontoTotal` del QR queda solo como respaldo si la pagina DGII no devuelve el monto.
- Si la pagina DGII no devuelve ITBIS, el formulario registra el total como base/costo y deja el ITBIS en 0 para no inventar credito fiscal.

### Verificado
- TypeScript.
- Build de Next.js.

### Pendiente de prueba funcional
- Escanear facturas que antes terminaban en `NaN` y confirmar que el total cuadra.
- Revisar manualmente facturas mixtas/exentas porque el QR DGII puede no traer desglose completo de ITBIS.

## 2026-05-24 - Mejoras mobile y QR por perfil

### Cambiado
- El dashboard muestra el nombre del perfil activo como titulo principal.
- `/mobile/quick-actions` ahora muestra acciones en dos columnas tambien en mobile.
- El menu inferior mobile incluye un acceso central destacado a `Acciones`.
- El acceso central del menu mobile ahora es un boton solo con icono `+`.
- El panel emergente de `Mas` en mobile usa padding `calc(var(--spacing) * 6)`.
- Los iconos de acciones rapidas usan colores distintos para diferenciarse mejor.
- `Escanear comprobante` es la primera accion rapida y abre `/purchases?scan=qr`.
- `/purchases?scan=qr` abre automaticamente el lector QR.
- El flujo QR intenta detectar el RNC/Cedula del comprador/receptor y cambia al perfil correspondiente antes de crear la compra.

### Pendiente de prueba funcional
- Confirmar en celular que el boton central `Acciones` queda comodo y no tapa contenido.
- Abrir `Acciones` y verificar que se ven dos tarjetas por fila.
- Escanear una factura electronica de Oasis Gate estando en Samuel Calderon y confirmar cambio automatico de perfil.
- Escanear una factura electronica de Samuel Calderon estando en Oasis Gate y confirmar cambio automatico de perfil.
- Confirmar fallback: si el QR no trae RNC del comprador o no coincide con un perfil, se mantiene el perfil activo.

## 2026-05-24 - Mejora visual modo oscuro

### Cambiado
- Se actualizo la paleta global del modo oscuro hacia un estilo financiero mas profundo: fondo casi negro, paneles elevados, bordes azul-gris y texto de mayor contraste.
- Sidebar desktop ahora usa un fondo oscuro diferenciado y estados activos con acento azul claro.
- Dashboard ajusta cards y paneles principales para usar bordes y fondos mas cercanos al nuevo tema oscuro.
- Se agregaron overrides globales para que las pantallas existentes con `dark:bg-slate-*`, `dark:border-slate-*` y `dark:text-slate-*` hereden la nueva direccion visual sin reescribir cada componente.

### Verificado
- TypeScript.

### Pendiente de prueba funcional
- Revisar dashboard, compras, facturas y configuracion en modo oscuro desde navegador.
- Confirmar que tablas, formularios y modales mantienen contraste suficiente.
- Ejecutar build completo luego de detener el server local si Windows mantiene bloqueado el Prisma query engine.

## 2026-05-24 - Migracion local SQLite a Supabase

### Agregado
- Script `scripts/export-sqlite-data.py` para exportar la data local desde `prisma/dev.db`.
- Script `scripts/import-sqlite-json-to-postgres.mjs` para importar la data a Supabase/PostgreSQL.
- El importador puede limpiar la base destino con `--wipe`, inserta los registros en orden por relaciones y reajusta las secuencias de IDs.
- Se ignora `tmp_migration` para no subir data contable exportada al repositorio.
- Comandos npm `data:export:sqlite` y `data:import:supabase`.

### Pendiente de prueba funcional
- Exportar la base local.
- Importar en Supabase con `--wipe` para reemplazar perfiles/registros raros iniciales.
- Abrir la app en Firebase y confirmar perfiles, compras, contactos, proyectos, facturas, cotizaciones, pagos y suscripciones.

## 2026-05-23 - Ajuste Firebase App Hosting / Prisma

### Cambiado
- Se agrego `postinstall: prisma generate` para que Firebase App Hosting genere el Prisma Client durante el build en la nube.
- Esto evita depender de `lib/generated-client`, que existe localmente pero no debe subirse al repo porque es artefacto generado.
- Se reforzo el build con `prisma generate && next build`.
- Se movieron `prisma` y `@prisma/client` a dependencias de produccion para evitar fallos del adaptador cloud.

### Pendiente de prueba funcional
- Subir el cambio de `package.json` a GitHub.
- Ejecutar un nuevo rollout en Firebase App Hosting.
- Si el rollout vuelve a fallar, revisar la primera linea roja del raw log de Cloud Build.

## 2026-05-22 - Preparacion Firebase App Hosting

### Agregado
- Configuracion Firebase base para el proyecto `oasis-contable`.
- Archivo `.firebaserc` apuntando al project ID `oasis-contable`.
- Archivo `apphosting.yaml` con configuracion inicial para Firebase App Hosting.
- Guia `FIREBASE_DEPLOY.md` con comandos, secretos requeridos y pendientes de produccion.

### Verificado
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false`
- `npm.cmd run build`

### Pendiente de prueba funcional
- Ejecutar `firebase login` en la maquina local.
- Crear backend de Firebase App Hosting desde consola o CLI.
- Configurar secretos `DATABASE_URL` y `GEMINI_API_KEY`.
- Migrar SQLite local a PostgreSQL antes de usarlo como produccion real.
- Mover adjuntos de `uploads` a Firebase Storage o Google Cloud Storage.

## 2026-05-22 - Fase PWA movil y accesos rapidos

### Agregado
- Configuracion PWA inicial con `manifest.webmanifest`.
- Service worker basico en `public/sw.js`.
- Iconos PWA en `public/icons`.
- Metadata de instalacion para navegador y Apple web app.
- Boton flotante `Instalar app` cuando el navegador permite instalar la PWA.
- Nueva pantalla `/mobile/quick-actions` para accesos rapidos desde celular.
- La pantalla movil muestra selector de perfil antes de registrar compras, para evitar cargar compras en el perfil equivocado.
- Accesos rapidos incluidos:
  - Compra rapida.
  - Nueva compra.
  - Importar compra con IA.
  - Escanear comprobante.
  - Facturas.
  - Suscripciones.
- Shortcuts en el manifest para abrir acciones rapidas, nueva compra, IA de compras y suscripciones desde la app instalada.

### Verificado
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false`
- `npm.cmd run build`

### Pendiente de prueba funcional
- Abrir desde celular y confirmar que el navegador ofrece instalar la app.
- Instalar la PWA y validar que abre en modo standalone.
- Probar shortcut de acciones rapidas y confirmar que permite seleccionar perfil antes de registrar.
- Confirmar comportamiento de service worker despues de cambios nuevos.
- Fase futura: despliegue Firebase Hosting.
- Fase futura: Firebase Cloud Messaging para notificaciones reales de renovaciones/suscripciones.

## 2026-05-22 - Fase suscripciones activas

### Agregado
- Nuevo modulo `/subscriptions` para dar seguimiento a dominios, hosting, software, plataformas y servicios recurrentes.
- Nuevo modelo `Subscription` con:
  - nombre de lo comprado,
  - categoria,
  - proveedor,
  - proyecto relacionado,
  - sitio web,
  - enlace de administracion/cancelacion,
  - metodo de pago,
  - tarjeta/cuenta usada,
  - monto,
  - ciclo de cobro,
  - fecha de proximo cobro,
  - dias de aviso,
  - estado,
  - notas.
- Formulario rapido para registrar suscripciones desde la misma pantalla.
- Tarjetas de resumen:
  - suscripciones activas,
  - renovaciones por vencer,
  - estimado mensual.
- Lista de suscripciones con estado visual segun vencimiento.
- Acciones para pausar/activar, marcar cancelada y eliminar.
- Enlaces directos a sitio web y panel donde cancelar.
- Navegacion agregada en sidebar desktop y menu mobile.

### Base de datos
- Nueva migracion: `20260522000500_add_subscriptions`.
- Prisma Client regenerado.

### Verificado
- Prisma migrate deploy.
- Prisma generate.
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false`
- `npm.cmd run build`

### Pendiente de prueba funcional
- Crear suscripciones con proyecto y sin proyecto.
- Confirmar que aparecen solo en el perfil activo.
- Validar colores de vencimiento para cobros atrasados, proximos y futuros.
- Probar enlaces de sitio web y administracion/cancelacion.
- Probar pausar, activar, marcar cancelada y eliminar.
- En fase futura: agregar recordatorios/notificaciones antes del cobro.

## 2026-05-22 - Fase portada y terminos en PDFs

### Agregado
- Facturas y cotizaciones ahora pueden guardar terminos y condiciones separados de las notas.
- Nuevas opciones por documento:
  - `includeCoverPage`: incluir portada por defecto.
  - `includeTermsPage`: incluir pagina de terminos por defecto.
- Formularios de facturas y cotizaciones incluyen checkboxes para definir esos defaults.
- Formularios de facturas y cotizaciones incluyen un textarea dedicado para terminos y condiciones.
- La vista de factura/cotizacion muestra casillas al exportar para elegir si el PDF sale con portada, terminos o ambos.
- Los endpoints PDF aceptan parametros:
  - `cover=1` o `cover=0`.
  - `terms=1` o `terms=0`.
- PDFs de facturas y cotizaciones pueden generar:
  - portada inicial,
  - documento principal,
  - pagina final de terminos y condiciones.

### Cambiado
- Las rutas `/api/invoices/[id]/pdf` y `/api/quotations/[id]/pdf` incluyen el proyecto relacionado para mostrarlo en la portada.
- El boton `Imprimir` en la vista del documento abre el PDF generado con las opciones seleccionadas.
- La exportacion PDF usa los defaults guardados cuando no se envian parametros.

### Base de datos
- Nueva migracion: `20260522000400_add_document_pdf_options`.
- Prisma Client regenerado.

### Verificado
- Prisma migrate deploy.
- Prisma generate.
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false`
- `npm.cmd run build`

### Pendiente de prueba funcional
- Crear una cotizacion con portada y terminos activos por defecto.
- Abrir el PDF de cotizacion con solo portada, solo terminos y ambas opciones.
- Crear una factura con terminos especificos y confirmar que aparecen en la pagina final.
- Confirmar que el boton `Imprimir` abre el PDF con las casillas seleccionadas.
- Comparar visualmente la portada contra el PDF de referencia de Oasis Gate y ajustar branding/espaciado.

## 2026-05-22 - Fase proyectos compartidos entre perfiles

### Agregado
- Se agrego la posibilidad de compartir proyectos entre perfiles contables.
- Nuevo modelo `ProjectShare` para relacionar un proyecto con perfiles adicionales sin cambiar su perfil dueno.
- Los proyectos compartidos aparecen en la lista de proyectos del perfil invitado.
- Los proyectos compartidos tambien aparecen en los selectores de proyectos usados por compras, facturas, cotizaciones y facturas recurrentes.
- La vista de proyectos marca como `Compartido` los proyectos que no pertenecen al perfil activo.

### Cambiado
- `getProjects()` y `getProject()` ahora devuelven proyectos propios y proyectos compartidos con el perfil activo.
- `resolveProject()` permite vincular documentos a proyectos propios o compartidos.
- La edicion de un proyecto queda limitada al perfil dueno para evitar cambios accidentales desde otro RNC.
- El formulario de proyectos incluye checkboxes para compartir con otros perfiles.

### Base de datos
- Nueva migracion: `20260522000300_add_project_shares`.
- Prisma Client regenerado.

### Verificado
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false`
- `npm.cmd run build`

### Pendiente de prueba funcional
- Crear un proyecto desde un perfil, compartirlo con otro perfil y confirmar que aparece como `Compartido`.
- Desde el perfil compartido, registrar una compra asociada al proyecto y confirmar que queda vinculada.
- Desde el perfil compartido, registrar una factura o cotizacion asociada al proyecto y confirmar que queda vinculada.
- Confirmar que el perfil compartido puede ver el dashboard del proyecto, pero no editarlo.
- Confirmar que el perfil dueno puede editar la lista de perfiles compartidos y quitar acceso.

## 2026-05-22 - Fase compras internacionales y credito fiscal

### Agregado
- Clasificacion fiscal de compras:
  - `LOCAL_CREDIT`: compra local con credito fiscal.
  - `LOCAL_NO_CREDIT`: gasto local sin credito fiscal.
  - `FOREIGN_EXPENSE`: gasto internacional.
  - `IMPORT_GOODS`: importacion de bienes.
  - `FOREIGN_WITHHOLDING`: pago al exterior con retencion.
- Nuevos campos en `Purchase` para origen, tratamiento fiscal, credito fiscal, inclusion en 606, inclusion en 609 y efecto ISR.
- Selector de tratamiento fiscal en el formulario de compras.
- Las compras por QR quedan forzadas como compras locales con credito fiscal.
- Las compras rapidas quedan como gasto local sin credito fiscal.
- La importacion con IA puede sugerir `taxTreatment`.
- La tabla de compras muestra una etiqueta de tratamiento fiscal.

### Cambiado
- Reporte 606 filtra compras con `report606 = true`.
- IT-1 solo suma ITBIS adelantado cuando `hasFiscalCredit = true`.

### Base de datos
- Nueva migracion: `20260522000200_add_purchase_tax_classification`.

### Verificado
- Prisma migrate deploy.
- Prisma generate.
- TypeScript.
- Build de Next.js.

### Pendiente de prueba funcional
- Registrar compra local con credito fiscal y confirmar que afecta IT-1 y 606.
- Registrar gasto local sin credito fiscal y confirmar que no descuenta ITBIS, pero queda como gasto.
- Registrar gasto internacional y confirmar que no aparece en 606 ni IT-1.
- Registrar importacion de bienes y confirmar que queda clasificada para seguimiento anual.
- Probar flujo QR y confirmar que no pide clasificacion internacional.

## 2026-05-22 - Fase adjuntos en compras importadas con IA

### Agregado
- Nuevo modelo `PurchaseAttachment`.
- Al importar una factura PDF/imagen con IA, el archivo original se guarda como soporte.
- Los adjuntos se almacenan en `uploads/purchases/{profileId}`.
- Nueva ruta protegida: `/api/purchases/attachments/[id]`.
- La tabla de compras muestra enlace `Ver soporte` cuando la compra tiene adjunto.

### Cambiado
- `processInvoiceAction()` conserva el archivo subido y lo pasa al flujo de revision.
- `BatchReview` envia los datos del adjunto al crear la compra.
- `createPurchase()` crea el adjunto asociado a la compra.
- `.gitignore` excluye `uploads`.

### Base de datos
- Nueva migracion: `20260522000100_add_purchase_attachments`.

### Verificado
- Prisma migrate deploy.
- Prisma generate.
- TypeScript.
- Build de Next.js.

### Pendiente de prueba funcional
- Subir un PDF real desde compras con IA y confirmar que extrae datos.
- Crear la compra desde la revision por lote.
- Abrir `Ver soporte` y confirmar que descarga o muestra el archivo correcto.
- Probar que un perfil no pueda abrir adjuntos de otro perfil.

## 2026-05-22 - Fase responsive y UI mobile

### Agregado
- Navegacion inferior para mobile como reemplazo del menu lateral.
- Espaciado inferior para evitar que el menu mobile tape contenido importante.
- Dashboard mobile con tarjetas organizadas en dos columnas donde aplica.

### Cambiado
- Botones principales unificados con `primaryActionClass`.
- Botones de nueva factura, nueva compra, nueva cotizacion y acciones similares alineados visualmente.
- Acciones de compras en mobile organizadas en dos columnas.
- Boton de importar con IA en facturacion alineado al estilo usado en compras.

### Verificado
- TypeScript.
- Build de Next.js.

### Pendiente de prueba funcional
- Revisar dashboard en celular real.
- Confirmar que el menu inferior no tapa botones ni tablas.
- Confirmar navegacion mobile entre Home, Compras, Facturas, Reportes y Mas.
- Revisar compras/facturas/cotizaciones en pantalla pequena.

## 2026-05-19 - Fase perfiles contables

### Objetivo
Separar la contabilidad por perfiles reales dentro del mismo sistema, por ejemplo persona fisica y negocio/empresa.

### Agregado
- Modelo `AccountProfile`.
- Selector global de perfil activo.
- Asociacion de contactos, proyectos, cotizaciones, facturas, compras, secuencias, facturas recurrentes e identidades al perfil.
- Backfill automatico para asignar data existente al perfil principal.

### Cambiado
- Consultas principales filtradas por perfil activo.
- Creaciones principales guardan `profileId`.
- Reportes y dashboard trabajan con el perfil activo.

### Pendiente de prueba funcional
- Cambiar entre perfiles y confirmar que cada uno ve su propia data.
- Crear contactos, facturas y compras en perfiles distintos.
- Confirmar que reportes no mezclan data entre perfiles.
