# Zu Term

Terminal de escritorio para trabajar con agentes, apps y logs en una sola ventana: splits anidados, cabecera compacta con nombre y ruta por split y menú contextual nativo. macOS y Linux.

**Estado:** MVP. Verificado en macOS con pruebas unitarias y arranque real; Linux sin probar.

## Estructura

| Ruta                     | Contenido                                                         |
| ------------------------ | ----------------------------------------------------------------- |
| `apps/desktop/src`       | UI en Vue 3 + xterm.js, por feature (`src/features/*`)            |
| `apps/desktop/src-tauri` | Tauri 2 en Rust: PTY por split (`src/pty`), permisos y bundle     |
| `shell/osc7.zsh`         | integración zsh incluida en la app: informa cwd, comando y agente |
| `scripts/`               | arranque/parada en segundo plano y prueba de operación            |
| `docs/`                  | [arquitectura](docs/ARCHITECTURE.md) y guías de buenas prácticas  |

## Requisitos

- Node 24 (≥ 24.8; `node-24` o `node`) y pnpm 11; Rust con `rustup` (versión fijada en `rust-toolchain.toml`).
- macOS: Xcode Command Line Tools. Linux: [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/#linux) (`webkit2gtk-4.1`, etc.).
- `zsh` como login shell para la integración de carpeta, comando y agente (abajo).

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

| Acción               | macOS         | Linux            | Ratón                                    |
| -------------------- | ------------- | ---------------- | ---------------------------------------- |
| Dividir a la derecha | `CMD+D`       | `CTRL+SHIFT+E`   | clic derecho                             |
| Dividir hacia abajo  | `CMD+SHIFT+D` | `CTRL+SHIFT+O`   | clic derecho                             |
| Copiar / pegar       | `CMD+C/V`     | `CTRL+SHIFT+C/V` | clic derecho                             |
| Limpiar              | `CMD+K`       | `CTRL+SHIFT+K`   | clic derecho                             |
| Cerrar split         | `CMD+W`       | `CTRL+SHIFT+W`   | clic derecho                             |
| Renombrar split      | —             | —                | doble clic en la cabecera o clic derecho |
| Redimensionar        | —             | —                | arrastrar el borde                       |
| Reorganizar split    | —             | —                | arrastrar la cabecera a otro split       |

- El split nuevo abre en la carpeta del split de origen; cerrar el último cierra la ventana.
- La barra superior incluye botones para dividir a la derecha o hacia abajo; ambos actúan sobre el split activo.
- La barra inferior reserva espacio fuera de la consola y muestra el split activo, ruta, comando/agente, workspace, cantidad de splits y dimensiones reales de la PTY.
- Arrastra la cabecera de un split al borde superior, inferior, izquierdo o derecho de otro para moverlo y cambiar entre orientación horizontal y vertical. Si el borde pertenece al límite de un grupo, se reorganiza el grupo completo; suelta en el centro para intercambiar posiciones. Puedes volver a una cuadrícula equilibrada arrastrando el pane al borde interno correspondiente.
- Cada cabecera tiene un botón `×` para cerrar directamente ese split. Si es el último, Zu Term pide confirmación antes de cerrar la ventana.
- La cabecera muestra el comando activo (`codex`, `claude`, etc.), el nombre asignado o el título que fija el programa y la carpeta actual.
- El botón `ACENTO` alterna rápidamente entre los temas Cian (`#00b7d5`) y Menta (`#00ca91`); la elección se conserva localmente.
- En macOS, el menú contextual del icono de Zu Term en el Dock incluye `Nueva ventana`.

### Workspaces

El menú `WORKSPACE` permite guardar, crear, cambiar y eliminar workspaces. Cada workspace conserva el árbol de splits, proporciones, nombres, títulos, split activo, última carpeta, historial asociado y el agente de cada pane. Después de seleccionar o crear uno, los cambios de splits, carpetas, títulos, nombres y contexto de agente se actualizan automáticamente en el workspace activo.

Mientras un workspace se está restaurando, el estado global bloquea nuevas selecciones para evitar abrirlo dos veces por clics o eventos concurrentes.

Un workspace solo puede estar abierto en una ventana: otra ventana o instancia no puede abrirlo ni eliminarlo mientras siga abierto, y cada ventana solo puede guardar el workspace que tiene abierto. El backend es el único que escribe `config.json` y aplica cada cambio sobre la versión actual del archivo, así que ninguna ventana sobrescribe los workspaces de otra. Entre instancias se usa un lock del sistema sobre un archivo privado en `~/.config/zu-term/workspace-locks/`, que el sistema libera si Zu Term termina de forma abrupta. Al cerrar o destruir una ventana se liberan sus locks y se terminan sus shells.

Al iniciar Zu Term no se abre ningún workspace automáticamente: aparece una terminal nueva y el workspace se restaura solo cuando lo seleccionas explícitamente en el menú `WORKSPACE`.

La configuración se guarda en `~/.config/zu-term/config.json`; los historiales independientes de zsh se guardan en `~/.config/zu-term/history/`. En la primera ejecución, las claves actuales `zu-term.workspace.v1` y `zu-term.theme` de `localStorage` se importan al archivo. Las claves antiguas `zylo.*` no se migran.

Al cerrar una ventana, Zu Term pregunta si debe guardar el workspace. `Cerrar y guardar workspace` fuerza una última actualización del workspace activo; `Cerrar sin guardar workspace` desactiva la restauración automática sin eliminar los workspaces guardados.

Los agentes soportados son Codex, Claude Code, Kiro, Muse Code y Antigravity. Solo se restauran agentes ejecutados con un ID explícito: el workspace guarda ese ID y al restaurar ejecuta su comando de reanudación. Un agente sin ID no se guarda y su pane se restaura como una shell vacía. Los comandos usados son `codex resume <ID>`, `claude --resume <ID>`, `kiro-cli chat --resume-id <ID>`, `muse resume <ID>` y `agy --conversation <ID>`.

No se guardan procesos activos, comandos arbitrarios ni scrollback: la PTY se crea de nuevo y solo se relanza un agente de una lista permitida con un ID validado. El historial de comandos continúa siendo responsabilidad de zsh, pero cada pane recibe su propio `HISTFILE` bajo `~/.config/zu-term/history/`.

### Integración zsh

Se carga sola: la app incluye `shell/osc7.zsh` y, cuando la login shell es zsh, lo instala en `~/.config/zu-term/shell-integration/zsh/` y lo activa mediante `ZDOTDIR`, sin tocar `~/.zshrc`. Tu `ZDOTDIR` y tus `.zshenv`, `.zprofile` y `.zshrc` se cargan como siempre.

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
- `config.json` se reemplaza de forma atómica y los archivos privados se crean con permisos `0600`.
- Dependencias JavaScript con versión exacta, lockfiles versionados y `minimumReleaseAge` de 2 días.

## Limitaciones conocidas

- La validación de la ventana Tauri (menú, portapapeles, diálogo, renombrado, redimensionado y reorganización por drag-and-drop) sigue requiriendo una comprobación manual.
- Linux se comprueba en CI mediante el bundle, pero aún no tiene validación interactiva de la ventana.
- La aplicación no está firmada ni notarizada para distribución externa.
- El menú del Dock y la restauración de workspaces requieren validación manual en una ventana Tauri real; la cobertura automatizada prueba la lógica y la validación de datos.
