# Logging

**Leer cuando:** se cree o configure un logger, se registren peticiones, errores, seguridad o auditoría, se use `console.*` o se decida qué datos van a los logs. Referencia con pino y `pino-http` (STACK-1); archivos locales en [MK-5](makefile-processes.md).

## LOG-1. Logger único

- Un logger pino por proceso, creado en `main.ts` con la configuración parseada (CFG-5) e inyectado (EXP-2); ningún módulo importa un logger global. Escribe JSON, una línea por evento, en `stdout`.
- Campos base: `time` (ISO 8601 UTC), `level` como etiqueta, `service`, `version`, `env` y `msg`.
- La fábrica vive en `core/logging/logger.ts` y acepta un `destination` opcional para capturar en memoria en tests.
- La API no usa `console.*` (`no-console: 'error'` en `apps/api/src`) ni escribe, rota o transporta archivos. `pino-pretty` solo en local por tubería (`make logs`), nunca dentro del proceso.

**Comprobación:** `rg` no encuentra `console.*` ni `pino-pretty`/`transport:` en `apps/api/src` fuera de tests.

## LOG-2. Niveles

| Nivel | Uso | Ejemplos |
|---|---|---|
| `fatal` | el proceso va a terminar | configuración inválida, DB no disponible al arrancar (EXP-5) |
| `error` | fallo inesperado que alguien debe revisar | 5xx, excepción no controlada, tarea periódica fallida |
| `warn` | anomalía esperada con valor de seguridad u operación | rate limit, CSRF rechazado, reutilización de refresh, reintento agotado |
| `info` | ciclo de vida y negocio | arranque y parada, petición completada, auditoría |
| `debug` | diagnóstico local | nunca en producción |

Producción y staging usan `info`; tests, `silent` o destino en memoria; `trace` no se usa. `LOG_LEVEL` es un enum validado (CFG-5). Un 4xx es comportamiento normal y va en `info`; si además es un evento de seguridad, se emite aparte en `warn` (LOG-6).

## LOG-3. Correlación

- Cada petición tiene `requestId`: el `x-request-id` entrante solo si cumple `^[A-Za-z0-9._-]{1,64}$`, si no `randomUUID()`. Siempre se devuelve en `x-request-id`.
- Un `AsyncLocalStorage` (`core/logging/request-context.ts`) guarda `{ requestId, userId?, organizationId? }`, completado por los middlewares de sesión y tenant (TEN-1). El `mixin` del logger lo añade a cada línea devolviendo un objeto nuevo (pino lo modifica), así los servicios no reciben `req`.
- La línea de petición completada lleva `req.id`, `req.method`, `route` (plantilla, p. ej. `/v1/clients/:clientId`), `res.statusCode` y `responseTime`, sin URL real, query ni cabeceras. `/health/*` no genera línea.
- El frontend guarda `x-request-id` en `ApiError` y ante un 5xx lo muestra como "código de soporte".

**Comprobación:** sin cabecera se devuelve un UUID; `abc-123` se conserva; `a b{}` se reemplaza por un UUID.

## LOG-4. Datos excluidos

- Nunca: contraseñas ni hashes, tokens (access, refresh, sesión, CSRF, restablecimiento, enlaces públicos), cookies, `Authorization`, API keys, secretos de configuración, bodies completos, query strings, tarjetas ni volcados de entidades.
- Al logger van objetos construidos campo a campo (`{ event, clientId }`), nunca `req.body`, `req.headers`, la entidad ni la configuración. Datos personales como IDs, no emails, nombres ni teléfonos; la IP solo en eventos de seguridad.
- Un token se correlaciona por su ID en DB o `tokenHashPrefix` (primeros 12 hex de su SHA-256), nunca por un fragmento.
- `redact` es defensa adicional: en pino, `*.campo` cubre solo un nivel y no la raíz, así que cada clave sensible se declara en ambas formas, más `req.headers.authorization`, `req.headers.cookie`, `x-csrf-token` y `set-cookie`.

