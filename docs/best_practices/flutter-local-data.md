# Datos locales Flutter

**Leer cuando:** una app Flutter guarde datos en el dispositivo (SQLite, preferencias o archivos), cambie su esquema, cifre datos o claves, o implemente respaldos, restauraciones, exportaciones o datos de demostración. Equivale a [DB](database-migrations.md) para apps local-first con `sqflite`; aplican [CON-6](shared-contracts.md), DB-4 e [IO-2](import-export.md).

## FDB-1. DB inyectada

- `DatabaseService` recibe la fábrica (`databaseFactory` en móvil, `databaseFactoryFfi` en escritorio) y la ruta; no reasigna el global ni es singleton (FARCH-3). Una conexión por proceso, cerrada al terminar.
- La base vive en `getApplicationSupportDirectory()`, nunca en `getApplicationDocumentsDirectory()`, que es visible y suele sincronizarse con iCloud u OneDrive. Si el usuario elige otra carpeta, se valida (escribible y, con datos sensibles, no sincronizada) antes de mover la base.
- `onOpen` activa `PRAGMA foreign_keys = ON` y comprueba que quedó activo; durante las migraciones siguen desactivadas, como exige SQLite para reconstruir tablas (FDB-2).

**Comprobación:** tras abrir, `PRAGMA foreign_keys` devuelve 1 y la ruta está bajo Application Support.

## FDB-2. Migraciones únicas

- `migrations` es una lista con una función por versión publicada y `version = migrations.length`; una versión publicada nunca se edita.
- Sin `onCreate`: sqflite llama a `onUpgrade` desde 0, así base nueva y actualizada recorren el mismo código. Duplicar el `CREATE TABLE` es la forma más común de que diverjan.
- `onUpgrade` corre en transacción (si falla, la base queda en la versión anterior) y termina con `PRAGMA foreign_key_check` vacío o lanza.
- Aditivas (DB-1). Para cambiar una tabla, en la misma migración: `CREATE TABLE x_new`, `INSERT … SELECT`, `DROP TABLE x`, `ALTER TABLE x_new RENAME TO x`; con claves foráneas activas, borrar un padre fallaría, por eso se activan en `onOpen`.
- `onDowngrade` lanza y la app muestra un error sin tocar datos; prohibido `onDatabaseDowngradeDelete` con datos del usuario.

**Comprobación:** un test abre la base en cada versión publicada, la migra y su `sqlite_master` es igual al de una base nueva; otro migra con datos y los conserva.

## FDB-3. Invariantes

- La base protege sus invariantes aunque el código falle: `NOT NULL`, `CHECK` de rangos y enums (`status IN ('PENDING', 'PAID')`), claves foráneas con `ON DELETE` explícito e índices únicos parciales ("una nómina activa por empleado y periodo").
- Dinero en `INTEGER` de centavos; horas en minutos o centésimas enteras; fechas de negocio `TEXT` con `CHECK` de formato `YYYY-MM-DD`; instantes en UTC ISO 8601.
- Cada fila que se sincroniza, exporta o cifra por campo tiene un `record_uid` aleatorio además del `id`. Una columna que cambia de tabla se retira en una migración posterior.

## FDB-4. Consultas y concurrencia

- Valores siempre con `?` y `whereArgs`; un nombre de tabla o columna variable sale de una lista blanca (VAL-2). `query(columns: …)` explícito al salir del repositorio.
- Escrituras relacionadas en `db.transaction` (DB-4); las de dinero (pagar, revertir, cancelar) con `exclusive: true`.
- Un cambio de estado es condicional (`where: 'id = ? AND status = ?'`) y comprueba filas afectadas; 0 es un `Err` (`PAYROLL_ALREADY_PAID`), nunca escritura a ciegas.
- Dentro de la transacción se revalidan sesión, permiso (FSEC-2, FSEC-3) y referencias (empleado activo, lote existente).
- Con sincronización futura, cada escritura deja su evento en una tabla outbox en la misma transacción, con tipo de lista cerrada y payload mínimo, cifrado si es personal.
- Las cargas masivas validan todas las filas antes de escribir la primera y usan `batch()` dentro de la transacción.

