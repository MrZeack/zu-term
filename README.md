# Zu Term

Terminal de escritorio para trabajar con agentes, apps y logs en una sola ventana: splits anidados, cabecera compacta con nombre y ruta por split y menú contextual nativo. macOS y Linux.

**Estado:** MVP. Verificado en macOS con pruebas unitarias y arranque real; Linux sin probar.

## Estructura

| Ruta                     | Contenido                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| `apps/desktop/src`       | UI en Vue 3 + xterm.js, por feature (`src/features/*`)           |
| `apps/desktop/src-tauri` | Tauri 2 en Rust: PTY por split (`src/pty`), permisos y bundle    |
| `shell/osc7.zsh`         | integración zsh: informa cwd y comando activo a la terminal      |
| `scripts/`               | arranque/parada en segundo plano y prueba de operación           |
| `docs/`                  | [arquitectura](docs/ARCHITECTURE.md) y guías de buenas prácticas |

## Requisitos

- Node 24 (≥ 24.8; `node-24` o `node`) y pnpm 11; Rust estable (`rustup`).
- macOS: Xcode Command Line Tools. Linux: [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/#linux) (`webkit2gtk-4.1`, etc.).
- `zsh` con la integración de carpeta (abajo).

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

- El split nuevo abre en la carpeta del split de origen; cerrar el último cierra la ventana.
- La barra superior incluye botones para dividir a la derecha o hacia abajo; ambos actúan sobre el split activo.
- Cada cabecera tiene un botón `×` para cerrar directamente ese split. Si es el último, Zu Term pide confirmación antes de cerrar la ventana.
- La cabecera muestra el comando activo (`codex`, `claude`, etc.), el nombre asignado o el título que fija el programa y la carpeta actual.
- El botón `ACENTO` alterna rápidamente entre los temas Cian (`#00b7d5`) y Menta (`#00ca91`); la elección se conserva localmente.
- En macOS, el menú contextual del icono de Zu Term en el Dock incluye `Nueva ventana`.

### Sesiones

Al cerrar una ventana, Zu Term pregunta si debe guardar la sesión. `Cerrar y restaurar sesión` conserva el árbol de splits, proporciones, nombres, títulos y última carpeta de cada shell; al próximo arranque las terminales se crean de nuevo en esas carpetas. `Cerrar sin restaurar` elimina ese punto de restauración.

No se guardan procesos activos, comandos en ejecución ni scrollback: una PTY nueva no puede reanudar esos estados de forma segura.

### Integración zsh

Sin ella, la ruta de la cabecera no se actualiza, el comando activo no aparece y los splits nuevos abren en la carpeta inicial (necesaria si la shell corre tras un wrapper como `kiro-cli-term`). En `~/.zshrc`, antes de bloques que deban ir al final:

```zsh
if [[ -n "$ZU_TERM_TERMINAL" && -f "$HOME/personal/zu-term/shell/osc7.zsh" ]]; then
  source "$HOME/personal/zu-term/shell/osc7.zsh"
fi
```

Después reinicia Zu Term o ejecuta `source ~/.zshrc` en cada split abierto. Comprueba que `echo "$ZU_TERM_TERMINAL"` muestra `1`, ejecuta `pwd`, cambia con `cd /tmp` y usa uno de los botones de split: el nuevo split debe iniciar en `/tmp`.

## Seguridad

- La UI solo tiene permisos de menú, cerrar sus ventanas, diálogo de confirmación y portapapeles de texto ([capabilities](apps/desktop/src-tauri/capabilities/default.json)); CSP sin orígenes externos.
- El backend valida tamaño de terminal, tamaño de escritura (≤ 1 MiB) y carpeta inicial (absoluta y existente; si no, `$HOME`).
- Dependencias JavaScript con versión exacta, lockfiles versionados y `minimumReleaseAge` de 2 días.

## Limitaciones conocidas

- La validación de la ventana Tauri (menú, portapapeles, diálogo, renombrado y redimensionado) sigue requiriendo una comprobación manual.
- Linux se comprueba en CI mediante el bundle, pero aún no tiene validación interactiva de la ventana.
- La aplicación no está firmada ni notarizada para distribución externa.
- El menú del Dock y la restauración de sesión requieren validación manual en una ventana Tauri real; la cobertura automatizada prueba la lógica y la validación de datos.
