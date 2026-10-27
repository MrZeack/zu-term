# Versiones, tags y releases

**Leer cuando:** se incremente la versión, se cree un tag o se publique una release de un proyecto que genera artefactos (app nativa, escritorio, CLI, librería o paquete de servidor). Pipeline en [CD](deployment-actions.md); Flutter añade [FTEST-7](flutter-testing-ci.md).

## REL-1. Una versión, una fuente

- La versión vive en un solo manifiesto (`package.json`, `pubspec.yaml`, `Cargo.toml` o equivalente). Los demás manifiestos, la UI y `--version` la leen en build o los sincroniza el bump; nunca se escribe a mano en código ni en tests.
- SemVer `MAJOR.MINOR.PATCH`: `major` rompe compatibilidad, `minor` añade funcionalidad y `patch` corrige. Prerelease con `-rc.N`. El número de build (`+N`) de las tiendas solo crece y nunca se reutiliza.
- El tipo sale de los commits desde el último tag (Conventional Commits): `BREAKING CHANGE` o `!` → `major`, `feat` → `minor` y el resto → `patch`.

**Comprobación:** un test compara cada manifiesto y la versión expuesta por la app con la fuente única; `rg` de la versión actual fuera de manifiestos, lockfiles y `CHANGELOG.md` queda vacío.

## REL-2. Bump reproducible

- `make bump TYPE=patch|minor|major` (o `VERSION=X.Y.Z` explícita) es el único camino y ejecuta un script del repositorio.
- Antes de escribir exige árbol limpio, la rama de release (`main`) al día con el remoto, `make check` en verde, versión actual SemVer válida y que el tag nuevo no exista local ni remotamente.
- Actualiza todos los manifiestos y lockfiles derivados (p. ej. `Cargo.lock`) y la sección nueva de `CHANGELOG.md`. Escribe en temporales y reemplaza al final; si algo falla, restaura y no deja cambios parciales.
- Crea un único commit `chore(release): vX.Y.Z` con solo esos archivos. No hace push ni publica.

**Comprobación:** con árbol sucio, tag existente o versión inválida, `make bump` sale con error sin modificar archivos; tras un bump correcto, `git show --stat HEAD` solo lista manifiestos, lockfiles y changelog.

## REL-3. Tag inmutable

- Tag anotado `vX.Y.Z` sobre el commit del bump (`git tag -a`, firmado con `-s` si hay llave), creado después de `make check` y nunca sobre un commit con cambios ajenos.
- Un tag publicado no se mueve ni se borra: una release defectuosa se corrige con una versión nueva.
- Se publica el tag concreto (`git push origin vX.Y.Z`), nunca `--tags`, y solo con autorización de push (AGENTS). El remoto protege `v*` con reglas de tags contra borrado y reescritura.

**Comprobación:** `git describe --exact-match` sobre el commit del bump devuelve el tag; `git cat-file -t vX.Y.Z` es `tag` (anotado).

## REL-4. Workflow de release

- Se dispara con el push de un tag `v*.*.*`, no con la publicación manual de una GitHub Release, que crea una página vacía antes de existir los artefactos.
- Primero valida: el tag (sin la `v` inicial) coincide exactamente con la versión del manifiesto, su commit pertenece a `main` y los checks de CI de ese commit pasaron. Nunca deriva la versión del tag con `--build-name` ni reemplazos de texto.
- Builds con SDK y runtime fijados por versión exacta, instalación con lockfile estricto, acciones fijadas por SHA y `permissions: contents: read` salvo el job que publica (CD-2). Una matriz construye cada plataforma distribuida.
- Artefactos nombrados `<app>-<versión>-<os>-<arch>.<ext>`. La release se crea como borrador, recibe todos los artefactos y se publica al final; una prerelease (`-rc`) se marca como tal. Si una plataforma falla, no se publica ninguna.

**Comprobación:** un tag que no coincide con el manifiesto o cuyo commit no está en `main` hace fallar el workflow antes de compilar; `rg "uses: [^@]+@v"` en `.github/workflows` queda vacío.

## REL-5. Artefactos verificables

- Firmados según la plataforma (FTEST-7, FSEC-5; actualizador de Tauri con su llave). Sin firma no hay release estable.
- Cada archivo publicado tiene su línea en `SHA256SUMS` y una atestación de procedencia (`actions/attest-build-provenance`); incluye el SHA del commit.
- Empaquetado con lista explícita, sin fuentes, tests, `.env`, llaves, símbolos de depuración ni logs (CD-3). El artefacto se verifica fuera del repositorio: estructura, ausencia de secretos y arranque real o `--version` del binario.

**Comprobación:** `sha256sum -c SHA256SUMS` pasa; el binario extraído en una ruta limpia arranca y reporta la versión del tag; el listado no contiene archivos prohibidos.

## REL-6. Notas y corrección

- `CHANGELOG.md` sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), se genera desde los commits y se revisa en el bump; las notas de la release son esa sección.
- Una release fallida antes de publicar se descarta (borrador y tag no publicado). Una publicada nunca cambia sus binarios: se marca como defectuosa en sus notas y se corrige con un `patch` nuevo.
- Los secretos de firma y publicación solo están disponibles en el job que los usa y nunca en ejecuciones de PRs de forks.

**Comprobación:** la sección de `CHANGELOG.md` de la versión coincide con las notas publicadas y cada versión publicada tiene un tag único que no se ha movido.
