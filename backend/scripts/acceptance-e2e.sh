#!/usr/bin/env bash
# TEST acceptance E2E using Phase D bootstrap creds. No password printing. No Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
API_BASE="${API_BASE:-https://api.test-sahaya.pariskq.in}"
# shellcheck disable=SC1090
set -a; . "$CREDS_FILE"; set +a
COOKIE_JAR="$(mktemp)"; trap 'rm -f "$COOKIE_JAR" /tmp/e2e_*.json' EXIT

redact(){ python3 -c 'import sys;e=sys.argv[1];l,d=e.split("@",1);print(l[:2]+"***@"+d)' "$1"; }

login() {
  local email="$1"
  # Fresh jar per login so role cookies do not collide.
  : > "$COOKIE_JAR"
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API_BASE/auth/login" \
    -H 'Content-Type: application/json' -H 'Origin: https://test-sahaya.pariskq.in' \
    -d "{\"email\":\"${email}\",\"password\":\"${AUTH_SET_PASSWORD}\"}" || true
}

echo "===== AUTH wrong password ====="
BAD="$(curl -sS -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ROLE_SUPER_ADMIN_EMAIL}\",\"password\":\"DefinitelyWrong1!\"}" || true)"
echo "$BAD" | python3 -c 'import sys,json
raw=sys.stdin.read().strip()
d=json.loads(raw) if raw else {}
print("wrong_pw",d.get("error"), "no_token", not d.get("accessToken"))'

echo "===== ROLE MATRIX ====="
declare -A TOKENS
for ROLE in SUPER_ADMIN ADMIN STAFF FIELD_EXECUTIVE; do
  EVAL="ROLE_${ROLE}_EMAIL"; EMAIL="${!EVAL:-}"
  [ -n "$EMAIL" ] || { echo "SKIP $ROLE"; continue; }
  sleep 1
  RESP="$(login "$EMAIL")"
  if [ -z "$RESP" ]; then
    echo "login $ROLE FAIL empty_body"
    TOKENS[$ROLE]=""
    continue
  fi
  echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);p=d.get("profile")or{};print("login",p.get("role"),bool(d.get("accessToken")),"org", "set" if p.get("organisation_id") else "null")'
  TOKENS[$ROLE]="$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken")or"")')"
done

SA="${TOKENS[SUPER_ADMIN]}"
ADM="${TOKENS[ADMIN]}"
STA="${TOKENS[STAFF]}"
FE="${TOKENS[FIELD_EXECUTIVE]}"

probe() {
  local label="$1" token="$2" path="$3"
  code="$(curl -sS -o /tmp/e2e_body.json -w '%{http_code}' "$API_BASE$path" -H "Authorization: Bearer $token" -H 'Origin: https://test-sahaya.pariskq.in')"
  echo "$label http=$code path=$path"
  if [ "$code" != "200" ] && [ "$code" != "401" ] && [ "$code" != "403" ] && [ "$code" != "404" ]; then
    python3 -c 'import json;d=json.load(open("/tmp/e2e_body.json"));print("ERR_BODY",d.get("error") or d)' 2>/dev/null || echo "ERR_BODY_raw $(head -c 200 /tmp/e2e_body.json)"
  fi
}

echo "===== AUTHENTICATED READS ====="
probe SA_me "$SA" /auth/me
probe SA_tickets "$SA" '/data/tickets?limit=5'
probe SA_orgs "$SA" '/data/organisations?limit=20'
probe SA_users "$SA" '/data/users?limit=20'
probe SA_sla "$SA" '/data/sla/monitor?limit=5'
probe SA_orgs_stats "$SA" '/data/organisations/stats'
probe SA_tickets_list_legacy "$SA" '/tickets?limit=5'
probe SA_sla_tracked "$SA" '/data/sla/tracked-count'
probe ADM_tickets "$ADM" '/data/tickets?limit=50'
probe ADM_users "$ADM" '/data/users?limit=20'
probe STA_tickets "$STA" '/data/tickets?limit=20'
probe FE_me "$FE" /auth/me
probe FE_tickets "$FE" '/data/tickets?limit=20'
probe logged_out_reject "" '/data/tickets?limit=1' || true
code="$(curl -sS -o /dev/null -w '%{http_code}' "$API_BASE/data/tickets?limit=1")"
echo "unauth_tickets http=$code"

