#!/usr/bin/env bash
# EC2 deployment body — invoked by .github/workflows/deploy-test.yml after git reset.
# Kept in-repo so appleboy/ssh-action does not inject DRONE_SSH lines into multiline shell/awk.
set -euo pipefail

MONOREPO="${MONOREPO:-/var/www/apps/sahaya-final-aws-monorepo}"
PM2_NAME="${PM2_NAME:-sahaya-final-aws-monorepo-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://api.sahaya.pariskq.in/health}"

print_diagnostics() {
  echo "========================"
  echo "DEPLOYMENT FAILED — diagnostics"
  echo "========================"
  echo "--- git rev-parse HEAD ---"
  git -C "$MONOREPO" rev-parse HEAD 2>/dev/null || true
  echo "--- git status ---"
  git -C "$MONOREPO" status 2>/dev/null || true
  echo "--- backend/.env flags (non-secret keys only) ---"
  grep -E '^(NODE_ENV|PORT|DB_MODE|APP_BASE_URL|PASSWORD_RESET_DRY_RUN|MAIL_DRY_RUN|PUBLIC_OTP_ALLOW_SMS_SKIP|ENFORCE_TENANT_GUARD)=' \
    "$MONOREPO/backend/.env" 2>/dev/null || true
  echo "--- port 4100 ---"
  ss -ltnp 2>/dev/null | grep 4100 || true
  echo "--- pm2 status ---"
  pm2 status 2>/dev/null || true
  echo "--- pm2 logs (last 100) ---"
  pm2 logs "$PM2_NAME" --lines 100 --nostream 2>/dev/null || true
}

trap 'print_diagnostics' ERR

cd "$MONOREPO"

# --- Env file helpers (safe for URL/special-char values; no sed replacement) ---

ensure_env_flag() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp="${file}.deploy_tmp.$$"

  echo "Upserting ${key} in ${file}..."

  if [ -z "${key}" ]; then
    echo "FATAL: ensure_env_flag called with empty key (file=${file})" >&2
    return 1
  fi

  local dir
  dir="$(dirname "$file")"
  if [ ! -d "$dir" ]; then
    echo "FATAL: missing directory ${dir} for key=${key}" >&2
    return 1
  fi
  if [ ! -f "$file" ]; then
    echo "Creating missing env file ${file} (key=${key})"
    touch "$file"
  fi

  if ! awk -v k="$key" -v v="$value" '
    BEGIN { updated = 0 }
    substr($0, 1, length(k) + 1) == k "=" { print k "=" v; updated = 1; next }
    { print }
    END { if (!updated) print k "=" v }
  ' "$file" > "$tmp"; then
    echo "FATAL: awk upsert failed for key=${key} file=${file}" >&2
    rm -f "$tmp"
    return 1
  fi
  if ! mv "$tmp" "$file"; then
    echo "FATAL: could not write ${file} for key=${key}" >&2
    rm -f "$tmp"
    return 1
  fi

  echo "Set ${key} in ${file}"
}

remove_env_key() {
  local file="$1"
  local key="$2"
  local tmp="${file}.deploy_tmp.$$"

  if [ ! -f "$file" ]; then
    return 0
  fi
  if ! grep -q "^${key}=" "$file"; then
    return 0
  fi
  if ! grep -v "^${key}=" "$file" > "$tmp"; then
    echo "FATAL: remove_env_key failed for key=${key} file=${file}" >&2
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$file"
  echo "Removed ${key} from ${file}"
}

ensure_secret_once() {
  local file="$1"
  local key="$2"

  if [ ! -f "$file" ]; then
    echo "FATAL: missing env file ${file} for secret key=${key}" >&2
    return 1
  fi
  if grep -q "^${key}=.\+" "$file"; then
    echo "Keeping existing ${key}"
    return 0
  fi
  local val
  val="$(openssl rand -base64 48 | tr -d '\n')"
  ensure_env_flag "$file" "$key" "$val"
  echo "Generated ${key} in ${file}"
}

