#!/usr/bin/env bash
# =============================================================================
# Deploy drp-payment di server (jalankan di direktori repo, bukan dari GitHub).
#
#   git pull → npm ci (kalau perlu) → build web (kalau perlu)
#            → prisma generate + migrate (kalau perlu) → restart PM2 → health check
#
# Aman dijalankan berulang kali. Setiap langkah expensive hanya jalan kalau
# berkasnya benar-benar berubah; status deploy disimpan di .deploy-state.
#
# Opsi:
#   --status       hanya tampilkan status, tidak mengubah apa pun
#   --dry-run      tampilkan rencana tanpa menjalankan
#   --force        rebuild semuanya walau tidak ada perubahan
#   --allow-dirty  buang perubahan lokal pada file tracked. Usually needed on
#                  the first run when the server still has rsync leftovers.
#   --yes          tidak tanya konfirmasi
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATE_FILE="$ROOT/.deploy-state"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/health}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-60}"
LOCK_FILE="$ROOT/.deploy.lock"

FORCE=0
DRY_RUN=0
ALLOW_DIRTY=0
ASSUME_YES=0
STATUS_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --status)       STATUS_ONLY=1 ;;
    --dry-run)      DRY_RUN=1 ;;
    --force)        FORCE=1 ;;
    --allow-dirty)  ALLOW_DIRTY=1 ;;
    --yes|-y)       ASSUME_YES=1 ;;
    -h|--help)      sed -n '3,20p' "$0" | sed 's/^#\( \)\?//'; exit 0 ;;
    *) echo "Opsi tidak dikenal: $arg (lihat --help)" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- output ----
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_C=$'\033[36m'
else
  C_RESET=""; C_B=""; C_G=""; C_Y=""; C_R=""; C_C=""
fi
log()  { printf '%s==>%s %s\n' "$C_C" "$C_RESET" "$*"; }
ok()   { printf '%s  OK%s %s\n' "$C_G" "$C_RESET" "$*"; }
skip() { printf '%s  --%s %s\n' "$C_Y" "$C_RESET" "$*"; }
warn() { printf '%s  !!%s %s\n' "$C_Y" "$C_RESET" "$*" >&2; }
die()  { printf '%s  XX%s %s\n' "$C_R" "$C_RESET" "$*" >&2; exit 1; }

confirm() {
  [[ "$ASSUME_YES" -eq 1 || "$DRY_RUN" -eq 1 ]] && return 0
  local reply
  read -r -p "  Lanjutkan? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# ------------------------------------------------- re-exec as the app user ----
# PM2 punya daemon per user. Kalau script dijalankan sebagai root, pm2 yang
# disentil akan membuat instance PM2 yang berbeda dari yang dipakai aplikasi
# (biasanya milik user non-root). Jadi teruskan ke user aplikasi itu.
DEPLOY_APP_USER="${DEPLOY_APP_USER:-$(id -un)}"
if [[ "$(id -u)" -eq 0 && "$DEPLOY_APP_USER" != "root" && -z "${DEPLOY_REEXEC:-}" ]]; then
  echo "==> Menjalankan ulang sebagai user '$DEPLOY_APP_USER' (supaya pm2 instance-nya sama)"
  exec env DEPLOY_REEXEC=1 DEPLOY_APP_USER="$DEPLOY_APP_USER" \
    sudo -u "$DEPLOY_APP_USER" -H bash "$ROOT/scripts/deploy.sh" "$@"
fi

# ------------------------------------------------------------------ lock ----
# Cegah dua deploy berjalan bersamaan (mis. cron + manual).
if [[ -e "$LOCK_FILE" && ! -w "$LOCK_FILE" ]]; then
  die "Lock file $LOCK_FILE ada tapi tidak bisa ditulis oleh user $(id -un).
  Kemungkinan pernah dibuat oleh user lain/root. Perbaiki dengan:
    sudo rm -f $LOCK_FILE"
fi
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  die "Deploy lain sedang berjalan. Hapus $LOCK_FILE hanya jika yakin tidak ada proses deploy aktif."
fi

# --------------------------------------------------------------- git base ---
git rev-parse --git-dir >/dev/null 2>&1 || die "Bukan direktori git: $ROOT"

CURRENT_COMMIT="$(git rev-parse HEAD)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

state_get() {
  [[ -f "$STATE_FILE" ]] || { echo ""; return; }
  sed -n "s/^$1=//p" "$STATE_FILE" | tail -n1
}
DEPLOYED_COMMIT="$(state_get DEPLOYED_COMMIT)"
DEPLOYED_BE_LOCK="$(state_get BACKEND_LOCK_HASH)"
DEPLOYED_WEB_LOCK="$(state_get WEB_LOCK_HASH)"
DEPLOYED_SCHEMA="$(state_get SCHEMA_HASH)"
DEPLOYED_MIGRATIONS="$(state_get MIGRATIONS_HASH)"

hash_of() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1; }
hash_dir() { find "$1" -type f -name '*.sql' -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -d' ' -f1; }

