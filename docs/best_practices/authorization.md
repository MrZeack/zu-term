# Autorización y aislamiento

**Leer cuando:** se expongan recursos con dueño o enlaces públicos; para organizaciones, aplica también [TEN](multi-tenancy.md).

## AUTHZ-1. Protección por defecto

El guard de autenticación es global y las rutas públicas se marcan explícitamente (p. ej. `@Public()`): una ruta nueva queda protegida aunque se olvide el decorador.

**Comprobación:** un recurso protegido sin credenciales da 401; las rutas públicas son solo login, register, refresh, logout y health.

## AUTHZ-2. Dueño en la consulta

Toda lectura, actualización y borrado filtra por `{ id, ownerId }` en la misma query; si no afecta filas, 404. Comprobar antes con `findUnique({ id })` y escribir solo por `id` abre una carrera (TOCTOU). El `ownerId` sale de la sesión validada (`req.user.sub`), nunca del body ni de la query.

**Comprobación:** `rg` no encuentra `update`, `delete`, `findUnique` ni `findFirst` con `where: { id }` sin dueño en recursos con dueño.

## AUTHZ-3. Recursos ajenos

Un recurso de otro usuario responde 404, igual que uno inexistente; un 403 confirmaría que el ID existe.

**Comprobación (prueba HTTP obligatoria):** el usuario B recibe 404 al leer, modificar y borrar un recurso de A y no lo ve en su lista; A sigue recibiendo 200.

## AUTHZ-4. Agregados

Conteos y resúmenes (dashboard) filtran por `ownerId` y se calculan en la base (`count`, `groupBy`), no sobre una lista truncada.

## AUTHZ-5. Soft delete

Con `deletedAt`, todas las queries excluyen los borrados mediante un helper o extensión de Prisma, no un filtro repetido a mano. Un registro borrado responde 404.

## AUTHZ-6. Enlaces públicos

Un enlace sin login (cotización, documento, invitación) es una credencial:

- Token aleatorio de al menos 128 bits en base64url (≥ 22 caracteres), guardado como hash si es de larga duración, revocable por su dueño y con caducidad cuando aplique.
- Respuesta con DTO público propio, sin notas privadas, costos, márgenes, usuarios internos ni historial. Token inexistente o revocado: 404 genérico; la ruta tiene rate limit propio.
- La página pública usa `Referrer-Policy: no-referrer` y los logs registran la plantilla de ruta, nunca el token ([LOG-3, LOG-4](logging.md)).

**Comprobación:** el body público no contiene `privateNotes`, `profit`, `margin` ni `purchasePrice`; un token revocado da 404.