**Comprobación:** un secreto sintético en `Authorization`, cookie, query y body de una ruta pública no aparece en los logs capturados, y la ruta figura como `/v1/public/quotes/:token`; `rg` no encuentra llamadas al logger con `req.body`, `req.headers`, `req.query`, `config` ni `process.env`.

## LOG-5. Error una sola vez

- Cada error se registra una vez, en la frontera: el `errorHandler` (EXP-3) con `req.log`. Las capas internas lanzan o propagan sin registrar y relanzar.
- `AppError` esperado (4xx): `info` con `code`, sin stack. Inesperado (5xx): `error` con la clave `err` (serializa `type`, `message`, `stack`).
- Los mensajes no incluyen entrada ni secretos; de Prisma solo `code` y `meta.target`. La respuesta nunca incluye stack ni mensaje interno (HTTP-3).
- `uncaughtException` y `unhandledRejection` registran `fatal` y apagan ordenadamente (EXP-5).

## LOG-6. Auditoría

Cada evento lleva `event` estable en minúsculas con puntos (`<dominio>.<acción>`), `outcome` (`success`/`failure`) y el contexto de LOG-3. Mínimo:

| `event` | Nivel | Campos extra |
|---|---|---|
| `auth.login` | `info` éxito, `warn` fallo | `userId` si existe, `ip`, `reason` (`invalid_credentials`, `inactive`) |
| `auth.logout` | `info` | `userId` |
| `auth.rate_limited` | `warn` | `ip`, `limiter` |
| `auth.csrf_rejected` | `warn` | `ip`, `route` |
| `auth.refresh_reuse_detected` | `warn` | `userId`, `familyId` |
| `user.password_changed` / `user.password_reset` | `info` | `userId` |
| `authz.context_denied` | `warn` | `userId`, organización solicitada |
| `<recurso>.deleted`, roles, permisos y superusuario | `info` | IDs afectados y conteos (EXP-6, DB-4) |

Un login fallido no registra el identificador tecleado (puede ser una contraseña escrita en el campo equivocado), solo el `userId` si la cuenta existe. La auditoría con valor legal o de negocio se guarda además en una tabla, en la misma transacción que la acción (EXP-6).

**Comprobación:** `rg "event: '"` en `apps/api/src` no encuentra nombres fuera de `[a-z_]+(\.[a-z_]+)+`.

## LOG-7. Mensajes fijos

`msg` es una frase fija (`'client deleted'`); los datos van en campos, nunca interpolados, para evitar inyección y permitir búsqueda. Las cadenas del cliente (`user-agent`, nombres de archivo) se truncan a 256 caracteres.

**Comprobación:** `rg` no encuentra llamadas al logger con template literals ni concatenación en `apps/api/src`.

## LOG-8. Ciclo de vida

Al arrancar, `service.started` con `version`, `port`, `env` y `logLevel`, sin volcar la configuración. Al apagar, la señal y `service.stopped`; una salida con error registra `fatal` antes de `process.exit` (EXP-5). Migraciones, seeds y tareas registran inicio, fin, duración y conteos, sin datos.

## LOG-9. Frontend

Tokens, cookies, valores de formularios y respuestas completas no se registran ni se envían a terceros. `no-console: ['error', { allow: ['error'] }]` en `apps/web/src`; `console.error` solo en `app.config.errorHandler`, con el nombre del error y el `requestId`. Un servicio de errores del navegador se documenta en `docs/ARCHITECTURE.md` con sus campos, sin replays de sesión ni captura de inputs.

**Comprobación:** `rg` no encuentra `console.log|info|debug|warn|trace` en `apps/web/src` fuera de tests.

## LOG-10. Acceso y retención

- Local: el Makefile redirige `stdout` y `stderr` a `logs/<servicio>.log` con `umask 077` (MK-5, MK-10); `logs/` ignorado por Git (STR-1).
- Producción: la plataforma recoge `stdout`; retención documentada en `docs/ARCHITECTURE.md` (p. ej. 30 días para aplicación y plazo legal para auditoría); acceso de mínimo privilegio.
- Los logs del runner E2E (`.e2e/`) y de las apps que arranca no se redactan: solo pueden contener datos sintéticos (TEST-9, E2E-6).