# --------------------------------------------------------------- status -----
if [[ "$STATUS_ONLY" -eq 1 ]]; then
  git fetch --quiet origin "$BRANCH" || warn "fetch gagal (offline?)"
  REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "?")"
  printf '  %-18s %s\n' "Deploy dir"      "$ROOT"
  printf '  %-18s %s\n' "Branch"          "$CURRENT_BRANCH (target: $BRANCH)"
  printf '  %-18s %s\n' "HEAD sekarang"   "$(git log -1 --format='%h %s' "$CURRENT_COMMIT")"
  printf '  %-18s %s\n' "Deploy terakhir" "${DEPLOYED_COMMIT:-<belum pernah>}"
  printf '  %-18s %s\n' "origin/$BRANCH"  "$(git log -1 --format='%h %s' "$REMOTE_COMMIT" 2>/dev/null || echo '?')"
  if [[ "$DEPLOYED_COMMIT" == "$REMOTE_COMMIT" ]]; then
    printf '  %-18s %s\n' "Status" "UP TO DATE"
  elif [[ -z "$DEPLOYED_COMMIT" ]]; then
    printf '  %-18s %s\n' "Status" "BELUM PERNAH DI-DEPLOY (jalankan ./scripts/deploy.sh)"
  else
    printf '  %-18s %s\n' "Status" "ADA PERUBAHAN YANG BELUM DI-DEPLOY ($(git rev-list --count "$DEPLOYED_COMMIT..$REMOTE_COMMIT" 2>/dev/null || echo '?') commit)"
  fi
  exit 0
fi

# ------------------------------------------------------------ preflight -----
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  die "Harus di branch '$BRANCH', sekarang '$CURRENT_BRANCH'."
fi
[[ -f "$ROOT/backend/.env" ]] || die "backend/.env tidak ada. Deploy butuh konfigurasi itu."

# Override manual selalu menang: DEPLOY_NODE_BIN=/path/ke/node
resolve_bin() {
  local name="$1" override_var="${2:-}"
  if [[ -n "$override_var" && -n "${!override_var:-}" && -x "${!override_var}" ]]; then
    echo "${!override_var}"; return 0
  fi
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  local hit nvm_root
  for dir in /www/server/nodejs/*/bin /www/server/panel/pyenv/bin; do
    [[ -x "$dir/$name" ]] && { echo "$dir/$name"; return 0; }
  done
  for nvm_root in "${NVM_DIR:-}" "$HOME/.nvm" /root/.nvm /usr/local/nvm; do
    [[ -z "$nvm_root" ]] && continue
    hit="$(ls -d "$nvm_root"/versions/node/*/bin/"$name" 2>/dev/null | sort -V | tail -n1 || true)"
    [[ -n "$hit" && -x "$hit" ]] && { echo "$hit"; return 0; }
  done
  for dir in /usr/local/bin /usr/bin /opt/node/bin /opt/*/bin; do
    [[ -x "$dir/$name" ]] && { echo "$dir/$name"; return 0; }
  done
  return 1
}

if ! NODE_BIN="$(resolve_bin node DEPLOY_NODE_BIN)"; then
  die "node tidak ditemukan.
  Yang dicek: PATH, /www/server/nodejs/*/bin, ~/.nvm/versions/node/*/bin,
              /usr/local/bin, /usr/bin, /opt/*/bin
  Kalau node ada di tempat lain, set manual:
    DEPLOY_NODE_BIN=/path/ke/node ./scripts/deploy.sh
  Untuk melihat node milik user ini:
    $(id -un) -lc 'command -v node; node -v'"
