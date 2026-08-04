#!/usr/bin/env bash
# Hearthstone Assistant production deploy helper.
#
# Usage:
#   ./deploy/deploy.sh help
#   ./deploy/deploy.sh init
#   ./deploy/deploy.sh deploy
#   ./deploy/deploy.sh restart
#
# Optional env overrides:
#   APP_ROOT=/opt/hearthstone-assistant
#   BACKEND_HOST=127.0.0.1
#   BACKEND_PORT=8101
#   SERVICE_NAME=hearthstone-assistant
#   SERVICE_USER=www-data
#   RUN_MODE=systemd|pid   (default: systemd if available, else pid)
#   SKIP_GIT_PULL=1
#   WORKERS=2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${APP_ROOT:-$SCRIPT_DIR/..}" && pwd)"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"
DEPLOY_DIR="$APP_ROOT/deploy"
PID_DIR="${PID_DIR:-$APP_ROOT/run}"
LOG_DIR="${LOG_DIR:-$APP_ROOT/logs}"
PID_FILE="$PID_DIR/uvicorn.pid"
LOG_FILE="$LOG_DIR/uvicorn.log"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8101}"
SERVICE_NAME="${SERVICE_NAME:-hearthstone-assistant}"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
WORKERS="${WORKERS:-2}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
CYAN=$'\033[36m'
RESET=$'\033[0m'

log() { printf '%s[%s]%s %s\n' "$CYAN" "$(date '+%H:%M:%S')" "$RESET" "$*"; }
ok() { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die() { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"
}

detect_run_mode() {
  if [[ -n "${RUN_MODE:-}" ]]; then
    echo "$RUN_MODE"
    return
  fi
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system || -d /sys/fs/cgroup/systemd ]]; then
    echo "systemd"
  else
    echo "pid"
  fi
}

ensure_dirs() {
  mkdir -p "$PID_DIR" "$LOG_DIR" "$BACKEND_DIR/data" "$BACKEND_DIR/data/skill_market"
}

has_systemd_unit() {
  systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1 \
    || [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]
}

cmd_help() {
  cat <<EOF
Hearthstone Assistant deploy helper

Usage: $0 <command>

Commands:
  help              显示帮助
  init              初始化目录与 .env（不安装 systemd）
  check             检查依赖与配置
  deps              安装后端/前端依赖
  migrate           执行 Alembic 迁移
  build             构建前端静态资源 (frontend/dist)
  install-systemd   安装并 enable systemd 服务（需 sudo）
  start             启动后端服务
  stop              停止后端服务
  restart           重启后端服务
  status            查看服务状态
  logs              查看后端日志（systemd journal 或 pid 日志）
  health            请求 /api/health
  deploy            一键：可选 git pull → deps → migrate → build → restart → health

Environment:
  APP_ROOT          项目根目录（默认脚本上级）
  BACKEND_PORT      后端端口（默认 8101）
  SERVICE_NAME      systemd 服务名（默认 hearthstone-assistant）
  SERVICE_USER      运行用户（默认当前用户）
  RUN_MODE          systemd | pid
  SKIP_GIT_PULL=1   deploy 时跳过 git pull
  WORKERS           uvicorn workers（默认 2）
EOF
}

cmd_init() {
  log "初始化部署目录: $APP_ROOT"
  ensure_dirs

  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    if [[ -f "$DEPLOY_DIR/env.production.example" ]]; then
      cp "$DEPLOY_DIR/env.production.example" "$BACKEND_DIR/.env"
      chmod 600 "$BACKEND_DIR/.env"
      warn "已创建 backend/.env（来自 deploy/env.production.example），请先编辑密钥与 DATABASE_URL"
    elif [[ -f "$BACKEND_DIR/.env.example" ]]; then
      cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
      chmod 600 "$BACKEND_DIR/.env"
      warn "已创建 backend/.env（来自 .env.example），请按生产环境修改"
    else
      die "找不到 env 模板"
    fi
  else
    ok "backend/.env 已存在"
  fi

  if ! command -v uv >/dev/null 2>&1; then
    warn "未检测到 uv，尝试安装到 \$HOME/.local ..."
    need_cmd curl
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
  fi
  need_cmd uv
  need_cmd node
  need_cmd npm

  ok "init 完成。下一步通常: $0 deploy"
}

