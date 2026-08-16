#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.deploy.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.deploy.env"
  set +a
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST (or create .deploy.env from .deploy.env.example)}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH}"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_APP_USER="${DEPLOY_APP_USER:-www}"
DEPLOY_PM2_NAME="${DEPLOY_PM2_NAME:-drp-payment}"
SSH_KEY="${DEPLOY_SSH_KEY:-}"
RELEASE="${ROOT}/release"

if [[ ! -f "$RELEASE/web/dist/index.html" || ! -f "$RELEASE/backend/dist/server.cjs" ]]; then
  echo "release/ is incomplete. Run: npm run pack:release" >&2
  exit 1
fi

SSH_OPTS=(-p "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_KEY" ]]; then
  SSH_KEY="${SSH_KEY/#\~/$HOME}"
  SSH_OPTS+=(-i "$SSH_KEY")
fi

RSYNC_SSH="ssh ${SSH_OPTS[*]}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

echo ">> Sync web/dist → ${REMOTE}:${DEPLOY_PATH}/web/dist"
# P .user.ini keeps aaPanel's immutable file from being deleted.
rsync -az --delete \
  --filter 'P .user.ini' \
  --exclude '.user.ini' \
  -e "$RSYNC_SSH" \
  "$RELEASE/web/dist/" \
  "${REMOTE}:${DEPLOY_PATH}/web/dist/"

echo ">> Sync backend/dist"
rsync -az --delete \
  -e "$RSYNC_SSH" \
  "$RELEASE/backend/dist/" \
  "${REMOTE}:${DEPLOY_PATH}/backend/dist/"

echo ">> Sync prisma schema + migrations"
rsync -az --delete \
  -e "$RSYNC_SSH" \
  "$RELEASE/backend/prisma/" \
  "${REMOTE}:${DEPLOY_PATH}/backend/prisma/"

echo ">> Sync ecosystem.config.cjs"
rsync -az \
  -e "$RSYNC_SSH" \
  "$RELEASE/backend/ecosystem.config.cjs" \
  "${REMOTE}:${DEPLOY_PATH}/backend/"

echo ">> Sync backend/node_modules (Prisma only)"
rsync -az --delete \
  -e "$RSYNC_SSH" \
  "$RELEASE/backend/node_modules/" \
  "${REMOTE}:${DEPLOY_PATH}/backend/node_modules/"

echo ">> Migrate, clean leftover node_modules, restart"
# ssh joins remote argv with spaces and the remote shell parses again, so a
# value like `pm2 restart drp-payment` must not sit unquoted on the ssh line.
{
  printf 'export DEPLOY_PATH=%q\n' "$DEPLOY_PATH"
  printf 'export DEPLOY_APP_USER=%q\n' "${DEPLOY_APP_USER:-www}"
  printf 'export DEPLOY_PM2_NAME=%q\n' "${DEPLOY_PM2_NAME:-drp-payment}"
  cat <<'REMOTE'
set -euo pipefail
DEPLOY_APP_USER="${DEPLOY_APP_USER:-www}"
DEPLOY_PM2_NAME="${DEPLOY_PM2_NAME:-drp-payment}"

resolve_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return
  fi
  local hit nvm_root
  hit="$(ls -d /www/server/nodejs/*/bin/"$name" 2>/dev/null | sort -V | tail -n1 || true)"
  if [[ -n "$hit" && -x "$hit" ]]; then
    echo "$hit"
    return
  fi
  for nvm_root in "${NVM_DIR:-}" "/home/${DEPLOY_APP_USER}/.nvm" "$HOME/.nvm" /root/.nvm; do
    [[ -z "$nvm_root" ]] && continue
    hit="$(ls -d "$nvm_root"/versions/node/*/bin/"$name" 2>/dev/null | sort -V | tail -n1 || true)"
    if [[ -n "$hit" && -x "$hit" ]]; then
      echo "$hit"
      return
    fi
  done
  for candidate in "/usr/local/bin/$name" "/usr/bin/$name"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
}

NODE_BIN="$(resolve_bin node)"
PM2_BIN="$(resolve_bin pm2)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node not found. Install Node or add it to PATH for non-interactive SSH." >&2
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):${PM2_BIN:+$(dirname "$PM2_BIN"):}$PATH"
echo "Using node: $NODE_BIN"
if [[ -n "$PM2_BIN" ]]; then
  echo "Using pm2: $PM2_BIN"
fi
echo "SSH user: $(id -un); app user: $DEPLOY_APP_USER"

as_app() {
  if [[ "$(id -un)" == "$DEPLOY_APP_USER" ]]; then
    "$@"
  elif [[ "$(id -u)" -eq 0 ]]; then
    sudo -u "$DEPLOY_APP_USER" -H env PATH="$PATH" HOME="/home/$DEPLOY_APP_USER" "$@"
  else
    "$@"
  fi
}

if [[ "$(id -u)" -eq 0 ]]; then
  chown -R "$DEPLOY_APP_USER:$DEPLOY_APP_USER" \
    "$DEPLOY_PATH/backend/dist" \
    "$DEPLOY_PATH/backend/prisma" \
    "$DEPLOY_PATH/backend/ecosystem.config.cjs" \
    "$DEPLOY_PATH/backend/node_modules"
  find "$DEPLOY_PATH/web/dist" ! -name '.user.ini' \
    -exec chown "$DEPLOY_APP_USER:$DEPLOY_APP_USER" {} +
fi

cd "$DEPLOY_PATH/backend"
if [[ ! -f .env ]]; then
  echo "Missing $DEPLOY_PATH/backend/.env — create it on the server before deploy." >&2
  exit 1
fi

as_app "$NODE_BIN" ./node_modules/.bin/prisma migrate deploy

# Leftover from old git-based deploys — not needed with bundled release.
rm -rf "$DEPLOY_PATH/web/node_modules" \
       "$DEPLOY_PATH/node_modules"

if [[ -z "$PM2_BIN" ]]; then
  echo "pm2 not found; start dist/server.cjs manually." >&2
  exit 1
fi

# `pm2 restart` keeps the original script (src/server.js).
# Delete and start from ecosystem so production always runs dist/server.cjs.
as_app "$PM2_BIN" delete "$DEPLOY_PM2_NAME" || true
as_app "$PM2_BIN" start "$DEPLOY_PATH/backend/ecosystem.config.cjs"
as_app "$PM2_BIN" save
echo "PM2 $DEPLOY_PM2_NAME now running backend/dist/server.cjs"
REMOTE
} | ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s

echo ">> Deploy finished"
