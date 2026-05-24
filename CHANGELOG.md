# Changelog

Bitacora de cambios del proyecto Oasis Software Contable. Mantener aqui las funciones nuevas, ajustes de UI, migraciones y puntos que necesitan prueba funcional.

## 2026-05-24 - Correccion QR compras y totales NaN

### Corregido
- El flujo de escaneo QR ya no genera `NaN` cuando el timbre DGII trae `MontoTotal` pero no trae un campo de ITBIS.
- El formulario de compras protege los calculos de subtotal, impuesto y total contra valores no numericos.
- El formato de moneda muestra `0.00` si recibe un valor no numerico, evitando que la UI muestre `NaN`.
- El parser de montos del QR acepta formatos con coma o punto decimal, incluyendo `RD$1,234.56` y `1.234,56`.
- El parser QR ahora reconoce `eNCF`, ademas de `ENCF`, `encf` y `ncf`.
- El flujo QR mantiene el modal abierto con loader mientras procesa la informacion, cambia de perfil y abre el formulario de compra.

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
