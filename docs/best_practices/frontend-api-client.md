# Cliente HTTP y sesión del frontend

**Leer cuando:** se configure el cliente HTTP (Axios o fetch), interceptores, el store de autenticación, el guard del router o cualquier llamada a la API. Referencia con Vue 3, Pinia, Vue Router y Axios; con sesión por cookie y `fetch`, [WEB-1](frontend-architecture.md) sustituye la instancia de Axios de FE-1 y FE-2 no aplica.

## FE-1. Vistas sin HTTP

- Por feature (STR-3): cada módulo tiene su cliente (`<feature>-api.ts`), su store y sus vistas; solo el store llama a su cliente.
- Una única instancia de Axios en `core/http/http.ts`, con `baseURL` de `import.meta.env.VITE_API_BASE_URL` y `withCredentials: true`.
- Vistas y componentes no importan `axios`, `core/http/http` ni ningún `*-api`; solo tipos y helpers de error. Lo impone `@typescript-eslint/no-restricted-imports` con `allowTypeImports` en `**/views/**` y `**/components/**`.

**Comprobación:** `rg` de imports de `axios`, `core/http/http` o `*-api` en vistas y componentes, excluyendo `import type`, queda vacío (cubre alias e imports relativos).

## FE-2. Refresh único

Un interceptor de respuesta captura los 401, lanza un único refresh y comparte esa promesa entre las peticiones concurrentes; cada original se reintenta una sola vez (marca `_retry`). Nunca refresca ante un 401 de `/auth/login`, `/auth/register` o `/auth/refresh`, para evitar bucles. Si el refresh falla, limpia la sesión y redirige a `/login?redirect=<ruta>`.

**Comprobación (test con `axios-mock-adapter`):** tres peticiones concurrentes que reciben 401 provocan exactamente un refresh y luego 200.

## FE-3. Errores centralizados

Un único `normalizeError(e): ApiError { code, status, message, fieldErrors?, requestId? }` traduce errores de red, 400 con errores por campo, 401, 403/404, 409, 429 y 5xx. `message` sale del mapa del cliente por `code` o status ([WEB-3](frontend-architecture.md)), nunca del `message` técnico del servidor (CON-4). Ante 5xx la vista muestra el `requestId` (LOG-3). `catch {}` vacío prohibido.

**Comprobación:** `rg` de `catch` con bloque vacío en `apps/web/src` queda vacío.

## FE-4. Restauración

El access vive solo en memoria. Al cargar, `auth.init()` intenta un refresh (la cookie `HttpOnly` viaja sola) y obtiene el usuario. El guard espera a `auth.ready` (promesa única de `init()`) antes de decidir: `meta.requiresAuth` sin sesión redirige a `login` con `redirect`, y `meta.guestOnly` con sesión, al dashboard.

**Comprobación (E2E-8):** con cookie válida y sin access en memoria, `/todos` termina en `/todos`; sin cookie, en `/login?redirect=/todos`.

## FE-5. Logout

`auth.logout()` llama al endpoint y en `finally` limpia el store, cancela peticiones pendientes y redirige. No depende de que el access siga vigente.
