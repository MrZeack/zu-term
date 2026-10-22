#!/usr/bin/env bash
# Static checks for local operations (Makefile and scripts).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  echo "FAIL $1" >&2
  exit 1
}

for target in up down logs status install-app uninstall-app audit; do
  grep -qE "^$target:" Makefile || fail "falta el target '$target'"
done
grep -qE '^build:' Makefile || fail "falta el target 'build'"
grep -qE '^check:.*build' Makefile || fail "check no incluye build"
grep -q '"check": "pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build"' package.json \
  || fail "el check de pnpm no incluye build"
[[ -f .github/workflows/ci.yml ]] || fail "falta el workflow de CI"
grep -q 'pnpm install --frozen-lockfile' .github/workflows/ci.yml || fail "CI no congela el lockfile"
grep -Eq 'pnpm run build|make check' .github/workflows/ci.yml || fail "CI no ejecuta el build"
grep -q 'aria-label="Cerrar split"' apps/desktop/src/features/pane-header/PaneHeader.vue \
  || fail "la cabecera no ofrece cerrar split"
grep -q 'Cerrar y restaurar sesión' apps/desktop/src/App.vue \
  || fail "falta la opción de restaurar sesión al cerrar"
grep -Fq 'zylo-window-*' apps/desktop/src-tauri/capabilities/default.json \
  || fail "las ventanas nuevas no tienen capability"
if grep -nE '\b(pkill|killall|fuser -k)\b|lsof -ti' Makefile scripts/*.sh | grep -v 'operations.test.sh'; then
  fail "comandos globales de terminación"
fi
for script in scripts/*.sh; do
  bash -n "$script" || fail "sintaxis en $script"
done
git check-ignore -q .env 2>/dev/null || grep -qxF '.env' .gitignore || fail ".env no ignorado"

echo "operations OK"
