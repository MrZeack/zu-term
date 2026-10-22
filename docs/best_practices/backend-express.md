# Backend con Express

**Leer cuando:** se cree o modifique una feature, un middleware o el arranque de una API Express. Variante Express de [ARCH](backend-architecture.md): ARCH-2 a ARCH-4 y ARCH-6 aplican igual; carpetas en [STR-2](project-structure.md).

## EXP-1. Capas

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| `*.routes.ts` | método, ruta y cadena de middleware | reglas, parseo y consultas |
| `*.controller.ts` | parsear params, query y body con el contrato; obtener el tenant; llamar al servicio; responder `{ success, data }` | negocio y ORM |
| `*.service.ts` | reglas, autorización fina, orquestación y transacciones; lanza `AppError` | `req`, `res`, cookies, cabeceras y cliente del ORM |
| `*.repository.ts` | puerto: tipos e interfaz que necesita el servicio | implementación |
| `prisma-*.repository.ts` | consultas con `select` explícito, transacciones y bloqueos | negocio |

**Comprobación:** `rg` no encuentra `@prisma/client` ni `lib/database` en routes, controllers ni services, ni `from 'express'` en services ni repositories.

## EXP-2. Composición

- Cada servicio publica un tipo `<Feature>UseCases` y recibe por constructor su repositorio (interfaz), otros casos de uso acotados (`Pick<ConfigurationUseCases, 'get'>`) y opciones (`now`, `audit`, generadores).
- `main.ts` es la única raíz de composición: parsea la configuración, crea logger y DB, instancia repositorios y servicios y llama a `createApp(deps)`.
- `createApp({ config, readiness, ...useCases })` no abre conexiones ni lee `process.env` y monta cada router solo si recibe sus dependencias, para que los tests de rutas usen casos de uso falsos sin DB.

**Comprobación:** `rg "process\.env" apps/api/src` solo encuentra `main.ts`, tests y `testing/`.

## EXP-3. Errores estables

- `AppError(statusCode, code, message, details?)` es la única excepción lanzada a propósito; cada código lleva siempre el mismo status. Fábricas nombradas por significado (`clientNotFound()`) evitan repetir literales.
- Express 5 pasa al error handler las promesas rechazadas de handlers async: sin `try/catch` ni respuestas de error a mano en cada handler.
- Un único `errorHandler` traduce `AppError` a su status, `ZodError` a 400 `VALIDATION_ERROR`, `entity.too.large` a 413 `PAYLOAD_TOO_LARGE`, `entity.parse.failed` a 400 `INVALID_JSON` y cualquier otro a 500 `INTERNAL_ERROR` genérico; `notFoundHandler` da 404 `ROUTE_NOT_FOUND`. Envoltura de [CON-4](shared-contracts.md).

**Comprobación:** un login con body `{mal` responde `"code":"INVALID_JSON"`.

## EXP-4. Orden del servidor

Orden: `app.disable('x-powered-by')` → `trust proxy` (RL-3) → `httpLogger` y `requestContext` (LOG-3) → `helmet` (HTTP-2) → `cors` (HTTP-1) → `/health` (HTTP-7) → rate limit global → `express.json` (HTTP-6) → routers `/v1` → `notFoundHandler` → `errorHandler`.

- El logger va primero para que toda respuesta, incluidas CORS, 429 y 413, tenga `requestId` y quede registrada; `/health` va antes del rate limit.
- Las rutas de negocio llevan prefijo de versión (`/v1`). Las fijas se montan antes que las parametrizadas que las capturarían (`/clients/export` antes de `/clients/:clientId`), o el parámetro se restringe con un patrón.

## EXP-5. Arranque y apagado

- Antes de `listen`, `readiness.check()`; si falla: log `fatal`, desconexión y `process.exit(1)`.
- `server.requestTimeout = 30_000`, `server.headersTimeout = 15_000`, `server.keepAliveTimeout = 5_000`.
- Con `SIGINT` o `SIGTERM` (`process.once`): `server.close()`, desconectar DB y salir con 0; si no termina en 10 s, salir con 1 (temporizador con `unref()`). Una segunda señal no repite el apagado.

**Comprobación:** cada `apps/*/src/main.ts` define los tres timeouts y dos `process.once('SIG…')`.

## EXP-6. Dependencias deterministas

`now`, los generadores de tokens o salts y el destino de auditoría se inyectan con valores reales por defecto; los tests los fijan. Las acciones sensibles (borrados en cascada, permisos, superusuario) emiten un evento estructurado (`{ event: 'client.deleted', organizationId, userId, clientId }`, LOG-6) que `main.ts` envía al logger o a una tabla de auditoría.

**Comprobación:** `new Date()`, `Date.now()` y `randomBytes(` en `*.service.ts` solo aparecen como valores por defecto de las opciones.

## EXP-7. Logging

Aplica [LOG](logging.md): `main.ts` crea el logger (LOG-1) y `createApp` monta `httpLogger(logger)` primero (LOG-3); `errorHandler` es el único punto que registra errores, con `req.log` (LOG-5). Los tests de rutas inyectan un destino en memoria o `LOG_LEVEL=silent` y comprueban la redacción (LOG-4).
