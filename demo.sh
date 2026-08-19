#!/usr/bin/env bash
#
# One-command runner for the PlotGuard demo: database, backend, frontend.
#
#   ./demo.sh start    start everything (skips whatever's already up)
#   ./demo.sh stop     stop backend + frontend (leaves the database running)
#   ./demo.sh stop --with-db   also stop the Postgres container
#   ./demo.sh status   show what's running and where
#   ./demo.sh logs [api|web]  tail logs (both by default)
#
# Deliberately not `set -e`: this script's job is to report and clean up,
# and a step that's a no-op (killing an already-dead pid, stopping an
# already-stopped container) is a normal outcome here, not a failure that
# should abort the rest of the sequence.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DB_CONTAINER="${DB_CONTAINER:-plotguard-pg}"
DB_PORT="${DB_PORT:-55432}"
DB_PASSWORD="${DB_PASSWORD:-plotguard}"
DB_NAME="${DB_NAME:-plotguard}"
API_PORT=3001
WEB_PORT=3000
LOG_DIR="logs"
PID_FILE=".demo.pids"

mkdir -p "$LOG_DIR"

# ---- helpers ----------------------------------------------------------

# ss, not lsof: lsof can't see backgrounded child sockets in some sandboxed
# shells, silently reporting nothing running when something plainly is.
port_pid() {
  ss -tlnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | head -1
}

is_up() {
  [ -n "$(port_pid "$1")" ]
}

wait_for_port() {
  local port="$1" label="$2" tries="${3:-30}"
  local i
  for ((i = 0; i < tries; i++)); do
    if is_up "$port"; then
      echo "  ready on :$port"
      return 0
    fi
    sleep 1
  done
  echo "  ! $label didn't come up on :$port within ${tries}s — check its log"
  return 1
}

wait_for_db() {
  local i
  for ((i = 0; i < 20; i++)); do
    if (exec 3<>"/dev/tcp/localhost/$DB_PORT") 2>/dev/null; then
      exec 3>&- 3<&-
      return 0
    fi
    sleep 1
  done
  return 1
}

ensure_api_env() {
  if [ ! -f apps/api/.env ]; then
    cat >apps/api/.env <<EOF
DATABASE_URL="postgresql://postgres:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME?schema=public"
EOF
  fi
}

save_pid() {
  echo "$1:$2" >>"$PID_FILE"
}

pid_for() {
  if [ -f "$PID_FILE" ]; then
    grep "^$1:" "$PID_FILE" | tail -1 | cut -d: -f2
  fi
}

# ---- commands -----------------------------------------------------------

cmd_start() {
  echo "== Database =="
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME="podman"
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_RUNTIME="docker"
  else
    echo "  ! podman or docker is required to start the local Postgres database"
    exit 1
  fi

  if "$CONTAINER_RUNTIME" ps --filter "name=$DB_CONTAINER" --format '{{.Names}}' 2>/dev/null | grep -q "$DB_CONTAINER"; then
    echo "  already running ($DB_CONTAINER)"
  elif "$CONTAINER_RUNTIME" ps -a --filter "name=$DB_CONTAINER" --format '{{.Names}}' 2>/dev/null | grep -q "$DB_CONTAINER"; then
    echo "  starting $DB_CONTAINER…"
    "$CONTAINER_RUNTIME" start "$DB_CONTAINER" >/dev/null
  else
    echo "  creating $DB_CONTAINER…"
    "$CONTAINER_RUNTIME" run -d --name "$DB_CONTAINER" \
      -e POSTGRES_PASSWORD="$DB_PASSWORD" \
      -e POSTGRES_DB="$DB_NAME" \
      -p "$DB_PORT:5432" \
      docker.io/library/postgres:16-alpine >/dev/null
  fi
  if wait_for_db; then
    echo "  ready on :$DB_PORT"
  else
    echo "  ! Postgres didn't come up on :$DB_PORT within 20s"
    exit 1
  fi

  ensure_api_env

  echo "== Database schema =="
  (cd apps/api && pnpm exec prisma migrate deploy)

  echo "== Backend (NestJS) =="
  if is_up "$API_PORT"; then
    echo "  already running on :$API_PORT"
  else
    (cd apps/api && pnpm dev) >"$LOG_DIR/api.log" 2>&1 &
    save_pid api "$!"
    echo "  starting (pid $!, log: $LOG_DIR/api.log)…"
    wait_for_port "$API_PORT" "backend" 30
  fi

  echo "== Frontend (Next.js) =="
  if is_up "$WEB_PORT"; then
    echo "  already running on :$WEB_PORT"
  else
    pnpm dev >"$LOG_DIR/web.log" 2>&1 &
    save_pid web "$!"
    echo "  starting (pid $!, log: $LOG_DIR/web.log)…"
    wait_for_port "$WEB_PORT" "frontend" 30
  fi

  echo
  echo "PlotGuard is up:"
  echo "  Web      http://localhost:$WEB_PORT  (starts at /login)"
  echo "  API      http://localhost:$API_PORT/api"
  echo "  Database podman container '$DB_CONTAINER' on :$DB_PORT"
  echo
  echo "  ./demo.sh status   ./demo.sh logs   ./demo.sh stop"
}

