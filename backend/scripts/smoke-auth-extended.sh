#!/usr/bin/env bash
# TEST EC2 only. Reads /var/backups/sahaya/phase-d-auth/test-local-passwords.env
# Does not print passwords. Does not touch Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
. "$CREDS_FILE"
set +a

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

redact() {
  python3 -c 'import sys; e=sys.argv[1]; local,domain=e.split("@",1); print(local[:2]+"***@"+domain)' "$1"
}

for ROLE in SUPER_ADMIN ADMIN STAFF FIELD_EXECUTIVE; do
  EVAL="ROLE_${ROLE}_EMAIL"
  EMAIL="${!EVAL:-}"
  [ -n "$EMAIL" ] || { echo "SKIP $ROLE"; continue; }
  echo "SMOKE login role=$ROLE email=$(redact "$EMAIL")"
  RESP="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST http://127.0.0.1:4100/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${AUTH_SET_PASSWORD}\"}")"
  echo "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); p=d.get("profile") or {}; print("ok", bool(d.get("accessToken")), "role", p.get("role"), "err", d.get("error"))'
  TOKEN="$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("accessToken") or "")')"
  [ -n "$TOKEN" ] || continue
  curl -sS http://127.0.0.1:4100/auth/me -H "Authorization: Bearer $TOKEN" \
    | python3 -c 'import sys,json; p=(json.load(sys.stdin).get("profile") or {}); print("me", p.get("role"), bool(p.get("id")))'
  code="$(curl -sS -o /tmp/tix.json -w "%{http_code}" "http://127.0.0.1:4100/data/tickets?limit=5" -H "Authorization: Bearer $TOKEN")"
  echo "tickets_http=$code"
done

echo "===== EXTENDED: refresh rotate + logout ====="
SA_EMAIL="${ROLE_SUPER_ADMIN_EMAIL}"
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST http://127.0.0.1:4100/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${SA_EMAIL}\",\"password\":\"${AUTH_SET_PASSWORD}\"}" >/tmp/sa_login.json
OLD_REFRESH="$(awk -F'\t' '$6=="sahaya_refresh"{print $7}' "$COOKIE_JAR" | tr -d '\r' | tail -1)"
REF1="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST http://127.0.0.1:4100/auth/refresh -H 'Content-Type: application/json' -d '{}')"
echo "$REF1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("refresh1", bool(d.get("accessToken")), "err", d.get("error"))'
if [ -n "${OLD_REFRESH}" ]; then
  OLD="$(curl -sS -X POST http://127.0.0.1:4100/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"${OLD_REFRESH}\"}")"
  echo "$OLD" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("old_refresh_rejected", (not d.get("accessToken")), "err", d.get("error"))'
fi
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST http://127.0.0.1:4100/auth/logout -H 'Content-Type: application/json' -d '{}' >/tmp/logout.json
REF2="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST http://127.0.0.1:4100/auth/refresh -H 'Content-Type: application/json' -d '{}')"
echo "$REF2" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("post_logout_refresh_fail", (not d.get("accessToken")), "err", d.get("error"))'

echo "===== EXTENDED: tenant isolation ====="
ADM_EMAIL="${ROLE_ADMIN_EMAIL}"
ADM="$(curl -sS -X POST http://127.0.0.1:4100/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"${ADM_EMAIL}\",\"password\":\"${AUTH_SET_PASSWORD}\"}")"
ADM_TOKEN="$(echo "$ADM" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("accessToken") or "")')"
ADM_ORG="$(echo "$ADM" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("profile") or {}).get("organisation_id") or "")')"
curl -sS -o /tmp/adm_tix.json -w "%{http_code}" "http://127.0.0.1:4100/data/tickets?limit=50" -H "Authorization: Bearer $ADM_TOKEN" >/tmp/adm_code.txt
python3 - <<PY
import json
adm_org = """$ADM_ORG"""
code = open("/tmp/adm_code.txt").read().strip()
data = json.load(open("/tmp/adm_tix.json"))
items = data.get("items") or data.get("tickets") or data.get("data") or []
if isinstance(data, list):
    items = data
foreign = [t for t in items if isinstance(t, dict) and t.get("organisation_id") and t.get("organisation_id") != adm_org]
print("tenant_tickets_http", code, "count", len(items) if isinstance(items, list) else "n/a", "foreign", len(foreign))
PY

echo "===== EXTENDED: proof presign if available ====="
echo "$ADM_TOKEN" > /tmp/adm_token.txt
node --input-type=module <<'NODE'
import { prisma } from "./src/db/prisma.js";
import fs from "node:fs";
const token = fs.readFileSync("/tmp/adm_token.txt", "utf8").trim();
const comments = await prisma.$queryRawUnsafe(`
  SELECT id, ticket_id, attachments
  FROM ticket_comments
  WHERE attachments ? 'proof_storage_paths'
  LIMIT 20
`);
let chosen = null;
for (const c of comments) {
  const paths = c.attachments?.proof_storage_paths;
  if (Array.isArray(paths) && paths.length > 0 && typeof paths[0] === "string") {
    chosen = c;
    break;
  }
}
if (!chosen) {
  console.log("proof_sample=none");
  await prisma.$disconnect();
  process.exit(0);
}
console.log("proof_sample", { ticketId: chosen.ticket_id, commentId: chosen.id });
const url = `http://127.0.0.1:4100/data/tickets/${chosen.ticket_id}/comments/${chosen.id}/proofs/0/url`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const body = await res.json().catch(() => ({}));
const href = body?.url || null;
let host = null;
try { host = href ? new URL(href).host : null; } catch { host = null; }
console.log("proof_url_http", res.status, "hasUrl", Boolean(href), "host", host);
if (href && String(href).includes("sahaya-test-fe-proofs")) console.log("proof_bucket=sahaya-test-fe-proofs");
if (href && String(href).includes("crm-pariskq")) console.log("PROOF_FAIL crm-pariskq");
await prisma.$disconnect();
NODE

echo "SMOKE_EXTENDED_DONE"
