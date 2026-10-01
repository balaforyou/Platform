# F-328 runbook — JBC venue rename + guest test-booking wipe

Three explicit approval gates. Each one needs Bala's "go" on that specific step. Dev first for both.
Run from Bala's machine (dev) and the GCP VM (production). Never pass a secret as a `sudo` argument (see
`deploy/gcp-vm/CLAUDE.md`); feed it from the environment file or stdin.

## Gate 0 — full dump (before anything else)
```bash
pg_dump "$DATABASE_URL" -Fc -f f328-predump-$(date +%Y%m%d-%H%M).dump
ls -l f328-predump-*.dump && pg_restore --list f328-predump-*.dump | head -20    # report path, size, list check
```
Dev: `badminton_db` (port 65500 via `.env`). Production: dump on the VM from the postgres container, report the
path and size to Bala, and copy it off the VM.

## Rename (Gate 1 = production)
```bash
export TENANT_SERVICE_URL=... SLOT_ENGINE_URL=... INTERNAL_SERVICE_KEY=...
node scripts/f328/rename-jbc-venues.mjs            # dry run: prints BEFORE and the PLAN, writes nothing
node scripts/f328/rename-jbc-venues.mjs --apply    # renames via PATCH /branches/:id + PATCH /resource-pools/:id, reads back
```
Also read back in SQL: `SELECT id,name FROM "Branch" WHERE "tenantId"=(SELECT id FROM "Tenant" WHERE subdomain='jbc');`
and the same for `"ResourcePool"`. Commit `scripts/tenants/jbc.json` (already updated) in the same change so a
re-provision matches. Evidence: before/after venue switcher, Home card ("Main Courts"), a fresh receipt for a new booking.

## Wipe (Gate 2 = production)
1. Rehearse on dev (rolls back, prints the exact counts the real run would produce):
   ```bash
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v tenant_subdomain=jbc -v commit=false -f scripts/f328/wipe-jbc-guest-bookings.sql
   ```
2. Show Bala the output: the plan table, the guest/member split (member must be absent from scope), the
   chain-payment parent/child counts, the orphan-intent count, other tenants identical before/after, and
   the "nothing real since today" block (`MAX(createdAt)`). **Do not enable `include_member`.**
3. Real run on dev with the approved number: `-v commit=true -v expected_bookings=<N>`.
4. Production, only after Bala approves the counts AND re-confirms immediately beforehand that nothing real has been booked today. On the VM, one psql process, no prompts, detached, so a dropped IAP/SSH tunnel cannot half-apply:
   ```bash
   scp scripts/f328/wipe-jbc-guest-bookings.sql vm:/tmp/ && sed -i 's/\r$//' /tmp/wipe-jbc-guest-bookings.sql   # CRLF trap
   nohup psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v tenant_subdomain=jbc -v commit=true -v expected_bookings=<N> \
        -f /tmp/wipe-jbc-guest-bookings.sql > /tmp/f328-wipe.out 2>&1 &
   tail -f /tmp/f328-wipe.out
   ```
   The file is one `BEGIN … COMMIT` transaction; a dropped connection makes Postgres roll it back. Every assertion
   (deleted == planned, other tenants and kept tables identical, no dispatch rows left for deleted bookings) aborts it before `COMMIT`.
5. After: re-run step 1 (expect all zeros), screenshot the empty "Current Bookings" state, make one new booking under the new names and download its receipt.

## Dispatch key shapes (verified in `services/slot-engine/src/index.ts`)
- `guest_booking_reminder`: `dedupKey = booking.id`, `subjectId = booking.userId` — matched on `dedupKey` only.
- `payment_confirm_reconciliation`: `dedupKey = intent.id`, `subjectId = booking.id` — matched on `dedupKey` (intent ids).
- `slot_release_reminder` (assignment+window), `low_occupancy_alert` (pool+window), `batch_renewal_reminder` (branch+month): not booking-keyed; kept.
