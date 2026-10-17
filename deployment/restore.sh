#!/bin/sh
# Restore a pg_dump into the running stack. Usage (from deployment/): ./restore.sh /data/services/services-data/glasshouse/backups/glasshouse-YYYY-MM-DD-HHMM.dump
# COMPOSE can carry extra flags (-p, -f, --env-file); the smoke test uses that. FORCE=1 skips the confirmation.
set -eu
COMPOSE="${COMPOSE:-docker compose}"
dump="${1:?usage: ./restore.sh <path-to-.dump>}"
[ -f "$dump" ] || { echo "No such file: $dump" >&2; exit 2; }
if [ "${FORCE:-0}" != 1 ]; then
  echo "This replaces everything in the Glasshouse database with the contents of $dump."
  printf 'Type yes to continue: '
  read -r answer
  [ "$answer" = yes ] || { echo "Cancelled; nothing was changed." >&2; exit 1; }
fi
echo "Stopping the web container (the database stays up)..."
$COMPOSE stop web
echo "Restoring $dump ..."
if ! $COMPOSE exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"; then
  cat >&2 <<'MSG'

The restore failed. The web container is stopped on purpose so nobody edits a half-restored database.
The previous data may be partly replaced. Do not start web yet: restore an earlier dump with this script,
or ask for help and keep this output. When the database is right, start it with: docker compose up -d --wait web
MSG
  exit 1
fi
echo "Starting the web container; it replays the restored log on boot..."
$COMPOSE up -d --wait web
echo "Restored. Open the app and check a few rooms."