fi
NPM_BIN="$(resolve_bin npm DEPLOY_NPM_BIN)" || die "npm tidak ditemukan (di sebelah node: $(dirname "$NODE_BIN"))."
PM2_BIN="$(resolve_bin pm2 DEPLOY_PM2_BIN || true)"
if [[ -z "$PM2_BIN" && "$DRY_RUN" -eq 0 ]]; then
  die "pm2 tidak ditemukan."
fi
export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN")${PM2_BIN:+:$(dirname "$PM2_BIN")}:$PATH"
PM2_NAME="${DEPLOY_PM2_NAME:-drp-payment}"
log "node $(node -v) · npm $(npm -v)${PM2_BIN:+ · pm2 $(pm2 -v 2>/dev/null)}"

# --------------------------------------------------------------- fetch ------
log "Fetch origin/$BRANCH"
git fetch --quiet origin "$BRANCH"
TARGET_COMMIT="$(git rev-parse "origin/$BRANCH")"

# ------------------------------------------------------- working tree -------
DIRTY="$(git status --porcelain --untracked-files=normal || true)"
BLOCKERS="$(git status --porcelain | awk '{print $2}' | while read -r f; do
             git cat-file -e "$TARGET_COMMIT:$f" 2>/dev/null && echo "$f"
           done || true)"

if [[ -n "$DIRTY" ]]; then
  warn "Working tree punya perubahan lokal:"
  printf '%s\n' "$DIRTY" | sed 's/^/       /' | head -20
  if [[ -n "$BLOCKERS" ]]; then
    warn "File berikut akan tertimpa oleh versi repo:"
    printf '%s\n' "$BLOCKERS" | sed 's/^/       /' | head -20
  fi
  if [[ "$ALLOW_DIRTY" -eq 1 ]]; then
    warn "Membuang perubahan lokal (--allow-dirty). File gitignored (.env, uploads/, backups/, node_modules/) tidak disentuh."
    confirm || die "Dibatalkan."
    if [[ "$DRY_RUN" -eq 0 ]]; then
      git reset --hard "$TARGET_COMMIT" --quiet
      git clean -fdq
    fi
  else
    die "Bersihkan dulu, atau jalankan ulang dengan --allow-dirty."
  fi
fi

if [[ "$CURRENT_COMMIT" == "$TARGET_COMMIT" ]]; then
  ok "Sudah di commit terbaru ($(git log -1 --format='%h %s'))"
else
  log "Pull ${CURRENT_COMMIT:0:7} → ${TARGET_COMMIT:0:7}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    git log --oneline "$CURRENT_COMMIT..$TARGET_COMMIT" | sed 's/^/       /'
  else
    git merge --ff-only "origin/$BRANCH" --quiet
  fi
fi

# ----------------------------------------------------------------- plan -----
# Tentukan apa yang perlu dikerjakan dari selisih commit.
BASE="$DEPLOYED_COMMIT"
if [[ "$FORCE" -eq 1 || -z "$BASE" ]]; then
  FIRST_RUN=1
  BASE=""
elif ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  warn "Commit hasil deploy sebelumnya ($BASE) tidak ada di repo ini — perlakukan sebagai deploy pertama."
  FIRST_RUN=1
  BASE=""
else
  FIRST_RUN=0
fi

changed_files() {
  if [[ "$FIRST_RUN" -eq 1 || "$FORCE" -eq 1 ]]; then echo "__all__"; return; fi
  git diff --name-only "$BASE" "$TARGET_COMMIT"
}
CHANGED="$(changed_files)"

touches() { [[ "$CHANGED" == "__all__" ]] && return 0; printf '%s\n' "$CHANGED" | grep -qE "$1"; }

NEED_BE_DEPS=0; NEED_WEB_DEPS=0; NEED_WEB_BUILD=0; NEED_GENERATE=0; NEED_MIGRATE=0; NEED_OPENAPI=0