warn_if_missing() {
  local file="$1"
  local key="$2"
  local label="$3"
  if [ ! -f "$file" ]; then
    return 0
  fi
  if ! grep -q "^${key}=.\+" "$file"; then
    echo "WARNING: ${label} (${key}) is not set in ${file} — may fail at runtime" >&2
  fi
}

require_env_key() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ] || ! grep -q "^${key}=.\+" "$file"; then
    echo "FATAL: required ${key} missing in ${file}" >&2
    return 1
  fi
}

apply_deploy_env() {
  echo "========================"
  echo "Applying deployment environment"
  echo "========================"

  # Backend — production safety + canonical URLs
  ensure_env_flag backend/.env NODE_ENV production
  ensure_env_flag backend/.env DB_MODE prisma
  ensure_env_flag backend/.env PORT 4100
  ensure_env_flag backend/.env APP_BASE_URL 'https://sahaya.pariskq.in'
  ensure_env_flag backend/.env PASSWORD_RESET_REDIRECT_URL 'https://sahaya.pariskq.in/reset-password'
  ensure_env_flag backend/.env PASSWORD_RESET_DRY_RUN false
  ensure_env_flag backend/.env MAIL_DRY_RUN false
  ensure_env_flag backend/.env PUBLIC_OTP_ALLOW_SMS_SKIP false
  ensure_env_flag backend/.env S3_FE_PROOFS_BUCKET sahaya-test-fe-proofs
  ensure_env_flag backend/.env S3_FE_PROOFS_ENABLED true
  ensure_env_flag backend/.env AWS_REGION ap-south-1
  ensure_env_flag backend/.env PHASE_A_DB_PROBE_ENABLED false
  ensure_env_flag backend/.env AUTH_COOKIE_DOMAIN '.sahaya.pariskq.in'
  ensure_env_flag backend/.env AUTH_COOKIE_SECURE true
  ensure_env_flag backend/.env AUTH_COOKIE_SAMESITE lax
  # Keep test SPA origin during cutover verification (APP_BASE_URL already allows prod FE).
  ensure_env_flag backend/.env AUTH_CORS_ORIGINS 'https://test-sahaya.pariskq.in,https://sahaya.pariskq.in'
  ensure_env_flag backend/.env JWT_ACCESS_TTL_SEC 900
  ensure_env_flag backend/.env JWT_REFRESH_TTL_SEC 604800
  ensure_env_flag backend/.env PASSWORD_RESET_TOKEN_TTL_SEC 3600
  ensure_env_flag backend/.env PROVISION_SERVER_SIDE_ENABLED true
  ensure_env_flag backend/.env ENFORCE_TENANT_GUARD true
  ensure_env_flag backend/.env TENANT_CLIENTS_ENABLED true
  ensure_env_flag backend/.env RATE_LIMIT_LOGIN_MAX 200

  # Frontend build-time URLs
  ensure_env_flag frontend/.env VITE_APP_BASE_URL 'https://sahaya.pariskq.in'
  ensure_env_flag frontend/.env VITE_CRM_API_URL 'https://api.sahaya.pariskq.in'
  ensure_env_flag frontend/.env VITE_TENANT_CLIENTS_ENABLED true

  # Remove legacy Supabase keys (Prisma-only on EC2)
  remove_env_key backend/.env SUPABASE_URL
  remove_env_key backend/.env SUPABASE_ANON_KEY
  remove_env_key backend/.env SUPABASE_SERVICE_ROLE_KEY
  remove_env_key backend/.env SHARED_SUPABASE_MUTATIONS_DISABLED
  remove_env_key frontend/.env VITE_SUPABASE_URL
  remove_env_key frontend/.env VITE_SUPABASE_ANON_KEY
  remove_env_key frontend/.env VITE_SUPABASE_PUBLISHABLE_KEY
  remove_env_key frontend/.env VITE_SHARED_SUPABASE_MUTATIONS_DISABLED

  # Preserve existing JWT secrets; generate only if absent
  ensure_secret_once backend/.env JWT_ACCESS_SECRET
  ensure_secret_once backend/.env JWT_REFRESH_SECRET

  warn_if_missing backend/.env POSTMARK_SERVER_TOKEN "Postmark server token"
  warn_if_missing backend/.env FROM_EMAIL "From email (FROM_EMAIL)"
  warn_if_missing backend/.env MAIL_FROM_EMAIL "From email (MAIL_FROM_EMAIL)"
  warn_if_missing backend/.env DATABASE_URL "Database URL"
  warn_if_missing backend/.env PUBLIC_OTP_HMAC_SECRET "Public OTP HMAC secret"

  require_env_key backend/.env DATABASE_URL
  require_env_key backend/.env NODE_ENV
  require_env_key backend/.env PORT

  grep -qx 'NODE_ENV=production' backend/.env
  grep -qx 'PASSWORD_RESET_DRY_RUN=false' backend/.env
  grep -qx 'MAIL_DRY_RUN=false' backend/.env
  grep -qx 'PUBLIC_OTP_ALLOW_SMS_SKIP=false' backend/.env
  grep -qx 'PORT=4100' backend/.env
}

