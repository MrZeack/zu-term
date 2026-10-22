# Arquitectura Flutter

**Leer cuando:** se cree o reorganice una app Flutter, feature, pantalla, ViewModel, repositorio o servicio, o se configure la raíz de composición, navegación, configuración por entorno o logs. Sigue la arquitectura oficial de Flutter (MVVM, repositorios, `provider`, comandos y `go_router`) con organización por feature; stack en [FLT](flutter-stack.md).

## FARCH-1. Features

- `lib/features/<feature>/` agrupa `data/`, `domain/` y `ui/`; `core/` solo lo transversal, `config/` el entorno, `l10n/` los textos y `main.dart`/`app.dart` la composición y la UI raíz. `test/` refleja `lib/`; integración y configuración tienen directorios propios.
- Archivos en snake_case con sufijo de rol: `*_screen.dart`, `*_view_model.dart`, `*_repository.dart`, `*_service.dart`. Imports `package:` (`always_use_package_imports`, FLT-4) para comprobar fronteras con `rg`.
- Una feature puede importar el `domain/` de otra, nunca su `ui/` ni su `data/`: lo compartido va a `core/` o se inyecta como repositorio (WEB-2). Sin carpetas globales por tipo (`lib/providers`, `lib/services`, `lib/models`, `lib/widgets`).

**Comprobación:** `rg` no encuentra imports de `features/<otra>/ui` ni `features/<otra>/data` entre features, ni esas carpetas globales.

## FARCH-2. Capas

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| `*_screen.dart` y widgets | pintar el estado del ViewModel y enviarle eventos | SQL, HTTP, archivos, `SharedPreferences`, negocio, dinero, `DateTime.now()` |
| `*_view_model.dart` | estado y comandos de una pantalla (FARCH-6); traduce `Result` a estado | `BuildContext`, widgets y servicios sin repositorio |
| `*_repository.dart` | interfaz: fuente de verdad de la feature | detalles de almacenamiento en la firma |
| `sqlite_*_repository.dart`, `api_*_repository.dart` | combinar servicios: transacciones, permisos (FSEC-3) y caché | `notifyListeners` y widgets |
| `*_service.dart` | envoltura sin estado de SQLite, HTTP, archivos o plataforma | negocio |
| `domain/` | modelos inmutables y funciones puras | Flutter, I/O y reloj implícito |

Un ViewModel por pantalla; prohibido un `ChangeNotifier` global con el estado de todas las features, porque cada notificación reconstruye la app y mezcla permisos, I/O y presentación. La lógica compartida entre ViewModels es una función pura de `domain/` probada con tablas de casos (CON-6). Un archivo de más de ~400 líneas suele mezclar capas: se divide o se justifica.

## FARCH-3. Composición

- `main.dart` es el único lugar que crea servicios y repositorios: parsea la configuración (FARCH-8), configura logs (FARCH-9), elige la fábrica de SQLite por plataforma, abre la base y monta `MultiProvider` (EXP-2).
- Repositorios y servicios se registran con `Provider`. Cada ruta crea su ViewModel con `ChangeNotifierProvider(create: …)`, que lo libera al salir, y la pantalla lo recibe por constructor para que un test le pase uno con repositorio falso.
- Prohibidos `static final instance`, getters globales, localizadores usados desde widgets y reasignar `databaseFactory`, global compartido por todas las pruebas.
- Reloj y aleatoriedad se inyectan (`typedef Now = DateTime Function()`) con valores reales por defecto (EXP-6).

**Comprobación:** `rg "static final instance|databaseFactory\s*="` en `lib` solo encuentra `main.dart`.

## FARCH-4. Modelos y dominio

- Campos `final`, constructores `const` y `copyWith` cuando haga falta. Variantes (cargando, error, datos) con `Command` o clases `sealed`, no banderas que pueden contradecirse.
- Estados, roles y tipos son `enum` con su valor de almacenamiento (`pending('PENDING')`); la conversión vive en un solo lugar y un valor desconocido es error de datos, nunca un default.
- Dinero: `Money` en centavos (`int`), nunca `double`; el texto se convierte sin pasar por `double` y el redondeo está en un solo punto (CON-6). Horas en minutos o centésimas enteras.
- Fecha de negocio `YYYY-MM-DD` en hora local o del negocio, calculada por una sola función (`businessDate(now())`). Derivarla de un instante UTC asigna al día siguiente lo ocurrido por la noche en América. Los instantes se guardan en UTC ISO 8601.
- Filas y JSON se convierten en un solo punto (`fromRow`, `fromJson`) con patrones; un campo ausente o de otro tipo es `FailureCode.dataCorrupted` o `invalidApiResponse`, nunca un `as String` disperso.

