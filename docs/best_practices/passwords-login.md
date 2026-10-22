# Contraseñas y login

**Leer cuando:** se creen cuentas, login, cambios o restablecimientos, respuestas con datos de usuario, seeds o compatibilidad con hashes heredados.

AUTH-7 es la única fuente de la política. Complementan [RL](rate-limiting.md), [TOK](tokens-sessions.md), [SES](sessions-csrf.md) y [LOG](logging.md).

## AUTH-1. Hash fuerte

- Sistemas nuevos: Argon2id con `m=19456 KiB, t=2, p=1` (mínimo OWASP) o parámetros superiores medidos en el servidor. Hashea en UTF-8 tras normalizar según AUTH-7.
- bcrypt solo en hashes heredados (AUTH-6): trunca a 72 bytes, así que mientras siga en uso rechaza contraseñas nuevas de más de 72 bytes UTF-8, sin truncar, y documenta la excepción a AUTH-7.
- Nunca almacenes, registres (LOG-4) ni devuelvas la contraseña.

**Comprobación:** un hash nuevo empieza por `$argon2id$v=19$` con `m≥19456`, `t≥2`, `p=1`.

## AUTH-2. Login sin enumeración

Usuario inexistente, contraseña incorrecta y cuenta inactiva devuelven el mismo 401, código `INVALID_CREDENTIALS` y body. Si el usuario no existe, verifica contra un hash ficticio calculado al iniciar, para igualar el tiempo.

**Comprobación:** login con email inexistente y con email real y contraseña errónea devuelve body y status idénticos y tiempos del mismo orden.

## AUTH-3. Registro

- Valida con el `PasswordSchema` compartido (CON-1); la lista de bloqueo solo en servidor. Valida el email y normalízalo (`trim` y minúsculas) antes de buscar y guardar; la unicidad la garantiza un índice único, no un `find` previo.
- Un 409 por duplicado permite enumerar: acéptalo solo documentado y con rate limit (RL-1); si la enumeración importa, responde 202 genérico y avisa por email.

**Comprobación:** email inválido, contraseña de 14 caracteres y contraseña común dan 400 (la última `PASSWORD_TOO_COMMON`); dos registros concurrentes con el mismo email crean un solo usuario.

## AUTH-4. Usuario público

Usa `select` explícito o esquema de salida (`SafeUser`), nunca la entidad completa (DB-5) ni `passwordHash`, tampoco desde helpers como `validateUser`.

**Comprobación:** los bodies de registro, login y `/auth/me` no contienen `passwordHash` ni `"password"`.

## AUTH-5. Seed y cuentas de prueba

Seed solo en desarrollo: nunca con `NODE_ENV=production`, contraseña leída de `SEED_PASSWORD` y validada con `PasswordSchema` al parsear el entorno (CFG-5), sin imprimirla. Tests y E2E generan contraseñas aleatorias por ejecución que cumplen AUTH-7, nunca literales compartidos (E2E-6).

## AUTH-6. Hashes heredados

- Verifica el formato original (p. ej. `pbkdf2_sha256$<iter>$<salt>$<hash>` de Django) con parser estricto y vectores generados por el sistema original.
- Antes del cálculo costoso rechaza entradas de más de `PASSWORD_MAX_LENGTH` y parámetros abusivos del hash guardado, para evitar DoS.
- Solo el login puede admitir el máximo histórico si supera el actual; documenta la diferencia (MIG-3).
- Tras login correcto con parámetros inferiores al objetivo, re-hashea en la transacción que crea la sesión; conserva el formato si el legacy debe seguir verificándolo. PBKDF2-HMAC-SHA256 mantenido por compatibilidad exige al menos 600 000 iteraciones.

**Comprobación:** los vectores originales pasan; un hash con 150 000 iteraciones se marca para actualizar y una entrada de `PASSWORD_MAX_LENGTH + 1` se rechaza sin calcular.

## AUTH-7. Política única

Alineada con NIST SP 800-63B-4 y OWASP ASVS 5.0: largo y lista de bloqueo protegen; la composición no.

| Aspecto | Requisito |
|---|---|
| Largo | 15–128 code points tras NFKC (CON-3), no `.length` |
| Caracteres | Unicode imprimible, incluidos espacios y emoji; rechaza controles `\p{Cc}` |
| Composición | sin exigir mayúsculas, dígitos ni símbolos |
| Transformación | solo NFKC; sin `trim`, minúsculas ni truncamiento; los espacios extremos cuentan |
| Bloqueo | en servidor: 400 `PASSWORD_TOO_COMMON` para comunes, filtradas o palabras de contexto |
| Caducidad | sin rotación periódica; cambio solo ante indicios de compromiso |
| Recuperación | sin pistas ni preguntas de seguridad |

- `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`, `PasswordSchema` y `LoginPasswordSchema` viven solo en `packages/shared/src/validation/password.ts` y los usan registro, cambio, restablecimiento, seed (AUTH-5) y web (UX-1). Las contraseñas no pasan por `requiredText` ni otros normalizadores de CON-3, que recortan espacios.
- Lista local versionada con al menos las 100 000 contraseñas más comunes, comparada en minúsculas tras NFKC, más palabras de contexto: nombre de la app y email o usuario, completo y su parte local. Un servicio externo (p. ej. Have I Been Pwned con k-anonymity) es opcional: envía solo un prefijo del hash, con timeout y documentado como dependencia de red.
- Login (`LoginPasswordSchema`): de 1 a `PASSWORD_MAX_LENGTH`, misma NFKC, sin mínimo ni lista de bloqueo, para que las contraseñas anteriores sigan funcionando.
- Excepción: con segundo factor obligatorio para todas las cuentas, el mínimo puede bajar a 8, documentado citando AUTH-7.

**Comprobación:** 14 caracteres y 129 emoji fallan; 15 emoji (`.length` 30) y una frase sin mayúsculas ni dígitos pasan; espacios extremos se conservan; un salto de línea falla; texto de ancho completo se normaliza por NFKC. `rg` no encuentra `requiredText`, `.trim()` ni `min(`/`max(` literales sobre campos de contraseña fuera de las constantes.

## AUTH-8. Cambio y restablecimiento

- Cambiar exige la contraseña actual y una nueva distinta validada por AUTH-7. En la misma transacción revoca las demás sesiones o familias de refresh (SES-4, TOK-3) y emite `user.password_changed` o `user.password_reset` (LOG-6).
- Token de restablecimiento: al menos 128 bits, guardado como hash, de un solo uso y TTL máximo de 30 minutos. La solicitud responde igual exista o no la cuenta y tiene rate limit propio (RL-1).
- Formularios permiten pegar, gestores (`autocomplete="new-password"` o `"current-password"`) y mostrar u ocultar la contraseña (UX-1).

**Comprobación:** tras cambiar la contraseña, otra sesión recibe 401 en `/auth/me`; un token caducado o usado se rechaza.
