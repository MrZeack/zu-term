#!/usr/bin/env bash
# Print the first usable Node 24 executable exposed by the host.
set -euo pipefail

is_supported_node() {
  local candidate="$1"
  "$candidate" -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 24 && minor >= 8 ? 0 : 1);
  ' >/dev/null 2>&1
}

resolve_node() {
  local name candidate

  for name in node-24 node; do
    candidate="$(command -v "$name" 2>/dev/null || true)"
    [[ -n "$candidate" ]] || continue
    if is_supported_node "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Se requiere Node 24.8+ (<25); se probaron node-24 y node." >&2
  return 1
}

resolve_node
