#!/usr/bin/env bash
# Phase F DR verify: backup + restore counts + live smoke (login/tickets/proofs metadata).
# TEST only. Does not overwrite pre-migration backups.
set -euo pipefail
cd "$(dirname "$0")/../.."
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
PHASE_F_OUT="${PHASE_F_OUT:-/var/backups/sahaya/phase-f}"
mkdir -p "$PHASE_F_OUT"
START=$(date +%s)

echo "===== DR BACKUP+RESTORE ====="
chmod +x scripts/acceptance-backup-restore.sh
bash scripts/acceptance-backup-restore.sh | tee "$PHASE_F_OUT/dr-backup-restore.log"
RESTORE_EXIT=${PIPESTATUS[0]}

echo "===== DR LIVE SMOKE (post-backup, live DB) ====="
# shellcheck disable=SC1090
set -a; . "$CREDS_FILE"; set +a
API_BASE="${API_BASE:-https://api.test-sahaya.pariskq.in}"
ORIGIN="${FE_BASE:-https://test-sahaya.pariskq.in}"

LOGIN=$(curl -sS -c /tmp/dr_cookies.txt -b /tmp/dr_cookies.txt -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"email\":\"${ROLE_SUPER_ADMIN_EMAIL}\",\"password\":\"${AUTH_SET_PASSWORD}\"}")
TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).accessToken||'')}catch{console.log('')}})")
if [ -z "$TOKEN" ]; then
  echo "DR_LOGIN=FAIL"
  LOGIN_OK=0
else
  echo "DR_LOGIN=PASS"
  LOGIN_OK=1
fi

TIX=$(curl -sS -o /tmp/dr_tix.json -w '%{http_code}' "$API_BASE/data/tickets?limit=5" \
  -H "Authorization: Bearer $TOKEN" -H "Origin: $ORIGIN")
echo "DR_TICKETS_HTTP=$TIX"
node -e "
const d=require('/tmp/dr_tix.json');
const items=d.items||[];
console.log('DR_TICKETS_COUNT='+items.length);
"

# Proofs metadata: any comment with proof_storage_paths
node --input-type=module <<'NODE'
import "dotenv/config";
import { prisma } from "./src/db/prisma.js";
import fs from "node:fs";
const n = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM ticket_comments
  WHERE attachments ? 'proof_storage_paths'
`);
const c = Number(n?.[0]?.c || 0);
console.log("DR_PROOF_META_ROWS="+c);
const sample = await prisma.$queryRawUnsafe(`
  SELECT id, ticket_id FROM ticket_comments
  WHERE attachments ? 'proof_storage_paths'
  ORDER BY created_at DESC LIMIT 1
`);
fs.writeFileSync("/tmp/dr_proof_sample.json", JSON.stringify(sample?.[0] || {}));
await prisma.$disconnect();
NODE

if [ -s /tmp/dr_proof_sample.json ]; then
  CID=$(node -e "const j=require('/tmp/dr_proof_sample.json');console.log(j.id||'')")
  TID=$(node -e "const j=require('/tmp/dr_proof_sample.json');console.log(j.ticket_id||'')")
  if [ -n "$CID" ] && [ -n "$TID" ] && [ -n "$TOKEN" ]; then
    PRESIGN=$(curl -sS -o /tmp/dr_presign.json -w '%{http_code}' \
      "$API_BASE/data/tickets/$TID/comments/$CID/proofs/0/url" \
      -H "Authorization: Bearer $TOKEN" -H "Origin: $ORIGIN")
    echo "DR_PRESIGN_HTTP=$PRESIGN"
  else
    echo "DR_PRESIGN_HTTP=skip"
  fi
fi

END=$(date +%s)
DUR=$((END - START))
cat >"$PHASE_F_OUT/dr-summary.json" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "restoreScriptExit": $RESTORE_EXIT,
  "durationSec": $DUR,
  "liveLoginOk": $LOGIN_OK,
  "ticketsHttp": $TIX,
  "rollbackNotes": [
    "Keep dump under /var/backups/sahaya/acceptance/<timestamp>/",
    "Restore into temporary container first (acceptance-backup-restore.sh)",
    "To rollback live TEST: stop API, restore dump into sahaya-migration-db after explicit CONFIRM, restart API",
    "Never restore TEST dumps into production",
    "S3 objects in sahaya-test-fe-proofs are independent of PG restore — verify keys still exist after DB rollback"
  ]
}
EOF
echo "DR_DURATION_SEC=$DUR"
echo "DR_SUMMARY=$PHASE_F_OUT/dr-summary.json"
echo "DR_DONE"
exit "$RESTORE_EXIT"
