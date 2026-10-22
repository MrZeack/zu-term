# Base de datos y migraciones

**Leer cuando:** se cambie el esquema, se escriba una migración o una consulta con transacciones o bloqueos, se adopte una base existente o se configure la base local. Referencia con Prisma 7 y PostgreSQL; SQL crudo y paginación en [VAL-2, VAL-3](input-validation.md).

## DB-1. Migraciones revisadas

- Cada cambio de esquema es una migración SQL versionada y revisada, que empieza con un comentario de qué hace y por qué; `prisma/migrations/**/*.sql` nunca está ignorado.
- En bases compartidas o copias de producción solo `prisma migrate deploy`; `migrate dev`, `migrate reset` y `db push` solo en bases desechables.
- Migraciones aditivas (tablas, columnas nulas o con default, índices). Renombrar o borrar va en pasos separados (expandir → migrar datos → contraer) con aprobación explícita.

**Comprobación:** `rg` de `drop`, `truncate`, `delete` o `update` en las migraciones queda vacío o justificado; `Makefile` y `scripts/` no usan `migrate dev|reset` ni `db push`; `git check-ignore` no ignora ningún `migration.sql`.

## DB-2. Sin drift

`scripts/prepare-database.sh`, llamado por `make up` y `make test`, ejecuta `prisma generate` → validar metadata de migraciones → `prisma migrate deploy` → `prisma migrate diff --exit-code` contra la base. Cualquier diferencia detiene el arranque; nunca se corrige con `db push`.

**Comprobación:** con esquema y base alineados, `migrate diff --exit-code` sale con 0; con una columna añadida a mano, falla.

## DB-3. Baseline de base existente

1. Introspección (`prisma db pull`) y revisión: sin `Unsupported` ni `@@ignore` sin justificar.
2. Baseline desde vacío (`prisma migrate diff --from-empty --to-schema … --script`) con su SHA-256 documentado.
3. Exigir diff cero y marcarlo aplicado (`prisma migrate resolve --applied <baseline>`) sin ejecutar su SQL.
4. Rechazar metadata parcial: si `_prisma_migrations` existe, el baseline está aplicado y no revertido.

El esquema físico es la fuente de verdad: no se renombran tablas ni columnas por estética; los nombres de dominio salen de los repositorios. Una prueba de integración verifica el número de tablas, columnas y claves foráneas del baseline, sin `_prisma_migrations` ni tablas propias nuevas.

## DB-4. Transacciones y bloqueos

- Escrituras relacionadas en una transacción interactiva (`$transaction(async (tx) => …)`, ARCH-4).
- Si varios escritores compiten por un agregado (borrados en cascada, importaciones, numeración secuencial, subrecursos), bloquea la fila padre con `SELECT … FOR UPDATE` dentro de la transacción, filtrando también por organización.
- Si la fila cambió o desapareció entre lectura y escritura, responde 404 o 409 (`*_CHANGED`); nunca escribas a ciegas.
- Los efectos de un borrado en tablas relacionadas (`SET NULL`, borrado de hijos) se aplican explícitamente en la misma transacción y se devuelven como conteos para auditoría.

**Comprobación:** dos escrituras concurrentes sobre el mismo padre no duplican registros y un fallo revierte toda la operación.

## DB-5. Consultas

- `select` explícito en cada consulta que devuelve datos (`satisfies Prisma.<modelo>Select`); nunca la fila completa hacia una respuesta.
- PostgreSQL: `mode: 'insensitive'` con `contains`/`startsWith`; en `LIKE`/`ILIKE` crudos el texto del usuario escapa `%`, `_` y `\`.
- El pool de `pg` fija `max`, `idleTimeoutMillis` y `connectionTimeoutMillis`. `SELECT 1` es el readiness (HTTP-7).

## DB-6. Base local en Docker Compose

- Imagen fijada por digest, misma versión mayor que producción y con soporte vigente (`postgres:17.x@sha256:…`; excepción justificada en STACK-3). Puerto solo en loopback (`127.0.0.1:${DB_PORT}:5432`) y variables obligatorias con `${VAR:?mensaje}`.
- `healthcheck` con `pg_isready -U … -d …`, `restart: 'no'`, `security_opt: [no-new-privileges:true]`, arranque con `docker compose up -d --wait` y encoding `UTF8`.
- Volumen con nombre (externo si restaurarlo es costoso); `make down` nunca lo borra (MK-9).
- Usuario de runtime con mínimo privilegio, otro para migraciones y uno de solo lectura para la API pública.
- Volcados (`*.sql`, `*.sql.gz`, `*.dump`, `*.bak`) ignorados por Git, salvo las migraciones.

**Comprobación:** ninguna `image:` sin digest; en `docker compose config` cada puerto publicado tiene `host_ip: 127.0.0.1`; `git check-ignore -q backup.sql` tiene éxito.
