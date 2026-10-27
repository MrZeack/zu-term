# Estructura del proyecto

**Leer cuando:** se cree un proyecto, se añada una app, paquete o feature, se reorganicen carpetas o se escriba README y `docs/`. Monorepo TypeScript con pnpm; stack en [STACK](tech-stack.md).

**Aplicación:** el monorepo (STR-1 a STR-4) aplica cuando hay varias apps o paquetes. Un CLI o una librería de un solo paquete usa en la raíz `package.json`, `Makefile`, `src/` organizado por feature (con el punto de entrada en `src/main.ts` o `src/cli.ts`), tests adyacentes (STR-5) y `docs/` (STR-6), sin `apps/` ni `packages/`. Crea solo las rutas de los componentes que existen.

## STR-1. Apps y paquetes

| Ruta | Contenido |
|---|---|
| `apps/api` | API privada: negocio y escrituras |
| `apps/public-api` | superficie pública aislada de solo lectura, solo si hay tráfico público (HTTP-8) |
| `apps/web` | frontend |
| `apps/mobile` | app Flutter, solo si se pide app nativa ([FARCH](flutter-architecture.md)) |
| `packages/shared` | contratos Zod y dominio puro |
| `scripts/` | arranque, parada, estado, espera de health, preparación de DB y smoke |
| `docs/` | arquitectura, una guía por feature y avance |

- Raíz: `Makefile`, `docker-compose.yml` (solo con recursos externos), `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc` y `.env.example`.
- `pnpm-workspace.yaml` declara `apps/*` y `packages/*`; paquetes `@<proyecto>/<nombre>` y dependencias internas `workspace:*`. Las apps no se importan entre sí: lo compartido va a `packages/shared`.
- `apps/mobile` no pertenece al workspace: tiene `pubspec.yaml` y `pubspec.lock`, consume la API solo por HTTP con contratos verificados por fixtures (FSEC-4) y queda excluida de `eslint.config.mjs` y `.prettierignore` (FLT-4).
- Puertos según AGENTS: web `1XX01`, API `1XX02`, DB `1XX03`, API pública `1XX04`.
- `.gitignore` cubre dependencias y builds, `.run/`, `logs/`, `*.pid`, `*.log`, `.env` y `.env.*` salvo `.env.example`, volcados (`*.sql`, `*.dump`, `*.bak`) salvo migraciones, `.e2e/`, `coverage/` y `.handoff.md` (HO-1).

**Comprobación:** `rg` no encuentra imports de `@<proyecto>/api|public-api|web` ni rutas relativas a otra app en `apps` y `packages`; `git check-ignore` acepta `.env`, `.run/x.pid`, `logs/x.log`, `dump.sql`, `apps/web/.e2e/report.json` y `.handoff.md`.

## STR-2. Backend por feature

- `apps/api/src/main.ts` es la raíz de composición (config, logger, DB, repositorios, servicios, `listen`); `app.ts` exporta `createApp(deps)` sin I/O propio; `config/env.ts` valida el entorno; `lib/database.ts` expone cliente y readiness; `testing/` solo para tests; `core/` contiene solo lo transversal (`errors/`, `http/`, `logging/`, `health/`, `tenancy/`, `time/`).
- Cada feature (`clients/`) agrupa `clients.routes.ts`, `clients.controller.ts`, `clients.service.ts`, `clients.repository.ts` (puerto), `prisma-clients.repository.ts` (adaptador), reglas puras (`client-visibility.ts`) y sus tests `*.service.test.ts`, `*.routes.test.ts` e `*.integration.test.ts`. Esquema y migraciones en `apps/api/prisma/`.
- Archivos en kebab-case con sufijo de capa. La lógica pura de la feature va en su archivo, sin Express ni Prisma, y se prueba sin mocks. Capas en [EXP](backend-express.md).

## STR-3. Frontend por feature

- `apps/web/src` contiene `main.ts`, `App.vue`, `router.ts`, `env.d.ts` e `index.css`. `core/` reúne `app-stores.ts` (raíz de composición), `http/` (`api-client.ts`, `error-messages.ts`), `forms/` y `layout/` (cabecera y guardas de contexto).
- Cada `modules/<feature>/` tiene `<feature>-api.ts`, `<feature>.store.ts`, lógica pura de formulario (`client-form.ts`), `components/` y `views/` (una vista por ruta), con tests `.test.ts` adyacentes.
- E2E en `apps/web/e2e/` (`<feature>.e2e.ts`, `auth.setup.e2e.ts`, `fixtures.ts`) y configuración en `apps/web/e2e.config.ts` (E2E-2, E2E-10).
- Componentes y vistas en PascalCase con sufijo (`*View.vue`, `*Form.vue`); el resto en kebab-case. Un store no importa otros stores (WEB-2); las vistas leen varios desde `core/app-stores.ts`.

## STR-4. Shared

`packages/shared/src` contiene `index.ts` (reexportaciones explícitas y nombradas, sin `export *`), `contracts/` (un archivo por feature), `validation/` (texto, email, contraseña de AUTH-7) y utilidades puras como `csv/`. Solo depende de Zod: sin Express, Vue, Pinia, Prisma ni APIs de Node o navegador. Compila con `tsup` a `dist/` y expone tipos desde `src` (`"types": "./src/index.ts"`).

**Comprobación:** `rg` no encuentra imports de `express`, `vue`, `pinia`, `@prisma/client` ni `node:*` en `packages/shared/src` fuera de tests, ni `export * from`.

## STR-5. Pruebas

Cada archivo con lógica tiene su `*.test.ts` al lado; sin carpeta `tests/` global. Excepciones: E2E en `apps/web/e2e/`, smoke en `scripts/<feature>-http-smoke.test.mjs` y Flutter en `test/` como espejo de `lib/` (FTEST-3). Los helpers viven en `src/testing/` (API) o `e2e/fixtures.ts` y nunca se importan desde producción. Capas en TEST-8.

**Comprobación:** `rg` no encuentra imports de `testing/` en `apps/*/src` fuera de tests y de `testing/`.

## STR-6. Documentación viva

Aplica [DOC](documentation.md), solo con información aplicable:

| Archivo | Contenido |
|---|---|
| `README.md` | estado, estructura, requisitos, inicio rápido, URLs y puertos, comandos, seguridad e índice de docs |
| `docs/ARCHITECTURE.md` | objetivos, capas, seguridad por defecto, runtime local, puertos y decisiones de versiones |
| `docs/<FEATURE>.md` | endpoints (método, ruta, permisos), validación, reglas, decisiones y pendientes |
| `docs/PROGRESS.md` | hitos, decisiones con fecha y motivo, riesgos con mitigación y pendientes con prioridad |

La documentación cambia junto con el código que describe y lo que afirma tiene un test que lo respalda (TEST-7). Cada decisión registra fecha y motivo; cada pendiente, prioridad y documento de referencia.
