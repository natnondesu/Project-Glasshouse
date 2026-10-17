#!/bin/sh
# Restore a pg_dump into the running stack. Usage (from deployment/): ./restore.sh /data/services/services-data/glasshouse/backups/glasshouse-YYYY-MM-DD-HHMM.dump
# COMPOSE can carry extra flags (-p, -f, --env-file); the smoke test uses that.
set -eu
COMPOSE="${COMPOSE:-docker compose}"
dump="${1:?usage: ./restore.sh <path-to-.dump>}"
[ -f "$dump" ] || { echo "No such file: $dump" >&2; exit 2; }
echo "Stopping the web container (the database stays up)..."
$COMPOSE stop web
echo "Restoring $dump ..."
$COMPOSE exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"
echo "Starting the web container; it replays the restored log on boot..."
$COMPOSE up -d --wait web
echo "Restored. Open the app and check a few rooms."
