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
LINUX_ICON="$HOME/.local/share/icons/hicolor/128x128/apps/zu-term.png"

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

linux_install() {
  build deb,appimage
  local appimage
  appimage="$(find "$BUNDLE_DIR/appimage" -maxdepth 1 -name '*.AppImage' | head -1)"
  [[ -n "$appimage" ]] || { echo "No se generó el AppImage" >&2; exit 1; }
  if [[ -e "$LINUX_DESKTOP" ]] && ! grep -qxF "X-Zu-Term-Id=$IDENTIFIER" "$LINUX_DESKTOP"; then
    echo "$LINUX_DESKTOP existe y no es de $APP_NAME; no se toca" >&2
    exit 1
  fi
  install -Dm755 "$appimage" "$LINUX_BIN"
  install -Dm644 "$ROOT_DIR/apps/desktop/src-tauri/icons/128x128.png" "$LINUX_ICON"
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
X-Zu-Term-Id=$IDENTIFIER
EOF
  command -v update-desktop-database >/dev/null && update-desktop-database "$(dirname "$LINUX_DESKTOP")" || true
  echo "Instalada: $LINUX_BIN (menú de aplicaciones: $APP_NAME)"
}

linux_uninstall() {
  if [[ -e "$LINUX_DESKTOP" ]] && ! grep -qxF "X-Zu-Term-Id=$IDENTIFIER" "$LINUX_DESKTOP"; then
    echo "$LINUX_DESKTOP no es de $APP_NAME; no se toca" >&2
    exit 1
  fi
  rm -f "$LINUX_BIN" "$LINUX_DESKTOP" "$LINUX_ICON"
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
