# console

Terminal de escritorio para trabajar con agentes, apps y logs en una sola ventana: splits anidados, cabecera grande con nombre y ruta por split y menú contextual nativo. macOS y Linux.

**Estado:** MVP. Verificado en macOS con pruebas unitarias y arranque real; Linux sin probar.

## Estructura

| Ruta                     | Contenido                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| `apps/desktop/src`       | UI en Vue 3 + xterm.js, por feature (`src/features/*`)           |
| `apps/desktop/src-tauri` | Tauri 2 en Rust: PTY por split (`src/pty`), permisos y bundle    |
| `shell/osc7.zsh`         | integración zsh: informa la carpeta actual a la terminal         |
| `scripts/`               | arranque/parada en segundo plano y prueba de operación           |
| `docs/`                  | [arquitectura](docs/ARCHITECTURE.md) y guías de buenas prácticas |

## Requisitos

- Node 24 y pnpm 11; Rust estable (`rustup`).
- macOS: Xcode Command Line Tools. Linux: [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/#linux) (`webkit2gtk-4.1`, etc.).
- `zsh` con la integración de carpeta (abajo).

## Inicio rápido

```bash
make up       # instala dependencias y abre la app en modo dev (Vite en 127.0.0.1:17601)
make status   # estado
make logs     # log en vivo
make down     # detiene todo lo iniciado
```

Otros: `make check` (lint, tipos y pruebas), `make test`, `make bundle` (instalable `.app/.dmg` o `.deb/.AppImage`).

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

- El split nuevo abre en la carpeta del split de origen; cerrar el último cierra la ventana.
- Título: el nombre asignado, si no el título que fija el programa (OSC 0/2), si no la carpeta actual.

### Integración zsh

Sin ella, la ruta de la cabecera no se actualiza y los splits nuevos abren en la carpeta inicial (necesaria si la shell corre tras un wrapper como `kiro-cli-term`). En `~/.zshrc`, antes de bloques que deban ir al final:

```zsh
[[ -n "$CONSOLE_TERMINAL" && -f "$HOME/personal/console/shell/osc7.zsh" ]] && source "$HOME/personal/console/shell/osc7.zsh"
```

## Seguridad

- La UI solo tiene permisos de menú, cerrar su ventana y portapapeles de texto ([capabilities](apps/desktop/src-tauri/capabilities/default.json)); CSP sin orígenes externos.
- El backend valida tamaño de terminal, tamaño de escritura (≤ 1 MiB) y carpeta inicial (absoluta y existente; si no, `$HOME`).
- Dependencias con versión exacta y `minimumReleaseAge` de 2 días.
