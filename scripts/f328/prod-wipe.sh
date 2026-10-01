#!/bin/sh
# PROD, on the VM. Runs wipe-jbc-guest-bookings.sql through the postgres container with the file on stdin
# (no host DB port is published). Launch the real run detached so a dropped IAP/SSH tunnel cannot kill it
# mid-way (one transaction: a dropped connection rolls back):
#   REHEARSAL (rolls back):  sh scripts/f328/prod-wipe.sh rehearse
#   REAL RUN (detached):     nohup sh scripts/f328/prod-wipe.sh commit <approved-count> > /tmp/f328-wipe.out 2>&1 &
. "$(dirname "$0")/prod-common.sh"
MODE="${1:?usage: prod-wipe.sh rehearse | commit <approved-count>}"
SQL="$(dirname "$0")/wipe-jbc-guest-bookings.sql"
case "$MODE" in
  rehearse) VARS="-v commit=false" ;;
  commit)   N="${2:?commit requires the approved booking count from the rehearsal}"
            case "$N" in ''|*[!0-9]*) echo "approved count must be a non-negative integer" >&2; exit 2 ;; esac
            VARS="-v commit=true -v expected_bookings=$N" ;;
  *) echo "mode must be rehearse or commit" >&2; exit 2 ;;
esac
# CRLF guard: a file copied from Windows breaks psql meta-commands silently.
if grep -q "$(printf '\r')" "$SQL"; then echo "FAIL: $SQL has CRLF line endings; run: sed -i 's/\\r\$//' $SQL" >&2; exit 2; fi
# shellcheck disable=SC2086
dc_pg psql -U "$PGUSER_VM" -d "$PGDB_VM" -X -v ON_ERROR_STOP=1 -v tenant_subdomain=jbc $VARS < "$SQL"
