# Arquitectura

## Objetivo

Terminal orientada a agentes, apps y logs, con splits, cabecera por split (comando, nombre, título y ruta), workspaces restaurables y menú contextual nativo, en macOS y Linux.

## Capas

- **UI (`apps/desktop/src`)**: Vue 3 + Pinia. `layout` guarda el árbol binario de splits, permite mover panes mediante zonas de drag-and-drop —borde del grupo para reestructurar y centro para intercambiar— y los dibuja como lista plana con clave posicionada desde el árbol (`layout-geometry.ts`), para que dividir o reorganizar no remonte ni mate shells existentes. `pane-actions` concentra las acciones que usan el menú (`context-menu`), la cabecera y los atajos (`shortcuts`). `workspace` valida el catálogo; `config` lo persiste junto al tema mediante comandos Tauri en `~/.config/zu-term/config.json`. `status` reserva una barra inferior fuera del área de xterm y muestra el contexto del pane activo y las dimensiones de su PTY. `terminal` envuelve xterm.js, asigna un `HISTFILE` por pane bajo `~/.config/zu-term/history/`, detecta la carpeta con OSC 7 y el comando/agente con OSC privado.
- **Backend (`apps/desktop/src-tauri`)**: Tauri 2. `pty` abre una PTY por split (`portable-pty`) con la login shell del usuario, transmite la salida por un `Channel` desde un hilo lector (UTF-8 reensamblado entre fragmentos) y mata el proceso al cerrar el split.
- **Integración nativa (`apps/desktop/src-tauri/src/dock.rs`)**: en macOS añade `Nueva ventana` al menú contextual del Dock usando AppKit; la ventana dinámica carga la misma aplicación y recibe el capability de las ventanas `zu-term-window-*`.
- **Shell (`shell/osc7.zsh`)**: emite OSC 7 en cada prompt y `cd`, y comunica el comando y el proveedor/ID explícito del agente en `preexec` cuando `ZU_TERM_TERMINAL` está definido.

## Runtime local

`make up` lanza `pnpm tauri dev` en segundo plano (`.run/desktop.pid`, `logs/desktop.log`), que arranca Vite en `WEB_HOST:WEB_PORT` (`.env`, `17601`) y la app. No hay API HTTP ni base de datos: el backend corre dentro del proceso de la app, por eso solo existe el puerto del frontend.

## Decisiones

- 2026-10-22 · Tauri 2 + xterm.js en lugar de WezTerm o Ghostty: menú contextual nativo y cabecera por split, ninguno de los dos lo ofrecía completo.
- 2026-10-22 · Nombre Zu Term e identificador `fyi.voza.zuterm` (dominio voza.fyi); `make install` instala en `/Applications` o en el menú de aplicaciones de Linux, y `make uninstall` lo retira, sin firma de código.
- 2026-10-22 · Endurecimiento: el texto pegado (menú, atajo o `CMD+V`) pasa por `paste-guard` (sin caracteres de control; confirmación si hay varias líneas); OSC 7 solo se acepta con el hostname local; el capability concede solo los comandos que la UI invoca; `make check` incluye `pnpm audit` y `cargo audit` (excepciones justificadas en `src-tauri/.cargo/audit.toml`).
- 2026-10-22 · Sin `freezePrototype`: con él la UI no arranca (`Attempted to assign to readonly property`, en dev y en release).
- 2026-10-22 · Los layouts por proyecto (pendiente) no ejecutarán comandos de un repo sin confianza explícita por carpeta, como `direnv allow`.
- 2026-10-22 · CSS propio en lugar de Tailwind: la UI es una sola pantalla con pocos estilos.
- 2026-10-22 · Tema oscuro propio con acentos `#00b7d5` y `#00ca91`; el botón de la barra superior alterna el orden del acento y conserva la preferencia en el archivo de configuración.
- 2026-10-22 · La barra superior compacta conserva Zu Term, el selector de workspace y las acciones; el contexto de cada terminal vive en su propia cabecera.
- 2026-10-22 · El cierre de una cabecera reutiliza la acción de cerrar split; el último split abre una confirmación con opción explícita de guardar o descartar la restauración.
- 2026-10-22 · Los workspaces se modelan como `zu-term.workspace.v1` con catálogo, validación, límite de 24 workspaces y 32 panes por workspace; no guardan procesos ni scrollback.
- 2026-10-23 · El catálogo y el tema se persisten en `~/.config/zu-term/config.json`; cada pane usa un historial zsh independiente en `~/.config/zu-term/history/` y se conservan los datos actuales de `localStorage` solo para la migración inicial.
- 2026-10-23 · El arranque siempre crea una terminal nueva y deja `activeId` en `null`; un workspace solo se restaura tras una selección explícita desde `WorkspaceMenu.vue`.
- 2026-10-22 · La restauración de Codex, Claude Code, Kiro, Muse Code y Antigravity usa únicamente proveedores permitidos y un ID explícito validado; sin ID se inicia una sesión nueva.
- 2026-10-23 · La cabecera de cada pane se puede arrastrar al borde de otro pane para compartirlo (`row`/`column`) o al centro para intercambiar posiciones, sin desmontar la PTY.
- 2026-10-22 · La opción macOS `Nueva ventana` se implementa en AppKit porque Tauri 2 no expone un builder de menú del Dock.
- 2026-10-22 · Sin E2E: el runner E2E del stack apunta a navegador, no a la ventana Tauri; la UI se verifica a mano y su lógica con pruebas unitarias.

## Decisiones de versiones

- TypeScript 6.0.3, no 7: `typescript-eslint` 8.72 exige `< 6.1`.
- `@tauri-apps/cli` 2.12.3 y `vite` 8.3.4, no las últimas: sus versiones más nuevas tenían menos de 2 días (`minimumReleaseAge`).