cmd_check() {
  log "检查运行环境"
  need_cmd uv
  need_cmd node
  need_cmd npm
  [[ -d "$BACKEND_DIR" ]] || die "backend 目录不存在: $BACKEND_DIR"
  [[ -d "$FRONTEND_DIR" ]] || die "frontend 目录不存在: $FRONTEND_DIR"
  [[ -f "$BACKEND_DIR/.env" ]] || die "缺少 backend/.env，请先执行: $0 init"
  if grep -Eq 'change-me-to-a-long-random-string|replace-with-a-long-random-string' "$BACKEND_DIR/.env"; then
    warn "JWT_SECRET 仍是占位值，生产环境请更换"
  fi
  if grep -Eq 'sqlite:' "$BACKEND_DIR/.env"; then
    warn "DATABASE_URL 仍是 SQLite；生产建议 PostgreSQL"
  fi
  ok "基础检查通过（RUN_MODE=$(detect_run_mode)）"
}

cmd_deps() {
  cmd_check
  log "安装后端依赖 (uv sync)"
  (cd "$BACKEND_DIR" && uv sync --no-dev)
  log "安装前端依赖 (npm ci/install)"
  if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
    (cd "$FRONTEND_DIR" && npm ci)
  else
    (cd "$FRONTEND_DIR" && npm install)
  fi
  ok "依赖安装完成"
}

cmd_migrate() {
  [[ -f "$BACKEND_DIR/.env" ]] || die "缺少 backend/.env"
  log "执行数据库迁移"
  (cd "$BACKEND_DIR" && uv run alembic upgrade head)
  ok "迁移完成"
}

cmd_build() {
  log "构建前端"
  (cd "$FRONTEND_DIR" && npm run build)
  [[ -f "$FRONTEND_DIR/dist/index.html" ]] || die "前端构建失败：缺少 dist/index.html"
  ok "前端产物: $FRONTEND_DIR/dist"
}

cmd_install_systemd() {
  need_cmd systemctl
  [[ "$(id -u)" -eq 0 ]] || die "install-systemd 需要 root（请用 sudo）"
  local unit_src="$DEPLOY_DIR/hearthstone-assistant.service"
  local unit_dst="/etc/systemd/system/${SERVICE_NAME}.service"
  [[ -f "$unit_src" ]] || die "缺少 unit 文件: $unit_src"

  local tmp
  tmp="$(mktemp)"
  sed \
    -e "s|/opt/hearthstone-assistant|$APP_ROOT|g" \
    -e "s|User=www-data|User=$SERVICE_USER|g" \
    -e "s|Group=www-data|Group=$SERVICE_USER|g" \
    -e "s|--port 8101|--port $BACKEND_PORT|g" \
    -e "s|--workers 2|--workers $WORKERS|g" \
    "$unit_src" >"$tmp"
  install -m 644 "$tmp" "$unit_dst"
  rm -f "$tmp"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  ok "已安装 systemd 单元: $unit_dst"
  warn "请确认用户 $SERVICE_USER 对 $APP_ROOT 有读/执行权限"
}

pid_start() {
  ensure_dirs
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    warn "后端已在运行 (pid $(cat "$PID_FILE"))"
    return 0
  fi
  log "以 pid 模式启动 uvicorn ($BACKEND_HOST:$BACKEND_PORT)"
  (
    cd "$BACKEND_DIR"
    nohup uv run uvicorn app.main:app \
      --host "$BACKEND_HOST" \
      --port "$BACKEND_PORT" \
      --workers "$WORKERS" \
      >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  sleep 1
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    ok "已启动 pid=$(cat "$PID_FILE")，日志: $LOG_FILE"
  else
    die "启动失败，请查看 $LOG_FILE"
  fi
}

pid_stop() {
  if [[ ! -f "$PID_FILE" ]]; then
    warn "没有 pid 文件，尝试按端口清理"
  else
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      log "停止 pid=$pid"
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # Also stop orphan workers bound to the port when possible
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -tiTCP:"$BACKEND_PORT" -sTCP:LISTEN || true)"
    if [[ -n "${pids:-}" ]]; then
      warn "清理仍占用 $BACKEND_PORT 的进程: $pids"
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
    fi
  fi
  ok "已停止"
}

