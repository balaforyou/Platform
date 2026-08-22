# CLAUDE.md — apps/guest-member-pwa/

Loaded automatically alongside root `CLAUDE.md` whenever a session touches files in this directory.

## Reuse this precedent before designing a new error state

`CourtBooking.tsx`'s error-banner pattern — see root `CLAUDE.md` item 4 ("Reuse proven patterns").

## e2e suite specifics

`playwright.config.ts` loads the repo `.env` itself and rewrites a `badminton_db` target to `badminton_db_e2e` (F-047), so `pnpm test:e2e` and a bare `npx playwright test <spec>` both work with no exported `DATABASE_URL`, and neither can reach the demo database by default. An explicitly exported target other than `badminton_db` is respected untouched. See root `CLAUDE.md`'s "Environment facts" for the three-database picture this fits into.

**Provisioning `badminton_db_e2e` from scratch** — it is not created by any script, so a fresh machine needs this once:

```bash
docker exec -i badminton_postgres psql -U postgres -c "CREATE DATABASE badminton_db_e2e;"
cd packages/database && DATABASE_URL="postgresql://postgres:postgrespassword@localhost:65432/badminton_db_e2e?schema=public" npx prisma migrate deploy
```

**The e2e suite does not pass, and that is pre-existing.** F-046's identity-collision half was fixed on 20 Aug (`ac7a15d`), taking it from **2 passed, 6 failed, 1 skipped** to **4 passed, 4 failed, 1 skipped**. The four that remain are not identity collisions: `f041` depends on `f041-member-pending`, a user nothing creates, and `f043` and `f061` expect fixtures like `admin-seed-booking-refundable-cancelled` that nothing in the suite creates. Do not read a red e2e run as a regression without checking against this profile first — and see the time-of-day caveat below before trusting any suite-wide number.

**The e2e suite's pass/fail count is time-of-day dependent, so no suite-wide number is a fixed baseline.** `tests/seed-test-data.ts`'s `alignTimeToBoundary` mixes local-time `getHours`/`setHours` with a `+2h` offset. Near the IST day boundary, `now + 2h` lands on the next local date while `setHours` keeps today's, so the generated window and the booking screen's default date disagree and specs relying on that window (`guest-booking`) fail with element-not-found timeouts. The **4 passed / 4 failed / 1 skipped** figure recorded when F-046 landed was measured around 14:30 IST; the same commit gives **3 passed / 5 failed / 1 skipped** at 23:11 IST. Re-run before trusting a count, especially late in the IST day, and confirm a suspected regression by stashing the change rather than by comparing numbers. **Deliberately not fixed and deliberately not in the register:** this is test-fixture code with no path to a real user, and the register stays reserved for product-facing findings. Cleanup is tracked debt for once the register is clear and the demo is done.
