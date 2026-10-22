# Pruebas y CI Flutter

**Leer cuando:** se escriban o reorganicen pruebas de una app Flutter (dominio, repositorios, migraciones, ViewModels, widgets o integración) o se configure cobertura, CI o release y firma. Complementa el TDD de AGENTS y [TEST](testing-ci.md); herramientas en [FLT-1](flutter-stack.md).

## FTEST-1. Capas

| Capa | Qué prueba | Herramienta | Dónde |
|---|---|---|---|
| Dominio | modelos, `Money`, fechas, cálculos y políticas con tablas de casos | `flutter_test` | `test/features/<feature>/domain/` |
| Datos | SQL, transacciones, migraciones, cifrado y respaldos contra SQLite real | `sqflite_common_ffi` en directorio temporal | `test/features/<feature>/data/`, `test/core/data/` |
| ViewModels | comandos, estados y errores con repositorios falsos | `flutter_test` | `*_view_model_test.dart` |
| Widgets | estados, accesibilidad, rutas y guardas | `testWidgets` | `*_screen_test.dart` |
| Integración | flujos completos en escritorio o dispositivo | `integration_test` | `integration_test/<flujo>_test.dart` |
| Operativa | contrato de Makefile y scripts (MK-11) | bash | `scripts/*.test.sh` |

`make check` ejecuta todas salvo integración; `make test-integration` (`flutter test integration_test -d $(FLUTTER_DEVICE)`) corre en local y CI. Con API, la integración usa el stack de `make up` y cuentas sintéticas (E2E-6); el navegador sigue [E2E](e2e-testing.md). Nombres de test según TEST-8.

## FTEST-2. Pruebas mínimas de seguridad y datos

| Caso | Esperado | Regla |
|---|---|---|
| Primer arranque | pide crear el administrador; no existe ninguna cuenta | FSEC-1 |
| Contraseña de 14 code points, de más de 128 o con controles | rechazada | AUTH-7 |
| 5 intentos fallidos | espera de 15 min; mismo error que usuario inexistente | FSEC-1, AUTH-2 |
| Inactividad o caducidad absoluta (reloj inyectado) | sesión cerrada y login | FSEC-2 |
| Rol cambiado o usuario desactivado | la siguiente escritura falla y cierra sesión | FSEC-2 |
| Registro ajeno o rol sin permiso | igual que inexistente | FSEC-3 |
| Último administrador | no se puede degradar, desactivar ni borrar | FSEC-3 |
| Archivo SQLite con datos sensibles | un valor sintético no aparece en claro en sus bytes | FDB-5 |
| Base sin su clave o con clave equivocada | no se leen datos ni se crea otra clave | FDB-5 |
| Pagar dos veces la misma nómina en paralelo | exactamente un éxito | FDB-4 |
| Restaurar con contraseña o archivo inválidos | rechazo sin tocar la base | FDB-6 |
| Migración desde cada versión publicada | mismo esquema que una base nueva y datos conservados | FDB-2 |
| CSV con `=`, `@`, `+` o `-` iniciales | celdas neutralizadas | FDB-7 |
| Logs capturados en memoria | sin nombres, montos, contraseñas ni claves | FARCH-9 |

## FTEST-3. Organización y fakes

- `test/` replica `lib/`, la excepción a STR-5 que impone `flutter test`. Fakes y fixtures compartidos viven una sola vez en `test/support/`.
- Los fakes implementan la interfaz del repositorio o servicio, registran llamadas y permiten forzar estados (un fallo o una espera con `Completer`); sin frameworks de mocks por defecto.
- `lib/` no contiene ayudas de prueba (`forTesting`, `TestClock`, `advanceClock`): las dependencias se inyectan (FARCH-3).
- Datos sintéticos con prefijo y sufijo aleatorio (TEST-9); nunca una copia de la base de un cliente.

**Comprobación:** `rg "forTesting|TestClock|advanceClock" lib` queda vacío.

## FTEST-4. Determinismo

- Reloj inyectado o `fakeAsync`; en widgets, `tester.pump(duración)` o `pumpAndSettle`. Nunca `Future.delayed` ni `sleep` para esperar un resultado (TEST-10).
- Orden aleatorio (`--test-randomize-ordering-seed=random`): ningún test depende de otro ni de ejecuciones anteriores.
- Cada test de base usa su archivo en `Directory.systemTemp.createTemp()` y lo borra en `tearDown`. `databaseFactoryFfi` se pasa al servicio; reasignar el global lo comparte entre tests y llena la salida de avisos.
- Sin red: `http.Client` es un `MockClient`; un test con la API real es de integración.
- Salida sin ruido: los logs se capturan o silencian y un aviso inesperado se investiga como fallo.

**Comprobación:** `rg "Future\.delayed|sleep\(" test` queda vacío y `flutter test` no imprime avisos.

## FTEST-5. Cobertura

`make test` falla con menos del 80 % de líneas, sin contar lo generado (`lib/l10n/`, `*.g.dart`); `domain/` y `core/security/` se acercan al 100 %. `coverage/` está ignorado por Git y se sube como artefacto de CI.

## FTEST-6. CI

- En cada push y PR, un job `ubuntu-latest` con dependencias de Flutter para Linux (GTK y `libsecret`): checkout → `subosito/flutter-action` con `flutter-version-file: pubspec.yaml` y caché → `flutter pub get --enforce-lockfile` → auditoría (FLT-3) → `make lint` → `make test` con umbral → `flutter build linux --debug`.
- Un job por plataforma distribuida compila en su runner (`macos-latest`, `windows-latest`) y ejecuta `integration_test` en el escritorio (en Linux con `xvfb-run`).
- Acciones fijadas por SHA con la versión en comentario (`actions/checkout@<sha> # v6`); el workflow declara `permissions: contents: read`.
- `coverage/lcov.info` y el reporte (`--file-reporter json:reports/tests.json`) se suben también si el job falla.

**Comprobación:** `rg "uses: [^@]+@(?![0-9a-f]{40})"` en `.github/workflows` queda vacío.

## FTEST-7. Release

- Sale de una etiqueta `vX.Y.Z` y depende (`needs:`) de los checks de FTEST-6 sobre el mismo commit; falla si `version:` de `pubspec.yaml` no coincide con la etiqueta (nada de `--build-name` improvisado).
- Solo el job que publica tiene `permissions: contents: write`; los de build, `contents: read`.
- Firma: Android con el keystore de los secretos de CI, escrito en el job y borrado al terminar; macOS con Developer ID, `xcrun notarytool` y `stapler`; Windows con Authenticode o MSIX. Sin firma no hay release estable.
- Builds con `--obfuscate --split-debug-info=build/symbols/<versión>`; los símbolos son artefacto privado del run, nunca de la release.
- Cada archivo publicado tiene su línea en `SHA256SUMS` y una atestación (`actions/attest-build-provenance`).
- Los secretos de firma no aparecen en logs ni artefactos y sus jobs no corren con código de PRs de forks.

**Comprobación:** `sha256sum -c SHA256SUMS` pasa sobre los archivos publicados y la release no contiene `build/symbols`.
