# Validación, filtros y paginación

**Leer cuando:** se definan entradas, búsquedas, ordenamiento, paginación o HTML de usuario; contratos en [CON](shared-contracts.md).

## VAL-1. Entrada estricta

- Validación global que rechaza campos desconocidos: en Nest, `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`; con Zod, CON-2.
- Cada campo tiene tipo y rango (longitud máxima, email, enum, fecha, enteros 1–100). Campos de servidor (`id`, `ownerId`, `createdAt`) nunca se aceptan en un DTO de entrada.

**Comprobación:** un body con `ownerId` o `isAdmin`, `dueFrom=no-es-fecha` y `limit=100000` dan 400.

## VAL-2. Orden y filtros permitidos

- `sortBy` es un enum de campos permitidos y `order` solo `asc` o `desc`; se traduce a `orderBy` del ORM, nunca se interpola en SQL.
- SQL crudo solo parametrizado (`$queryRaw` con template tag); nunca `$queryRawUnsafe`, `Prisma.raw` ni concatenación.
- `order=desc` funciona en todos los campos, también los ordenados en memoria (prioridad, nulos al final).

**Comprobación:** `sortBy=passwordHash` da 400; `rg` no encuentra `RawUnsafe`, `Prisma.raw(` ni SQL concatenado en `apps/api/src`.

## VAL-3. Paginación

`page` y `limit` (máximo 100) se convierten en `skip`/`take` del ORM, con `total` por `count` con el mismo `where`. Paginar en memoria después de un `skip` da páginas vacías o erróneas: si un orden se hace en memoria, aplica `skip`/`take` después de ordenar. Respuesta `{ items, page, limit, total, totalPages }` en la envoltura de CON-4.

**Comprobación:** con 25 registros y `limit=10`, las páginas 1–3 de cada `sortBy` suman 25 IDs únicos.

## VAL-4. Búsqueda

`contains` sobre campos concretos, con longitud máxima de 100, escapando `%`, `_` y `\` (DB-5) y siempre con el filtro de dueño. Sin distinguir mayúsculas: en PostgreSQL con Prisma, `mode: 'insensitive'`; en SQLite, columna normalizada.

## VAL-5. HTML

- HTML de usuario (plantillas, descripciones, firmas) se sanea en servidor con lista blanca de etiquetas y atributos (`sanitize-html` o DOMPurify), nunca con regex que solo quitan `<script>`.
- Elimina `on*`, URLs `javascript:` y `data:` no permitidos, `<iframe>`, `<object>` y `<style>` salvo que la lista los incluya.
- `v-html`/`innerHTML` solo recibe contenido saneado y la CSP impide scripts inline.

**Comprobación:** `<img src=x onerror=…>`, `<a href="javascript:…">` y `<svg onload=…>` saneados no contienen `onerror`, `onload` ni `javascript:`.
