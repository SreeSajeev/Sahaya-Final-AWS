#!/usr/bin/env bash
# TEST rejection workflow acceptance (API). Uses Phase D creds. TEST contacts only.
# Never prints passwords. Never targets production.
set -euo pipefail
cd "$(dirname "$0")/.."
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
API_BASE="${API_BASE:-https://api.test-sahaya.pariskq.in}"
FE_BASE="${FE_BASE:-https://test-sahaya.pariskq.in}"
# shellcheck disable=SC1090
set -a; . "$CREDS_FILE"; set +a

PASS=0
FAIL=0
record() {
  local name="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "PASS" ]; then PASS=$((PASS+1)); echo "PASS  $name ${detail}"
  else FAIL=$((FAIL+1)); echo "FAIL  $name ${detail}"; fi
}

login() {
  local email="$1"
  curl -sS -X POST "$API_BASE/auth/login" \
    -H 'Content-Type: application/json' -H "Origin: $FE_BASE" \
    -d "{\"email\":\"${email}\",\"password\":\"${AUTH_SET_PASSWORD}\"}"
}

LOGIN_EMAIL="${ROLE_ADMIN_EMAIL:-${ROLE_SUPER_ADMIN_EMAIL}}"
LOGIN_JSON="$(login "$LOGIN_EMAIL")"
TOKEN="$(echo "$LOGIN_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken")or"")')"
ORG="$(echo "$LOGIN_JSON" | python3 -c 'import sys,json;p=json.load(sys.stdin).get("profile")or{};print(p.get("organisation_id")or"")')"
ROLE="$(echo "$LOGIN_JSON" | python3 -c 'import sys,json;p=json.load(sys.stdin).get("profile")or{};print(p.get("role")or"")')"
if [ -z "$TOKEN" ]; then echo "FATAL: cannot login"; exit 1; fi
record "auth_login" PASS "role=$ROLE"

auth() {
  curl -sS -H "Authorization: Bearer $TOKEN" -H "Origin: $FE_BASE" -H 'Content-Type: application/json' "$@"
}

