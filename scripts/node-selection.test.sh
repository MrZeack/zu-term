#!/usr/bin/env bash
# Behavioral checks for Node 24 selection on hosts exposing node-24.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  echo "FAIL $1" >&2
  exit 1
}

usable_node="$(scripts/resolve-node.sh || true)"
[[ -n "$usable_node" ]] || fail "el entorno de prueba necesita Node 24.8+"

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

mkdir "$temp_dir/preferred"
ln -s "$usable_node" "$temp_dir/preferred/node-24"
selected="$(PATH="$temp_dir/preferred:$PATH" scripts/resolve-node.sh)"
[[ "$selected" == "$temp_dir/preferred/node-24" ]] \
  || fail "no se prioriza node-24: $selected"

mkdir "$temp_dir/fallback"
ln -s "$usable_node" "$temp_dir/fallback/node"
selected="$(PATH="$temp_dir/fallback:$PATH" scripts/resolve-node.sh)"
[[ "$selected" == "$temp_dir/fallback/node" ]] \
  || fail "no se usa node cuando es Node 24: $selected"

echo "node selection OK"
