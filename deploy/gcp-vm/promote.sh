#!/usr/bin/env bash
#
# promote.sh — F-193 Batch 4. Promote a CI-pushed SHA to the GCP VM.
#
# Consolidates docs/deploy_via_dockerhub_reference.md steps 5-10 into one script that
# runs ON THE VM (no SSH inside it — see deploy/gcp-vm/CLAUDE.md's `||`/`$VAR`/CRLF
# traps). CI (.github/workflows/ci.yml) pushes :<svc>-<full-sha> immutable images for
# every main commit; this pulls that set, drives the F-077 migrate guard (never
# bypasses it), brings the stack up, and verifies all 7 components report the target
# SHA over real HTTPS.
#
#   ./deploy/gcp-vm/promote.sh <target-git-sha>
#   ./deploy/gcp-vm/promote.sh <target-git-sha> --rollback
#
# The VM's app tree is a plain copy, NOT a git checkout, so the script fetches the
# docker-compose.yml / Caddyfile / verify-deployment.mjs FOR THE TARGET SHA straight from
# raw.githubusercontent.com, SHA-pinned (content-addressed, immutable) — no local git, and
# the topology always matches the images.
#
# One-time prerequisite on the VM:  `sudo docker login`   (Docker Hub repo is private)

set -euo pipefail

SHA="${1:-}"
MODE="${2:-promote}"

if [ -z "$SHA" ]; then
  echo "usage: $0 <target-git-sha> [--rollback]" >&2
  exit 2
fi

REPO="balamuralikrishna/badminton-platform"
RAW="https://raw.githubusercontent.com/balaforyou/Platform/${SHA}"

# All 7 images CI builds/pushes. Used for pull, retag, and the :rollback image snapshot.
# `migrate` IS pulled/retagged — the F-077 guard runs it via `run --rm` — but it is a
# one-shot (`restart: "no"`) and must NEVER be in `up -d`.
COMPONENTS=(slot-engine identity-auth tenant-management payment notification caddy migrate)
# The long-running services `up -d --force-recreate` touches. Six — no `migrate`, no
# `postgres` (its image is unchanged; no reason to bounce the live customer database).
SERVICES=(slot-engine identity-auth tenant-management payment notification caddy)

HERE="$(cd "$(dirname "$0")" && pwd)"          # .../deploy/gcp-vm
SITE="https://elitecourts.duckdns.org"
ADMIN_V2_SITE="https://admin.elitecourts.duckdns.org"   # F-197: its own host
STAMP="$(date +%s)"

cd "$HERE"

on_err() {
  echo ""
  echo "!! promote.sh FAILED (line $1). Nothing further will change."
  if [ "$MODE" != "--rollback" ]; then
    echo "!! To restore the images AND config that were live before this run:"
    echo "!!     $0 $SHA --rollback"
  fi
}
trap 'on_err $LINENO' ERR

caddy_fallback_count() {
  sudo docker compose --env-file .env logs caddy | grep -c 'listening only on the HTTP port' || true
}

recreate_services() {
  sudo docker compose --env-file .env up -d --force-recreate "${SERVICES[@]}"
  sudo docker compose --env-file .env ps
}

# Wait until every endpoint verify-deployment.mjs checks answers 200. `docker compose up`
# returns once containers are STARTED, not once the app inside has bound its port — the
# recreated services take a few seconds and Caddy returns 502 in the gap. Without this the
# verify step (and the Caddy grep) races the stack coming up.
wait_for_ready() {
  local paths="
    /api/slot-engine/health
    /api/identity/health
    /api/tenant/health
    /api/payment/health
    /api/notification/health
    /version.json
    /admin/version.json
  "
  local i ep ok
  for i in $(seq 1 40); do
    ok=1
    for ep in $paths; do
      curl -fsS --max-time 5 "${SITE}${ep}" >/dev/null || { ok=0; break; }
    done
    # F-197: admin-v2 on its own host — the bundle's version.json, plus /api/identity
    # via the same Caddy (proves the @adminV2Host block did not shadow the API handlers).
    if [ "$ok" = 1 ]; then
      curl -fsS --max-time 5 "${ADMIN_V2_SITE}/version.json" >/dev/null || ok=0
      curl -fsS --max-time 5 "${ADMIN_V2_SITE}/api/identity/health" >/dev/null || ok=0
    fi
    if [ "$ok" = 1 ]; then echo "   all endpoints answering after ~$((i * 3))s"; return 0; fi
    sleep 3
  done
  echo "!! stack did not become ready within 2 minutes (last failing: ${SITE}${ep})"
  sudo docker compose --env-file .env ps
  return 1
}

