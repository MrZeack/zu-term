#!/usr/bin/env bash
# Static checks for local operations (Makefile and scripts).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  echo "FAIL $1" >&2
  exit 1
}

for target in up down logs status install-app uninstall-app; do
  grep -qE "^$target:" Makefile || fail "falta el target '$target'"
done
if grep -nE '\b(pkill|killall|fuser -k)\b|lsof -ti' Makefile scripts/*.sh | grep -v 'operations.test.sh'; then
  fail "comandos globales de terminación"
fi
for script in scripts/*.sh; do
  bash -n "$script" || fail "sintaxis en $script"
done
git check-ignore -q .env 2>/dev/null || grep -qxF '.env' .gitignore || fail ".env no ignorado"

echo "operations OK"