if [[ "$FIRST_RUN" -eq 1 || "$FORCE" -eq 1 ]]; then
  NEED_BE_DEPS=1; NEED_WEB_DEPS=1; NEED_WEB_BUILD=1; NEED_GENERATE=1; NEED_MIGRATE=1; NEED_OPENAPI=1
  PLAN_REASON="deploy pertama"
else
  touches '^backend/package(-lock)?\.json$'                        && NEED_BE_DEPS=1
  touches '^web/package(-lock)?\.json$'                             && NEED_WEB_DEPS=1
  touches '^web/(src|public)/|^web/(index\.html|vite\.config|tsconfig|env\.d\.ts|components\.json)' && NEED_WEB_BUILD=1
  touches '^backend/prisma/schema\.prisma$'                         && NEED_GENERATE=1
  touches '^backend/prisma/migrations/'                              && NEED_MIGRATE=1
  # dist/openapi.json diprioritaskan swagger.js di atas spec runtime, jadi
  # harus di-regenerate setiap route/spec berubah — kalau tidak, /api/docs
  # akan menyajikan versi lama.
  touches '^backend/src/(routes/|swagger\.js|app\.js)'              && NEED_OPENAPI=1
  PLAN_REASON="perubahan sejak commit ${BASE:0:7}"
fi

# node_modules mungkin rusak/terhapus → tetap install kalau marker hilang.
BE_LOCK="$(hash_of backend/package-lock.json)"
WEB_LOCK="$(hash_of web/package-lock.json)"
SCHEMA_HASH="$(hash_of backend/prisma/schema.prisma)"
MIGRATIONS_HASH="$(hash_dir backend/prisma/migrations)"
[[ -d backend/node_modules/express ]]              || NEED_BE_DEPS=1
[[ -d web/node_modules/vite ]]                      || NEED_WEB_DEPS=1
[[ -f web/dist/index.html ]]                        || NEED_WEB_BUILD=1

log "Rencana ($PLAN_REASON)"
printf '     %-28s %s\n' "npm ci backend"  "$([[ $NEED_BE_DEPS   -eq 1 ]] && echo 'JAU' || echo 'skip')"
printf '     %-28s %s\n' "npm ci web"      "$([[ $NEED_WEB_DEPS  -eq 1 ]] && echo 'JAU' || echo 'skip')"
printf '     %-28s %s\n' "build web"       "$([[ $NEED_WEB_BUILD -eq 1 ]] && echo 'JAU' || echo 'skip')"
printf '     %-28s %s\n' "prisma generate" "$([[ $NEED_GENERATE -eq 1 ]] && echo 'JAU' || echo 'skip')"
printf '     %-28s %s\n' "prisma migrate"  "$([[ $NEED_MIGRATE  -eq 1 ]] && echo 'JAU' || echo 'skip')"
printf '     %-28s %s\n' "openapi spec"    "$([[ $NEED_OPENAPI   -eq 1 ]] && echo 'JAU' || echo 'skip')"
printf '     %-28s %s\n' "pm2 restart"     "selalu"

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "Dry run — tidak ada yang dieksekusi."
  exit 0
fi

# --------------------------------------------------------------- install ----
run_be_deps() {
  log "npm ci (backend)"
  (cd backend && npm ci --no-audit --no-fund)
}
run_web_deps() {
  log "npm ci (web)"
  (cd web && npm ci --no-audit --no-fund)
}

if [[ "$NEED_BE_DEPS" -eq 1 ]]; then run_be_deps; else skip "npm ci backend (lockfile tidak berubah)"; fi
if [[ "$NEED_WEB_DEPS" -eq 1 ]]; then run_web_deps; else skip "npm ci web (lockfile tidak berubah)"; fi

# ----------------------------------------------------------------- build ----
if [[ "$NEED_WEB_BUILD" -eq 1 ]]; then
  log "Build web (vite)"
  (cd web && npm run build)
  [[ -f web/dist/index.html ]] || die "Build web gagal — web/dist/index.html tidak ada."
  ok "web/dist siap"
else
  skip "build web (tidak ada perubahan di web/src)"
fi

