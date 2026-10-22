# Multi-tenant

**Leer cuando:** existan organizaciones, sucursales, equipos o roles, o se escriba un endpoint, consulta o vista sobre datos de un tenant. AUTHZ-2 a AUTHZ-4 de [AUTHZ](authorization.md) aplican con `organizationId` en lugar de `ownerId`.

## TEN-1. Contexto desde sesión

- `requireActiveAccess()` construye un `TenantContext` `{ userId, organizationId, officeId, role, isSuperuser }` desde la sesión validada: un admin opera sobre la organización (`officeId: null`) y un empleado sobre su sucursal.
- Los servicios lo reciben como primer argumento; ningún `organizationId` llega del body, la query ni la URL. El contexto activo se guarda en la sesión y se revalida en cada petición contra los accesos visibles.
- Sin contexto: 403 `CONTEXT_REQUIRED`; con un solo acceso visible se selecciona automáticamente. Por request se guarda en un `WeakMap<Request, TenantContext>` con getter tipado que lanza si falta, sin mutar `req` con `any`.

**Comprobación:** `rg` no encuentra `body`, `query` ni `params` con `organizationId`, `orgId` o `tenantId` en `apps/api/src`.

## TEN-2. Middleware

Orden fijo: sesión (401) → CSRF en escrituras (403) → tenant (403 `CONTEXT_REQUIRED`) → rol (403 `ADMIN_REQUIRED`) → plan o suscripción (402) → controller.

**Comprobación (test de rutas):** sin sesión 401; sin contexto 403; un empleado que borra un recurso de admin, 403.

## TEN-3. Visibilidad única

Una función pura por feature (p. ej. `clientVisibility(tenant, flags)`) devuelve el filtro `{ organizationId, officeId?, ownerUserId? }`. El repositorio lo convierte en el `where` de todas las operaciones: listado, conteo, detalle, edición, borrado, exportación y subrecursos. Fuera de la regla: 404 con el código del recurso (`CLIENT_NOT_FOUND`). Los subrecursos se anidan bajo un padre visible (`/clients/:clientId/addresses/:addressId`) y filtran por padre y organización.

## TEN-4. Políticas y referencias

- Políticas pequeñas en `core/tenancy/policies.ts`: `assertAdmin` → 403 `ADMIN_REQUIRED`; `assertSameOrganization` → 404.
- Toda referencia recibida (sucursal, tipo, usuario asignado, contacto) se valida contra la organización y el padre antes de escribir: 400 con código propio (`OFFICE_INVALID`, `RECIPIENT_INVALID`).
- La configuración de la organización se escribe por lista blanca de campos (CON-2). Las acciones de superusuario son explícitas, idempotentes y auditadas (EXP-6).

## TEN-5. Aislamiento probado

Cada feature con datos de tenant tiene integración contra DB real con al menos dos organizaciones y dos sucursales:

- un admin de B no lee, edita, borra ni exporta datos de A (404);
- un empleado no ve otra sucursal cuando la regla lo restringe;
- listados y conteos de B no incluyen IDs de A;
- una referencia de A enviada desde B da 400.

## TEN-6. Frontend sin mezcla

Al cambiar de organización o sucursal y al cerrar sesión se llama a `reset()` de todos los stores con datos de negocio; cada store lo expone con un test que comprueba el estado inicial. Las vistas de datos van dentro de una guarda (`RequiresContext.vue`) que pide elegir organización mientras no haya contexto.

**Comprobación:** el número de stores de negocio en `apps/web/src/core/app-stores.ts` coincide con las llamadas a `.reset()` al cambiar contexto.
