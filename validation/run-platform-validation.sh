#!/usr/bin/env bash
# Sahaya-Final-AWS — full platform validation runner
# Usage (from repo root or anywhere):
#   ./validation/run-platform-validation.sh
# Optional:
#   PV_STRESS=1 PV_TICKET_COUNT=200 ./validation/run-platform-validation.sh
#   SKIP_UNIT=1 SKIP_E2E=1 ./validation/run-platform-validation.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
E2E="$ROOT/e2e"
REPORT_DIR="$ROOT/validation/reports"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
JSON_OUT="$REPORT_DIR/platform-validation-$STAMP.json"
MD_OUT="$REPORT_DIR/platform-validation-$STAMP.md"
HTML_OUT="$REPORT_DIR/platform-validation-$STAMP.html"
LATEST_MD="$REPORT_DIR/LATEST.md"
LATEST_HTML="$REPORT_DIR/LATEST.html"

mkdir -p "$REPORT_DIR"

echo "========================"
echo "Sahaya Platform Validation"
echo "root=$ROOT"
echo "stamp=$STAMP"
echo "========================"

cd "$BACKEND"

if [[ -f .env.test ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "WARN: DATABASE_URL is empty — DB-backed suites will skip via describeIfDb"
fi

declare -a RESULTS=()

run_step() {
  local name="$1"
  shift
  echo ""
  echo "========================"
  echo "Running: $name"
  echo "========================"
  local start end code
  start=$(date +%s)
  set +e
  "$@"
  code=$?
  set -e
  end=$(date +%s)
  RESULTS+=("$name|$code|$((end - start))")
  if [[ $code -ne 0 ]]; then
    echo "FAILED: $name (exit $code)"
  else
    echo "OK: $name ($((end - start))s)"
  fi
  return 0
}

if [[ "${SKIP_UNIT:-0}" != "1" ]]; then
  run_step "unit" npm test
fi
if [[ "${SKIP_REPO:-0}" != "1" ]]; then
  run_step "repo" npm run test:repo
fi
if [[ "${SKIP_INTEGRATION:-0}" != "1" ]]; then
  run_step "integration" npm run test:integration
fi
run_step "platform-validation" npm run test:platform-validation

if [[ "${SKIP_E2E:-1}" != "1" && -d "$E2E" && -f "$E2E/package.json" ]]; then
  run_step "e2e" bash -c "cd \"$E2E\" && npm test"
fi

# Build report via node
RESULTS_BLOB="$(printf '%s\n' "${RESULTS[@]}")"
node "$ROOT/validation/generate-report.mjs" \
  --stamp "$STAMP" \
  --json "$JSON_OUT" \
  --md "$MD_OUT" \
  --html "$HTML_OUT" \
  --results "$RESULTS_BLOB"

cp "$MD_OUT" "$LATEST_MD"
cp "$HTML_OUT" "$LATEST_HTML"

echo ""
echo "========================"
echo "Reports written"
echo "  $MD_OUT"
echo "  $HTML_OUT"
echo "  $LATEST_MD"
echo "========================"

FAILED=0
for row in "${RESULTS[@]}"; do
  name="${row%%|*}"
  rest="${row#*|}"
  code="${rest%%|*}"
  if [[ "$code" != "0" ]]; then
    echo "Suite failed: $name (exit $code)"
    FAILED=1
  fi
done

exit "$FAILED"
