#!/usr/bin/env bash
# Controlled restart of ONLY sahaya-migration-db. Confirm required.
set -euo pipefail
echo "===== BEFORE COUNTS ====="
docker exec sahaya-migration-db psql -U postgres -d sahaya -tAc \
  "SELECT 'users='||COUNT(*) FROM users; SELECT 'tickets='||COUNT(*) FROM tickets; SELECT 'orgs='||COUNT(*) FROM organisations;"
echo "===== HEALTH BEFORE ====="
curl -sS http://127.0.0.1:4100/health || true; echo
echo "===== RESTART CONTAINER ====="
docker restart sahaya-migration-db
for i in $(seq 1 40); do
  if docker exec sahaya-migration-db pg_isready -U postgres >/dev/null 2>&1; then
    echo "pg_ready attempt=$i"
    break
  fi
  sleep 2
done
sleep 3
echo "===== AFTER COUNTS ====="
docker exec sahaya-migration-db psql -U postgres -d sahaya -tAc \
  "SELECT 'users='||COUNT(*) FROM users; SELECT 'tickets='||COUNT(*) FROM tickets; SELECT 'orgs='||COUNT(*) FROM organisations;"
echo "===== API RECONNECT ====="
for i in $(seq 1 20); do
  CODE=$(curl -sS -o /tmp/pg_restart_health.json -w '%{http_code}' http://127.0.0.1:4100/health || echo 000)
  if [[ "$CODE" == "200" ]]; then
    echo "API_OK attempt=$i"; cat /tmp/pg_restart_health.json; echo
    break
  fi
  echo "API wait attempt=$i code=$CODE"
  # bounce API if needed after long DB gap
  if [[ "$i" == "8" ]]; then
    pm2 restart sahaya-final-aws-monorepo-api --update-env || true
  fi
  sleep 3
done
echo "PG_RESTART_DONE"
