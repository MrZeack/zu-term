# Stack Flutter

**Leer cuando:** se cree una app móvil o de escritorio, se añada o actualice una dependencia de pub, se cambie la versión de Flutter o se configure el analizador, el formato o el Makefile de la app. Stack por defecto para apps nativas; la web sigue con Vue ([STACK](tech-stack.md)) y Flutter web solo si se pide. En el monorepo vive en `apps/mobile/` (STR-1); arquitectura en [FARCH](flutter-architecture.md). Las comprobaciones se ejecutan desde la app (`cd "$APP"`).

## FLT-1. Componentes

| Capa | Elección |
|---|---|
| SDK | Flutter 3.47 estable (≥ 3.47.7) con Dart 3.13, versión exacta (FLT-3) |
| UI | `material_ui` 1.x (Material 3), `package:material_ui/material_ui.dart` (FUX-2) |
| Estado e inyección | MVVM con `ChangeNotifier` y `provider` 6.1 |
| Navegación | `go_router` 18 (FARCH-7) |
| Datos locales | `sqflite` 2.4, `sqflite_common_ffi` 2.4 en escritorio, sobre `sqlite3` 3.x ([FDB](flutter-local-data.md)) |
| Secretos del dispositivo | `flutter_secure_storage` 11: Keychain, Keystore, Credential Manager o libsecret (FDB-5) |
| Criptografía | `cryptography` 2.9 (AES-256-GCM, Argon2id, SHA-256) y `unorm_dart` para NFKC con contraseñas locales (FSEC-1) |
| HTTP, si hay API | `http` 1.6 con un único cliente inyectado (FSEC-4) |
| Textos y formatos | `gen-l10n` con ARB e `intl` en la versión que fija el SDK (FUX-7) |
| Preferencias de UI | `shared_preferences`, solo datos no sensibles (FDB-8) |
| Archivos y gráficas | `path_provider`, `file_picker` y `fl_chart`, cuando hagan falta |
| Logs | `logging` 1.3 con un único listener en `main.dart` (FARCH-9) |
| Pruebas | `flutter_test`, `integration_test`, fakes a mano y SQLite real con `sqflite_common_ffi` ([FTEST](flutter-testing-ci.md)) |
| Calidad | `flutter_lints` 6 con FLT-4, `dart format` y `flutter analyze --fatal-infos` |

- Modelos escritos a mano; `freezed` o `json_serializable` solo justificados en `docs/ARCHITECTURE.md`. Una elección por capa: otro gestor de estado, cliente HTTP o localizador global se justifica ahí.
- Nada se descarga en ejecución: fuentes como assets (con `google_fonts`, `GoogleFonts.config.allowRuntimeFetching = false`).

## FLT-2. Makefile y procesos

Los targets de AGENTS y las reglas MK aplican igual; `make up` también arranca la app junto con API y DB si existen.

| Target | Comando |
|---|---|
| `env` | comprueba `flutter`, `jq`, la versión exacta (FLT-3) y que `$(DART)` es el Dart del SDK (MK-8) |
| `deps` | `flutter pub get --enforce-lockfile` (también ejecuta `gen-l10n`) |
| `format` | `$(DART) format .`, el único que reescribe (TEST-5) |
| `lint` | `$(DART) format --output=none --set-exit-if-changed . && flutter analyze --fatal-infos` |
| `test` | `flutter test --coverage --test-randomize-ordering-seed=random` y umbral de FTEST-5 |
| `check` | `lint` → `test` → build debug del escritorio del host (`flutter build macos --debug`) |
| `up`, `down`, `status`, `logs` | `scripts/flutter-app.sh start\|stop\|status` y `logs/app.log` |
| `reload`, `restart` | `kill -USR1`/`-USR2` al PID de `.run/flutter.pid` |

- `DART := $(dir $(shell command -v flutter))dart`: otro `dart` del `PATH` (p. ej. Homebrew) puede formatear distinto y hacer que `make lint` falle solo en una máquina.
- En el monorepo, los targets llevan prefijo `mobile-` y `make check` ejecuta los de pnpm (STACK-2) y los de la app.
- `make up` lanza `nohup flutter run -d "$DEVICE" --pid-file .run/flutter.pid --dart-define-from-file=config/dev.json` como comando simple, para que `$!` sea Flutter y no un subshell (MK-10), y guarda ese PID en `.run/app.pid` con escritura atómica.
- La app está lista cuando aparece `.run/flutter.pid` (Flutter lo crea al compilar y lo borra al salir); la espera llega a 300 s y, si el proceso muere antes, muestra las últimas 30 líneas del log y falla (MK-4).
- `make down` envía TERM tras verificar identidad (MK-2); si sigue vivo a los 5 s, mata sus hijos propios y luego el proceso.
- `FLUTTER_DEVICE` es por defecto el escritorio del host; un móvil se indica explícitamente (`FLUTTER_DEVICE=emulator-5554`). Con `-d web-server`, `--web-hostname 127.0.0.1` y un puerto propio de la secuencia `1XXYY`.

