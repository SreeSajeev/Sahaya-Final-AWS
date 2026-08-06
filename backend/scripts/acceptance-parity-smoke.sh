#!/usr/bin/env bash
# TEST-only post-divergence parity smoke (JWT + Prisma + S3). No Supabase. No password printing.
# Creates disposable fixtures tagged E2E_PARITY_ and cleans them up.
set -euo pipefail
cd "$(dirname "$0")/.."
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
API_BASE="${API_BASE:-https://api.test-sahaya.pariskq.in}"
FE_BASE="${FE_BASE:-https://test-sahaya.pariskq.in}"
# shellcheck disable=SC1090
set -a; . "$CREDS_FILE"; set +a

PASS=0
FAIL=0
SKIP=0
record() {
  local name="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "PASS" ]; then PASS=$((PASS+1)); echo "PASS  $name ${detail}"
  elif [ "$ok" = "SKIP" ]; then SKIP=$((SKIP+1)); echo "SKIP  $name ${detail}"
  else FAIL=$((FAIL+1)); echo "FAIL  $name ${detail}"; fi
}

ticket_count() {
  node --input-type=module -e 'import { PrismaClient } from "@prisma/client"; const p=new PrismaClient(); console.log(await p.ticket.count()); await p.$disconnect();' 2>/dev/null || echo "unknown"
}

TICKET_BEFORE="$(ticket_count)"
echo "TICKET_COUNT_BEFORE=$TICKET_BEFORE"

login() {
  local email="$1"
  curl -sS -X POST "$API_BASE/auth/login" \
    -H 'Content-Type: application/json' -H "Origin: $FE_BASE" \
    -d "{\"email\":\"${email}\",\"password\":\"${AUTH_SET_PASSWORD}\"}"
}

# Prefer ADMIN for ticket create (tenant-scoped); fall back to SUPER_ADMIN
LOGIN_EMAIL="${ROLE_ADMIN_EMAIL:-${ROLE_SUPER_ADMIN_EMAIL}}"
LOGIN_JSON="$(login "$LOGIN_EMAIL")"
TOKEN="$(echo "$LOGIN_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken")or"")')"
ORG="$(echo "$LOGIN_JSON" | python3 -c 'import sys,json;p=json.load(sys.stdin).get("profile")or{};print(p.get("organisation_id")or"")')"
ROLE="$(echo "$LOGIN_JSON" | python3 -c 'import sys,json;p=json.load(sys.stdin).get("profile")or{};print(p.get("role")or"")')"
if [ -z "$TOKEN" ]; then
  echo "FATAL: cannot login"
  exit 1
fi
record "auth_local_jwt_login" PASS "role=$ROLE"

auth() {
  curl -sS -H "Authorization: Bearer $TOKEN" -H "Origin: $FE_BASE" -H 'Content-Type: application/json' "$@"
}

# --- A. Location required ---
CODE_NO_LOC="$(auth -o /tmp/parity_noloc.json -w '%{http_code}' -X POST "$API_BASE/tickets" \
  -d '{"short_description":"E2E_PARITY_no_loc","category":"MECHANICAL"}')"
if [ "$CODE_NO_LOC" != "200" ] && [ "$CODE_NO_LOC" != "201" ]; then
  record "location_required_rejects" PASS "http=$CODE_NO_LOC"
else
  record "location_required_rejects" FAIL "http=$CODE_NO_LOC"
fi

CREATE_BODY="{\"short_description\":\"E2E_PARITY_create\",\"category\":\"MECHANICAL\",\"location\":\"Mumbai Parity Test\""
if [ -n "$ORG" ]; then CREATE_BODY+=",\"organisation_id\":\"${ORG}\""; fi
CREATE_BODY+="}"
CODE_CREATE="$(auth -o /tmp/parity_create.json -w '%{http_code}' -X POST "$API_BASE/tickets" -d "$CREATE_BODY")"
TID="$(python3 -c 'import json;d=json.load(open("/tmp/parity_create.json"));print(d.get("id")or"")' 2>/dev/null || true)"
if [ "$CODE_CREATE" = "200" ] || [ "$CODE_CREATE" = "201" ]; then
  if [ -n "$TID" ]; then record "location_create_with_location" PASS "ticket=$TID http=$CODE_CREATE"
  else record "location_create_with_location" FAIL "http=$CODE_CREATE no id body=$(head -c 200 /tmp/parity_create.json)"; fi
