# AGENTS.md

## Reglas de trabajo

- **TDD:** antes de crear o modificar código, escribe pruebas del comportamiento; Red → Green → Refactor. Ejecuta pruebas y checks de lint, tipos o build aplicables.
- **Organización:** agrupa código, pruebas y recursos por feature/dominio; estructura por tipo solo con justificación.
- **Commits:** usa [Conventional Commits](https://www.conventionalcommits.org/); cada commit es atómico (un cambio lógico), pasa las pruebas y checks aplicables, incluye solo archivos revisados y relacionados (nunca secretos ni archivos ajenos) y no salta hooks (`--no-verify`). Push solo con autorización explícita.
- **Sin worktrees:** no crees ni uses worktrees; trabaja en rama y árbol actuales, preservando cambios existentes.
- **Handoff:** al empezar, lee `.handoff.md` de la raíz si existe y contrástalo con `git status` y `git log`; reescríbelo antes de responder si hubo cambios, resultados, decisiones o pendientes. Máximo 200 líneas, sin secretos, ignorado por Git y nunca versionado; formato en [HO](docs/best_practices/handoff.md).
- **Subagentes:** resuelve directamente; delega solo si resulta imprescindible y no hay alternativa razonable.
- **Seguridad:** seguridad por defecto, entradas validadas, secretos protegidos, mínimo privilegio y código claro y simple; nunca expongas credenciales.
- **Búsqueda:** prefiere [`tgrep`](https://github.com/microsoft/tgrep) (`tgrep index .`, `tgrep serve .`, `tgrep "<patrón>" .`); usa `rg` si no está disponible.

## Ejecución e infraestructura

Cada regla aplica solo si el proyecto tiene lo que regula: sin servidor no hay puertos ni procesos en segundo plano; sin recursos externos no hay Compose. No crees componentes para cumplir una guía.

- **Docker Compose** solo para recursos externos (DB, Redis, colas). Frontend y backend nativos, en segundo plano con PIDs y logs o gestión equivalente; detén solo procesos propios, sin `pkill`, `killall` ni comandos globales.
- **Puertos** (solo con servicios que escuchan): genera una vez un `XX` aleatorio de dos dígitos con una función del sistema (p. ej. `$((RANDOM % 90 + 10))` o shell equivalente, nunca de memoria para no repetir puertos); formato `1XXYY`: frontend `1XX01`, backend `1XX02` y siguientes servicios consecutivos.
- **Makefile** obligatorio en proyecto nuevo, sin pasos manuales y solo con los targets que el proyecto necesita:
  - Todos: `make install` valida herramientas e instala dependencias; `make check` ejecuta lint, tipos, pruebas y build aplicables.
  - Con servicios de larga duración (API, web, workers) o recursos externos: `make up` instala, levanta recursos, prepara DB, migra e inicia apps; `make down` detiene todo lo iniciado sin afectar procesos ajenos; `make logs` se queda mostrando los últimos logs de los servicios como `tail -f`; `make status` indica si están activos.
  - CLI o librería: sin `up`/`down`/`logs`/`status`; añade `make build` y, si se distribuye, el target que instala o empaqueta el binario.
  - Con releases versionadas: `make bump` según [REL-2](docs/best_practices/versioning-release.md).

## Buenas prácticas por tema

- Lee solo las guías aplicables y, dentro de ellas, solo las reglas cuyo componente existe (API, web, DB, usuarios, servicios); ejecuta sus comprobaciones antes de cerrar.
- Para ahorrar contexto, lista primero los encabezados (`rg "^## " <guía>`) y lee solo las reglas necesarias; una referencia `ID-n` se resuelve leyendo solo esa sección.
- Toda documentación aplica [DOC](docs/best_practices/documentation.md): precisa, mínima y sin duplicados ni ejemplos.
- Para no seguir una regla, indica su ID y justifícalo.
- Las comprobaciones asumen `apps/api`, `apps/web` y `packages/shared` ([STR](docs/best_practices/project-structure.md)) y `$API` como origen del backend; Flutter se comprueba desde `$APP` (`apps/mobile` o la raíz si el repositorio es solo la app). Adapta rutas a otra estructura: una búsqueda en ruta inexistente queda vacía y no demuestra cumplimiento.

| Tema                 | Leer cuando…                                                                                            | Guía                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Documentación        | crear, revisar o reducir docs                                                                           | [documentation](docs/best_practices/documentation.md)                 |
| Handoff              | iniciar, cerrar o retomar trabajo; cambiar CLI/modelo                                                   | [handoff](docs/best_practices/handoff.md)                             |
| Diagnóstico          | algo falla y se busca la causa por síntoma                                                              | [troubleshooting](docs/best_practices/troubleshooting.md)             |
| Estructura           | crear o reorganizar apps, paquetes y features; README y `docs/`                                         | [project-structure](docs/best_practices/project-structure.md)         |
| Stack                | proyecto sin stack indicado, dependencias, TypeScript, ESLint o Prettier                                | [tech-stack](docs/best_practices/tech-stack.md)                       |
| Configuración        | entorno, `.env`, parseo tipado, secretos, puertos y URLs                                                | [secrets-config](docs/best_practices/secrets-config.md)               |
| Contraseñas          | política, registro, login, cambio, restablecimiento, hashes heredados, datos de usuario y seed          | [passwords-login](docs/best_practices/passwords-login.md)             |
| Rate limit           | auth, rutas públicas, proxy inverso o réplicas                                                          | [rate-limiting](docs/best_practices/rate-limiting.md)                 |
| JWT                  | access, refresh, cookies, rotación, logout y `/auth/me`                                                 | [tokens-sessions](docs/best_practices/tokens-sessions.md)             |
| Sesión opaca         | sesión de servidor sin JWT, cookie `HttpOnly` y CSRF                                                    | [sessions-csrf](docs/best_practices/sessions-csrf.md)                 |
| HTTP                 | arranque, CORS, Helmet, Swagger, errores, health, límites de payload y API pública                      | [http-hardening](docs/best_practices/http-hardening.md)               |
| Validación           | DTOs, query params, búsqueda, paginación, orden y HTML enriquecido                                      | [input-validation](docs/best_practices/input-validation.md)           |
| Contratos            | esquemas Zod, envoltura de respuestas, normalización de texto, dominio puro y dinero                    | [shared-contracts](docs/best_practices/shared-contracts.md)           |
| Autorización         | recursos con dueño, aislamiento entre usuarios, soft delete y enlaces públicos                          | [authorization](docs/best_practices/authorization.md)                 |
| Multi-tenant         | organizaciones, sucursales, roles y contexto activo                                                     | [multi-tenancy](docs/best_practices/multi-tenancy.md)                 |
| Backend              | módulos, features, capas y tipado                                                                       | [backend-architecture](docs/best_practices/backend-architecture.md)   |
| Express              | middleware, arranque, errores de dominio y apagado                                                      | [backend-express](docs/best_practices/backend-express.md)             |
| Logging              | logger, peticiones, errores, auditoría, `requestId`, redacción y `console.*`                            | [logging](docs/best_practices/logging.md)                             |
| DB                   | esquema, migraciones, transacciones, bloqueos, base existente y local                                   | [database-migrations](docs/best_practices/database-migrations.md)     |
| Cliente web          | Axios/fetch, interceptores, auth store, refresh automático y guardas                                    | [frontend-api-client](docs/best_practices/frontend-api-client.md)     |
| Frontend             | módulos, vistas, stores, `fetch` con cookies, mensajes de error, router y Vite                          | [frontend-architecture](docs/best_practices/frontend-architecture.md) |
| UX web               | formularios, listas, filtros, estados de carga/error/vacío, accesibilidad y borrados                    | [frontend-ux-forms](docs/best_practices/frontend-ux-forms.md)         |
| Archivos             | CSV, importación, exportación y descargas                                                               | [import-export](docs/best_practices/import-export.md)                 |
| Legacy               | reemplazo incremental, base compartida y paso a producción                                              | [legacy-migration](docs/best_practices/legacy-migration.md)           |
| Operación local      | Makefile, arranque, parada, PIDs, logs, versión de Node, volúmenes, `verify-api`/`verify-load`          | [makefile-processes](docs/best_practices/makefile-processes.md)       |
| Despliegue           | contrato, alcance, evidencia y recuperación                                                             | [deployment](docs/best_practices/deployment.md)                       |
| Ansible              | infraestructura, vault, runtime, proxy y TLS                                                            | [deployment-ansible](docs/best_practices/deployment-ansible.md)       |
| Hardening            | auditar o endurecer servidores, SSH, cuentas, firewall, CDN, reinicios y agentes con herramientas       | [server-hardening](docs/best_practices/server-hardening.md)           |
| GitHub               | variables, secretos, SSH y workflow publicado                                                           | [deployment-github](docs/best_practices/deployment-github.md)         |
| Entorno prod         | preparar y validar configuración                                                                        | [deployment-env](docs/best_practices/deployment-env.md)               |
| Actions              | CI/CD, artefactos, migraciones y rollback                                                               | [deployment-actions](docs/best_practices/deployment-actions.md)       |
| Versiones y releases | bump, SemVer, changelog, tag y publicación de artefactos compilados                                     | [versioning-release](docs/best_practices/versioning-release.md)       |
| Testing              | capas de prueba, datos sintéticos, smoke, cobertura, lint, CI y README verificable                      | [testing-ci](docs/best_practices/testing-ci.md)                       |
| E2E                  | navegador con runner `e2e` sin IA, sesiones de prueba, locators, mocks de red y `make e2e`              | [e2e-testing](docs/best_practices/e2e-testing.md)                     |
| Stack Flutter        | SDK, dependencias de pub, analizador, formato, plataformas y Makefile de la app                         | [flutter-stack](docs/best_practices/flutter-stack.md)                 |
| Arquitectura Flutter | features, ViewModels, repositorios, composición, `go_router`, `--dart-define` y logs                    | [flutter-architecture](docs/best_practices/flutter-architecture.md)   |
| UI Flutter           | widgets, tema, formularios, estados, accesibilidad, móvil/escritorio, ARB y formatos                    | [flutter-ui-forms](docs/best_practices/flutter-ui-forms.md)           |
| Datos Flutter        | SQLite con `sqflite`, migraciones, cifrado, claves, respaldos, exportaciones, preferencias y datos demo | [flutter-local-data](docs/best_practices/flutter-local-data.md)       |
| Seguridad Flutter    | usuarios y roles locales, contraseñas, sesión, permisos, cliente de la API y plataformas                | [flutter-security](docs/best_practices/flutter-security.md)           |
| Testing Flutter      | pruebas, fakes, migraciones, cobertura, CI, firma y releases                                            | [flutter-testing-ci](docs/best_practices/flutter-testing-ci.md)       |
