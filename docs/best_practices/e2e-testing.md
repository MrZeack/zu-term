# E2E determinista

**Leer cuando:** se escriban o modifiquen E2E del navegador, se configure el runner `e2e` o se ejecuten E2E en local o CI. [`e2e`](https://e2e.tester.army/docs) (TesterArmy) usa Playwright y permite pasos con IA (`agent.*`); aquí solo se usa su parte determinista: locators, `expect`, `browser`, sesiones y credenciales. Capas en [TEST-8](testing-ci.md).

## E2E-1. Sin IA ni telemetría

- `e2e` y `@e2e-dev/web` son devDependencies de `apps/web` con versión exacta (STACK-3); el motor fija `playwright-core` y exige Node `^22.22.3 || >=24.8.0`.
- Sin `ai` ni `@ai-sdk/*`; la configuración no declara `agents` y fija `cache: 'off'`. Ningún test usa el fixture `agent` (`act`, `assert`, `waitFor`, `extract`); si lo hiciera, el runner falla con `MODEL_UNAVAILABLE`.
- No se usan `e2e explore`, `e2e mcp`, `e2e login` ni la skill para agentes; la configuración se escribe a mano porque `e2e init --yes` configura un gateway de IA.
- La telemetría está activa por defecto: Makefile y CI exportan `E2E_TELEMETRY_DISABLED=1`. El entorno no tiene claves de modelos (`AI_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`…).

**Comprobación:** `rg` no encuentra `ai`/`@ai-sdk` ni rangos `^`/`~` de `e2e` en `apps/web/package.json`, ni `agent.*`, `agents:` o imports de IA en `apps/web/e2e` y `e2e.config.ts`; `E2E_TELEMETRY_DISABLED` aparece en `Makefile` y `.github/workflows`.

## E2E-2. Stack existente

- Los E2E corren contra los servicios de `make up`; el target no declara `app.command`, así el runner no arranca ni detiene procesos.
- `app.url` usa el mismo host que web y API (`127.0.0.1`) para que viajen las cookies (SES-2).
- `apps/web/e2e.config.ts` carga el `.env` raíz con `process.loadEnvFile` (el runner no lo hace) y exige cada variable sin fallback (CFG-1): `WEB_HOST`, `WEB_PORT`, `E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD`.
- Fija explícitamente `tests: ['e2e/**/*.e2e.ts']`, `retries: 0` (en CI el default es 1), `workers: 1` con base compartida, `cache: 'off'`, `trace` y `video` en `retain-on-failure` y reporters `list` y `junit` (TEST-10).

**Comprobación:** `rg "command\s*:|reuseExisting" apps/web/e2e.config.ts` queda vacío y `e2e list` sin `E2E_ADMIN_PASSWORD` sale con código distinto de 0 (`CONFIG_LOAD_FAILED`).

## E2E-3. Sesión por ejecución

Un `test.setup` (`auth.setup.e2e.ts`) inicia sesión por la interfaz, comprueba que entró (`toHaveURL`) y luego `session.save('admin')`; los demás tests usan `{ session: 'admin' }` y empiezan con `app.open()`. La contraseña es el handle `credentials.user(name).password`: el test no lee su valor y el runner la redacta en reportes y trazas. Las sesiones duran una ejecución, se cifran en disco y se borran al terminar.

**Comprobación:** `rg` no encuentra `.fill('…')` literales en campos de contraseña en `apps/web/e2e`.

## E2E-4. Locators accesibles

- Preferencia: `getByRole(rol, nombre)` → `getByLabel` → `getByText` → `getByTestId` solo sin rol ni etiqueta accesibles; un control que solo se encuentra por test ID es un defecto de accesibilidad (UX-6, UX-7). Nombres con el texto visible de la interfaz.
- Sin CSS ni XPath (`browser.locator`) salvo justificación en comentario.
- Una consulta con varios nodos falla: acota con `.filter({ hasText })` o un contenedor. `.first()`/`.nth()` solo si el orden es contrato, con comentario.

**Comprobación:** cada `browser.locator(`, `.first(` y `.nth(` en `apps/web/e2e` tiene comentario justificativo.

## E2E-5. Esperas por condición

Las aserciones de locator reintentan hasta su timeout; para valores sin locator, `expect.poll`. Las lecturas directas (`textContent()`, `count()`) no reintentan y no afirman estados que aún cambian. Sin `setTimeout`, `sleep` ni esperas fijas. Cada paso lleva `await`; uno sin esperar falla con `STEP_NOT_AWAITED`.

**Comprobación:** `rg "setTimeout|waitForTimeout|\bsleep\(" apps/web/e2e` queda vacío.

## E2E-6. Datos propios

- `scripts/e2e-fixtures.mjs` crea las cuentas antes del runner y las borra después (TEST-9, TEST-10), con prefijo `__<app>_e2e_`, sufijo y contraseña aleatorios que cumplen AUTH-7.
- Cada test crea sus datos con un valor único (`Synthetic Cliente ${Date.now()}`) y no depende del orden; un flujo que abarca varios tests usa `describe(…, { serial: true })`.
- Para preparar datos por API, un fixture con `test.extend` envía las cookies de `browser.cookies()` y rechaza otros orígenes ([API testing](https://e2e.tester.army/docs/api-testing)).
- `.e2e/` (reportes, trazas, capturas, videos) solo contiene datos sintéticos; nunca se ejecutan E2E contra producción.

## E2E-7. Mocks acotados

El camino feliz recorre web, API y DB reales. `browser.route` solo para terceros (pagos, mapas, email) o para forzar estados difíciles de provocar: 5xx, lista vacía, 429 o respuesta lenta (UX-3, RL-2). La ruta se registra antes de `app.open` y la respuesta simulada cumple la envoltura y el esquema de `shared` (CON-4).

**Comprobación:** con `/v1/clients` simulado como 500 `INTERNAL_ERROR`, la vista muestra un `alert` y el botón "Reintentar".

## E2E-8. Seguridad en navegador

Como mínimo se verifica:

- la cookie de sesión es `HttpOnly`, `SameSite=Lax` e invisible para `document.cookie` (SES-2);
- `localStorage` y `sessionStorage` no contienen tokens (TOK-2, UX-6);
- tras el logout, volver a una ruta protegida termina en el login;
- una ruta protegida sin sesión redirige al login y vuelve a la ruta pedida tras iniciar sesión (FE-4).

## E2E-9. Local y CI

- `make e2e`: `env` (MK-8) → comprueba que el stack está activo (si no, pide `make up`) → crea cuentas sintéticas → `pnpm --dir apps/web exec e2e run` → las borra con un `trap`, también si fallan.
- En CI (`CI=1`), `.only` falla con `ONLY_IN_CI`; el job sube `.e2e/` también si falla y publica `.e2e/junit.xml`. En local, `e2e run --last-failed` repite solo lo fallido.

**Comprobación:** `git check-ignore -q apps/web/.e2e/report.json` tiene éxito y `rg "\.only\(" apps/web/e2e` queda vacío.

## E2E-10. Organización

`apps/web/` contiene `e2e.config.ts`, `tsconfig.e2e.json` (incluido en `typecheck`, STACK-2) y `e2e/` con `auth.setup.e2e.ts`, `auth.e2e.ts` (login, logout, guardas y E2E-8), un `<feature>.e2e.ts` por feature y `fixtures.ts` (nunca importado por producción). Cada archivo agrupa sus tests en un `describe` con `{ tags: ['<feature>'] }` para ejecutar con `--tag`. Nombres de test según TEST-8. `test` se importa de `@e2e-dev/web` (fixture `browser` tipado) y `expect` de `e2e`.