else
  record "location_create_with_location" FAIL "http=$CODE_CREATE body=$(head -c 240 /tmp/parity_create.json)"
fi

# Backfill location on ticket with empty location (if we can find/create one)
if [ -n "$TID" ]; then
  # Clear location via prisma then PATCH back
  node --input-type=module <<NODE || true
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.ticket.update({ where: { id: "$TID" }, data: { location: null } });
await p.\$disconnect();
NODE
  # API contract matches FE useUpdateTicket: PATCH body is { updates: { location } }
  CODE_BF="$(auth -o /tmp/parity_bf.json -w '%{http_code}' -X PATCH "$API_BASE/data/tickets/$TID" \
    -d '{"updates":{"location":"Backfilled Parity Loc"}}')"
  LOC_OK="$(python3 -c 'import json;d=json.load(open("/tmp/parity_bf.json"));print("yes" if (d.get("location")or"").upper().find("BACKFILLED")>=0 else "no")' 2>/dev/null || echo no)"
  if [ "$CODE_BF" = "200" ] && [ "$LOC_OK" = "yes" ]; then
    record "location_backfill_patch" PASS
  else
    record "location_backfill_patch" FAIL "http=$CODE_BF loc_ok=$LOC_OK $(head -c 160 /tmp/parity_bf.json)"
  fi
fi

# --- D. Analytics staff_users ---
CODE_SUM="$(auth -o /tmp/parity_sum.json -w '%{http_code}' "$API_BASE/data/analytics/summary")"
HAS_STAFF="$(python3 -c 'import json;d=json.load(open("/tmp/parity_sum.json"));print("yes" if isinstance(d.get("staff_users"),list) else "no")' 2>/dev/null || echo no)"
if [ "$CODE_SUM" = "200" ] && [ "$HAS_STAFF" = "yes" ]; then
  record "analytics_staff_users" PASS "n=$(python3 -c 'import json;d=json.load(open("/tmp/parity_sum.json"));print(len(d.get("staff_users")or[]))')"
else
  record "analytics_staff_users" FAIL "http=$CODE_SUM has_staff=$HAS_STAFF"
fi

# --- E. Dashboard ---
CODE_DASH="$(auth -o /tmp/parity_dash.json -w '%{http_code}' "$API_BASE/data/dashboard/stats")"
[ "$CODE_DASH" = "200" ] && record "dashboard_stats" PASS || record "dashboard_stats" FAIL "http=$CODE_DASH"
CODE_DASH2="$(auth -o /tmp/parity_dash2.json -w '%{http_code}' \
  "$API_BASE/data/dashboard/stats?startDate=2020-01-01T00:00:00.000Z&endDate=2030-01-01T00:00:00.000Z")"
[ "$CODE_DASH2" = "200" ] && record "dashboard_resolved_date_params" PASS || record "dashboard_resolved_date_params" FAIL "http=$CODE_DASH2"

# --- B. Proof TOO_MANY_IMAGES ---
export API_BASE
TOO_MANY="$(API_BASE="$API_BASE" node --input-type=module <<'NODE'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const tok = await p.feActionToken.findFirst({
  where: {
    used: false,
    expiresAt: { gt: new Date() },
  },
  orderBy: { createdAt: "desc" },
});
if (!tok) {
  console.log("SKIP no_unused_fe_action_token");
  await p.$disconnect();
  process.exit(0);
}
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const images = Array.from({ length: 11 }, (_, i) => ({
  image_base64: `data:image/png;base64,${png}`,
  filename: `p${i}.png`,
}));
const res = await fetch(`${process.env.API_BASE}/fe/proof`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: tok.id, attachments: { images } }),
});
const j = await res.json().catch(() => ({}));
if (j.code === "TOO_MANY_IMAGES") console.log("PASS");
else console.log(`FAIL status=${res.status} code=${j.code || ""} error=${j.error || ""}`);
await p.$disconnect();
NODE
)" || TOO_MANY="FAIL node_error"
if [ "$TOO_MANY" = "PASS" ]; then record "proof_too_many_images" PASS
elif echo "$TOO_MANY" | grep -q SKIP; then record "proof_too_many_images" SKIP "$TOO_MANY"
else record "proof_too_many_images" FAIL "$TOO_MANY"; fi

