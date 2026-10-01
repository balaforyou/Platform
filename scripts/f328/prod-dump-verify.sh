#!/bin/sh
# PROD, on the VM. Gate 0: full custom-format dump + verification. Exits non-zero (and Gate 1 must not
# start) unless the dump is non-empty AND lists every public table that exists in the live database.
#   sh scripts/f328/prod-dump-verify.sh [output-dir]
. "$(dirname "$0")/prod-common.sh"
OUT_DIR="${1:-$HOME}"; TS="$(date +%Y%m%d-%H%M%S)"; DUMP="$OUT_DIR/f328-predump-$TS.dump"
dc_pg pg_dump -U "$PGUSER_VM" -d "$PGDB_VM" -Fc > "$DUMP"
SIZE="$(wc -c < "$DUMP")"
[ "$SIZE" -gt 0 ] || { echo "FAIL: dump is empty: $DUMP" >&2; exit 1; }
# Table count in the dump vs the live public schema.
DUMP_TABLES="$(dc_pg pg_restore --list < "$DUMP" | grep -cE '^[0-9]+; [0-9]+ [0-9]+ TABLE public ' || true)"
LIVE_TABLES="$(dc_pg psql -U "$PGUSER_VM" -d "$PGDB_VM" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
DUMP_DATA="$(dc_pg pg_restore --list < "$DUMP" | grep -cE '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public ' || true)"
echo "dump:        $DUMP"; echo "size bytes:  $SIZE"
echo "tables in dump: $DUMP_TABLES   live public tables: $LIVE_TABLES   TABLE DATA entries: $DUMP_DATA"
[ "$DUMP_TABLES" -eq "$LIVE_TABLES" ] && [ "$DUMP_DATA" -eq "$LIVE_TABLES" ] || { echo "FAIL: dump table count does not match the live database" >&2; exit 1; }
echo "OK: dump verified. Copy it off the VM and report path + size to Bala before Gate 1."