**Comprobación:** dos pagos concurrentes del mismo registro producen un solo pago y un `Err`; `rg` no encuentra SQL interpolado con `$` en `lib`.

## FDB-5. Cifrado y claves

- Datos sensibles (personas, sueldos, salud) cifrados en reposo con una opción registrada en `docs/ARCHITECTURE.md`:
  - base completa con SQLCipher o SQLite3 Multiple Ciphers vía el build hook de `sqlite3` 3.x; protege índices y estructura, pero exige que todas las plataformas usen ese SQLite (en Android e iOS `sqflite` usa el del sistema);
  - por campo con AES-256-GCM (`cryptography`), nonce aleatorio y AAD ligada a tabla, `record_uid` y columna; funciona en todas las plataformas y lo que queda en claro (fechas, estados, cantidades) se documenta.
- Clave maestra de 32 bytes aleatorios en `flutter_secure_storage`. En macOS sin Keychain Sharing, `MacOsOptions(usesDataProtectionKeychain: false)`, que no exige provisioning profile.
- Prohibido guardar claves, tokens o contraseñas en `SharedPreferences`, archivos o junto a la base, y caer a un almacén en memoria si el seguro falla: la clave se perdería y los datos quedarían ilegibles.
- Si la base existe y su clave no, la app se detiene y ofrece restaurar un respaldo (FDB-6); nunca genera otra clave. Un valor de control cifrado (`key_check`) detecta una clave equivocada antes de leer datos.
- El nombre de la clase dice lo que hace (un almacén sobre preferencias no se llama `SecureKeyStore`) y la documentación describe el código actual (TEST-7).

**Comprobación:** `rg` no encuentra claves ni tokens escritos en `SharedPreferences`; con un almacén que lanza `PlatformException`, abrir la app no crea clave nueva ni lee la base; los bytes del archivo no contienen un valor sintético sensible.

## FDB-6. Respaldo y restauración

- Copiar el archivo SQLite no es restaurable si la clave queda en el dispositivo. El respaldo es un archivo cifrado con la base y su clave envuelta con una contraseña de recuperación (AUTH-7): Argon2id (≥ 19 MiB, t=2, p=1, AUTH-1) y AES-256-GCM, cabecera versionada, SHA-256 de la base y AAD que liga cabecera y contenido.
- Antes de reemplazar, valida una copia temporal: `PRAGMA integrity_check`, versión de esquema permitida, identidad (`base_id`) y descifrado del valor de control.
- El reemplazo es atómico (escritura junto a la base y renombrado) y un diario permite completar o revertir un intercambio interrumpido al arrancar.
- Las operaciones de respaldo van de una en una y bloquean escrituras; restaurar cierra la sesión y recrea los servicios.

**Comprobación (tests):** contraseña incorrecta, archivo truncado o alterado y esquema futuro se rechazan sin tocar la base actual; un intercambio interrumpido deja al arrancar la base anterior o la nueva, nunca una mezcla.

## FDB-7. Exportación

- CSV desde una función pura probada: comillas escapadas, saltos `\r\n` y fórmulas neutralizadas (IO-2). Se guardan en el archivo que elige el usuario (`file_picker`), no en el portapapeles, que leen otras apps.
- Prohibido exportar la base completa descifrada (JSON o CSV "de respaldo"): anula el cifrado. Una exportación legible se limita a lo que el rol ve, avisa de que contiene datos personales y queda auditada (LOG-6).
- Al portapapeles solo van datos no sensibles (folio, ruta).

**Comprobación:** tests del CSV con comillas, saltos y fórmulas; `rg "Clipboard.setData"` solo aparece con datos no sensibles.

## FDB-8. Preferencias y demo

- `shared_preferences` solo guarda preferencias de UI no sensibles (tema, última sección), con claves prefijadas y versionadas (`app.v1.theme_mode`) y valores validados al leer; uno inválido se descarta. El estado de negocio que sobrevive a reinicios (turno en curso) va en SQLite.
- Datos de demostración solo en debug y profile, nunca en release (FARCH-8): marcados (`is_demo = 1`), idempotentes y sin crear cuentas ni credenciales (AUTH-5).

**Comprobación:** con configuración release, activar la demo falla en `AppConfig.parse`.
