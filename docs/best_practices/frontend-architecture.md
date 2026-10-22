# Arquitectura frontend

**Leer cuando:** se cree un módulo, vista o store, o se configure el cliente `fetch`, los mensajes de error, el router o las variables de Vite. Referencia con Vue 3, Pinia, Vue Router y `fetch`; carpetas en [STR-3](project-structure.md).

Con sesión por cookie ([SES](sessions-csrf.md)), WEB-1 sustituye la instancia de Axios de FE-1 y FE-2 no aplica; el resto de [FE](frontend-api-client.md) y [UX](frontend-ux-forms.md) sigue vigente.

## WEB-1. Cliente base y por feature

- `core/http/api-client.ts` crea el cliente sobre `fetch` (inyectable en tests) con `credentials: 'include'`, `accept: application/json`, `baseUrl` de `import.meta.env.VITE_API_BASE_URL` y `x-csrf-token` en cada mutación.
- `get(path, Schema)` y `send(method, path, Schema, body)` validan la respuesta con el esquema de `shared`; un cuerpo no JSON o fuera de contrato es `ApiError` `INVALID_API_RESPONSE`, no un dato. Los errores se convierten en `ApiError(code, message, status, details, requestId)` desde la envoltura (CON-4) y `x-request-id` (LOG-3).
- Cada `<feature>-api.ts` valida la entrada con el contrato, construye la query con `URLSearchParams` y devuelve solo `data` tipada. `download(path)` devuelve un `Blob` y conserva el `ApiError` si la respuesta es un error JSON.

**Comprobación:** `rg "\bfetch\("` en `apps/web/src` solo encuentra `core/` y tests.

## WEB-2. Stores inyectables

- Cada store es una fábrica (`createClientsStore(api, lookups)`) que depende de una interfaz de API, para que los tests usen un API falso sin red. Un store no importa otros stores: los catálogos ajenos se inyectan como `lookups`.
- `core/app-stores.ts` es la única raíz de composición del navegador y solo exporta stores.
- Estado de UI explícito (`loading`, `saving`, `error`, `notice`, `fieldErrors`) y `reset()` (TEN-6). Las mutaciones pasan por un helper común que limpia mensajes, marca `saving`, traduce el error y extrae los errores por campo.

**Comprobación:** cada store se prueba con un API falso y `reset()` devuelve el estado inicial.

## WEB-3. Mensajes por código

`apiErrorMessage(error)` traduce `ApiError.code` con un mapa en el idioma de la interfaz y un texto por defecto; un `ZodError` local muestra "Revisa los datos capturados". `fieldErrorsFrom(error)` convierte issues locales o `details.issues` de `VALIDATION_ERROR` en `{ 'address.street': 'Máximo 50 caracteres.' }`. Cada código nuevo de la API añade su mensaje en el mismo cambio.

**Comprobación:** todo código de `AppError(…, 'CODE')` en `apps/api/src` tiene clave en `apps/web/src/core/http/error-messages.ts`.

## WEB-4. Router y URL

- Rutas con carga diferida (`component: () => import(…)`), nombre estable y parámetros numéricos restringidos en el patrón (`/clientes/:id(\\d+)`), entregados como props tipadas.
- La URL es la fuente de verdad de búsqueda y página (UX-4): la vista observa `route.query` y navega con `router.push`, así recargar o volver atrás conserva el estado.
- Si una URL pública cambia, la antigua se conserva con `redirect`.

## WEB-5. Vite

`vite.config.ts` lee el `.env` raíz (`envDir`, `loadEnv`), falla si faltan `WEB_HOST` o `WEB_PORT` y usa `strictPort: true` en `server` y `preview` (MK-1). Solo `VITE_*` llega al navegador: nunca secretos y tipadas en `src/env.d.ts` (`ImportMetaEnv`).

**Comprobación:** `.env.example` no tiene `VITE_*` con `SECRET`, `PASSWORD`, `PRIVATE` ni `API_KEY`.

## WEB-6. Pruebas sin navegador

Clientes HTTP, stores, traducción de errores y lógica de formularios (`client-form.ts`) se prueban con `node:test`: `fetchImplementation` falso, API falso y `setActivePinia(createPinia())` en cada test. La lógica de vista que merezca prueba se extrae a un `.ts` puro. Flujos y estados de carga, error y vacío se cubren con [E2E](e2e-testing.md), forzando estados con `browser.route` (E2E-7).