pid_status() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    ok "运行中 pid=$(cat "$PID_FILE") port=$BACKEND_PORT"
    return 0
  fi
  warn "未运行"
  return 1
}

cmd_start() {
  local mode
  mode="$(detect_run_mode)"
  if [[ "$mode" == "systemd" ]]; then
    need_cmd systemctl
    has_systemd_unit || die "未安装 systemd 单元，请先: sudo $0 install-systemd"
    sudo systemctl start "$SERVICE_NAME"
    ok "systemctl start $SERVICE_NAME"
  else
    pid_start
  fi
}

cmd_stop() {
  local mode
  mode="$(detect_run_mode)"
  if [[ "$mode" == "systemd" ]]; then
    need_cmd systemctl
    sudo systemctl stop "$SERVICE_NAME"
    ok "systemctl stop $SERVICE_NAME"
  else
    pid_stop
  fi
}

cmd_restart() {
  local mode
  mode="$(detect_run_mode)"
  if [[ "$mode" == "systemd" ]]; then
    need_cmd systemctl
    if ! has_systemd_unit; then
      warn "未检测到 systemd 单元，回退到 pid 模式重启"
      pid_stop || true
      pid_start
      return
    fi
    sudo systemctl restart "$SERVICE_NAME"
    ok "systemctl restart $SERVICE_NAME"
  else
    pid_stop || true
    pid_start
  fi
}

cmd_status() {
  local mode
  mode="$(detect_run_mode)"
  if [[ "$mode" == "systemd" ]] && has_systemd_unit; then
    systemctl --no-pager --full status "$SERVICE_NAME" || true
  else
    pid_status || true
  fi
}

cmd_logs() {
  local mode
  mode="$(detect_run_mode)"
  if [[ "$mode" == "systemd" ]] && has_systemd_unit; then
    journalctl -u "$SERVICE_NAME" -n "${1:-100}" -f
  else
    ensure_dirs
    touch "$LOG_FILE"
    tail -n "${1:-100}" -f "$LOG_FILE"
  fi
}

cmd_health() {
  local url="http://${BACKEND_HOST}:${BACKEND_PORT}/api/health"
  log "健康检查 $url"
  if curl -sf "$url" | grep -q ok; then
    ok "health ok"
  else
    die "health 失败"
  fi
}

cmd_deploy() {
  log "开始部署 APP_ROOT=$APP_ROOT"
  cmd_init
  cmd_check

  if [[ "$SKIP_GIT_PULL" != "1" ]] && [[ -d "$APP_ROOT/.git" ]]; then
    if git -C "$APP_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      log "git pull --ff-only"
      git -C "$APP_ROOT" pull --ff-only || warn "git pull 失败（忽略并继续）"
    fi
  else
    warn "跳过 git pull"
  fi

  cmd_deps
  cmd_migrate
  cmd_build
  cmd_restart
  sleep 1
  cmd_health
  ok "部署完成"
  cat <<EOF

下一步（若尚未配置反代）:
  1. 编辑 nginx: 参考 $DEPLOY_DIR/nginx.conf.example
  2. 安装 systemd（可选）: sudo $0 install-systemd && sudo $0 restart
  3. 在牌库页同步官方卡牌数据

EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    help|-h|--help) cmd_help ;;
    init) cmd_init ;;
    check) cmd_check ;;
    deps) cmd_deps ;;
    migrate) cmd_migrate ;;
    build) cmd_build ;;
    install-systemd) cmd_install_systemd ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs "$@" ;;
    health) cmd_health ;;
    deploy) cmd_deploy ;;
    *) die "未知命令: $cmd（执行 $0 help）" ;;
  esac
}

main "$@"
