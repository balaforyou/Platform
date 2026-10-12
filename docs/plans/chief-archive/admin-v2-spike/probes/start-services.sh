#!/usr/bin/env bash
# Spike: start the five built services against the scratch database.
# Usage: start-services.sh start|stop
set -u
REPO=/home/user/Platform
OUT=/tmp/claude-0/-home-user-Platform/dc61fd4a-98d3-518c-bda7-8da1e9ffb29c/scratchpad/spike
export DATABASE_URL="postgresql://postgres@127.0.0.1:65500/badminton_db_scratch_spike?schema=public"
export INTERNAL_SERVICE_KEY=test-service-key
export NODE_ENV=development
case "${1:-}" in
  start)
    declare -A PORTS=( [slot-engine]=3001 [identity-auth]=3002 [tenant-management]=3003 [payment]=3004 [notification]=3005 )
    for svc in slot-engine identity-auth tenant-management payment notification; do
      ( cd "$REPO/services/$svc" && PORT=${PORTS[$svc]} nohup node dist/index.js > "$OUT/svc-$svc.log" 2>&1 & echo $! > "$OUT/svc-$svc.pid" )
    done
    sleep 6
    for p in 3001 3002 3003 3004 3005; do printf "%s " $p; curl -s -m 3 localhost:$p/health; echo; done
    ;;
  stop)
    for f in "$OUT"/svc-*.pid; do kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; done
    ;;
esac