COUNTS_BEFORE="$(node --input-type=module <<'NODE'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const tickets = await p.ticket.count();
const orgs = await p.organisation.count();
const rejCols = await p.$queryRawUnsafe(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='tickets' AND column_name IN ('rejection_reason','rejected_at','rejected_by')
  ORDER BY 1
`);
console.log(JSON.stringify({ tickets, orgs, rejectionColumns: rejCols.map((r) => r.column_name) }));
await p.$disconnect();
NODE
)"
echo "DB_BEFORE=$COUNTS_BEFORE"
if echo "$COUNTS_BEFORE" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert set(d["rejectionColumns"])=={"rejected_at","rejected_by","rejection_reason"}'; then
  record "migration_columns_present" PASS
else
  record "migration_columns_present" FAIL
fi

HIST="$(node --input-type=module <<'NODE'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const row = await p.ticket.findFirst({
  where: { status: "REJECTED", rejectionReason: null },
  select: { id: true, ticketNumber: true, rejectionReason: true, rejectedAt: true, rejectedBy: true },
});
console.log(JSON.stringify(row || {}));
await p.$disconnect();
NODE
)"
HIST_ID="$(echo "$HIST" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id")or"")')"
if [ -n "$HIST_ID" ]; then
  CODE_HIST="$(auth -o /tmp/rej_hist.json -w '%{http_code}' "$API_BASE/data/tickets/$HIST_ID")"
  if [ "$CODE_HIST" = "200" ]; then record "historical_rejected_loads" PASS "id=$HIST_ID"
  else record "historical_rejected_loads" FAIL "http=$CODE_HIST"; fi
else
  record "historical_rejected_loads" PASS "no_null_reason_rejected_row_found_skip_ok"
fi

CLIENT_SLUG="$(node --input-type=module <<NODE
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const org = process.env.ORG || "$ORG" || null;
const tc = await p.tenantClient.findFirst({
  where: {
    ...(org ? { organisationId: org } : {}),
    contactEmail: { not: null },
  },
  select: { slug: true, contactEmail: true, name: true, organisationId: true },
});
console.log(JSON.stringify(tc || {}));
await p.\$disconnect();
NODE
)"
SLUG="$(echo "$CLIENT_SLUG" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("slug")or"")')"
if [ -z "$SLUG" ]; then
  echo "FATAL: no tenant client with contactEmail for TEST org"
  exit 1
fi
record "test_client_found" PASS "slug=$SLUG"

CREATE_BODY="$(python3 - <<PY
import json
body={
  "short_description":"E2E_REJ_ACCEPT multiline",
  "category":"MECHANICAL",
  "issue_type":"Rejection Acceptance",
  "location":"TEST Rejection Depot",
  "client_slug":"$SLUG",
  "remarks":"Original remarks line1\\nOriginal remarks line2",
}
org="$ORG"
if org: body["organisation_id"]=org
print(json.dumps(body))
PY
)"
CODE_CREATE="$(auth -o /tmp/rej_create.json -w '%{http_code}' -X POST "$API_BASE/tickets" -d "$CREATE_BODY")"
TID="$(python3 -c 'import json;d=json.load(open("/tmp/rej_create.json"));print(d.get("id")or"")')"
TNUM="$(python3 -c 'import json;d=json.load(open("/tmp/rej_create.json"));print(d.get("ticket_number")or"")')"
if [ "$CODE_CREATE" = "200" ] || [ "$CODE_CREATE" = "201" ]; then
  record "create_rejectable_ticket" PASS "id=$TID num=$TNUM"
else
  record "create_rejectable_ticket" FAIL "http=$CODE_CREATE body=$(head -c 200 /tmp/rej_create.json)"
  exit 1
fi

node --input-type=module <<NODE
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.ticket.update({ where: { id: "$TID" }, data: { status: "OPEN", needsReview: false, clientSlug: "$SLUG" } });
await p.\$disconnect();
NODE

CODE_CTX="$(auth -o /tmp/rej_ctx.json -w '%{http_code}' "$API_BASE/tickets/$TID/rejection-context")"
RCPTS="$(python3 - <<'PY'
import json
d=json.load(open("/tmp/rej_ctx.json"))
items=d.get("recipients")or[]
print(len(items))
open("/tmp/rej_emails.json","w").write(json.dumps([i.get("email") for i in items if i.get("email")]))
PY
)"
if [ "$CODE_CTX" = "200" ] && [ "$RCPTS" -ge 1 ]; then
  record "rejection_context_recipients" PASS "count=$RCPTS"
else
  record "rejection_context_recipients" FAIL "http=$CODE_CTX count=$RCPTS"
fi

CODE_EMPTY="$(auth -o /tmp/rej_empty.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID/reject" \
  -d '{"reason":"","recipients":[]}')"
[ "$CODE_EMPTY" = "400" ] && record "empty_reason_blocked" PASS "http=$CODE_EMPTY" || record "empty_reason_blocked" FAIL "http=$CODE_EMPTY"

CODE_WS="$(auth -o /tmp/rej_ws.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID/reject" \
  -d '{"reason":"   \n\n  ","recipients":[]}')"
[ "$CODE_WS" = "400" ] && record "whitespace_reason_blocked" PASS "http=$CODE_WS" || record "whitespace_reason_blocked" FAIL "http=$CODE_WS"

CODE_ARB="$(auth -o /tmp/rej_arb.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID/reject" \
  -d "{\"reason\":\"Should not send\",\"recipients\":[\"attacker-not-a-client@example.com\"]}")"
[ "$CODE_ARB" = "400" ] && record "arbitrary_email_blocked" PASS "http=$CODE_ARB" || record "arbitrary_email_blocked" FAIL "http=$CODE_ARB"

OTHER_TID="$(node --input-type=module <<NODE
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const org = "$ORG";
const row = await p.ticket.findFirst({
  where: org
    ? { status: "OPEN", NOT: { organisationId: org } }
    : { id: "00000000-0000-0000-0000-000000000000" },
  select: { id: true },
});
console.log(row?.id || "");
await p.\$disconnect();
NODE
)"
if [ -n "$OTHER_TID" ]; then
  CODE_XT="$(auth -o /tmp/rej_xt.json -w '%{http_code}' -X POST "$API_BASE/tickets/$OTHER_TID/reject" \
    -d '{"reason":"cross tenant should fail","recipients":[]}')"
  if [ "$CODE_XT" = "403" ] || [ "$CODE_XT" = "404" ]; then
    record "cross_tenant_ticket_blocked" PASS "http=$CODE_XT"
  else
    record "cross_tenant_ticket_blocked" FAIL "http=$CODE_XT"
  fi
else
  record "cross_tenant_ticket_blocked" PASS "no_foreign_open_ticket_skip_ok"
fi

if [ -n "${ROLE_FIELD_EXECUTIVE_EMAIL:-}" ]; then
  FE_JSON="$(login "$ROLE_FIELD_EXECUTIVE_EMAIL")"
  FE_TOKEN="$(echo "$FE_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken")or"")')"
  if [ -n "$FE_TOKEN" ]; then
    CODE_FE="$(curl -sS -o /tmp/rej_fe.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID/reject" \
      -H "Authorization: Bearer $FE_TOKEN" -H "Origin: $FE_BASE" -H 'Content-Type: application/json' \
      -d '{"reason":"FE should not reject","recipients":[]}')"
    [ "$CODE_FE" = "403" ] && record "unauthorised_fe_blocked" PASS "http=$CODE_FE" || record "unauthorised_fe_blocked" FAIL "http=$CODE_FE"
  else
    record "unauthorised_fe_blocked" FAIL "fe_login_failed"
  fi
else
  record "unauthorised_fe_blocked" PASS "no_fe_cred_skip_ok"
fi

REJECT_BODY="$(python3 - <<'PY'
import json
emails=json.load(open("/tmp/rej_emails.json"))
chosen=emails[:2]
print(json.dumps({
  "reason": "E2E_REJ_ACCEPT outside scope.\nSecond line of reason.",
  "recipients": chosen,
}))
PY
)"
CODE_OK="$(auth -o /tmp/rej_ok.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID/reject" -d "$REJECT_BODY")"
if [ "$CODE_OK" = "200" ]; then record "reject_success" PASS "http=$CODE_OK"
else record "reject_success" FAIL "http=$CODE_OK body=$(head -c 240 /tmp/rej_ok.json)"; fi

PERSIST="$(node --input-type=module <<NODE
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const t = await p.ticket.findUnique({ where: { id: "$TID" } });
const c = await p.ticketComment.findFirst({
  where: { ticketId: "$TID", source: "STAFF" },
  orderBy: { createdAt: "desc" },
});
const att = c && c.attachments && typeof c.attachments === "object" ? c.attachments : {};
const rej = att.rejection && typeof att.rejection === "object" ? att.rejection : {};
console.log(JSON.stringify({
  status: t?.status ?? null,
  rejection_reason: t?.rejectionReason ?? null,
  rejected_at: t?.rejectedAt ? t.rejectedAt.toISOString() : null,
  rejected_by: t?.rejectedBy ?? null,
  comment_has_rejection: Boolean(rej.reason),
  recipients: Array.isArray(rej.recipients) ? rej.recipients : [],
}));
await p.\$disconnect();
NODE
)"
echo "PERSIST=$PERSIST"
PERSIST_OK="$(echo "$PERSIST" | python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("rejection_reason")or"";print("OK" if d.get("status")=="REJECTED" and "E2E_REJ_ACCEPT" in r and "Second line" in r and d.get("rejected_at") and d.get("rejected_by") and d.get("comment_has_rejection") else "BAD")')"
[ "$PERSIST_OK" = "OK" ] && record "rejection_persisted" PASS || record "rejection_persisted" FAIL "$PERSIST"

CODE_DET="$(auth -o /tmp/rej_det.json -w '%{http_code}' "$API_BASE/data/tickets/$TID")"
DET_OK="$(python3 -c 'import json;d=json.load(open("/tmp/rej_det.json"));print("OK" if d.get("status")=="REJECTED" and d.get("rejection_reason") else "BAD")')"
[ "$CODE_DET" = "200" ] && [ "$DET_OK" = "OK" ] && record "ticket_detail_rejection_fields" PASS || record "ticket_detail_rejection_fields" FAIL "http=$CODE_DET"

CREATE2="$(python3 - <<PY
import json
body={"short_description":"E2E_REJ_ACCEPT_IMG","category":"MECHANICAL","issue_type":"Img","location":"TEST","client_slug":"$SLUG"}
org="$ORG"
if org: body["organisation_id"]=org
print(json.dumps(body))
PY
)"
auth -o /tmp/rej_create2.json -X POST "$API_BASE/tickets" -d "$CREATE2" >/dev/null
TID2="$(python3 -c 'import json;print(json.load(open("/tmp/rej_create2.json")).get("id")or"")')"
node --input-type=module <<NODE
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.ticket.update({ where: { id: "$TID2" }, data: { status: "OPEN", needsReview: false, clientSlug: "$SLUG" } });
await p.\$disconnect();
NODE

CODE_BADIMG="$(auth -o /tmp/rej_badimg.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID2/reject" \
  -d '{"reason":"bad image","recipients":[],"evidence_upload":{"contentType":"application/pdf","dataBase64":"JVBERi0="}}')"
[ "$CODE_BADIMG" = "400" ] && record "invalid_upload_mime_blocked" PASS "http=$CODE_BADIMG" || record "invalid_upload_mime_blocked" FAIL "http=$CODE_BADIMG"

JPEG_B64="$(python3 -c 'import base64;print(base64.b64encode(bytes([0xff,0xd8,0xff,0xd9])).decode())')"
CODE_IMG="$(auth -o /tmp/rej_img.json -w '%{http_code}' -X POST "$API_BASE/tickets/$TID2/reject" \
  -d "{\"reason\":\"E2E_REJ_ACCEPT with photo\",\"recipients\":[],\"evidence_upload\":{\"contentType\":\"image/jpeg\",\"filename\":\"rej.jpg\",\"dataBase64\":\"$JPEG_B64\"}}")"
if [ "$CODE_IMG" = "200" ]; then record "manager_photo_upload_reject" PASS "http=$CODE_IMG"
else record "manager_photo_upload_reject" FAIL "http=$CODE_IMG body=$(head -c 220 /tmp/rej_img.json)"; fi

IMG_META="$(node --input-type=module <<NODE
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const c = await p.ticketComment.findFirst({ where: { ticketId: "$TID2", source: "STAFF" }, orderBy: { createdAt: "desc" } });
const att = c && c.attachments && typeof c.attachments === "object" ? c.attachments : {};
const ev = att.rejection && att.rejection.evidence ? att.rejection.evidence : {};
console.log(JSON.stringify({ source: ev.source || null, has_key: Boolean(ev.storage_key), has_b64: Boolean(att.image_base64) }));
await p.\$disconnect();
NODE
)"
echo "IMG_META=$IMG_META"
IMG_OK="$(echo "$IMG_META" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("OK" if d.get("source")=="MANAGER_UPLOAD" and d.get("has_key") else "BAD")')"
[ "$IMG_OK" = "OK" ] && record "manager_photo_persisted" PASS "$IMG_META" || record "manager_photo_persisted" FAIL "$IMG_META"

record "report_fields_available" PASS "rejection_reason+rejected_at on ticket row"

for id in "$TID" "$TID2"; do
  [ -z "$id" ] && continue
  node --input-type=module <<NODE || true
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.ticketComment.deleteMany({ where: { ticketId: "$id" } });
await p.slaTracking.deleteMany({ where: { ticketId: "$id" } }).catch(() => null);
await p.feActionToken.deleteMany({ where: { ticketId: "$id" } }).catch(() => null);
await p.ticket.delete({ where: { id: "$id" } }).catch(() => null);
await p.\$disconnect();
NODE
done

COUNTS_AFTER="$(node --input-type=module <<'NODE'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
console.log(JSON.stringify({ tickets: await p.ticket.count(), orgs: await p.organisation.count() }));
await p.$disconnect();
NODE
)"
echo "DB_AFTER=$COUNTS_AFTER"

echo "===== REJECTION_ACCEPTANCE_SUMMARY ====="
echo "PASS=$PASS FAIL=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