# --------------------------------------------------------------------------------------
if [ "$MODE" = "--rollback" ]; then
  echo "== ROLLBACK — restoring the last promotion's image + config snapshot =="

  # Config: restore the .rollback snapshot the last forward run took (always taken, so it
  # always exists after any promotion — no-op-equivalent if nothing had drifted).
  for f in docker-compose.yml Caddyfile; do
    if [ -f "$HERE/$f.rollback" ]; then
      cp "$HERE/$f.rollback" "$HERE/$f"
      echo "   restored $f from $f.rollback"
    else
      echo "   no $f.rollback — leaving $f as-is (no promotion has run since this script landed?)"
    fi
  done

  # Images: restore the gcp-vm-<svc>:rollback tags.
  for c in "${COMPONENTS[@]}"; do
    if sudo docker image inspect "gcp-vm-$c:rollback" >/dev/null 2>&1; then
      sudo docker tag "gcp-vm-$c:rollback" "gcp-vm-$c"
    else
      echo "   no gcp-vm-$c:rollback tag — leaving gcp-vm-$c as-is"
    fi
  done

  recreate_services
  wait_for_ready
  fb="$(caddy_fallback_count)"
  echo "Caddy HTTP-fallback grep: $fb  (must be 0)"
  [ "$fb" = 0 ] || { echo "!! Caddy is HTTP-only after rollback — investigate SITE_ADDRESS / Caddyfile mount"; exit 1; }
  echo "== rollback done =="
  exit 0
fi

# --------------------------------------------------------------------------------------
echo "== promote $SHA =="

# 1. Fetch compose.yml / Caddyfile / verify-deployment.mjs for this exact SHA. `curl -f`
#    fails closed on any HTTP error; the sanity checks catch a truncated / wrong body before
#    it can be installed.
echo "-- fetch compose.yml, Caddyfile, verify-deployment.mjs for $SHA"
curl -fsSL "$RAW/deploy/gcp-vm/docker-compose.yml" -o "/tmp/promote-compose-$SHA.yml"
curl -fsSL "$RAW/deploy/gcp-vm/Caddyfile"          -o "/tmp/promote-caddy-$SHA"
curl -fsSL "$RAW/scripts/verify-deployment.mjs"    -o "/tmp/promote-verify-$SHA.mjs"
grep -q '^services:' "/tmp/promote-compose-$SHA.yml"           || { echo "!! fetched docker-compose.yml looks wrong"; exit 1; }
grep -q 'SITE_ADDRESS' "/tmp/promote-caddy-$SHA"               || { echo "!! fetched Caddyfile looks wrong"; exit 1; }
grep -q 'verify-deployment' "/tmp/promote-verify-$SHA.mjs"     || { echo "!! fetched verify-deployment.mjs looks wrong"; exit 1; }

# 2. Snapshot the CURRENT state — config and images — BEFORE any mutation, so --rollback is
#    always whole. Both are taken unconditionally every run: .rollback = "undo the last
#    promotion", exactly like the gcp-vm-<svc>:rollback image tags.
echo "-- snapshot config -> *.rollback, images -> gcp-vm-*:rollback"
for f in docker-compose.yml Caddyfile; do
  # `if`, not `[ -f ] && cp` — the latter aborts under `set -e` when the file is absent
  # (fresh / rebuilt VM). Missing here just means "nothing to snapshot yet".
  if [ -f "$HERE/$f" ]; then cp -p "$HERE/$f" "$HERE/$f.rollback"; fi
done
for c in "${COMPONENTS[@]}"; do
  if sudo docker image inspect "gcp-vm-$c" >/dev/null 2>&1; then
    sudo docker tag "gcp-vm-$c" "gcp-vm-$c:rollback"
  else
    echo "   (no current gcp-vm-$c — first deploy?)"
  fi
done

# 3. Install compose.yml / Caddyfile only if they actually differ (CRLF-insensitive: strip
#    \r from BOTH sides before comparing, so a real change is never skipped and an
#    identical-but-CRLF file is never needlessly rewritten). Keep a dated audit copy on
#    change — same reconciliation the 19 Aug F-149 fix did by hand.
install_if_changed() {
  local target="$1" fetched="$2"
  if [ -f "$target" ] && diff -q <(tr -d '\r' < "$target") <(tr -d '\r' < "$fetched") >/dev/null 2>&1; then
    echo "   $(basename "$target") already current"
  else
    # `if`, not `[ -f ] && cp` — the latter aborts under `set -e` when $target is absent
    # (fresh / rebuilt VM, no prior config). Absent just means there is nothing to back up.
    if [ -f "$target" ]; then
      cp -p "$target" "$target.bak.promote.$STAMP"
      echo "   audit copy: $(basename "$target").bak.promote.$STAMP"
    fi
    cp "$fetched" "$target"
    echo "   updated $(basename "$target") from $SHA"
  fi
}
install_if_changed "$HERE/docker-compose.yml" "/tmp/promote-compose-$SHA.yml"
install_if_changed "$HERE/Caddyfile"          "/tmp/promote-caddy-$SHA"

