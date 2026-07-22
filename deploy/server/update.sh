#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/home/cuteyuchen/projects/campux-deploy}"
REPOSITORY_DIR="${REPOSITORY_DIR:-$DEPLOY_ROOT/repository}"
ENV_FILE="${ENV_FILE:-$DEPLOY_ROOT/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPOSITORY_DIR/deploy/server/compose.yaml}"
BACKUP_ROOT="${BACKUP_ROOT:-$DEPLOY_ROOT/backups/container-deploy}"
LOCK_FILE="${LOCK_FILE:-$DEPLOY_ROOT/.container-deploy.lock}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/cuteyuchen/campux}"
OCR_IMAGE_REPOSITORY="${OCR_IMAGE_REPOSITORY:-ghcr.io/cuteyuchen/campux-ocr}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://xxyg.cuteyuchen.top/api/health}"
PG_CONTAINER="${PG_CONTAINER:-campux-postgres}"
APP_CONTAINER="${APP_CONTAINER:-campux}"
OCR_CONTAINER="${OCR_CONTAINER:-campux-ocr}"
DOCKER_NETWORK="${DOCKER_NETWORK:-campux-deploy_default}"
BARE_PID_FILE="${BARE_PID_FILE:-$DEPLOY_ROOT/runtime/campux-server.pid}"
BARE_BUN_BIN="${BARE_BUN_BIN:-$DEPLOY_ROOT/runtime.old/node_modules/.bin/bun}"
PULL_ATTEMPTS="${PULL_ATTEMPTS:-12}"
PULL_DELAY_SECONDS="${PULL_DELAY_SECONDS:-10}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/deploy-$timestamp"
old_image=""
old_ocr_image=""
bare_pid=""
first_container_deploy=0

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_file() {
  [[ -f "$1" ]] || die "missing required file: $1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

load_env() {
  require_file "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${POSTGRES_USER:?POSTGRES_USER is required in $ENV_FILE}"
  : "${POSTGRES_DB:?POSTGRES_DB is required in $ENV_FILE}"
  : "${CAMPUX_CONTAINER_DATABASE_URL:?CAMPUX_CONTAINER_DATABASE_URL is required in $ENV_FILE}"
}

compose() {
  CAMPUX_ENV_FILE="$ENV_FILE" \
  CAMPUX_IMAGE="$CAMPUX_IMAGE" \
  CAMPUX_OCR_IMAGE="$CAMPUX_OCR_IMAGE" \
  CAMPUX_CONTAINER_DATABASE_URL="$CAMPUX_CONTAINER_DATABASE_URL" \
  CAMPUX_DOCKER_NETWORK="$DOCKER_NETWORK" \
    docker compose --project-name campux-app --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

read_bare_pid() {
  if [[ -f "$BARE_PID_FILE" ]]; then
    cat "$BARE_PID_FILE"
  fi
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

stop_bare_app() {
  bare_pid="$(read_bare_pid || true)"
  if ! is_pid_running "$bare_pid"; then
    log "no running bare Bun process found"
    bare_pid=""
    return
  fi

  log "stopping bare Bun process pid=$bare_pid"
  kill "$bare_pid"
  for _ in $(seq 1 30); do
    if ! is_pid_running "$bare_pid"; then
      return
    fi
    sleep 1
  done
  kill -9 "$bare_pid" || true
}

start_bare_app() {
  require_file "$BARE_BUN_BIN"
  require_file "$DEPLOY_ROOT/source/apps/server/src/index.ts"
  mkdir -p "$DEPLOY_ROOT/runtime"
  log "restoring bare Bun application"
  (
    cd "$DEPLOY_ROOT/source/apps/server"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    export PATH="$(dirname "$BARE_BUN_BIN"):$PATH"
    export CAMPUX_WEB_DIST_DIR="$DEPLOY_ROOT/source/apps/web/dist"
    export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}"
    nohup "$BARE_BUN_BIN" src/index.ts >> "$DEPLOY_ROOT/runtime/campux-server.log" 2>&1 &
    echo $! > "$BARE_PID_FILE"
  )
}

wait_for_health() {
  local local_url="http://127.0.0.1:8989/api/health"
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "$local_url" >/dev/null 2>&1 \
      && curl -fsS --max-time 10 "$PUBLIC_HEALTH_URL" >/dev/null 2>&1; then
      log "health checks passed"
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_ocr_health() {
  for _ in $(seq 1 60); do
    if [[ "$(docker container inspect "$OCR_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' 2>/dev/null || true)" = "healthy" ]]; then
      log "OCR health check passed"
      return 0
    fi
    sleep 2
  done
  return 1
}

pull_image() {
  local image="$1"
  for attempt in $(seq 1 "$PULL_ATTEMPTS"); do
    if docker pull "$image"; then
      return 0
    fi
    if [[ "$attempt" -lt "$PULL_ATTEMPTS" ]]; then
      log "image not available yet; retrying in ${PULL_DELAY_SECONDS}s ($attempt/$PULL_ATTEMPTS)"
      sleep "$PULL_DELAY_SECONDS"
    fi
  done
  return 1
}

backup_database() {
  mkdir -p "$backup_dir"
  log "backing up PostgreSQL to $backup_dir/database.dump"
  docker exec "$PG_CONTAINER" pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$backup_dir/database.dump"
  cp "$ENV_FILE" "$backup_dir/env.backup"
  chmod 600 "$backup_dir/env.backup"
  printf '%s\n' "$target_sha" > "$backup_dir/target-commit"
  printf '%s\n' "${old_image:-bare-bun}" > "$backup_dir/previous-runtime"
}

prune_backups() {
  mapfile -t backups < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'deploy-*' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  if (( ${#backups[@]} <= 10 )); then
    return
  fi
  for old_backup in "${backups[@]:10}"; do
    rm -rf -- "$old_backup"
  done
}

restore_ocr() {
  if [[ -n "$old_ocr_image" ]]; then
    log "restoring OCR image $old_ocr_image"
    CAMPUX_OCR_IMAGE="$old_ocr_image"
    compose up -d --no-build --force-recreate campux-ocr
    wait_for_ocr_health || die "OCR rollback completed but health check still fails"
  else
    log "removing failed initial OCR container"
    compose rm -sf campux-ocr || true
  fi
}

rollback() {
  log "deployment failed; starting application rollback"
  restore_ocr
  if [[ -n "$old_image" ]]; then
    CAMPUX_IMAGE="$old_image"
    compose up -d --no-build --force-recreate campux
  elif [[ "$first_container_deploy" = "1" ]]; then
    start_bare_app
  fi
  if ! wait_for_health; then
    die "rollback completed but health checks still fail"
  fi
  die "deployment failed; previous application restored. Database backup: $backup_dir/database.dump"
}

main() {
  require_cmd curl
  require_cmd docker
  require_cmd flock
  require_cmd git
  require_file "$COMPOSE_FILE"
  load_env

  exec 9>"$LOCK_FILE"
  flock -n 9 || die "another container deployment is already running"

  docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1 \
    || die "Docker network not found: $DOCKER_NETWORK"
  [[ "$(docker container inspect "$PG_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || true)" = "true" ]] \
    || die "PostgreSQL container is not running: $PG_CONTAINER"

  git -C "$REPOSITORY_DIR" fetch origin main
  git -C "$REPOSITORY_DIR" checkout main
  git -C "$REPOSITORY_DIR" pull --ff-only origin main
  target_sha="$(git -C "$REPOSITORY_DIR" rev-parse HEAD)"
  CAMPUX_IMAGE="$IMAGE_REPOSITORY:sha-$target_sha"
  CAMPUX_OCR_IMAGE="$OCR_IMAGE_REPOSITORY:sha-$target_sha"

  if docker container inspect "$APP_CONTAINER" >/dev/null 2>&1; then
    old_image="$(docker container inspect "$APP_CONTAINER" --format '{{.Config.Image}}')"
  else
    first_container_deploy=1
  fi
  if docker container inspect "$OCR_CONTAINER" >/dev/null 2>&1; then
    old_ocr_image="$(docker container inspect "$OCR_CONTAINER" --format '{{.Config.Image}}')"
  fi

  log "target commit: $target_sha"
  log "target image: $CAMPUX_IMAGE"
  log "target OCR image: $CAMPUX_OCR_IMAGE"
  pull_image "$CAMPUX_IMAGE" || die "unable to pull $CAMPUX_IMAGE; current application was not changed"
  pull_image "$CAMPUX_OCR_IMAGE" || die "unable to pull $CAMPUX_OCR_IMAGE; current application was not changed"
  backup_database

  if ! compose up -d --no-build --force-recreate campux-ocr; then
    compose logs --no-color --tail 200 campux-ocr > "$backup_dir/failed-ocr-container.log" 2>&1 || true
    restore_ocr
    die "OCR deployment failed; current application was not changed"
  fi
  if ! wait_for_ocr_health; then
    compose logs --no-color --tail 200 campux-ocr > "$backup_dir/failed-ocr-container.log" 2>&1 || true
    restore_ocr
    die "OCR health check failed; current application was not changed"
  fi

  if [[ "$first_container_deploy" = "1" ]]; then
    stop_bare_app
  fi

  if ! compose up -d --no-build --force-recreate campux; then
    rollback
  fi
  if ! wait_for_health; then
    compose logs --no-color --tail 200 > "$backup_dir/failed-container.log" 2>&1 || true
    rollback
  fi

  printf '%s %s %s\n' "$target_sha" "$CAMPUX_IMAGE" "$CAMPUX_OCR_IMAGE" > "$DEPLOY_ROOT/.deployed-container"
  prune_backups
  log "deployment completed successfully"
  log "backup kept at $backup_dir"
}

main "$@"
