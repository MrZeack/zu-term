#!/usr/bin/env bash
# Runs the desktop app in dev mode (`pnpm tauri dev`) in the background,
# tracked with a PID file and a log. Usage: desktop.sh start|stop|status|logs
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$RUN_DIR/desktop.pid"
LOG_FILE="$LOG_DIR/desktop.log"
READY_TIMEOUT=60

env_value() {
  grep -E "^$1=" "$ROOT_DIR/.env" | tail -1 | cut -d= -f2-
}
WEB_HOST="$(env_value WEB_HOST)"
WEB_PORT="$(env_value WEB_PORT)"
[[ "$WEB_HOST" =~ ^[0-9a-zA-Z.:-]+$ && "$WEB_PORT" =~ ^[0-9]+$ ]] || {
  echo "WEB_HOST/WEB_PORT inválidos en .env" >&2
  exit 1
}

# A process is ours if its command line or cwd contains ROOT_DIR (literal match).
is_ours() {
  local pid=$1
  ps -o command= -p "$pid" 2>/dev/null | grep -qF "$ROOT_DIR" && return 0
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep -qF "n$ROOT_DIR"
}

alive() { kill -0 "$1" 2>/dev/null; }

recorded_pid() { [[ -f "$PID_FILE" ]] && cat "$PID_FILE" || true; }

running() {
  local pid
  pid="$(recorded_pid)"
  [[ -n "$pid" ]] && alive "$pid" && is_ours "$pid"
}

port_busy() { lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; }

# Children first, deepest first.
descendants() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do
    descendants "$child"
    echo "$child"
  done
}

stop_tree() {
  local root=$1 pids pid waited=0
  pids="$(descendants "$root") $root"
  for pid in $pids; do
    if alive "$pid" && is_ours "$pid"; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  while ((waited < 50)); do
    local any=0
    for pid in $pids; do alive "$pid" && is_ours "$pid" && any=1; done
    ((any == 0)) && return 0
    sleep 0.1
    waited=$((waited + 1))
  done
  for pid in $pids; do
    if alive "$pid" && is_ours "$pid"; then kill -KILL "$pid" 2>/dev/null || true; fi
  done
}

start() {
  if running; then
    echo "Desktop ya activo (PID $(recorded_pid))"
    return 0
  fi
  local stale
  stale="$(recorded_pid)"
  if [[ -n "$stale" ]] && alive "$stale"; then
    echo "El PID $stale de $PID_FILE pertenece a otro programa; no se toca. Borra el archivo y repite." >&2
    exit 1
  fi
  rm -f "$PID_FILE"
  if port_busy; then
    echo "El puerto $WEB_PORT está ocupado por otro proceso" >&2
    exit 1
  fi

  umask 077
  mkdir -p "$RUN_DIR" "$LOG_DIR"
  local config pid
  config="{\"build\":{\"devUrl\":\"http://$WEB_HOST:$WEB_PORT\"}}"
  # No subshell: the background job must not hold the caller's stdout.
  cd "$ROOT_DIR/apps/desktop"
  nohup pnpm tauri dev --config "$config" </dev/null >>"$LOG_FILE" 2>&1 &
  pid=$!
  cd "$ROOT_DIR"
  echo "$pid" >"$PID_FILE.tmp"
  mv "$PID_FILE.tmp" "$PID_FILE"

  local waited=0
  until port_busy; do
    if ! alive "$pid" || ((waited >= READY_TIMEOUT * 2)); then
      echo "Desktop no arrancó; últimas líneas de $LOG_FILE:" >&2
      tail -n 30 "$LOG_FILE" >&2
      stop
      exit 1
    fi
    sleep 0.5
    waited=$((waited + 1))
  done
  echo "Desktop arrancando (PID $pid, Vite en http://$WEB_HOST:$WEB_PORT)."
  echo "La primera compilación de Rust tarda unos minutos; sigue el avance con 'make logs'."
}

stop() {
  local pid
  pid="$(recorded_pid)"
  if [[ -z "$pid" ]]; then
    echo "Nada que detener"
    return 0
  fi
  if alive "$pid" && is_ours "$pid"; then
    stop_tree "$pid"
    echo "Desktop detenido"
  elif alive "$pid"; then
    echo "El PID $pid no pertenece a este proyecto; no se toca" >&2
  else
    echo "Nada que detener"
  fi
  rm -f "$PID_FILE"
}

status() {
  if running; then
    local app="compilando" pid
    for pid in $(descendants "$(recorded_pid)"); do
      ps -o command= -p "$pid" 2>/dev/null | grep -qF "target/debug/zylo" && app="ventana abierta"
    done
    echo "desktop: activo · PID $(recorded_pid) · Vite :$WEB_PORT $(port_busy && echo escuchando || echo sin respuesta) · app $app"
  else
    echo "desktop: detenido"
  fi
}

logs() {
  mkdir -p "$LOG_DIR"
  touch "$LOG_FILE"
  echo "== desktop ($LOG_FILE) =="
  tail -n 50 -F "$LOG_FILE"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  *)
    echo "uso: $0 start|stop|status|logs" >&2
    exit 2
    ;;
esac
