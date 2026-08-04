#!/usr/bin/env bash
# Run Playwright full-platform acceptance against TEST.
# Loads Phase D bootstrap creds when CREDS_FILE is present (EC2).
# Never prints passwords.
set -euo pipefail
cd "$(dirname "$0")"

CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
if [ -f "$CREDS_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$CREDS_FILE"; set +a
  export E2E_SUPER_ADMIN_EMAIL="${ROLE_SUPER_ADMIN_EMAIL:-}"
  export E2E_SUPER_ADMIN_PASSWORD="${AUTH_SET_PASSWORD:-}"
  export E2E_ADMIN_EMAIL="${ROLE_ADMIN_EMAIL:-}"
  export E2E_ADMIN_PASSWORD="${AUTH_SET_PASSWORD:-}"
  export E2E_STAFF_EMAIL="${ROLE_STAFF_EMAIL:-}"
  export E2E_STAFF_PASSWORD="${AUTH_SET_PASSWORD:-}"
  export E2E_FE_EMAIL="${ROLE_FIELD_EXECUTIVE_EMAIL:-}"
  export E2E_FE_PASSWORD="${AUTH_SET_PASSWORD:-}"
fi

export E2E_BASE_URL="${E2E_BASE_URL:-https://test-sahaya.pariskq.in}"
export E2E_API_URL="${E2E_API_URL:-https://api.test-sahaya.pariskq.in}"
export E2E_SKIP_WEB_SERVER="${E2E_SKIP_WEB_SERVER:-1}"

if [ ! -d node_modules ]; then
  npm ci || npm install
fi
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

npm run acceptance
echo "Report: docs/migration/playwright-acceptance-report.md"
