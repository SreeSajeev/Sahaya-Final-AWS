#!/usr/bin/env bash
# Phase F orchestrator — TEST EC2 only.
set -euo pipefail
cd "$(dirname "$0")/../.."
MODE="${1:-help}"
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
export CREDS_FILE API_BASE="${API_BASE:-https://api.test-sahaya.pariskq.in}"
export FE_BASE="${FE_BASE:-https://test-sahaya.pariskq.in}"
export PHASE_F_OUT="${PHASE_F_OUT:-/var/backups/sahaya/phase-f}"
mkdir -p "$PHASE_F_OUT"
chmod 700 "$PHASE_F_OUT" || true

case "$MODE" in
  soak_start)
    HOURS="${SOAK_HOURS:-6}"
    export SOAK_DURATION_SEC=$((HOURS * 3600))
    export SOAK_INTERVAL_SEC="${SOAK_INTERVAL_SEC:-20}"
    export SOAK_LABEL="${SOAK_LABEL:-soak6h}"
    # Stop prior soak if any
    if [ -f "$PHASE_F_OUT/${SOAK_LABEL}.pid" ]; then
      old="$(cat "$PHASE_F_OUT/${SOAK_LABEL}.pid" || true)"
      if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
        echo "Stopping prior soak pid=$old"
        kill "$old" || true
        sleep 2
      fi
    fi
    nohup node scripts/phase-f/soak.mjs \
      >"$PHASE_F_OUT/${SOAK_LABEL}.stdout.log" 2>&1 &
    echo $! >"$PHASE_F_OUT/${SOAK_LABEL}.pid"
    echo "SOAK_STARTED pid=$(cat "$PHASE_F_OUT/${SOAK_LABEL}.pid") hours=$HOURS label=$SOAK_LABEL"
    ;;
  soak_dense)
    # High-frequency ~60m soak for immediate leak signals
    export SOAK_DURATION_SEC="${SOAK_DURATION_SEC:-3600}"
    export SOAK_INTERVAL_SEC="${SOAK_INTERVAL_SEC:-8}"
    export SOAK_LABEL="${SOAK_LABEL:-soak_dense_1h}"
    node scripts/phase-f/soak.mjs
    ;;
  soak_status)
    LABEL="${SOAK_LABEL:-soak6h}"
    echo "===== SOAK STATUS label=$LABEL ====="
    if [ -f "$PHASE_F_OUT/${LABEL}.pid" ]; then
      pid="$(cat "$PHASE_F_OUT/${LABEL}.pid")"
      if kill -0 "$pid" 2>/dev/null; then
        echo "running pid=$pid"
      else
        echo "pid_file_stale pid=$pid"
      fi
    else
      echo "no_pid_file"
    fi
    if [ -f "$PHASE_F_OUT/${LABEL}-summary.json" ]; then
      echo "SUMMARY_PRESENT"
      node -e "const s=require('$PHASE_F_OUT/${LABEL}-summary.json'); console.log(JSON.stringify({cycles:s.cycles,durationSec:s.durationSec,counters:s.counters,memoryGrowthHint:s.memoryGrowthHint,latencyKeys:Object.keys(s.latency||{})},null,2))"
    else
      echo "NO_SUMMARY_YET"
      if [ -f "$PHASE_F_OUT/${LABEL}-metrics.jsonl" ]; then
        lines=$(wc -l <"$PHASE_F_OUT/${LABEL}-metrics.jsonl" | tr -d ' ')
        echo "metrics_lines=$lines"
        tail -n 1 "$PHASE_F_OUT/${LABEL}-metrics.jsonl" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify({ts:j.ts,elapsedSec:j.elapsedSec,counters:j.counters,mem:j.host?.memUsedMb,pm2mem:j.host?.pm2?.memory,pg:j.host?.pgConnections},null,2))})"
      fi
    fi
    ;;
  soak_analyze)
    node scripts/phase-f/soak-analyze.mjs
    ;;
  account_audit)
    node scripts/phase-f/account-audit.mjs
    ;;
  activation_fixture)
    node scripts/phase-f/validate-activation-fixture.mjs
    ;;
  historical_audit)
    node scripts/phase-f/historical-data-audit.mjs
    ;;
  historical_api_probe)
    node scripts/phase-f/historical-api-probe.mjs
    ;;
  load)
    export LOAD_CONCURRENCY="${LOAD_CONCURRENCY:-15}"
    export LOAD_ROUNDS="${LOAD_ROUNDS:-4}"
    node scripts/phase-f/load.mjs
    ;;
  security)
    node scripts/phase-f/security.mjs
    ;;
  session)
    node scripts/phase-f/session-lifecycle.mjs
    ;;
  passwords)
    node scripts/phase-f/password-coverage.mjs
    ;;
  observability)
    node scripts/phase-f/observability.mjs
    ;;
  dr)
    chmod +x scripts/acceptance-backup-restore.sh scripts/phase-f/dr-verify.sh
    bash scripts/phase-f/dr-verify.sh
    ;;
  all_except_long_soak)
    bash "$0" passwords
    bash "$0" session
    bash "$0" security
    bash "$0" load
    bash "$0" observability
    bash "$0" soak_dense
    bash "$0" dr
    ;;
  help|*)
    echo "Usage: $0 {soak_start|soak_dense|soak_status|soak_analyze|account_audit|activation_fixture|load|security|session|passwords|observability|dr|all_except_long_soak}"
    exit 1
    ;;
esac
