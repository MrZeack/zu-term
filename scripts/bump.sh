#!/usr/bin/env bash
# Increments the project version across Tauri, Cargo, and package.json manifests.
# Usage: ./scripts/bump.sh [patch|minor|major]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TYPE="${1:-patch}"

TAURI_CONF="$ROOT_DIR/apps/desktop/src-tauri/tauri.conf.json"
CARGO_TOML="$ROOT_DIR/apps/desktop/src-tauri/Cargo.toml"
ROOT_PKG="$ROOT_DIR/package.json"
DESKTOP_PKG="$ROOT_DIR/apps/desktop/package.json"
BRAND_TEST="$ROOT_DIR/apps/desktop/src/core/brand.test.ts"

CURRENT_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TAURI_CONF', 'utf8')).version)")"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Tipo de incremento desconocido: $TYPE (usa patch, minor o major)" >&2
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

node -e "
  const fs = require('fs');

  function updateJson(filePath, updater) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    updater(data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  }

  // 1. tauri.conf.json
  updateJson('$TAURI_CONF', (d) => { d.version = '$NEW_VERSION'; });

  // 2. package.json
  updateJson('$ROOT_PKG', (d) => { d.version = '$NEW_VERSION'; });

  // 3. apps/desktop/package.json
  updateJson('$DESKTOP_PKG', (d) => { d.version = '$NEW_VERSION'; });

  // 4. Cargo.toml
  const cargoPath = '$CARGO_TOML';
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(/^version = \"[0-9]+\.[0-9]+\.[0-9]+\"/m, 'version = \"$NEW_VERSION\"');
  fs.writeFileSync(cargoPath, cargoContent);

  // 5. brand.test.ts
  const brandTestPath = '$BRAND_TEST';
  let brandTestContent = fs.readFileSync(brandTestPath, 'utf8');
  brandTestContent = brandTestContent.replace(
    /assert\.equal\(APP_VERSION, '[0-9]+\.[0-9]+\.[0-9]+'\);/,
    \"assert.equal(APP_VERSION, '$NEW_VERSION');\"
  );
  fs.writeFileSync(brandTestPath, brandTestContent);
"

# Sync Cargo.lock
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
if command -v cargo >/dev/null 2>&1; then
  cargo check --manifest-path "$CARGO_TOML" --quiet
fi

echo "Versión actualizada: $CURRENT_VERSION -> $NEW_VERSION"