**Comprobación:** dos `make up` conservan `.run/app.pid`, que coincide con `.run/flutter.pid`; `make reload` deja `Reloaded` en `logs/app.log`; tras dos `make down` no queda ningún proceso con `ROOT_DIR`; un proceso ajeno con su PID en `.run/app.pid` sobrevive a `make down`.

## FLT-3. Versiones y suministro

Aplica STACK-3 con pub:

- `environment` declara `sdk: ^3.13.0` y `flutter: 3.47.7` exacto. Pub solo exige la cota inferior, así que `make env` falla si la versión instalada no es idéntica; CI la lee del mismo campo (FTEST-6).
- Dependencias directas exactas (`provider: 6.1.5+1`), salvo las del SDK (`sdk: flutter`) y las que fija (`intl: any`). `pubspec.lock` versionado e instalado con `--enforce-lockfile`.
- Cada dependencia declarada se usa (se elimina p. ej. `cupertino_icons` de la plantilla). `dependency_overrides` y versiones mayores retenidas (p. ej. `sqlite3` 2.x) se justifican en "Decisiones de versiones" con fecha y plan de salida. Se prefieren publishers verificados y mantenimiento activo.
- Paquetes con build hooks (`hook/build.dart`) ejecutan código al compilar y pueden descargar binarios: se listan en `docs/ARCHITECTURE.md` y solo se aceptan si verifican lo que descargan (`sqlite3` 3.x comprueba SHA-256 y publica atestaciones SLSA) o compilan desde fuentes del repositorio.
- Sin avisos de seguridad, versiones retiradas ni paquetes discontinuados al cerrar un cambio. `flutter pub upgrade --major-versions` pasa por lockfile, pruebas y build; nada se acepta automáticamente.

**Comprobación:** `pubspec.yaml` no tiene rangos fuera de `sdk:`; su `flutter:` coincide con `frameworkVersion` de `flutter --version --machine`; cada dependencia aparece como `package:<dep>/` en `lib`; `flutter pub outdated --json` no reporta paquetes con advisory, retirados ni discontinuados; los paquetes con `hook/build.dart` coinciden con los documentados.

## FLT-4. Analizador y formato

- `analysis_options.yaml` incluye `package:flutter_lints/flutter.yaml`, excluye `build/**` y las carpetas nativas, activa `strict-casts`, `strict-inference` y `strict-raw-types` (equivalen al `strict` de TypeScript) y añade: `always_declare_return_types`, `always_use_package_imports`, `avoid_catches_without_on_clauses`, `avoid_catching_errors`, `avoid_dynamic_calls`, `avoid_type_to_string`, `avoid_void_async`, `cancel_subscriptions`, `close_sinks`, `directives_ordering`, `discarded_futures`, `only_throw_errors`, `prefer_const_constructors`, `prefer_final_locals`, `prefer_single_quotes`, `strict_top_level_inference`, `test_types_in_equals`, `throw_in_finally`, `unawaited_futures`, `unnecessary_ignore` y `use_enums`.
- JSON y filas se convierten con patrones al entrar (FARCH-4), no con `dynamic`.
- `dart format` por defecto; `make lint` solo comprueba, `make format` es lo único que reescribe y los infos bloquean.
- Toda supresión lleva motivo en la misma línea (`// ignore: avoid_print -- salida de diagnóstico del test`).

**Comprobación:** `make lint` da "No issues found!"; `rg` no encuentra `// ignore:` sin motivo en `lib` ni `test` (salvo `lib/l10n`); la versión de `$DART` coincide con `dartSdkVersion` de Flutter.

## FLT-5. Plataformas

- Solo existen las carpetas de las plataformas distribuidas (`web/` incluida en las eliminables); la lista vive en `docs/ARCHITECTURE.md` y un test la fija para que `flutter create .` no las regenere sin aviso.
- Identificador de la app (`applicationId`, bundle id) de la organización (`flutter create --org …`), nunca `com.example`.
- La versión sale solo de `version:` en `pubspec.yaml` (`1.4.0+12`); CI comprueba que coincide con la etiqueta de release (FTEST-7). Seguridad por plataforma en [FSEC-5](flutter-security.md).

**Comprobación:** `ls -d android ios linux macos windows web` solo lista las documentadas y `rg "com\.example"` en las carpetas nativas queda vacío.
