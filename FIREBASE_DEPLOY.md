# Firebase Deploy - Oasis Contable

Proyecto Firebase:
- Nombre: `oasis-contable`
- Project ID: `oasis-contable`
- Numero de proyecto: `363091161618`

## Camino recomendado

Usar Firebase App Hosting, porque este proyecto usa Next.js con rutas dinamicas, server actions, API routes y Prisma.

## Estado actual

Configuracion agregada:
- `.firebaserc`
- `apphosting.yaml`

## Comandos locales

Instalar o actualizar Firebase CLI:

```powershell
npm.cmd install -g firebase-tools
```

Iniciar sesion:

```powershell
firebase login
```

Seleccionar el proyecto:

```powershell
firebase use oasis-contable
```

Crear secretos usados por App Hosting:

```powershell
firebase apphosting:secrets:set DATABASE_URL
firebase apphosting:secrets:set GEMINI_API_KEY
```

Validar build local:

```powershell
npm.cmd run build
```

## Pendientes importantes antes de produccion real

### Base de datos

Ahora `DATABASE_URL` apunta a SQLite local:

```text
file:./dev.db
```

Eso sirve para desarrollo local, pero no es buena base para Firebase cloud. Para produccion conviene migrar a PostgreSQL, por ejemplo Neon, Supabase o Cloud SQL.

### Archivos adjuntos

Los soportes de compras se guardan en:

```text
uploads/purchases
```

En Firebase eso debe moverse a Firebase Storage o Google Cloud Storage para que no se pierdan al redeploy.

### Notificaciones

Para recordatorios reales en celular se necesita Firebase Cloud Messaging:
- Web Push certificate / VAPID key.
- Permission prompt en la PWA.
- Guardar token por perfil/usuario.
- Job programado para renovaciones y suscripciones.

## Primer deploy de prueba

El primer despliegue puede hacerse como prueba tecnica. Lo esperado:
- UI y rutas Next.js funcionando.
- PWA instalable desde HTTPS.
- Funciones dependientes de SQLite/uploads pueden requerir migracion antes de uso real.
