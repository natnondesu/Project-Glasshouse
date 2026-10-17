#!/bin/sh
# Daily pg_dump at $BACKUP_AT (container local time, TZ), keeping $BACKUP_KEEP_DAYS days.
# `backup.sh --once` takes one backup now and exits (used by the restore drill); it exits non-zero if the dump failed.
set -eu
case "${BACKUP_AT:-03:00}" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) echo "backup: BACKUP_AT must look like 03:00 (HH:MM), got '${BACKUP_AT:-}'" >&2; exit 2 ;;
esac
# Called from an `if`, where `set -e` does not apply, so every step is checked by hand.
dump() {
  file="/backups/glasshouse-$(date +%Y-%m-%d-%H%M).dump"
  pg_dump --format=custom --file="$file.partial" || { rm -f "$file.partial"; echo "backup: pg_dump failed" >&2; return 1; }
  mv "$file.partial" "$file" || { rm -f "$file.partial"; echo "backup: could not move the dump into place" >&2; return 1; }
  echo "backup: wrote $file"
  find /backups \( -name 'glasshouse-*.dump' -o -name 'glasshouse-*.dump.partial' \) -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete || echo "backup: could not remove old dumps" >&2
}
if [ "${1:-}" = "--once" ]; then dump; exit $?; fi
last=""
while true; do
  today="$(date +%Y-%m-%d)"
  if [ "$(date +%H:%M)" = "${BACKUP_AT:-03:00}" ] && [ "$last" != "$today" ]; then
    if dump; then last="$today"; else echo "backup: will retry in 30 seconds while the minute lasts, else tomorrow" >&2; fi
  fi
  sleep 30
done
