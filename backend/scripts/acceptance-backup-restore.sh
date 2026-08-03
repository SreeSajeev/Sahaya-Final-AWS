#!/usr/bin/env bash
# TEST-only: fresh dump of sahaya-migration-db + restore into temporary PG18 container.
# Does NOT overwrite pre-migration backup. Does NOT touch production.
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/sahaya/acceptance}"
TS="$(date -u +%Y%m%d-%H%M%S)"
DIR="$BACKUP_ROOT/$TS"
TMP_NAME="sahaya-accept-restore-$TS"
DUMP="$DIR/sahaya-acceptance-$TS.dump"

mkdir -p "$DIR"
chmod 700 "$BACKUP_ROOT" "$DIR" || true

echo "===== BACKUP SOURCE ====="
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep sahaya-migration-db || {
  echo "sahaya-migration-db not found" >&2
  exit 1
}

echo "===== DUMP ====="
# Discover DB role from backend .env without printing secrets
cd /var/www/apps/sahaya-final-aws-monorepo/backend 2>/dev/null || cd "$(dirname "$0")/.."
DB_USER="$(node --input-type=module -e 'import "dotenv/config"; const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.username||"sahaya")')"
DB_NAME="$(node --input-type=module -e 'import "dotenv/config"; const u=new URL(process.env.DATABASE_URL); process.stdout.write((u.pathname||"/sahaya").replace(/^\//,"").split("?")[0]||"sahaya")')"
echo "dump_user=$DB_USER dump_db=$DB_NAME"
docker exec sahaya-migration-db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f /tmp/sahaya-accept.dump
docker cp sahaya-migration-db:/tmp/sahaya-accept.dump "$DUMP"
docker exec sahaya-migration-db rm -f /tmp/sahaya-accept.dump
sha256sum "$DUMP" | tee "$DIR/SHA256SUMS"
ls -la "$DUMP"

echo "===== TEMP RESTORE CONTAINER ====="
# Use same PG major as live if possible
IMG="$(docker inspect sahaya-migration-db --format '{{.Config.Image}}' 2>/dev/null || echo postgres:18)"
echo "image=$IMG"
docker rm -f "$TMP_NAME" 2>/dev/null || true
docker run -d --name "$TMP_NAME" -e POSTGRES_PASSWORD=accept_tmp_only -e POSTGRES_USER="$DB_USER" -e POSTGRES_DB=sahaya_restore "$IMG"
# wait ready
for i in $(seq 1 30); do
  if docker exec "$TMP_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then break; fi
  sleep 2
done
docker cp "$DUMP" "$TMP_NAME:/tmp/restore.dump"
docker exec "$TMP_NAME" pg_restore -U "$DB_USER" -d sahaya_restore --no-owner --no-acl /tmp/restore.dump || {
  echo "pg_restore exited $? — checking counts anyway"
}

echo "===== COMPARE COUNTS ====="
live_count() { docker exec sahaya-migration-db psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
rest_count() { docker exec "$TMP_NAME" psql -U "$DB_USER" -d sahaya_restore -tAc "$1"; }

for q in \
  "SELECT COUNT(*) FROM users" \
  "SELECT COUNT(*) FROM organisations" \
  "SELECT COUNT(*) FROM tickets" \
  "SELECT COUNT(*) FROM ticket_comments" \
  "SELECT COUNT(*) FROM ticket_assignments" \
  "SELECT COUNT(*) FROM sla_tracking" \
  "SELECT COUNT(*) FROM audit_logs" \
  "SELECT COUNT(*) FROM auth_sessions" \
  "SELECT COUNT(*) FROM field_executives"
do
  L=$(live_count "$q" | tr -d '[:space:]')
  R=$(rest_count "$q" | tr -d '[:space:]')
  OK="FAIL"
  [[ "$L" == "$R" ]] && OK="PASS"
  echo "$OK live=$L restore=$R query=$q"
done

echo "===== CLEANUP TEMP CONTAINER ONLY ====="
docker rm -f "$TMP_NAME"
echo "BACKUP_KEPT=$DUMP"
echo "BACKUP_RESTORE_DONE"
