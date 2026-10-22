# CORS, cabeceras y errores HTTP

**Leer cuando:** se configure el arranque del servidor (CORS, Helmet, prefijos, Swagger, límites de payload, health), el manejo global de errores o una API pública.

## HTTP-1. CORS explícito

- `origin` es una lista parseada del entorno (`CORS_ORIGINS`, separada por comas, CFG-5); nunca `origin: true`, `*` ni un callback que siempre acepta. `credentials: true` solo con esa lista.
- Un origen ajeno no recibe `Access-Control-Allow-Origin` y se rechaza con 403 o 204, nunca 500.
- En local, web y API usan el mismo host (`127.0.0.1`) y la lista contiene solo ese origen, sin mezclar `localhost` (SES-2).

**Comprobación:** un preflight desde `$WEB` devuelve `Access-Control-Allow-Origin` igual a `$WEB` y `Allow-Credentials: true`; desde `http://evil.example`, ninguna cabecera `allow-origin`.

## HTTP-2. Cabeceras seguras

`helmet()` antes de las rutas. Si Swagger necesita una CSP relajada, solo en la ruta de docs; en producción, Swagger deshabilitado o protegido.

**Comprobación:** `/health/live` incluye `X-Content-Type-Options`, `Content-Security-Policy` y `X-Frame-Options` (y `Strict-Transport-Security` tras TLS).

## HTTP-3. Errores públicos

Un único manejador global responde con la envoltura de [CON-4](shared-contracts.md). Un error no controlado da 500 `INTERNAL_ERROR` con mensaje genérico; stack y mensaje original solo en el log, una vez (LOG-5). Prisma `P2002` se traduce a 409 y `P2025` a 404, con códigos estables.

**Comprobación:** un `Error('db password=...')` produce `INTERNAL_ERROR` y el body no contiene `password=` ni líneas de stack.

## HTTP-4. Health público

`/health/live` y `/health/ready` son públicos, fuera del rate limit y sin log por petición (LOG-3). Makefile, scripts de espera y CI usan `ready` (HTTP-7).

## HTTP-5. OpenAPI coherente

Cada endpoint documenta tags, autenticación (`@ApiBearerAuth` en Nest) y respuestas 200/201/400/401/404/409/429. En Express, el OpenAPI se genera desde los esquemas Zod de `shared`, no a mano. La URL de docs del README coincide con la real, incluido el prefijo global.

## HTTP-6. Payload y JSON

`express.json({ limit, strict: true })` con el mínimo necesario (p. ej. `1mb` en la API privada por importaciones y `32kb` en la pública). Exceso: 413 `PAYLOAD_TOO_LARGE`; JSON mal formado: 400 `INVALID_JSON`, ambos con CON-4. `x-powered-by` desactivado.

**Comprobación:** un body de 2 MB da 413 y ninguna respuesta incluye `X-Powered-By`.

## HTTP-7. Liveness y readiness

`GET /health/live` da 200 sin tocar dependencias; `GET /health/ready` ejecuta `SELECT 1` y falla si la DB no responde. Si la DB cae, el proceso no termina: `ready` falla y se recupera solo. Ambos responden solo `{ service, status, timestamp, checks }`.

**Comprobación:** al detener la DB, `ready` falla y `live` sigue en 200 con el mismo PID; al reanudarla, `ready` vuelve a 200 (MK-12).

## HTTP-8. API pública aislada

El tráfico público (vistas compartidas, catálogo, webhooks) va en un proceso aparte que:

- no importa código de la API privada (STR-1) y usa un usuario de DB de solo lectura;
- configura CORS sin `credentials` y solo `GET`, `HEAD` y `OPTIONS` mientras no necesite escrituras;
- tiene rate limit y payload más estrictos que la API privada;
- responde DTOs públicos propios, nunca los internos (AUTHZ-6).

**Comprobación:** `rg` no encuentra imports de la API privada en la pública y su usuario de DB no puede escribir.