**Comprobación:** tests de límites, redondeo, zonas horarias y datos corruptos; `rg "\bdouble\b"` no aparece en código monetario.

## FARCH-5. Fallos esperados

- Los repositorios devuelven `Result<T>` (`Ok`/`Err`) con `AppFailure(FailureCode)`; las excepciones quedan para errores de programación e imprevistos (FARCH-9).
- `FailureCode` es un `enum` con código estable en mayúsculas (`SHIFT_NOT_FOUND`). Los códigos de la API (CON-4) se convierten con `FailureCode.fromWire`, con `unknown` para los desconocidos.
- La UI traduce con un `switch` exhaustivo, así un código sin mensaje no compila (WEB-3); nunca muestra `error.toString()`.
- Una escritura condicional sin filas afectadas (nómina ya pagada, turno inexistente) es un `Err` con su código (`PAYROLL_ALREADY_PAID`), no un `StateError`.
- Prohibidos `catch (_) {}` y `catch` sin `on` (FLT-4); un fallo se registra una vez, donde se decide qué hacer (LOG-5).

## FARCH-6. Comandos y asincronía

- Cada acción del usuario es un `Command` con `running` y `result`; mientras corre, el botón se deshabilita y una segunda ejecución se ignora (UX-2).
- Ningún ViewModel ni comando notifica tras `dispose()` (mixin `DisposeGuard`): un resultado tardío tras logout o salida se descarta en vez de lanzar "used after being disposed".
- Sin `async void`: se devuelve `Future<void>` y quien llama espera o usa `unawaited(…)` con comentario (FLT-4). Tras un `await` en un widget se comprueba `context.mounted`.
- El trabajo de CPU (Argon2id, cifrado masivo, CSV o JSON grandes, reportes) corre en `Isolate.run`.

**Comprobación:** destruir un ViewModel con una carga pendiente no lanza ni notifica; dos ejecuciones simultáneas de un comando llaman una vez al repositorio.

## FARCH-7. Navegación

- Un único `GoRouter` en `core/routing/` con `refreshListenable` en la sesión: login, logout y caducidad reevalúan `redirect` (FE-4).
- Sin sesión, `redirect` lleva al login con `from=<ruta>`; con sesión, lo saca de él. Una ruta que el rol no puede ver redirige como si no existiera, y el repositorio vuelve a comprobar el permiso (FSEC-3).
- Parámetros y deep links son entrada no confiable: se restringen en el patrón (`/turnos/:id(\d+)`) y se convierten con `int.tryParse`, positivos y en rango (CON-5).
- En escritorio, `StatefulShellRoute` con `NavigationRail` conserva el estado de cada sección; en móvil, `NavigationBar` (FUX-6). Pantallas con `context.go`/`context.push`; `showDialog` y `Navigator.pop` solo para diálogos.

**Comprobación:** tests de router: logout redirige al login, una ruta sin permiso y un ID no numérico no muestran la pantalla.

## FARCH-8. Entorno compilado

- Valores por entorno en `config/<entorno>.json`, cargados con `--dart-define-from-file`. Quedan en el binario y se pueden extraer, así que nunca contienen secretos (como `VITE_*`, WEB-5); la app no lee el `.env` raíz (CFG-6).
- Solo `AppConfig.fromEnvironment()` usa `String.fromEnvironment` (siempre `const`); `AppConfig.parse(…)` es puro y valida, y `main.dart` muestra una pantalla de error sin abrir datos si falla (CFG-1, CFG-5).
- En release, `parse` rechaza URL de API sin `https` y datos de demostración activos (FDB-8).

**Comprobación:** tests de configuración válida, valor ausente o mal formado y cada regla de release; `rg "fromEnvironment"` solo aparece en `AppConfig`.

## FARCH-9. Logs

- `package:logging` con `Logger('<feature>')` por módulo. Solo `configureLogging()`, llamado desde `main.dart`, escucha `Logger.root`: en depuración imprime con `debugPrint` y en release deja pasar `WARNING` o más.
- Nada más usa `print` ni `debugPrint`. Mensajes fijos con IDs o códigos (LOG-7); nunca nombres, teléfonos, montos, contraseñas, claves ni contenido descifrado (LOG-4).
- Se registra `FailureCode`, no `runtimeType`: con `--obfuscate` el nombre del tipo es aleatorio (FTEST-7).
- `FlutterError.onError` y `PlatformDispatcher.instance.onError` registran una vez los errores no controlados (LOG-5) y la UI muestra un mensaje genérico.
- Un servicio de reporte de fallos solo se integra documentado en `docs/ARCHITECTURE.md`, con consentimiento y sin datos personales (LOG-9).

**Comprobación:** `rg "\bprint\(|debugPrint\("` en `lib` solo encuentra `configureLogging`; los logs capturados en tests no contienen datos sensibles.
