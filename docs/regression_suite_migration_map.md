# Regression Suite Consolidation — Scenario Migration Map

**Purpose:** prove that consolidating the scattered API-level tests into `services/*/src/regression/` dropped **nothing**. Every scenario in the 7 original `*.test.ts` files, plus the 3 scenarios migrated out of Playwright, maps 1:1 to exactly one new location. Written and reviewed *before* the old files were deleted.

**Result:** 46 sections across 5 suites, all passing via one command (`pnpm test:regression`).

---

## 1. `services/identity-auth/src/identity.test.ts` → `identity-auth/src/regression/`

| Original | New location | Status |
|---|---|---|
| Test 1 — OTP cooldown 429 `COOLDOWN_ACTIVE`, rate-limit 429 `RATE_LIMIT_EXCEEDED` | `otp-flow.regression.ts` §1 | moved verbatim |
| Test 2 — wrong code 400, correct code 201, JWT + httpOnly refresh cookie, `userType` defaults GUEST | `otp-flow.regression.ts` §2 | moved verbatim |
| Test 3 — `PendingInvite` deleted, `BookingPlayer.userId` linked, resolve-invites 401 gate | `otp-flow.regression.ts` §3 | moved verbatim |
| Test 4 — refresh rotation, rotated-away token replay → 401 | `jwt-session.regression.ts` §1 | moved verbatim |
| Test 5 — Google signup gating 400 `PHONE_VERIFICATION_REQUIRED`, guest login 403, PATCH 401 without internal key / 200 with, member Google login 200 | `jwt-session.regression.ts` §2 | moved verbatim |
| Test 6 — admin phone lookup: owner 200 no-email, branch-manager 200, non-admin 403, tenant-mismatch 403, cross-tenant 404 no-leak, invalid phone 400 | `admin-phone-lookup.regression.ts` §1 | moved; now also asserts the 404 body contains neither the other tenant's user id nor phone (**stricter**) |

## 2. `services/tenant-management/src/tenant.test.ts` → `tenant-management/src/regression/`

| Original | New location | Status |
|---|---|---|
| Test 1 — draft branch hidden from guests, hidden even with `includeDraft=true`, visible after ACTIVE | `branch-lifecycle.regression.ts` §1 | moved verbatim |
| Test 4 — unknown tenant manifest → 404 `TENANT_NOT_FOUND` | `branch-lifecycle.regression.ts` §2 | moved verbatim |
| Test 2 — BRANCH_MANAGER scoped (A allowed / B denied), OWNER `branchId:null` access-all | `role-scoping.regression.ts` §1 | moved verbatim |
| Test 3 — login → promote → assign role → re-login → `roles` claim carries `branch_manager:<id>` | `role-scoping.regression.ts` §2 | moved verbatim |

## 3. `services/slot-engine/src/concurrency.test.ts` → `slot-engine/src/regression/`

| Original | New location | Status |
|---|---|---|
| Test 0 — pool PATCH persists, immutable `branchId` 400, booking-rule PUT persists, assignment create/list scoped, other-branch manager 403, internal key 200 | `admin-operations.regression.ts` §1 | **relocated** out of "concurrency" — it was never a concurrency scenario |
| Test 1 — concurrent FIXED_INSTANCE holds: one 201, one 409 `SLOT_ALREADY_BOOKED` | `guest-booking.regression.ts` §1 | moved verbatim |
| Test 2 — concurrent POOLED cap=2: two 201, one 409 `POOL_CAPACITY_EXCEEDED` | `guest-booking.regression.ts` §2 | moved verbatim |
| Test 3 — idempotency-key sequential retry → 200, identical booking id | `guest-booking.regression.ts` §3 | moved verbatim |
| Test 4 — idempotency-key concurrent race → one 201 + one 200, same id (P2002 handled) | `guest-booking.regression.ts` §4 | moved verbatim |
| Test 5 — expired HELD swept to `RELEASED_NO_SHOW` | `low-occupancy-release.regression.ts` §1 | moved verbatim |
| Test 6 — member auto-released, guest preserved, **F-022** attendance-confirmed member NOT released | `low-occupancy-release.regression.ts` §2 | moved verbatim |
| Test 7 — `HAS_SESSION`/`canConfirm`, guest confirm 403, **spoofed `userId` in body ignored**, one booking, no-session state, subscription-inactive 409, past-cutoff 409, concurrent double-confirm → 1 booking | `member-flow.regression.ts` §1 | moved; spoof check now uses the named `expectIdentityFromJwt` helper (**stricter** — explicitly fails if the body value was stored) |

