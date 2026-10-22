# Arquitectura backend

**Leer cuando:** se cree o reorganice un módulo o feature backend. Referencia con NestJS y Prisma; con Express (stack por defecto) aplican [EXP](backend-express.md) y la estructura de [STR-2](project-structure.md).

## ARCH-1. Features

Una carpeta por feature con su controller, service, repository, DTOs y tests (`auth/`, `todos/`). Lo transversal va aparte: `common/` (filtros, interceptores, decoradores, pipes), `config/` (validación del entorno) y `prisma/` (cliente de DB).

## ARCH-2. Controllers delgados

Un controller solo traduce HTTP: recibe el DTO, extrae el usuario y llama al servicio. No importa Prisma, no tiene `if` de negocio ni construye queries. Lectura y escritura de cookies en un helper o servicio (`CookieService`), no repetidas en cada handler.

**Comprobación:** `rg -l "PrismaService|prisma\." -g '*.controller.ts' apps/api/src` queda vacío.

## ARCH-3. Servicios y repositorios

El servicio contiene las reglas de negocio y lanza errores de dominio o HTTP; el repositorio encapsula las queries para probar el servicio con un doble simple. En módulos pequeños de Nest, `PrismaService` directo en el servicio es aceptable si mantiene el `where` con dueño ([AUTHZ-2](authorization.md)); en Express aplica el puerto de EXP-1.

## ARCH-4. Atomicidad

Varias escrituras que deben ser consistentes (rotación de tokens, reordenamiento, cambio más registro de auditoría) van en una `$transaction`.

## ARCH-5. Piezas transversales

| Pieza | Responsabilidad |
|---|---|
| Guard JWT global + `@Public()` | autenticación por defecto (AUTHZ-1) |
| Strategy access y strategy refresh | validar cada tipo de token con su secreto (TOK-1) |
| Decorador `@CurrentUser()` | extraer `req.user` tipado |
| Exception filter global | formato único de error ([HTTP-3](http-hardening.md)) |
| Interceptor de logging | peticiones y `requestId` ([LOG-3, LOG-4](logging.md)) |

## ARCH-6. Tipado

`strict: true` en `tsconfig`. Sin `any`, tampoco en tests (`@typescript-eslint/no-explicit-any: error`, STACK-5): los dobles implementan la interfaz del puerto o usan `Pick<T, …>`. Los payloads JWT tienen interfaz (`JwtPayload { sub; type }`).

**Comprobación:** `rg ":\s*any\b|as any|<any>" apps/api/src` queda vacío.