# FE me tickets (if FE creds)
if [ -n "${ROLE_FIELD_EXECUTIVE_EMAIL:-}" ]; then
  FE_JSON="$(login "${ROLE_FIELD_EXECUTIVE_EMAIL}")"
  FE_TOKEN="$(echo "$FE_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken")or"")')"
  if [ -n "$FE_TOKEN" ]; then
    FE_CODE="$(curl -sS -o /tmp/parity_fe.json -w '%{http_code}' \
      -H "Authorization: Bearer $FE_TOKEN" -H "Origin: $FE_BASE" \
      "$API_BASE/fe/me/tickets")"
    [ "$FE_CODE" = "200" ] && record "fe_portal_tickets_api" PASS || record "fe_portal_tickets_api" FAIL "http=$FE_CODE"
  else
    record "fe_portal_tickets_api" SKIP "fe_login_failed"
  fi
else
  record "fe_portal_tickets_api" SKIP "no_fe_email"
fi

# --- F/G/H public FE assets ---
MCODE="$(curl -sS -o /dev/null -w '%{http_code}' "$FE_BASE/manifest.webmanifest")"
[ "$MCODE" = "200" ] && record "pwa_manifest" PASS || record "pwa_manifest" FAIL "http=$MCODE"
ICODE="$(curl -sS -o /dev/null -w '%{http_code}' "$FE_BASE/icons/icon-192.png")"
[ "$ICODE" = "200" ] && record "pwa_icons" PASS || record "pwa_icons" FAIL "http=$ICODE"
VCODE="$(curl -sS -o /dev/null -w '%{http_code}' -r 0-1023 "$FE_BASE/sahaya-demo.mp4")"
if [ "$VCODE" = "200" ] || [ "$VCODE" = "206" ]; then record "landing_video_asset" PASS "http=$VCODE"; else record "landing_video_asset" FAIL "http=$VCODE"; fi
RCODE="$(curl -sS -o /dev/null -w '%{http_code}' "$FE_BASE/reset-password?token=parity-smoke-token")"
[ "$RCODE" = "200" ] && record "password_reset_deeplink_page" PASS || record "password_reset_deeplink_page" FAIL "http=$RCODE"

HEALTH="$(curl -sS "$API_BASE/health")"
echo "$HEALTH" | python3 -c 'import sys,json;d=json.load(sys.stdin);raise SystemExit(0 if d.get("status")=="ok" and d.get("dbMode")=="prisma" else 1)' \
  && record "health_prisma" PASS || record "health_prisma" FAIL "$HEALTH"

# Cleanup created ticket
if [ -n "${TID:-}" ]; then
  node --input-type=module <<NODE || true
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  await p.ticketComment.deleteMany({ where: { ticketId: "$TID" } });
  await p.ticketAssignment.deleteMany({ where: { ticketId: "$TID" } }).catch(() => {});
  await p.slaTracking.deleteMany({ where: { ticketId: "$TID" } }).catch(() => {});
  await p.ticket.delete({ where: { id: "$TID" } });
  console.log("cleaned", "$TID");
} catch (e) {
  console.log("cleanup_err", e?.message || e);
} finally {
  await p.\$disconnect();
}
NODE
fi

TICKET_AFTER="$(ticket_count)"
echo "TICKET_COUNT_AFTER=$TICKET_AFTER"
echo "===== PARITY SMOKE SUMMARY pass=$PASS fail=$FAIL skip=$SKIP ====="
[ "$FAIL" -eq 0 ]