## 4. `services/slot-engine/src/availabilityGeneration.phaseA.test.ts` → `slot-engine/src/regression/availability-generation.regression.ts`

| Original scenario | New section | Status |
|---|---|---|
| Pattern generation: 3 hourly windows, provenance, price 150 | §1 | moved verbatim |
| CLOSED override precedence → 0 windows | §2 | moved verbatim |
| MODIFIED override precedence → 4×30min, capacity 5, no pattern provenance | §3 | moved verbatim |
| Generation-lock concurrency: 2 concurrent calls → 1 set, exactly 1 lock row | §4 | moved verbatim |
| **Booking stability** — pattern edit must not mutate existing window/booking | §5 | moved verbatim |
| No pattern + no override → `source: NONE` | §6 | moved verbatim |

## 5. `services/slot-engine/src/availabilityGeneration.phaseB.test.ts` → split

| Original scenario | New location | Status |
|---|---|---|
| Guest GET availability triggers lazy generation | `availability-generation-api.regression.ts` §1 | moved verbatim |
| Admin GET availability triggers generation (different date) | `availability-generation-api.regression.ts` §2 | moved verbatim |
| Pool + branch occupancy trigger generation before counting (capacity 12 / 14) | `availability-generation-api.regression.ts` §3 | moved verbatim |
| Browse-ahead limit → 400 | `availability-generation-api.regression.ts` §4 | moved verbatim |
| CLOSED → empty; MODIFIED → override-shaped windows only | `availability-generation-api.regression.ts` §5 | moved verbatim |
| Range override `fromDate`/`toDate` → 3 rows | `availability-generation-api.regression.ts` §6 | moved verbatim |
| Trust boundary — wrong-branch manager 403 on pattern create, override create, pattern edit, override edit | **`admin-operations.regression.ts` §2** | **relocated** so all admin/branch-scoping checks live together |

## 6. `services/payment/src/payment.test.ts` → `payment/src/regression/`

| Original | New location | Status |
|---|---|---|
| Test 1 — spoofed price 5.00 ignored, server resolves 125.00 | `price-integrity.regression.ts` §1 | moved verbatim |
| Test 6 — PaymentIntent duplicate prevention | `price-integrity.regression.ts` §2 | moved verbatim |
| Test 2 — webhook signature invalid 400 / valid 200 | `webhook-signature-and-idempotency.regression.ts` §1 | moved verbatim |
| Test 3 — replayed event → 200 `duplicated: true` | `webhook-signature-and-idempotency.regression.ts` §2 | moved verbatim |
| Test 4 — capture webhook → HELD→CONFIRMED, intent `captured` | `webhook-signature-and-idempotency.regression.ts` §3 | moved verbatim |
| Test 5 — AutoPay `charge_failed`→suspended, `charged`→active | `autopay-and-refund.regression.ts` §1 | moved verbatim |
| Test 7 — cancel computes 125.00, refund 12500 paise `processed` | `autopay-and-refund.regression.ts` §2 | moved verbatim |
| Test 6B — negotiated link idempotency (201 then 200, same ids, 1 booking + 1 intent), member JWT 403 | `negotiated-link.regression.ts` §1 | moved verbatim |

## 7. `services/notification/src/notification.test.ts` → `notification/src/regression/`