echo "===== TENANT ISOLATION (ADMIN tickets foreign) ====="
python3 - <<PY
import json,urllib.request,os
api=os.environ.get('API_BASE','https://api.test-sahaya.pariskq.in')
# reuse ADM from file written below
PY
echo "$ADM" > /tmp/e2e_adm.token
ADM_ORG="$(echo "$(login "${ROLE_ADMIN_EMAIL}")" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("profile")or{}).get("organisation_id")or"")')"
curl -sS -o /tmp/e2e_adm_tix.json "$API_BASE/data/tickets?limit=100" -H "Authorization: Bearer $ADM"
python3 - <<PY
import json
adm_org="$ADM_ORG"
data=json.load(open("/tmp/e2e_adm_tix.json"))
items=data.get("items") or data.get("tickets") or data.get("data") or []
if isinstance(data, list): items=data
foreign=[t for t in items if isinstance(t,dict) and t.get("organisation_id") and t.get("organisation_id")!=adm_org]
print("admin_ticket_count", len(items) if isinstance(items,list) else "n/a", "foreign", len(foreign), "org_set", bool(adm_org))
# IDOR: if we have a ticket id from SA list, try as ADMIN against another org ticket
PY

curl -sS -o /tmp/e2e_sa_tix.json "$API_BASE/data/tickets?limit=100" -H "Authorization: Bearer $SA"
python3 - <<PY
import json,urllib.request
adm_org="$ADM_ORG"
adm_token=open("/tmp/e2e_adm.token").read().strip()
api="$API_BASE"
sa=json.load(open("/tmp/e2e_sa_tix.json"))
items=sa.get("items") or sa.get("tickets") or sa.get("data") or []
if isinstance(sa,list): items=sa
foreign_ids=[t.get("id") for t in items if isinstance(t,dict) and t.get("organisation_id") and t.get("organisation_id")!=adm_org and t.get("id")]
print("candidate_foreign_ids", len(foreign_ids))
if foreign_ids and adm_token:
  tid=foreign_ids[0]
  req=urllib.request.Request(f"{api}/data/tickets/{tid}", headers={"Authorization": f"Bearer {adm_token}"})
  try:
    with urllib.request.urlopen(req) as r:
      print("idor_foreign_ticket", r.status, "LEAK")
  except Exception as e:
    code=getattr(e,"code",None)
    print("idor_foreign_ticket", code or str(e)[:80], "blocked" if code in (403,404) else "check")
PY

echo "===== REFRESH / LOGOUT ====="
login "${ROLE_SUPER_ADMIN_EMAIL}" >/tmp/e2e_sa_login.json
REF="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API_BASE/auth/refresh" -H 'Content-Type: application/json' -d '{}')"
echo "$REF" | python3 -c 'import sys,json
raw=sys.stdin.read().strip(); d=json.loads(raw) if raw else {}
print("refresh",bool(d.get("accessToken")))'
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API_BASE/auth/logout" -H 'Content-Type: application/json' -d '{}' >/dev/null || true
REF2="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API_BASE/auth/refresh" -H 'Content-Type: application/json' -d '{}' || true)"
echo "$REF2" | python3 -c 'import sys,json
raw=sys.stdin.read().strip(); d=json.loads(raw) if raw else {}
print("post_logout_refresh_fail", not d.get("accessToken"), d.get("error"))'

echo "===== SAFE WRITE (create TEST ticket if allowed) ====="
# Prefer STAFF create if endpoint exists
CREATE_CODE="$(curl -sS -o /tmp/e2e_create.json -w '%{http_code}' -X POST "$API_BASE/tickets" \
  -H "Authorization: Bearer $STA" -H 'Content-Type: application/json' \
  -d '{"short_description":"E2E_TEST_ACCEPTANCE_MARKER","category":"OTHER","issue_type":"OTHER","priority_level":"LOW","status":"OPEN"}' || true)"
echo "create_ticket_http=$CREATE_CODE"
python3 - <<'PY'
import json
try:
  d=json.load(open("/tmp/e2e_create.json"))
  print("create_keys", list(d.keys())[:12], "error", d.get("error"), "id", (d.get("item") or d.get("ticket") or d).get("id") if isinstance(d.get("item") or d.get("ticket") or d, dict) else None)
except Exception as e:
  print("create_parse", e)
PY

echo "===== PROOF FIXTURE SEARCH ====="
node --input-type=module <<'NODE'
import { prisma } from "./src/db/prisma.js";
const n = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM ticket_comments WHERE attachments ? 'proof_storage_paths'`);
console.log("comments_with_proof_storage_paths", n[0].c);
const sample = await prisma.$queryRawUnsafe(`
  SELECT id, ticket_id FROM ticket_comments
  WHERE attachments ? 'proof_storage_paths' LIMIT 3
`);
console.log("proof_samples", sample.length);
await prisma.$disconnect();
NODE

echo "ACCEPTANCE_E2E_DONE"
