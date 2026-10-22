# Testing y CI

**Leer cuando:** se escriban pruebas unitarias, de rutas, integración o smoke, se configure CI, lint o cobertura, o se redacte el README. Complementa el TDD de AGENTS; herramientas en [STACK-1](tech-stack.md); navegador en [E2E](e2e-testing.md).

## TEST-1. Seguridad HTTP mínima

Pruebas de rutas o smoke (TEST-8) obligatorias en toda API con usuarios:

| Caso | Esperado | Regla |
|---|---|---|
| Ruta protegida sin token ni cookie | 401 | AUTHZ-1 |
| B hace GET, PATCH o DELETE sobre un recurso de A, o lo busca en su lista | 404 / ausente | AUTHZ-3 |
| Reutilizar el refresh antiguo tras rotar | 401 y familia revocada | TOK-3 |
| Dos refresh concurrentes con el mismo token | exactamente un 200 | TOK-3 |
| Refresh o sesión tras logout | 401 | TOK-4, SES-4 |
| Escritura sin CSRF válido (sesión por cookie) | 403 | SES-3 |
| Body con campos no permitidos | 400 | VAL-1, CON-2 |
| `sortBy` fuera de la lista | 400 | VAL-2 |
| Login fallido repetido | 429 | RL-4 |
| Contraseña de 14, de más de 128 o de la lista de bloqueo | 400 | AUTH-7 |
| Respuestas | sin `passwordHash` ni tokens, salvo el access emitido (TOK-2) | AUTH-4 |
| Email duplicado en registro | 409 o la política elegida | AUTH-3 |
| Logs | sin contraseñas, tokens, cookies ni query strings | LOG-4 |

## TEST-2. Pruebas DB juntas

- Cada ejecución usa una base desechable (`test_<uuid>`), migrada en el setup (`prisma migrate deploy`) y borrada en el teardown; una base compartida aplica TEST-9.
- Suites que comparten base corren en serie (`node --test --test-concurrency=1`), limpian estado entre sí y no dependen del orden ni de ejecuciones anteriores.
- Límites de rate limit y timeouts de test por variables de entorno; el timeout de hooks alcanza para migrar (≥ 30 s). `make test` pasa completo, no solo suite por suite.

## TEST-3. Frontend

Con `node:test` (WEB-6), como mínimo: stores de auth y recurso principal con `reset()` (TEN-6); cliente HTTP (validación de respuesta, `ApiError` y, con JWT, refresh concurrente FE-2); guard de rutas con y sin sesión; `apiErrorMessage` y `normalizeError`; lógica pura de formularios. Los estados de carga, error y vacío se cubren con E2E (UX-3, E2E-7).

## TEST-4. Cobertura

`node --test --experimental-test-coverage` con `--test-coverage-lines=80`, `--test-coverage-branches=70` y `--test-coverage-functions=80`: por debajo, la ejecución falla.

## TEST-5. Lint y tipos

Scripts separados (STACK-2): `lint` solo comprueba (`--max-warnings=0`), `lint:fix` corrige y `typecheck` usa `tsc --noEmit`/`vue-tsc --noEmit` incluyendo tests y E2E (`tsconfig.e2e.json`). ESLint con flat config (STACK-5).

**Comprobación:** `pnpm run lint && pnpm run typecheck && git diff --quiet` pasa.

## TEST-6. CI

- En cada push y PR: `pnpm install --frozen-lockfile` → `pnpm audit --audit-level low` → `make check` → servicios externos y migraciones → integración (`RUN_DB_TESTS=true`) → `make up` → `make smoke` → `make e2e` → `make down`.
- Secretos de test generados en el job o desde secrets de CI. El job no recibe claves de modelos de IA (E2E-1) y exporta `E2E_TELEMETRY_DISABLED=1`.
- `.e2e/` y `logs/` se suben como artefactos también si el job falla; solo contienen datos sintéticos (LOG-10).

## TEST-7. Documentación verificable

Cada afirmación funcional o de seguridad del README ("refresh hasheado", "soft delete", "rotación con detección de reutilización") tiene un test que la respalda; sin test, no se afirma. El README incluye "Limitaciones conocidas" honestas (cookie sin `Secure` en desarrollo, pendientes, almacenamiento de tokens). Puertos, comandos y URLs (Swagger, health) coinciden con la configuración real. Redacción según [DOC](documentation.md).

## TEST-8. Capas

| Capa | Qué prueba | Herramienta | Dónde | Comando |
|---|---|---|---|---|
| Unitaria | funciones puras, contratos y servicios con repositorio falso | `node:test` + `tsx` | `*.test.ts` junto al código | `pnpm test` |
| Rutas | middleware, status, envoltura, contrato y logs con casos de uso falsos, sin DB | supertest | `*.routes.test.ts` | `pnpm test` |
| Integración | repositorios y servicios contra DB real, aislamiento entre tenants | `node:test` con `RUN_DB_TESTS=true` | `*.integration.test.ts` | `make test` |
| Smoke | flujo HTTP real (cookies, CSRF, contexto) contra el stack levantado | `fetch` + esquemas de `shared` | `scripts/*-http-smoke.test.mjs` | `make smoke` |
| E2E | flujos de usuario en navegador, sin IA | `e2e` + `@e2e-dev/web` | `apps/web/e2e/*.e2e.ts` | `make e2e` |
| Operativa | contrato de Makefile, Compose y scripts | bash | `scripts/*.test.sh` | MK-11 |

- `make check` (lint → typecheck → test → build) es la puerta de calidad local y de CI; `make smoke` y `make e2e` corren contra `make up`.
- La integración se omite (`{ skip: !shouldRun }`) salvo con `RUN_DB_TESTS=true`, para que `pnpm test` funcione sin DB.
- "E2E" es solo navegador; supertest o `fetch` son rutas o smoke. Flutter según FTEST-1.
- El nombre de cada test describe el comportamiento en el idioma del proyecto (`'GET /v1/clients exige sesión y contexto'`).

## TEST-9. Bases con datos reales

Con una base que contiene datos reales (p. ej. copia de producción):

- todo lo creado lleva prefijo (`__<app>_` en usuarios, `Synthetic ` en organizaciones) y sufijo aleatorio por ejecución;
- se crea en el `try` y se borra en `finally` o `after`, hijos primero y en una transacción;
- el helper de borrado se niega a tocar registros sin prefijo y `assertNotProduction()` lanza con `NODE_ENV=production`;
- los datos reales solo se leen.

## TEST-10. Determinismo

- Reloj, tokens y salts inyectados (EXP-6); temporizadores con `mock.timers`; nunca `sleep` para esperar resultados.
- E2E (E2E-2): `workers: 1` si comparten base, `retries: 0`, `.only` rechazado en CI, `trace` y `video` en `retain-on-failure` y `cache: 'off'`.
- Las cuentas E2E las crea un script de fixtures antes de ejecutar, con contraseñas aleatorias que cumplen AUTH-7, y las borra al terminar (E2E-6).
- Los smoke validan cada respuesta con el esquema de `shared` y fijan un tiempo máximo para consultas críticas (p. ej. listado < 1 s con la organización más grande).
