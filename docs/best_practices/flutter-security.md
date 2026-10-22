# Seguridad Flutter

**Leer cuando:** una app Flutter tenga usuarios o roles locales, inicie sesión contra la API, guarde secretos en el dispositivo o se configure la seguridad de Android, iOS, macOS, Windows o Linux. Aplica [AUTH](passwords-login.md), [SES](sessions-csrf.md) y [TOK](tokens-sessions.md) desde un cliente nativo; AUTH-7 sigue siendo la única política; claves en [FDB-5](flutter-local-data.md).

## FSEC-1. Cuentas locales

- Sin credenciales por defecto: el primer arranque pide crear el administrador; ni seed ni demo crean cuentas (AUTH-5).
- Contraseñas con Argon2id (AUTH-1) de `cryptography` en `Isolate.run` (FARCH-6), formato PHC (`$argon2id$v=19$m=19456,t=2,p=1$…`), parser estricto y comparación en tiempo constante. bcrypt solo para verificar hashes heredados, re-hasheados tras login correcto (AUTH-6).
- Política AUTH-7: 15–128 code points (`runes.length`) tras NFKC (`unorm_dart`), sin composición. Constantes en `core/security/password_policy.dart`, con valores y casos compartidos con `packages/shared` si hay API. El login no aplica el mínimo; prohibido bajarlo por comodidad.
- Usuario normalizado (`trim().toLowerCase()`) y validado con lista blanca de caracteres.
- Tras 5 fallos en 15 minutos, la cuenta espera 15 minutos; el contador vive en SQLite para sobrevivir al reinicio. Usuario inexistente, contraseña incorrecta y cuenta inactiva dan el mismo error y el mismo coste, verificando contra un hash ficticio (AUTH-2).

**Comprobación:** con reloj inyectado, el sexto intento dentro de 15 minutos se rechaza aunque se reinicie la app; un hash guardado empieza por `$argon2id$`; `rg` no encuentra mínimos de longitud fuera de `password_policy.dart`.

## FSEC-2. Sesión local

- Solo en memoria, con caducidad por inactividad (p. ej. 15 min) y absoluta (p. ej. 8 h) medidas con el reloj inyectado. Al caducar, el router lleva al login (FARCH-7) y los ViewModels se liberan con sus rutas.
- Cada usuario tiene `auth_version`: cambiar rol o contraseña, desactivarlo o borrarlo la incrementa (AUTH-8, SES-4). Cada escritura comprueba en su transacción que sigue activo, con el mismo rol y versión; si no, cierra la sesión.
- El logout termina la sesión, cancela temporizadores, vacía cachés de repositorios y borra lo que la sesión dejó en disco (TEN-6). Al volver de segundo plano tras caducar, se pide la contraseña antes de mostrar datos.

**Comprobación (tests):** inactividad mayor que el límite deja `isActive` falso y lleva al login; un rol cambiado desde otra sesión hace fallar la siguiente escritura con `NOT_AUTHORIZED`; tras logout, repositorios y temporizadores quedan vacíos.

## FSEC-3. Permisos

- Permisos como `enum` (`Permission.payrollPay`) y política pura de rol a permisos, probada con la tabla completa rol × permiso.
- El repositorio comprueba el permiso antes de leer o escribir; la UI solo oculta. Lo propio de un usuario se filtra en el mismo `WHERE` (`created_by_user_id = ?`, AUTHZ-2) y un registro ajeno responde igual que uno inexistente (AUTHZ-3).
- Degradar, desactivar o borrar al último administrador activo se rechaza (`LAST_ADMINISTRATOR`).
- Los registros con efectos contables no se borran: se cancelan o revierten con motivo, usuario y fecha (FDB-4).

**Comprobación:** test de la matriz rol × permiso y del rechazo `LAST_ADMINISTRATOR`.

## FSEC-4. Cliente API

- Un único `ApiClient` sobre `http.Client` inyectado (`MockClient` de `package:http/testing.dart` en tests), con URL de `AppConfig`, `accept: application/json`, timeout por petición y lectura de `x-request-id` (LOG-3).
- Cada respuesta valida la envoltura (CON-4) y el DTO con `fromJson` estricto; un cuerpo fuera de contrato es `INVALID_API_RESPONSE` (WEB-1) y los errores llegan como `FailureCode.fromWire(code)` (FARCH-5).
- Paridad con `packages/shared`: los DTO de Dart se prueban con fixtures JSON válidos e inválidos generados desde los esquemas Zod, así un cambio de contrato rompe los tests de la app. Con OpenAPI (HTTP-5), el cliente puede generarse desde ahí, nunca escribirse a mano contra la documentación.
- La app no cambia el contrato: guarda el valor de la cookie de sesión (SES-1) o de refresh (TOK-2) en `flutter_secure_storage` y lo envía en `cookie` solo al origen de `API_BASE_URL`, respetando `Path` y caducidad. El CSRF se pide a `GET /auth/csrf` y viaja en `x-csrf-token` (SES-3). Con JWT, el access vive en memoria y un único refresh se comparte entre los 401 (FE-2).
- El logout llama al endpoint y en `finally` borra el almacén seguro y el estado local (FE-5).
- Release solo HTTPS (FARCH-8); prohibidos `badCertificateCallback` y `HttpOverrides` que acepten certificados inválidos. Pinning solo con plan de rotación documentado.

**Comprobación:** `rg "badCertificateCallback|HttpOverrides"` en `lib` queda vacío; con `MockClient`, una cookie nunca se envía a otro origen y un body fuera de contrato produce `INVALID_API_RESPONSE`.

## FSEC-5. Plataformas

| Plataforma | Requisito |
|---|---|
| Android | `android:allowBackup="false"` y `dataExtractionRules` que excluyen base y preferencias; sin `usesCleartextTraffic="true"`; release firmado con la clave de `android/key.properties` (fuera de Git, desde secretos de CI), nunca con la de debug |
| iOS | ATS por defecto, sin `NSAllowsArbitraryLoads`; secretos con `KeychainAccessibility.first_unlock_this_device` |
| macOS | App Sandbox; `Release.entitlements` solo con lo usado (`network.client`, `files.user-selected.read-write`); Hardened Runtime y notarización fuera de la App Store |
| Windows | datos en `%APPDATA%` (`getApplicationSupportDirectory`); ejecutables firmados (Authenticode o MSIX) |
| Linux | `libsecret` declarado como dependencia del paquete (FDB-5) |

Los builds de release usan `--obfuscate --split-debug-info=build/symbols/<versión>`; los símbolos se guardan como artefacto privado para `flutter symbolize` y nunca van en el paquete (FTEST-7).

**Comprobación:** un test fija esta configuración (sin firma de debug en release, `allowBackup` desactivado, entitlements esperados) para que un cambio accidental falle en CI.