load_backend_env_for_pm2() {
  # .env may contain legacy unquoted values; disable nounset while sourcing.
  set +u
  set -a
  # shellcheck disable=SC1091
  source "$MONOREPO/backend/.env"
  set +a
  set -u
}

restart_pm2_with_env() {
  echo "========================"
  echo "Restarting PM2"
  echo "========================"
  cd "$MONOREPO/backend"
  load_backend_env_for_pm2
  pm2 restart "$PM2_NAME" --update-env
}

run_health_checks() {
  echo "========================"
  echo "Running health checks"
  echo "========================"

  local health_ok=false
  local i
  for i in $(seq 1 30); do
    if curl --fail --silent --show-error "$HEALTH_URL"; then
      echo
      echo "Local health check OK (attempt ${i}/30)"
      health_ok=true
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "Local health check failed after 30 attempts" >&2
      print_diagnostics
      exit 1
    fi
    sleep 2
  done

  if [ "$health_ok" != "true" ]; then
    print_diagnostics
    exit 1
  fi

  if curl --fail --silent --show-error "$PUBLIC_HEALTH_URL" >/dev/null; then
    echo "Public API health check OK (${PUBLIC_HEALTH_URL})"
  else
    echo "WARNING: public API health check failed (${PUBLIC_HEALTH_URL}) — local health passed" >&2
  fi
}

# --- Main deploy sequence ---

echo "========================"
echo "Sahaya EC2 deploy script"
echo "revision=$(git -C "$MONOREPO" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "========================"

apply_deploy_env

echo "========================"
echo "Installing backend + migrations"
echo "========================"

cd "$MONOREPO/backend"
npm install

echo "========================"
echo "Generating Prisma Client"
echo "========================"

npx prisma generate

echo "========================"
echo "Running Prisma migrations"
echo "========================"

if ! npx prisma migrate deploy; then
  echo "migrate deploy failed — baselining Phase D auth migration if needed"
  npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260802160000_phase_d_local_auth/migration.sql
  npx prisma migrate resolve --applied 20260802160000_phase_d_local_auth
  if ! npx prisma migrate deploy; then
    echo "FATAL: prisma migrate deploy failed after baseline retry — aborting deploy" >&2
    exit 1
  fi
fi

echo "========================"
echo "Building frontend"
echo "========================"

cd "$MONOREPO/frontend"
npm install
npm run build

echo "========================"
echo "Publishing frontend"
echo "========================"

rm -rf /var/www/test-sahaya/*
cp -R dist/* /var/www/test-sahaya/

restart_pm2_with_env

echo "========================"
echo "Reloading nginx"
echo "========================"

systemctl reload nginx

run_health_checks

trap - ERR

echo "========================"
echo "DEPLOYMENT SUCCESS"
echo "revision=$(git -C "$MONOREPO" rev-parse HEAD)"
echo "========================"