cmd_stop() {
  echo "== Stopping backend + frontend =="

  for name in api web; do
    pid="$(pid_for "$name")"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo "  stopped $name (pid $pid)"
    fi
  done

  # Belt and suspenders: whatever's actually bound to the ports, not just what
  # this script remembers starting (covers a run started outside this script).
  for port in "$API_PORT" "$WEB_PORT"; do
    p="$(port_pid "$port")"
    if [ -n "$p" ]; then
      kill "$p" 2>/dev/null
      echo "  stopped process on :$port (pid $p)"
    fi
  done

  rm -f "$PID_FILE"

  if [ "${1:-}" = "--with-db" ]; then
    echo "== Stopping database =="
    if command -v podman >/dev/null 2>&1; then
      CONTAINER_RUNTIME="podman"
    elif command -v docker >/dev/null 2>&1; then
      CONTAINER_RUNTIME="docker"
    else
      echo "  podman or docker is not available"
      return
    fi
    if "$CONTAINER_RUNTIME" stop "$DB_CONTAINER" >/dev/null 2>&1; then
      echo "  stopped $DB_CONTAINER"
    else
      echo "  $DB_CONTAINER was already stopped"
    fi
  else
    echo "== Database left running (pass --with-db to stop it too) =="
  fi
}

cmd_status() {
  echo "== Database =="
  local db_status
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME="podman"
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_RUNTIME="docker"
  else
    CONTAINER_RUNTIME=""
  fi
  db_status="$([ -n "$CONTAINER_RUNTIME" ] && "$CONTAINER_RUNTIME" ps --filter "name=$DB_CONTAINER" --format '{{.Status}}' 2>/dev/null)"
  if [ -n "$db_status" ]; then
    echo "  up   $db_status"
  else
    echo "  down"
  fi

  echo "== Backend =="
  if is_up "$API_PORT"; then
    echo "  up   :$API_PORT (pid $(port_pid "$API_PORT"))"
  else
    echo "  down"
  fi

  echo "== Frontend =="
  if is_up "$WEB_PORT"; then
    echo "  up   :$WEB_PORT (pid $(port_pid "$WEB_PORT"))"
  else
    echo "  down"
  fi
}

cmd_logs() {
  case "${1:-}" in
    api) tail -f "$LOG_DIR/api.log" ;;
    web) tail -f "$LOG_DIR/web.log" ;;
    *) tail -f "$LOG_DIR/api.log" "$LOG_DIR/web.log" ;;
  esac
}

# ---- entry point ----------------------------------------------------------

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop "${2:-}" ;;
  status) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  *)
    echo "Usage: $0 {start|stop [--with-db]|status|logs [api|web]}"
    exit 1
    ;;
esac