# 5. Pull the immutable image set for this SHA.
echo "-- pull $REPO:<svc>-$SHA"
for c in "${COMPONENTS[@]}"; do
  sudo docker pull "$REPO:$c-$SHA"
done

# 6. Retag to the names docker-compose.yml expects (compose project 'gcp-vm').
echo "-- retag -> gcp-vm-<svc>"
for c in "${COMPONENTS[@]}"; do
  sudo docker tag "$REPO:$c-$SHA" "gcp-vm-$c"
done

# 7. Persist the deploy SHA into .env.
#
#    WHY `GIT_SHA` AND NOT `EXPECTED_GIT_SHA`: the migrate service's compose definition is
#    `environment: EXPECTED_GIT_SHA: ${GIT_SHA:-}` — Compose interpolation reads `${GIT_SHA}`,
#    and an `environment:` entry overrides the same key from `env_file:` even when empty. So
#    writing `EXPECTED_GIT_SHA=` to .env (as the old manual Step 7 did) is dead weight; the
#    value that reaches the container comes from `${GIT_SHA}`. Writing `GIT_SHA` here matches
#    what interpolation actually reads AND — since .env is also Compose's auto-loaded
#    interpolation source — makes a later plain `docker compose up` interpolate correctly even
#    without a fresh `export`. Do NOT "fix" this back to EXPECTED_GIT_SHA.
echo "-- .env: GIT_SHA=$SHA"
if grep -q '^GIT_SHA=' .env; then
  sed -i "s/^GIT_SHA=.*/GIT_SHA=$SHA/" .env
else
  printf 'GIT_SHA=%s\n' "$SHA" >> .env
fi
grep -q '^SITE_ADDRESS=' .env || { echo "!! SITE_ADDRESS missing from .env — refusing (F-083: Caddy would serve plain HTTP)"; exit 1; }

# 8. Migrate behind the F-077 guard, then bring the stack up.
#    `export GIT_SHA` + `sudo -E`: belt-and-suspenders alongside the .env line, because plain
#    `sudo` strips the export (deploy/gcp-vm/CLAUDE.md).
export GIT_SHA="$SHA"
echo "-- migrate (F-077 guard: verify-build-sha.mjs)"
if ! sudo -E docker compose --env-file .env run --rm migrate; then
  echo "!! MIGRATE GUARD FAILED — the pulled images do not match $SHA, or EXPECTED_GIT_SHA is unset."
  echo "!! The database was NOT touched. Nothing has been brought up. Rollback snapshots are intact."
  exit 1
fi

echo "-- up -d --force-recreate: ${SERVICES[*]}  (migrate + postgres deliberately excluded)"
recreate_services

echo "-- wait for the recreated stack to answer"
wait_for_ready

# 10. HTTPS did not silently fall back to HTTP-only (F-083 / F-084). VM-local, reliable —
#     run it before verify-deployment, which is blind to scheme-level failure.
echo "-- Caddy HTTP-fallback check"
fb="$(caddy_fallback_count)"
echo "   grep -c 'listening only on the HTTP port' = $fb   (must be 0)"
[ "$fb" = 0 ] || { echo "!! Caddy fell back to HTTP-only — check SITE_ADDRESS and the Caddyfile volume mount"; exit 1; }

# 9. All 7 components report the target SHA over real HTTPS. Run the fetched script in a
#    throwaway container so the VM host needs no Node install.
echo "-- verify-deployment.mjs $SITE $SHA (+ admin-v2 at $ADMIN_V2_SITE)"
sudo docker run --rm --network host -v "/tmp/promote-verify-$SHA.mjs:/verify.mjs:ro" \
  node:22-bookworm-slim node /verify.mjs "$SITE" "$SHA" "$ADMIN_V2_SITE"

echo ""
echo "== PROMOTION COMPLETE — $SHA is live at $SITE =="
echo "   rollback:  $0 $SHA --rollback   (restores gcp-vm-<svc>:rollback + *.rollback config)"
