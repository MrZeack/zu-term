# Stack de referencia

**Leer cuando:** se inicie un proyecto sin stack indicado, se añadan o actualicen dependencias o se configuren TypeScript, ESLint o Prettier. En un proyecto existente se respeta su stack y STACK-3 a STACK-5 siguen aplicando. App nativa según [FLT](flutter-stack.md); carpetas según [STR](project-structure.md).

## STACK-1. Componentes

| Capa | Elección |
|---|---|
| Runtime | Node.js 24 LTS (≥ 24.8, exigido por el runner E2E), ESM (`"type": "module"`), fijado en `.nvmrc` y `engines` |
| Paquetes | pnpm con workspaces, fijado en `packageManager` |
| Lenguaje | TypeScript 5.9 estricto (STACK-4) |
| API | Express 5, Zod 4, `helmet`, `cors`, `express-rate-limit`, `cookie`, `pino` y `pino-http` |
| Persistencia | Prisma 7 con `@prisma/adapter-pg`; PostgreSQL en Docker Compose o el motor existente |
| Web | Vue 3 (`<script setup lang="ts">`), Vite 8, Pinia 4, Vue Router 5, Tailwind CSS 4 y `fetch` nativo |
| Móvil y escritorio | Flutter con `provider` y `go_router`, solo si se pide app nativa (FLT-1) |
| Contratos | Zod en `packages/shared` ([CON](shared-contracts.md)) |
| Desarrollo | `node --env-file=.env --import tsx`, sin compilar ni `dotenv`; `--watch` en `dev` |
| Build | `tsup` (ESM, `--target node24`, sourcemaps); web con `vue-tsc --noEmit && vite build` |
| Pruebas | `node:test` + `node:assert/strict` vía `tsx`, `supertest` y [`e2e`](https://e2e.tester.army/docs) + `@e2e-dev/web` (Chromium, sin IA) ([E2E](e2e-testing.md)) |
| Logs | pino y pino-http, JSON a `stdout` ([LOG](logging.md)) |
| Calidad | ESLint flat config con `typescript-eslint` y `eslint-plugin-vue`, Prettier y EditorConfig |

## STACK-2. Scripts

- Raíz: `build` y `test` recursivos; `lint` = `eslint . --max-warnings=0 && prettier --check .`; `lint:fix` = `eslint . --fix && prettier --write .`; `typecheck` recursivo; `check` = lint → typecheck → test → build. `test` y `typecheck` compilan `shared` primero, porque las apps importan su `dist/`. El Makefile los envuelve (`make test`, `make lint`, `make check`).
- API: `dev` = `node --env-file=../../.env --import tsx --watch src/main.ts`; `start` = `node --env-file=../../.env dist/main.js`; `build` = `tsup src/main.ts --format esm --platform node --target node24 --clean --sourcemap`; `test` = `node --env-file=../../.env --import tsx --test "src/**/*.test.ts"`; `typecheck` = `tsc --noEmit`.
- Web: `dev` = `vite`; `build` = `vue-tsc --noEmit && vite build`; `test` como la API; `test:e2e` = `e2e run` (E2E-9); `typecheck` incluye `tsconfig.e2e.json`.
- Shared: `build` = `tsup src/index.ts --format esm --dts --clean --sourcemap`, más `test` y `typecheck`.

## STACK-3. Versiones y suministro

- Dependencias directas con versión exacta, sin `^`, `~` ni prereleases (`-rc`, `-beta`, `-alpha`, `-next`). Lockfile versionado e instalación con `pnpm install --frozen-lockfile`.
- `packageManager` fija pnpm y `engines` fija Node; el Makefile comprueba la versión mayor de Node antes de instalar (MK-8).
- Solo los paquetes listados en `onlyBuiltDependencies` o `allowBuilds` ejecutan scripts de instalación. Se respeta `minimumReleaseAge`, con excepciones por versión exacta en `minimumReleaseAgeExclude`; las transitivas vulnerables se corrigen con `overrides` exactos.
- Cada actualización pasa por lockfile, pruebas, build y `pnpm audit --audit-level low` sin hallazgos; ninguna se acepta automáticamente. Una versión que no sea la última estable se justifica en `docs/ARCHITECTURE.md` ("Decisiones de versiones").

**Comprobación:** `rg` no encuentra `"^`, `"~` ni prereleases en los `package.json`; `pnpm install --frozen-lockfile && pnpm audit --audit-level low` pasa.

## STACK-4. TypeScript y ESM

- `tsconfig.base.json` en la raíz, extendido por cada paquete con su `rootDir`, `outDir` y `types`: `target: ES2024`, `module` y `moduleResolution: NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `isolatedModules`, `resolveJsonModule`, `forceConsistentCasingInFileNames`, `skipLibCheck`, `declaration` y `sourceMap`.
- En Node los imports relativos llevan extensión `.js`, como exige `NodeNext`. La web usa `module: ESNext`, `moduleResolution: Bundler`, `lib` con `DOM` y `noEmit`; los E2E tienen `tsconfig.e2e.json`, incluido en `typecheck`.
- Con `noUncheckedIndexedAccess`, `array[0]` puede ser `undefined`: se comprueba, no se silencia con `!` en código de aplicación. Sin `any` (ARCH-6).

**Comprobación:** `pnpm run typecheck` pasa y `rg` no encuentra aserciones no nulas (`]!`, `)!.`, `!.`) en `apps/*/src` ni `packages/*/src` fuera de tests.

## STACK-5. Lint y formato

- `eslint.config.mjs` parte de los recommended de `@eslint/js`, `typescript-eslint` y `eslint-plugin-vue` (`flat/recommended`) y añade en TS: `consistent-type-imports` (`inline-type-imports`), `no-explicit-any: error`, `no-unused-vars` con `argsIgnorePattern: '^_'` y `no-console: 'error'` (en `apps/web/**`, `allow: ['error']`, LOG-9). Globals de Node en `*.ts`/`*.js` y de navegador en `apps/web/**`; los `.vue` usan `tseslint.parser`.
- Ignora `dist`, `node_modules`, `coverage`, `.run`, `logs`, `.e2e` y las migraciones generadas. `.prettierignore` excluye además el lockfile y el esquema introspectado.
- `.prettierrc.json`: `singleQuote`, `trailingComma: "all"`, `printWidth: 100`, `semi`. `.editorconfig`: UTF-8, LF, 2 espacios y línea final; tabs en `Makefile` y sin recortar espacios finales en `*.md`.
- `lint` solo comprueba; `lint:fix` es lo único que reescribe (TEST-5). Toda desactivación puntual lleva motivo tras `--`.

**Comprobación:** `rg` no encuentra `eslint-disable` sin motivo en `apps` ni `packages`; `pnpm run lint` no modifica archivos.
