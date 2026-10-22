# Sesiones opacas y CSRF

**Leer cuando:** se implemente login, sesión, logout, `/auth/me` o cambio de contexto con sesión de servidor sin JWT, o cualquier escritura autenticada por cookie. Alternativa a [TOK](tokens-sessions.md) y FE-2; contraseñas en [AUTH](passwords-login.md).

## SES-1. Tokens y hashes

- Sesión: 32 bytes aleatorios en base64url (43 caracteres). En DB solo su SHA-256 (`BINARY(32)`, clave primaria) con `userId`, contexto activo, `createdAt` y `expiresAt`. El token CSRF también se guarda solo como hash.
- Un token que no cumple `^[A-Za-z0-9_-]{43}$` da 401 sin consultar DB. Compara con `timingSafeEqual` sobre digests de igual longitud.

**Comprobación:** el token emitido cumple el patrón y la fila guardada contiene su hash, nunca el token.

## SES-2. Cookies

| Cookie | `HttpOnly` | `SameSite` | `Path` | Producción |
|---|---|---|---|---|
| Sesión | sí | `Lax` | `/` | `Secure`, `__Host-<app>_session` |
| CSRF | no: la lee el frontend | `Lax` | `/` | `Secure`, `__Host-<app>_csrf` |

- Sin `Domain` y con `Max-Age` igual a la vida de la sesión. La validación de configuración impide arrancar en producción sin `Secure` o sin `__Host-` (CFG-3).
- En local, web y API usan el mismo host (`127.0.0.1`): mezclarlo con `localhost` impide enviar la cookie. CORS solo permite ese origen.

**Comprobación (E2E-8):** la cookie de sesión es `httpOnly`, `sameSite: Lax` y no aparece en `document.cookie`.

## SES-3. CSRF double-submit ligado a la sesión

- `GET /auth/csrf` emite un token en la cookie CSRF y en el JSON. El login exige `x-csrf-token` igual a la cookie y guarda su hash en la sesión creada.
- Cada `POST`, `PUT`, `PATCH` o `DELETE` autenticado exige cabecera igual a cookie y hash de la cookie igual al de la sesión; si no, 403 `CSRF_INVALID` y `auth.csrf_rejected` (LOG-6).
- Los `GET` no cambian estado ni exigen CSRF. Sin cookie CSRF, el frontend falla antes de la red con `CSRF_MISSING`.

**Comprobación:** una mutación sin cabecera o con un token de 43 caracteres ajeno da 403; con el token de la sesión, 201.

## SES-4. Ciclo de vida

- Caducidad absoluta configurable (p. ej. `AUTH_SESSION_TTL_MINUTES=480`) que no se renueva con actividad. Un login nuevo reemplaza la sesión anterior en una transacción; si se permiten varias, con máximo por usuario.
- Logout borra la sesión en servidor y expira ambas cookies con sus atributos originales. Cambiar o restablecer la contraseña revoca las demás sesiones (AUTH-8).
- Sesión caducada, revocada o de usuario desactivado: 401 `AUTHENTICATION_REQUIRED`. Las caducadas se borran al presentarse y con una tarea periódica.

**Comprobación:** logout da 200 y `/auth/me` con la cookie anterior da 401; con reloj inyectado, una sesión vencida da 401.

## SES-5. Login

- Límites de RL-1 con `skipSuccessfulRequests: true` y 429 `AUTH_RATE_LIMITED` en la envoltura estándar (RL-5).
- Identificador normalizado (`trim` y minúsculas) igual que al registrarse; contraseña con `LoginPasswordSchema` (AUTH-7). Respuesta uniforme según AUTH-2; un identificador ambiguo (correo compartido por varias cuentas) da el mismo error genérico.
- Devuelve el usuario público y sus accesos visibles, nunca el token.

## SES-6. Cliente

Al montar la app, `auth.restore()` llama a `GET /auth/me`; un 401 deja invitado sin mostrar error. `fetch` siempre con `credentials: 'include'`; el frontend nunca lee, guarda ni registra el token de sesión. Logout limpia el estado local aunque la API falle y reinicia los stores de negocio (TEN-6).

## SES-7. Pruebas mínimas

| Caso | Esperado |
|---|---|
| Ruta protegida sin cookie, cookie tras logout o sesión caducada | 401 |
| Escritura sin `x-csrf-token` o con uno ajeno a la sesión | 403 |
| Login fallido repetido | 429 |
| Usuario inexistente y contraseña incorrecta | mismo status y body |
| Recurso de otra organización | 404 (TEN-5) |
| Cookie de sesión en navegador | `HttpOnly`, ausente de `document.cookie` |
| Cualquier respuesta | sin hashes de contraseña ni tokens de sesión |
