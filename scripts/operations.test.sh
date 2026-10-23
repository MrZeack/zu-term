#!/usr/bin/env bash
# Static checks for local operations (Makefile and scripts).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  echo "FAIL $1" >&2
  exit 1
}

for target in up down logs status install uninstall audit; do
  grep -qE "^$target:" Makefile || fail "falta el target '$target'"
done
grep -qE '^deps:' Makefile || fail "falta el target interno 'deps'"
grep -q 'scripts/install-app.sh install' Makefile || fail "install no instala la aplicación"
grep -q 'scripts/install-app.sh uninstall' Makefile || fail "uninstall no elimina la aplicación"
grep -qE '^icons:' Makefile || fail "falta el target de generación de iconos"
grep -qE '^install: deps icons( |$)' Makefile || fail "install no prepara los iconos del bundle"
grep -qF 'pnpm tauri icon ../../icon.png --output src-tauri/icons' Makefile \
  || fail "el build no genera los iconos Tauri desde icon.png"
grep -qE '^  build appimage$' scripts/install-app.sh \
  || fail "el instalador Linux no construye solo el AppImage"
if grep -qE '^  build deb,appimage$' scripts/install-app.sh; then
  fail "el instalador Linux empaqueta deb y AppImage juntos"
fi
[[ -f icon.png ]] || fail "falta el icono de Fedora en la raíz del proyecto"
grep -qF 'install -Dm644 "$ROOT_DIR/apps/desktop/src-tauri/icons/128x128.png" "$LINUX_ICON"' \
  scripts/install-app.sh || fail "make install no instala el icono generado para Fedora"
grep -qF '"enableGTKAppId": false' apps/desktop/src-tauri/tauri.conf.json \
  || fail "Tauri registra una instancia GTK única y bloquea ventanas independientes"
grep -qE '^LINUX_DESKTOP="\$HOME/\.local/share/applications/zu-term\.desktop"$' \
  scripts/install-app.sh || fail "el launcher no coincide con el app_id de la ventana"
grep -qF 'StartupWMClass=zu-term' scripts/install-app.sh \
  || fail "la entrada de Fedora no identifica la ventana del dock"
grep -qE '^LEGACY_LINUX_DESKTOP="\$HOME/\.local/share/applications/\$IDENTIFIER\.desktop"$' \
  scripts/install-app.sh || fail "el instalador no migra el launcher anterior"
grep -qF 'gsettings get org.gnome.shell favorite-apps' scripts/install-app.sh \
  || fail "el instalador no revisa el favorito anterior de GNOME"
grep -qF 'gsettings set org.gnome.shell favorite-apps' scripts/install-app.sh \
  || fail "el instalador no migra el favorito anterior de GNOME"
grep -qF 'echo "Favorito de GNOME migrado a zu-term.desktop"' scripts/install-app.sh \
  || fail "el instalador anuncia un destino incorrecto para el favorito"
if grep -qF 'update-desktop-database "$(dirname "$LINUX_DESKTOP")" || true' scripts/install-app.sh; then
  fail "el instalador oculta errores al actualizar la base de escritorios"
fi
grep -qF 'gtk-update-icon-cache --force --ignore-theme-index --include-image-data' scripts/install-app.sh \
  || fail "make install no actualiza el cache del icono"
[[ -f scripts/nautilus/zu_term.py ]] || fail "falta la extensión de Nautilus"
[[ -f scripts/nautilus/zu_term_paths.py ]] || fail "falta el helper de rutas de Nautilus"
[[ -f scripts/nautilus/zu_term.test.py ]] || fail "falta la prueba del menú de Nautilus"
grep -qF 'scripts/nautilus/zu_term.py' scripts/install-app.sh \
  || fail "make install no instala la extensión de Nautilus"
grep -qF 'scripts/nautilus/zu_term_paths.py' scripts/install-app.sh \
  || fail "make install no instala el helper de Nautilus"
grep -qF -- '--working-directory' scripts/nautilus/zu_term.py \
  || fail "Nautilus no transmite la carpeta al terminal"
if grep -qE '^(install-app|uninstall-app):' Makefile; then
  fail "siguen expuestos los targets install-app/uninstall-app"
fi
grep -q 'resolve-node.sh' Makefile || fail "Makefile no usa la resolución de Node"
grep -q 'node-24' scripts/resolve-node.sh || fail "la resolución de Node no contempla node-24"
[[ -x scripts/resolve-node.sh ]] || fail "scripts/resolve-node.sh no es ejecutable"
grep -qE '^build:' Makefile || fail "falta el target 'build'"
grep -qE '^check:.*build' Makefile || fail "check no incluye build"
grep -q '"check": "pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build"' package.json \
  || fail "el check de pnpm no incluye build"
[[ -f .github/workflows/ci.yml ]] || fail "falta el workflow de CI"
grep -q 'pnpm install --frozen-lockfile' .github/workflows/ci.yml || fail "CI no congela el lockfile"
grep -Eq 'pnpm run build|make check' .github/workflows/ci.yml || fail "CI no ejecuta el build"
grep -qE '^  release:$' .github/workflows/ci.yml || fail "CI no escucha releases publicados"
grep -qF 'types: [published]' .github/workflows/ci.yml || fail "CI no limita releases a publicados"
grep -qF "if: github.event_name == 'release' || (github.event_name == 'push' && github.ref_type == 'tag')" \
  .github/workflows/ci.yml || fail "el bundle se ejecuta fuera de tags y releases"
grep -q 'aria-label="Cerrar split"' apps/desktop/src/features/pane-header/PaneHeader.vue \
  || fail "la cabecera no ofrece cerrar split"
grep -q 'Cerrar y guardar workspace' apps/desktop/src/App.vue \
  || fail "falta la opción de guardar workspace al cerrar"
grep -Fq 'zu-term-window-*' apps/desktop/src-tauri/capabilities/default.json \
  || fail "las ventanas nuevas no tienen capability"
if grep -nE '\b(pkill|killall|fuser -k)\b|lsof -ti' Makefile scripts/*.sh | grep -v 'operations.test.sh'; then
  fail "comandos globales de terminación"
fi
for script in scripts/*.sh; do
  bash -n "$script" || fail "sintaxis en $script"
done
python3 scripts/nautilus/zu_term_paths.test.py
python3 scripts/nautilus/zu_term.test.py
git check-ignore -q .env 2>/dev/null || grep -qxF '.env' .gitignore || fail ".env no ignorado"

echo "operations OK"