| Original | New location | Status |
|---|---|---|
| Test 1 — health check | `dispatch-and-routing.regression.ts` §1 | moved; `console.assert` → real throw (**stricter**) |
| Test 2 — push-preferred routing targets device token, dispatches to `sent` with `mock-push` ref | `dispatch-and-routing.regression.ts` §2 | moved; `console.assert` → real throw (**stricter**) |
| Test 3 — `slot_release_reminder` queues BOTH push and sms | `dispatch-and-routing.regression.ts` §3 | moved verbatim |
| Test 6 — template override persists `{{venueName}}` | `dispatch-and-routing.regression.ts` §4 | moved; `console.assert` → real throw (**stricter**) |
| Trailing regression check — payment `/health` reachable | `dispatch-and-routing.regression.ts` §5 | moved; `console.assert` → real throw (**stricter**) |
| Test 4 — retry 1/2/3 stay `queued`, 4th → `dead_letter` with `attempts: 4` | `retry-and-dead-letter.regression.ts` §1 | moved; `console.assert` → real throw (**stricter**) |
| Test 5 — **acceptance bar**: signed `charge_failed` webhook to Payment creates real push+sms `NotificationRequest` rows and suspends the subscription | `cross-service-e2e.regression.ts` §1 | moved verbatim |

## 8. Migrated OUT of Playwright (were pure API, drove no browser)

| Original | New location | Playwright file after |
|---|---|---|
| `findings-verification.spec.ts` — F-009 backend half (2× `POST /bookings` → 400 "Invalid co-player phone number format") | `slot-engine/.../co-player-and-alignment.regression.ts` §1 | keeps only the rendered red-error-box + valid-phone redirect |
| `findings-verification.spec.ts` — F-010 entire test (60-min + 30-min pools, start & end misalignment, exact "did you mean" suggestions) | `slot-engine/.../co-player-and-alignment.regression.ts` §2 | test deleted (not skipped) |
| `member-self-confirm.spec.ts` — raw-API concurrent double-confirm race (`raceCount === 1`) | `slot-engine/.../member-flow.regression.ts` §1 | keeps only UI confirm click + rendered states |

## 9. Untouched — still Playwright, still run via `pnpm test:e2e`

`f023-full-system.spec.ts`, `f041-verification.spec.ts`, `f043-phase-c.spec.ts`, `pwa-install-dismissal.spec.ts`, `guest-booking.spec.ts` — **zero changes**. Seed scripts `tests/seed-test-data.ts` and `apps/admin-web/tests/seed-admin-web-data.mjs` untouched.

---

## Deviations from the plan, stated plainly

1. **Section order within slot-engine** follows the original `concurrency.test.ts` execution order (Test 0 → 1-4 → 5-6 → 7), i.e. `low-occupancy-release` runs *before* `member-flow`, not after as the plan's prose listed. These sections share seeded pools and mutate booking rows; the original order is the one proven to pass, so it was preserved rather than reshuffled for cosmetic grouping.
2. **`cleanDatabase()` in slot-engine also clears** `availabilityPattern` / `availabilityOverride` / `generationLock`. Required: the availability-generation sections now run in the *same process*, leaving pattern rows that would break the next run's `resourcePool.deleteMany()` on a foreign-key constraint. Infrastructure only — no assertion changed.
3. **`console.assert` → real throws** in the notification suite (6 places). The originals printed on failure and let the run "pass" regardless. Now enforced.
4. **The notification suite now spawns its own services.** The original assumed the operator had already started identity-auth/payment/notification by hand.
5. **F-045 encoded as current behavior, not fixed.** `co-player-and-alignment.regression.ts` sends a JWT to `POST /bookings` for parity with the original Playwright call, with an explicit comment that the route does not verify it. No F-045 fix was made anywhere.

## Evidence

- `pnpm test:regression` — **5/5 suites, 46/46 sections passing** (identity-auth 6, tenant-management 4, slot-engine 23, payment 8, notification 7).
- `pnpm run typecheck` — clean across all 13 workspace projects.
- `pnpm run lint` — **no new problems**; verified by stashing all changes and diffing (the only delta traced to pre-existing uncommitted edits in `apps/admin-web/src/main.tsx`).
- Playwright, full local stack (5 services + Caddy + both dev servers): the 2 trimmed specs pass, and `guest-booking` + `pwa-install-dismissal` pass unchanged.
