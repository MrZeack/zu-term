#!/usr/bin/env bash
# Builds Zu Term in release mode and installs it where the OS app launcher finds it.
# Usage: install-app.sh install|uninstall
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Zu Term"
IDENTIFIER="fyi.voza.zuterm"
BUNDLE_DIR="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle"

MAC_TARGET="/Applications/$APP_NAME.app"
LINUX_BIN="$HOME/.local/bin/zu-term"
LINUX_DESKTOP="$HOME/.local/share/applications/zu-term.desktop"
LEGACY_LINUX_DESKTOP="$HOME/.local/share/applications/$IDENTIFIER.desktop"
LINUX_ICON_THEME="$HOME/.local/share/icons/hicolor"
LINUX_ICON="$LINUX_ICON_THEME/128x128/apps/zu-term.png"
NAUTILUS_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
[[ "$NAUTILUS_DATA_HOME" = /* ]] || NAUTILUS_DATA_HOME="$HOME/.local/share"
NAUTILUS_EXTENSION_DIR="$NAUTILUS_DATA_HOME/nautilus-python/extensions"
NAUTILUS_EXTENSION="$NAUTILUS_EXTENSION_DIR/zu_term.py"
NAUTILUS_PATHS="$NAUTILUS_EXTENSION_DIR/zu_term_paths.py"
NAUTILUS_MARKER="# Zu Term Nautilus extension"

build() {
  cd "$ROOT_DIR/apps/desktop"
  pnpm tauri build --bundles "$1"
  cd "$ROOT_DIR"
}

# An existing install is replaced or removed only if it is this app.
mac_is_ours() {
  [[ "$(defaults read "$MAC_TARGET/Contents/Info" CFBundleIdentifier 2>/dev/null)" == "$IDENTIFIER" ]]
}

mac_install() {
  build app,dmg
  local built="$BUNDLE_DIR/macos/$APP_NAME.app"
  [[ -d "$built" ]] || { echo "No se generó $built" >&2; exit 1; }
  if [[ -e "$MAC_TARGET" ]]; then
    mac_is_ours || { echo "$MAC_TARGET existe y no es $IDENTIFIER; no se toca" >&2; exit 1; }
    rm -rf "$MAC_TARGET"
  fi
  ditto "$built" "$MAC_TARGET"
  echo "Instalada en $MAC_TARGET (búscala en Launchpad o Spotlight como $APP_NAME)"
}

mac_uninstall() {
  if [[ ! -e "$MAC_TARGET" ]]; then
    echo "Nada que desinstalar"
  elif mac_is_ours; then
    rm -rf "$MAC_TARGET" && echo "Desinstalada"
  else
    echo "$MAC_TARGET no es $IDENTIFIER; no se toca" >&2
    exit 1
  fi
}

nautilus_python_available() {
  command -v nautilus >/dev/null 2>&1 || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - <<'PY'
import gi
gi.require_version("Nautilus", "4.0")
from gi.repository import Nautilus
PY
}

install_nautilus_extension() {
  if ! command -v nautilus >/dev/null 2>&1; then
    echo "Nautilus no está instalado; se omite su extensión"
    return 0
  fi
  if ! nautilus_python_available; then
    echo "Aviso: falta nautilus-python; no se instaló 'Open Zu Term Here'" >&2
    echo "Instálalo con: sudo dnf install nautilus-python" >&2
    return 0
  fi
  install -Dm644 "$ROOT_DIR/scripts/nautilus/zu_term.py" "$NAUTILUS_EXTENSION"
  install -Dm644 "$ROOT_DIR/scripts/nautilus/zu_term_paths.py" "$NAUTILUS_PATHS"
  echo "Extensión de Nautilus instalada; reinicia Nautilus para cargarla"
}

nautilus_file_is_ours() {
  [[ -f "$1" ]] && grep -qF "$NAUTILUS_MARKER" "$1"
}

uninstall_nautilus_extension() {
  if [[ -e "$NAUTILUS_EXTENSION" ]] && ! nautilus_file_is_ours "$NAUTILUS_EXTENSION"; then
    echo "$NAUTILUS_EXTENSION no es de $APP_NAME; no se toca" >&2
    exit 1
  fi
  if [[ -e "$NAUTILUS_PATHS" ]] && ! nautilus_file_is_ours "$NAUTILUS_PATHS"; then
    echo "$NAUTILUS_PATHS no es de $APP_NAME; no se toca" >&2
    exit 1
  fi
  rm -f "$NAUTILUS_EXTENSION" "$NAUTILUS_PATHS"
}

update_linux_icon_cache() {
  if [[ -d "$LINUX_ICON_THEME" ]] && command -v gtk-update-icon-cache >/dev/null; then
    gtk-update-icon-cache --force --ignore-theme-index --include-image-data "$LINUX_ICON_THEME"
  fi
}

migrate_gnome_favorite() {
  command -v gsettings >/dev/null || return 0
  local favorites migrated
  favorites="$(gsettings get org.gnome.shell favorite-apps 2>/dev/null)" || return 0
  [[ "$favorites" == *"'$IDENTIFIER.desktop'"* ]] || return 0
  migrated="${favorites//\'$IDENTIFIER.desktop\'/\'zu-term.desktop\'}"
  if gsettings set org.gnome.shell favorite-apps "$migrated" >/dev/null 2>&1; then
    echo "Favorito de GNOME migrado a zu-term.desktop"
  else
    echo "Aviso: no se pudo migrar el favorito de GNOME; vuelve a fijar Zu Term" >&2
  fi
}

linux_install() {
  build appimage
  local appimage
  appimage="$(find "$BUNDLE_DIR/appimage" -maxdepth 1 -name '*.AppImage' | head -1)"
  [[ -n "$appimage" ]] || { echo "No se generó el AppImage" >&2; exit 1; }
  for desktop in "$LINUX_DESKTOP" "$LEGACY_LINUX_DESKTOP"; do
    if [[ -e "$desktop" ]] && ! grep -qxF "X-Zu-Term-Id=$IDENTIFIER" "$desktop"; then
      echo "$desktop existe y no es de $APP_NAME; no se toca" >&2
      exit 1
    fi
  done
  install -Dm755 "$appimage" "$LINUX_BIN"
  install -Dm644 "$ROOT_DIR/apps/desktop/src-tauri/icons/128x128.png" "$LINUX_ICON"
  update_linux_icon_cache
  mkdir -p "$(dirname "$LINUX_DESKTOP")"
  cat >"$LINUX_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Terminal con splits para agentes, apps y logs
Exec=$LINUX_BIN
Icon=zu-term
Terminal=false
Categories=System;TerminalEmulator;
StartupWMClass=zu-term
X-Zu-Term-Id=$IDENTIFIER
EOF
  rm -f "$LEGACY_LINUX_DESKTOP"
  migrate_gnome_favorite
  if command -v update-desktop-database >/dev/null; then
    update-desktop-database "$(dirname "$LINUX_DESKTOP")"
  fi
  install_nautilus_extension
  echo "Instalada: $LINUX_BIN (menú de aplicaciones: $APP_NAME)"
}

linux_uninstall() {
  for desktop in "$LINUX_DESKTOP" "$LEGACY_LINUX_DESKTOP"; do
    if [[ -e "$desktop" ]] && ! grep -qxF "X-Zu-Term-Id=$IDENTIFIER" "$desktop"; then
      echo "$desktop no es de $APP_NAME; no se toca" >&2
      exit 1
    fi
  done
  rm -f "$LINUX_BIN" "$LINUX_DESKTOP" "$LEGACY_LINUX_DESKTOP" "$LINUX_ICON"
  update_linux_icon_cache
  uninstall_nautilus_extension
  echo "Desinstalada"
}

case "$(uname)-${1:-}" in
  Darwin-install) mac_install ;;
  Darwin-uninstall) mac_uninstall ;;
  Linux-install) linux_install ;;
  Linux-uninstall) linux_uninstall ;;
  *)
    echo "uso: $0 install|uninstall (macOS o Linux)" >&2
    exit 2
    ;;
esac