# ---------------------------------------------------------------- prisma ----
if [[ "$NEED_OPENAPI" -eq 1 || ! -f backend/dist/openapi.json ]]; then
  log "Generate OpenAPI spec"
  (cd backend && npm run openapi)
  ok "backend/dist/openapi.json diperbarui"
else
  skip "generate openapi spec (route & swagger tidak berubah)"
fi

if [[ "$NEED_GENERATE" -eq 1 || ! -d backend/node_modules/.prisma ]]; then
  log "prisma generate"
  (cd backend && npx prisma generate)
else
  skip "prisma generate (schema tidak berubah)"
fi

if [[ "$NEED_MIGRATE" -eq 1 || ! -f "$STATE_FILE" ]]; then
  log "prisma migrate deploy"
  (cd backend && npx prisma migrate deploy)
else
  skip "prisma migrate deploy (tidak ada migration baru)"
fi

# ----------------------------------------------------------------- state ----
cat > "$STATE_FILE" <<EOF
DEPLOYED_COMMIT=$TARGET_COMMIT
BACKEND_LOCK_HASH=$BE_LOCK
WEB_LOCK_HASH=$WEB_LOCK
SCHEMA_HASH=$SCHEMA_HASH
MIGRATIONS_HASH=$MIGRATIONS_HASH
DEPLOYED_AT=$(date -Is)
EOF
ok "State deploy ditulis (.deploy-state)"

# ------------------------------------------------------------------ pm2 -----
log "Restart PM2: $PM2_NAME"
mkdir -p backend/uploads/merchants web/dist

# Backend berjalan dari src/server.js, bukan lagi bundle dist/server.cjs.
# `pm2 restart` mempertahankan script path yang sedang berjalan, jadi kalau
# PM2 masih memegang bundle lama, restart akan terus menjalankan kode lama
# sementara web/ sudah baru — gejalanya route baru balas 404. Karena itu
# bandingkan script path yang benar-benar berjalan dengan yang diminta
# ecosystem, dan recreate prosesnya kalau beda.
expected_script="$(sed -n 's/.*script: path.join(__dirname, "\([^"]*\)".*/\1/p' backend/ecosystem.config.cjs | head -1)"
expected_path="$ROOT/backend/${expected_script:-src/server.js}"
running_path=""
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  running_path="$(pm2 describe "$PM2_NAME" 2>/dev/null \
    | sed -n 's/.*script path *│ *\(.*[^ ]\) *│$/\1/p' | head -1)"
fi

if [[ -n "$running_path" && "$running_path" != "$expected_path" ]]; then
  warn "PM2 sedang menjalankan $running_path"
  warn "Ekosistem sekarang memakai $expected_path — proses akan dibuat ulang."
  pm2 delete "$PM2_NAME" || true
  pm2 start backend/ecosystem.config.cjs
elif [[ -n "$running_path" ]]; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start backend/ecosystem.config.cjs
fi
pm2 save --quiet 2>/dev/null || true

# Bundle lama tidak lagi dipakai dan berbahaya kalau suatu saat ter-start
# lagi. dist/ tetap dipakai untuk openapi.json.
if [[ -f backend/dist/server.cjs ]]; then
  rm -f backend/dist/server.cjs
  ok "Bundle lama backend/dist/server.cjs dihapus"
fi

# ---------------------------------------------------------- health check ----
PORT="$(sed -n 's/^PORT=//p' backend/.env | head -1 | tr -d '"'"'"' ' | head -1)"
PORT="${PORT:-8081}"
log "Health check http://127.0.0.1:$PORT$HEALTH_PATH (timeout ${HEALTH_TIMEOUT}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
healthy=0
while [[ "$(date +%s)" -lt "$deadline" ]]; do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT$HEALTH_PATH" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  warn "Health check GAGAL. 20 baris log terakhir:"
  pm2 logs "$PM2_NAME" --lines 20 --nostream 2>/dev/null || true
  die "Deploy dianggap gagal. Periksa log di atas."
fi

ok "Deploy ${TARGET_COMMIT:0:7} live di http://127.0.0.1:$PORT"
pm2 describe "$PM2_NAME" 2>/dev/null | grep -E "status|restarts|uptime" | sed 's/^/     /' || true
