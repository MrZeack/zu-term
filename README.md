# Zu Term

Terminal de escritorio para trabajar con agentes, apps y logs en una sola ventana: splits anidados, cabecera compacta con nombre y ruta por split y menú contextual nativo. macOS y Linux.

**Estado:** MVP. Verificado en macOS con pruebas unitarias y arranque real; Linux sin probar.

## Estructura

| Ruta                     | Contenido                                                            |
| ------------------------ | -------------------------------------------------------------------- |
| `apps/desktop/src`       | UI en Vue 3 + xterm.js, por feature (`src/features/*`)               |
| `apps/desktop/src-tauri` | Tauri 2 en Rust: PTY por split (`src/pty`), permisos y bundle        |
| `shell/`                 | integración zsh, bash y fish incluida: informa cwd, comando y agente |
| `scripts/`               | arranque/parada en segundo plano y prueba de operación               |
| `docs/`                  | [arquitectura](docs/ARCHITECTURE.md) y guías de buenas prácticas     |

## Requisitos

- Node 24 (≥ 24.8; `node-24` o `node`) y pnpm 12; Rust con `rustup` (versión fijada en `rust-toolchain.toml`).
- macOS: Xcode Command Line Tools. Linux: [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/#linux) (`webkit2gtk-4.1`, etc.).
- `zsh`, `bash` o `fish` como login shell para la integración automática de carpeta, comando y agente (abajo).

## Inicio rápido

```bash
make up       # instala dependencias y abre la app en modo dev (Vite en 127.0.0.1:17601)
make status   # estado
make logs     # log en vivo
make down     # detiene todo lo iniciado
```

Otros: `make check` (lint, tipos, pruebas, cobertura, build y auditoría), `make test`, `make bundle` (solo genera `.app/.dmg` o `.deb/.AppImage`).

## Instalar

```bash
make install         # compila en release e instala Zu Term
make uninstall       # la desinstala
```

- macOS: copia `Zu Term.app` a `/Applications` (aparece en Launchpad y Spotlight). El `.dmg` queda en `apps/desktop/src-tauri/target/release/bundle/dmg/` para instalar en otro Mac.
- Linux: instala el AppImage en `~/.local/bin/zu-term` con su entrada en el menú de aplicaciones (`~/.local/share/applications/zu-term.desktop`).
- Solo reemplaza una instalación previa si su identificador es `fyi.voza.zuterm`. La app no está firmada: en otro Mac, la primera vez ábrela con clic derecho → Abrir.

## Uso

| Acción                    | macOS                  | Linux                                    | Ratón                                    |
| ------------------------- | ---------------------- | ---------------------------------------- | ---------------------------------------- |
| Dividir a la derecha      | `CMD+D`                | `CTRL+SHIFT+E`                           | clic derecho                             |
| Dividir hacia abajo       | `CMD+SHIFT+D`          | `CTRL+SHIFT+O`                           | clic derecho                             |
| Copiar / pegar            | `CMD+C/V`              | `CTRL+SHIFT+C/V`                         | clic derecho                             |
| Buscar en scrollback      | `CMD+F`                | `CTRL+SHIFT+F`                           | clic derecho                             |
| Limpiar                   | `CMD+K`                | `CTRL+SHIFT+K`                           | clic derecho                             |
| Navegar entre splits      | `CMD+OPT+←↑↓→` / `⌘[]` | `CTRL+SHIFT+←↑↓→` / `CTRL+SHIFT+PgUpDn`  | clic en el split                         |
| Maximizar/restaurar split | `CMD+SHIFT+ENTER`      | `CTRL+SHIFT+ENTER`                       | botón `⤢` en la cabecera                 |
| Tamaño de fuente          | `CMD+` / `CMD-` / `⌘0` | `CTRL+` / `CTRL-` / `CTRL+0`             | controles de fuente en la barra superior |
| Cerrar split              | `CMD+W`                | `CTRL+SHIFT+W`                           | clic derecho o `×` en la cabecera        |
| Cerrar ventana / salir    | `CMD+SHIFT+W` / `⌘Q`   | `CTRL+ALT+W` / `CTRL+SHIFT+Q` / `ALT+F4` | botón cerrar de la ventana               |
| Renombrar split           | —                      | —                                        | doble clic en la cabecera o clic derecho |
| Redimensionar             | —                      | —                                        | arrastrar el borde                       |
| Reorganizar split         | —                      | —                                        | arrastrar la cabecera a otro split       |
| Abrir enlace/archivo      | —                      | —                                        | `Ctrl`+clic sobre una URL o ruta         |

- `Ctrl`+clic (también en macOS, donde sustituye al menú contextual sobre el enlace) abre URLs `http(s)` en el navegador y rutas existentes —absolutas, `~/`, relativas a la carpeta del split, con `:línea:columna` opcional, o enlaces OSC 8— con su app predeterminada. Ejecutables, scripts, apps e instaladores solo se muestran en Finder (en Linux, se abre su carpeta).
- Al arrastrar la cabecera, soltar en un borde de otro split lo divide en ese lado y soltar en su centro intercambia ambos; la franja junto al borde de la ventana lleva el split a todo ese borde.
- El split nuevo abre en la carpeta del split de origen; cerrar el último cierra la ventana.
- La barra superior incluye botones para dividir a la derecha o hacia abajo; ambos actúan sobre el split activo.
- La barra inferior reserva espacio fuera de la consola y muestra el split activo, ruta, comando/agente, workspace, cantidad de splits y dimensiones reales de la PTY.
- Arrastra la cabecera de un split al borde superior, inferior, izquierdo o derecho de otro para moverlo y cambiar entre orientación horizontal y vertical. Si el borde pertenece al límite de un grupo, se reorganiza el grupo completo; suelta en el centro para intercambiar posiciones. Puedes volver a una cuadrícula equilibrada arrastrando el pane al borde interno correspondiente.
- Cada cabecera tiene botón `⤢` para maximizar/restaurar temporalmente el split y botón `×` para cerrarlo. Si hay un agente o proceso activo en el split (detectado por integración de shell o por grupo de procesos en primer plano de la PTY), pide confirmación antes de cerrarlo.
- La cabecera muestra el comando activo (`codex`, `claude`, etc.), avisos de actividad cuando un split inactivo termina un comando o emite una alerta (`BEL`, OSC 9/99), la rama y resumen `git status` de su carpeta, el nombre asignado o el título del programa y la ruta actual.
- El botón `WORKSPACE` muestra un punto indicador cuando hay cambios sin guardar respecto al último snapshot. Al cerrar la ventana, el diálogo también lista los agentes o procesos activos que se interrumpirán.
- El botón `ACENTO` alterna rápidamente entre los temas Cian (`#00b7d5`) y Menta (`#00ca91`); la elección se conserva localmente.
- En macOS, el menú contextual del icono de Zu Term en el Dock incluye `Nueva ventana`.

### Workspaces

El menú `WORKSPACE` permite guardar, crear, cambiar y eliminar workspaces. Cada workspace conserva el árbol de splits, proporciones, nombres, títulos, split activo, última carpeta, historial asociado y el agente de cada pane. Los cambios no se guardan solos: el workspace se guarda con `Guardar` del menú, al cambiar a otro workspace o al cerrar la ventana con `Cerrar y guardar workspace`.

Mientras un workspace se está restaurando, el estado global bloquea nuevas selecciones para evitar abrirlo dos veces por clics o eventos concurrentes.

Un workspace solo puede estar abierto en una ventana: otra ventana o instancia no puede abrirlo ni eliminarlo mientras siga abierto, y cada ventana solo puede guardar el workspace que tiene abierto. El backend es el único que escribe `config.json` y aplica cada cambio sobre la versión actual del archivo, así que ninguna ventana sobrescribe los workspaces de otra. Entre instancias se usa un lock del sistema sobre un archivo privado en `~/.config/zu-term/workspace-locks/`, que el sistema libera si Zu Term termina de forma abrupta. Al cerrar o destruir una ventana se liberan sus locks y se terminan sus shells.

Al iniciar Zu Term no se abre ningún workspace automáticamente: aparece una terminal nueva y el workspace se restaura solo cuando lo seleccionas explícitamente en el menú `WORKSPACE`.

La configuración se guarda en `~/.config/zu-term/config.json`; los historiales independientes de zsh se guardan en `~/.config/zu-term/history/`. En la primera ejecución, las claves actuales `zu-term.workspace.v1` y `zu-term.theme` de `localStorage` se importan al archivo. Las claves antiguas `zylo.*` no se migran.

Al cerrar una ventana, Zu Term pregunta si debe guardar el workspace. `Cerrar y guardar workspace` guarda el workspace activo; `Cerrar sin guardar workspace` descarta los cambios desde el último guardado sin eliminar los workspaces guardados.

Los agentes soportados son Codex, Claude Code, Kiro, Muse Code y Antigravity. Solo se restaura un agente ejecutado con un ID explícito y que sea el último comando del pane (cualquier otro comando posterior, como `make install`, lo descarta): el workspace guarda ese ID y al restaurar ejecuta su comando de reanudación. Un agente sin ID no se guarda y su pane se restaura como una shell vacía. Los comandos usados son `codex resume <ID>`, `claude --resume <ID>`, `kiro-cli chat --resume-id <ID>`, `muse resume <ID>` y `agy --conversation <ID>`.

No se guardan procesos activos, comandos arbitrarios ni scrollback: la PTY se crea de nuevo y solo se relanza un agente de una lista permitida con un ID validado. El historial de comandos continúa siendo responsabilidad de zsh, pero cada pane recibe su propio `HISTFILE` bajo `~/.config/zu-term/history/`.

### Integración de shell (zsh, bash y fish)

Se carga sola sin modificar tus dotfiles:

- **`zsh`**: instala `shell/osc7.zsh` en `~/.config/zu-term/shell-integration/zsh/` y lo activa mediante `ZDOTDIR`, cargando tu `ZDOTDIR`, `.zshenv`, `.zprofile` y `.zshrc` como siempre.
- **`bash`**: instala `shell/zu-term.bash` y un wrapper en `~/.config/zu-term/shell-integration/bash/` pasado vía `--rcfile`, cargando `/etc/profile`, tu perfil de login y `~/.bashrc` antes de registrar `PROMPT_COMMAND` y el trap `DEBUG`.
- **`fish`**: instala `shell/zu-term.fish` bajo `~/.config/zu-term/shell-integration/fish/fish/vendor_conf.d/` y lo expone vía `XDG_DATA_DIRS` (restaurando inmediatamente el `XDG_DATA_DIRS` original).

Si `~/.zshrc` lanza otra shell mediante un wrapper (p. ej. `kiro-cli-term`), esa shell interna no hereda la integración. En ese caso, cárgala desde `~/.zshrc`:

```zsh
[[ -n "$ZU_TERM_TERMINAL" && -r ~/.config/zu-term/shell-integration/zsh/zu-term.zsh ]] &&
  source ~/.config/zu-term/shell-integration/zsh/zu-term.zsh
```

Comprueba que funciona con `cd /tmp` seguido de un split: el nuevo split debe iniciar en `/tmp`.

## Seguridad

- La UI solo tiene los permisos que invoca, incluidos los comandos propios declarados en `build.rs` ([capabilities](apps/desktop/src-tauri/capabilities/default.json)); CSP sin orígenes externos.
- El backend valida tamaño de terminal, tamaño de escritura (≤ 1 MiB) y carpeta inicial (absoluta y existente; si no, el home). Cada PTY y cada lock pertenecen a la ventana que los creó, según su etiqueta de Tauri y no según un valor del cliente.
- La entrada de cada PTY pasa por una cola acotada en su propio hilo: un proceso que no lee rechaza la escritura sin bloquear la UI ni otros panes.
- Un enlace solo abre URLs `http(s)` o rutas existentes, sin shell (`/usr/bin/open` o `xdg-open`), y nunca ejecuta: lo que podría correr código al abrirse se muestra en el gestor de archivos.
- `config.json` se reemplaza de forma atómica y los archivos privados se crean con permisos `0600`.
- Dependencias JavaScript con versión exacta, lockfiles versionados y `minimumReleaseAge` de 2 días.

## Limitaciones conocidas

- La validación de la ventana Tauri (menú, portapapeles, diálogo, renombrado, redimensionado y reorganización por drag-and-drop) sigue requiriendo una comprobación manual.
- Linux se comprueba en CI mediante el bundle, pero aún no tiene validación interactiva de la ventana.
- La aplicación no está firmada ni notarizada para distribución externa.
- El menú del Dock y la restauración de workspaces requieren validación manual en una ventana Tauri real; la cobertura automatizada prueba la lógica y la validación de datos.
