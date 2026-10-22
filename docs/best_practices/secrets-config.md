# Secretos y configuración

**Leer cuando:** se añadan variables de entorno, secretos (JWT, API keys, DB), puertos, URLs entre servicios o configuración por entorno.

## CFG-1. Secretos obligatorios

Prohibido todo valor de respaldo para secretos (`|| 'secret'`, `?? 'dev-key'`, `get('X_SECRET', 'x')`); léelos con `getOrThrow` o equivalente. La configuración se valida al inicio: un secreto ausente, vacío o de menos de 32 caracteres termina el proceso antes de escuchar en el puerto.

**Comprobación:** `rg` no encuentra fallbacks literales de `*SECRET` en `apps/api/src`; arrancar sin `JWT_ACCESS_SECRET` termina con código distinto de 0.

## CFG-2. Una fuente para puertos y URLs

Puertos, orígenes CORS y URL de la API salen del entorno y el Makefile los propaga (`PORT`, `VITE_API_BASE_URL`, `CORS_ORIGINS`). Ningún puerto fijo fuera de configuración; un override (`make up FRONTEND_PORT=X BACKEND_PORT=Y`) funciona sin editar archivos. El prefijo aleatorio `XX` de `1XXYY` se genera con una función del sistema (shell/SO), nunca de memoria para evitar repeticiones entre proyectos.

**Comprobación:** `rg "\b1[0-9]{4}\b" apps/*/src` solo encuentra config o tests; `make up` con puertos alternativos pasa `make verify-api` en el nuevo puerto.

## CFG-3. Producción segura

Con `NODE_ENV=production`, la validación rechaza cookies sin `Secure`, `SameSite=None` sin `Secure` y `trust proxy` sin proxy declarado, y exige el prefijo `__Host-` en cookies de sesión opaca (SES-2).

**Comprobación:** el parser lanza error con `NODE_ENV=production` y `COOKIE_SECURE=false`.

## CFG-4. Entorno fuera de Git

Versiona solo `.env.example` con valores no reutilizables; `.env` está en `.gitignore`. Si `make up` crea `.env` desde el ejemplo, genera secretos aleatorios (`openssl rand -hex 32`) en vez de copiarlos.

**Comprobación:** `git check-ignore -q .env` tiene éxito y `git ls-files` no lista ningún `.env`.

## CFG-5. Parseo único y tipado

- Una función pura por proceso (`parseApiEnv(env)`) valida con Zod `.strict()` y devuelve un objeto tipado: puertos enteros 1–65535, booleanos solo `'true'`/`'false'`, enums para `NODE_ENV` y `LOG_LEVEL` (LOG-2), URLs validadas, límites acotados y `SEED_PASSWORD` con `PasswordSchema` ([AUTH-7](passwords-login.md)).
- Solo `main.ts` la llama con `process.env`; el resto recibe la configuración tipada (EXP-2). Las reglas de producción viven en la misma función (CORS sin `*`, cookies `Secure` con `__Host-`).

**Comprobación:** tests de entorno válido, secreto ausente o vacío, valores fuera de rango, `CORS_ORIGINS='*'` en producción y cada regla de producción.

## CFG-6. Carga y permisos

- Un único `.env` en la raíz para todos los servicios, con permisos `0600` (aplicados por el Makefile, MK-8). Node lo carga con `node --env-file=.env`, sin `dotenv`; Prisma con `loadEnvFile` en `prisma.config.ts`; Vite con `envDir` en la raíz (WEB-5).
- Flutter no lee este `.env`: usa `config/<entorno>.json` sin secretos, porque queda dentro del binario ([FARCH-8](flutter-architecture.md)).
- `.env.example` comenta cada variable cuyo valor no sea obvio.

**Comprobación:** `stat` de `.env` da `600` y `rg "from ['\"]dotenv"` en `apps` y `packages` queda vacío.
