#!/bin/sh
# Daily pg_dump at $BACKUP_AT (container local time, TZ), keeping $BACKUP_KEEP_DAYS days.
# `backup.sh --once` takes one backup now and exits (used by the restore drill).
set -eu
dump() {
  file="/backups/glasshouse-$(date +%Y-%m-%d-%H%M).dump"
  pg_dump --format=custom --file="$file.partial"
  mv "$file.partial" "$file"
  find /backups -name 'glasshouse-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  echo "backup: wrote $file"
}
if [ "${1:-}" = "--once" ]; then dump; exit 0; fi
last=""
while true; do
  today="$(date +%Y-%m-%d)"
  if [ "$(date +%H:%M)" = "${BACKUP_AT:-03:00}" ] && [ "$last" != "$today" ]; then
    if dump; then last="$today"; else echo "backup: pg_dump failed; retrying in a minute" >&2; fi
  fi
  sleep 30
done
