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
# The dump is turned into SQL first and only then run in ONE transaction that starts by emptying the schema. A damaged
# dump stops before anything is run, and a failure while loading rolls everything back: the old data stays as it was.
if ! $COMPOSE exec -T db sh -c '
  set -eu
  script="$(mktemp)"
  trap "rm -f \"$script\"" EXIT
  { echo "drop schema public cascade; create schema public;"; pg_restore --no-owner -f -; } > "$script"
  psql -q -o /dev/null -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$script"
' < "$dump"; then
  cat >&2 <<'MSG'

The restore failed. Nothing was changed: the loading runs as one transaction, so the database still holds the data
it had before. The web container is left stopped; start it again with: docker compose up -d --wait web
To try again, use another dump (or this one once the cause above is fixed). Keep this output if you ask for help.
MSG
  exit 1
fi
echo "Starting the web container; it replays the restored log on boot..."
$COMPOSE up -d --wait web
echo "Restored. Open the app and check a few rooms."
