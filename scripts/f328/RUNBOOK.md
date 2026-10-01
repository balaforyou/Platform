# F-328 runbook — JBC venue rename + guest test-booking wipe

> **F-329 warning — read first.** `scripts/provision-tenant.mjs` is not idempotent for pools: a past re-provision may have
> left a branch with more than one pool, and a re-run after the rename against a stale seed would create a second branch
> and pool. The rename script aborts if a branch doesn't resolve uniquely or doesn't have exactly one pool. **If it
> aborts, stop and report to Bala; do not rename around it.** Run the read-only pool count (below) before the production rename.

Three explicit approval gates, each needs Bala's "go" on that specific step: **Gate 0** dump, **Gate 1** production rename,
**Gate 2** production wipe. Dev first for everything. Every block below is labelled **DEV** (Bala's machine, shared
Postgres on host port 65500 via the repo `.env`) or **PROD** (GCP VM, where Postgres is only reachable through the compose
`postgres` container — it publishes no host port, so `psql "$DATABASE_URL"` from the VM host does not work).

Rules for every command: never pass a secret as a command-line argument (it shows in `ps`, shell history and, via `sudo`,
`auth.log` — see `deploy/gcp-vm/CLAUDE.md`). The PROD helper scripts read `POSTGRES_USER`/`POSTGRES_DB` from the VM's
`deploy/gcp-vm/.env` on the VM side; nothing is interpolated through an SSH double-quoted string, and the password is never read.
Run from a directory with no `docker-compose.override.yml`. Copy files to the VM with `scp`, then confirm LF endings
(`grep -c $'\r' <file>` must print 0; the helper also refuses a CRLF SQL file).

## Gate 0 — full dump, verified

**DEV**
```bash
pg_dump "$DATABASE_URL" -Fc -f f328-dev-predump-$(date +%Y%m%d-%H%M).dump
ls -l f328-dev-predump-*.dump && pg_restore --list f328-dev-predump-*.dump | grep -c "TABLE DATA public"
```

**PROD** (on the VM, in the repo checkout)
```bash
sh scripts/f328/prod-dump-verify.sh ~          # writes ~/f328-predump-<ts>.dump via `docker compose exec -T postgres pg_dump -Fc`
```
It fails (non-zero, Gate 1 must not start) unless the dump is non-empty **and** the table count in the dump equals the live
public-schema table count (and every table has a `TABLE DATA` entry). Report the path, size and the three counts to Bala, and copy
the dump off the VM.

## Gate 1 — rename

The script validates both base URLs against a **fixed allowlist in code** before the key is read into a header (no override flag, no env switch): `http://localhost|127.0.0.1:<port>`, `http://tenant-management:3003` / `http://slot-engine:3001` (each only for its own service), and `https://jbc.elitecourts.duckdns.org/api/tenant` / `/api/slot-engine` (exact path). Anything else aborts with exit 2. Check it without any network call or key: `node scripts/f328/rename-jbc-venues.mjs --self-test` (all 20 cases must pass).

Reaches the services through Caddy's HTTPS routes (`/api/tenant/*` → `tenant-management:3003`, `/api/slot-engine/*` →
`slot-engine:3001`, prefix stripped), with the internal key from the environment — never as an argument.

**DEV** (services on localhost)
```bash
export TENANT_SERVICE_URL=http://localhost:3003 SLOT_ENGINE_URL=http://localhost:3001
read -rs INTERNAL_SERVICE_KEY && export INTERNAL_SERVICE_KEY      # type/paste the key; not echoed, not in history
node scripts/f328/rename-jbc-venues.mjs            # dry run
node scripts/f328/rename-jbc-venues.mjs --apply
```

**PROD** — step 1, read-only pool count (the F-329 guard; expect exactly 1 pool per branch):
```bash
docker compose -f deploy/gcp-vm/docker-compose.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X' < scripts/f328/preflight-pool-counts.sql
```
(Single-quoted: `$POSTGRES_*` expand **inside the container**, which already has them in its environment.)

**PROD** — step 2, dry run (writes nothing; aborts on ambiguity). Run this before asking Bala for the Gate 1 go:
```bash
export TENANT_SERVICE_URL=https://jbc.elitecourts.duckdns.org/api/tenant
export SLOT_ENGINE_URL=https://jbc.elitecourts.duckdns.org/api/slot-engine
read -rs INTERNAL_SERVICE_KEY && export INTERNAL_SERVICE_KEY      # from the VM .env; not echoed, not in history
node scripts/f328/rename-jbc-venues.mjs
```
**PROD** — step 3, only after Bala's Gate 1 go: `node scripts/f328/rename-jbc-venues.mjs --apply`, then read back in SQL
(`SELECT id,name FROM "Branch" …`, `"ResourcePool" …` for tenant `jbc`). Fallback if the public route is ever restricted: run the same
script in a `node` container attached to the compose network with `http://tenant-management:3003` / `http://slot-engine:3001`.

`scripts/tenants/jbc.json` already carries the new names, so a re-provision matches. Evidence: before/after venue switcher,
Home card ("Main Courts"), a fresh receipt for a new booking.

## Gate 2 — wipe (guest bookings only; do NOT enable `include_member`)

1. **Rehearse** (rolls back; prints the exact counts the real run would produce):

   **DEV:**
   ```bash
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v tenant_subdomain=jbc -v commit=false -f scripts/f328/wipe-jbc-guest-bookings.sql
   ```
   **PROD** (on the VM):
   ```bash
   sh scripts/f328/prod-wipe.sh rehearse
   ```
2. Show Bala the output: the "PLAN: rows to delete" table (its **Booking** row is the approved count `N`), the guest/member split (member must
   be absent from scope), chain-payment parent/child counts, orphan-intent count, other tenants identical before/after, and the
   "nothing real since today" block (`MAX(createdAt)`).
3. **A real run requires the approved count.** `commit=true` without `expected_bookings` aborts before any delete.
   **DEV:** `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v tenant_subdomain=jbc -v commit=true -v expected_bookings=<N> -f scripts/f328/wipe-jbc-guest-bookings.sql`
4. **PROD**, only after Bala approves the counts AND re-confirms immediately beforehand that nothing real has been booked today.
   Detached, one process, no prompts, so a dropped IAP/SSH tunnel cannot half-apply (one `BEGIN … COMMIT`; a dropped connection rolls back):
   ```bash
   nohup sh scripts/f328/prod-wipe.sh commit <N> > /tmp/f328-wipe.out 2>&1 &
   tail -f /tmp/f328-wipe.out
   ```
   Every assertion (deleted == planned, other tenants and kept tables identical, no dispatch rows left for deleted bookings) aborts it before `COMMIT`.
5. After: re-run step 1 (every row 0), screenshot the empty "Current Bookings" state, make one new booking under the new names and download its receipt.

## Dispatch key shapes (verified in `services/slot-engine/src/index.ts`)
- `guest_booking_reminder`: `dedupKey = booking.id`, `subjectId = booking.userId` — matched on `dedupKey` only.
- `payment_confirm_reconciliation`: `dedupKey = intent.id`, `subjectId = booking.id` — matched on `dedupKey` (intent ids).
- `slot_release_reminder` (assignment+window), `low_occupancy_alert` (pool+window), `batch_renewal_reminder` (branch+month): not booking-keyed; kept.
