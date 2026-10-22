# Arquitectura

## Objetivo

Terminal de una sola ventana orientada a agentes, apps y logs, con splits, cabecera por split (nombre grande y ruta) y menú contextual nativo, en macOS y Linux.

## Capas

- **UI (`apps/desktop/src`)**: Vue 3 + Pinia. `layout` guarda el árbol binario de splits; los terminales se dibujan como lista plana con clave posicionada desde el árbol (`layout-geometry.ts`), para que dividir no remonte ni mate shells existentes. `pane-actions` concentra las acciones que usan el menú (`context-menu`) y los atajos (`shortcuts`). `terminal` envuelve xterm.js y detecta la carpeta con OSC 7.
- **Backend (`apps/desktop/src-tauri`)**: Tauri 2. `pty` abre una PTY por split (`portable-pty`) con la login shell del usuario, transmite la salida por un `Channel` desde un hilo lector (UTF-8 reensamblado entre fragmentos) y mata el proceso al cerrar el split.
- **Shell (`shell/osc7.zsh`)**: emite OSC 7 en cada prompt y `cd` cuando `ZYLO_TERMINAL` está definido.

## Runtime local

`make up` lanza `pnpm tauri dev` en segundo plano (`.run/desktop.pid`, `logs/desktop.log`), que arranca Vite en `WEB_HOST:WEB_PORT` (`.env`, `17601`) y la app. No hay API HTTP ni base de datos: el backend corre dentro del proceso de la app, por eso solo existe el puerto del frontend.

## Decisiones

- 2026-10-22 · Tauri 2 + xterm.js en lugar de WezTerm o Ghostty: menú contextual nativo y cabecera por split, ninguno de los dos lo ofrecía completo.
- 2026-10-22 · Nombre Zylo e identificador `fyi.voza.zylo` (dominio voza.fyi); `make install-app` instala en `/Applications` o en el menú de aplicaciones de Linux, sin firma de código.
- 2026-10-22 · CSS propio en lugar de Tailwind: la UI es una sola pantalla con pocos estilos.
- 2026-10-22 · Sin E2E: el runner E2E del stack apunta a navegador, no a la ventana Tauri; la UI se verifica a mano y su lógica con pruebas unitarias.

## Decisiones de versiones

- TypeScript 6.0.3, no 7: `typescript-eslint` 8.72 exige `< 6.1`.
- `@tauri-apps/cli` 2.12.3 y `vite` 8.3.4, no las últimas: sus versiones más nuevas tenían menos de 2 días (`minimumReleaseAge`).
