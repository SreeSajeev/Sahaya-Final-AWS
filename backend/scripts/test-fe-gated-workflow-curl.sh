#!/usr/bin/env bash
set -euo pipefail

# Usage:
# API_BASE=http://localhost:3000 \
# TICKET_ID=<ticket-uuid> \
# FE_ID=<fe-uuid> \
# bash scripts/test-fe-gated-workflow-curl.sh

: "${API_BASE:?API_BASE is required}"
: "${TICKET_ID:?TICKET_ID is required}"
: "${FE_ID:?FE_ID is required}"

echo "[1/4] Assign ticket (expect ON_SITE token + LOCKED RESOLUTION token)"
ASSIGN_RES=$(curl -sS -X POST "${API_BASE}/tickets/${TICKET_ID}/assign" \
  -H "Content-Type: application/json" \
  -d "{\"feId\":\"${FE_ID}\"}")
echo "${ASSIGN_RES}"

ON_SITE_TOKEN=$(echo "${ASSIGN_RES}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d||"{}");process.stdout.write(j.onSiteToken||j.token||"")})')
RESOLUTION_TOKEN=$(echo "${ASSIGN_RES}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d||"{}");process.stdout.write(j.resolutionToken||"")})')

if [[ -z "${ON_SITE_TOKEN}" || -z "${RESOLUTION_TOKEN}" ]]; then
  echo "Missing tokens from assign response"
  exit 1
fi

echo "[2/4] Try resolution before on-site proof (expect RESOLUTION_TOKEN_LOCKED)"
curl -sS -X POST "${API_BASE}/fe/proof" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${RESOLUTION_TOKEN}\",\"outcome\":\"SUCCESS\"}" || true
echo

echo "[3/4] Submit on-site proof (expect success + activation)"
curl -sS -X POST "${API_BASE}/fe/proof" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${ON_SITE_TOKEN}\",\"attachments\":{}}" 
echo

echo "[4/4] Submit resolution proof (expect RESOLVED_PENDING_VERIFICATION or FE_ATTEMPT_FAILED)"
curl -sS -X POST "${API_BASE}/fe/proof" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${RESOLUTION_TOKEN}\",\"outcome\":\"SUCCESS\",\"attachments\":{}}"
echo
