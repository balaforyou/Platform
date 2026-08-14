# F-090 Fix Kickoff — Authenticate `POST /bookings/:id/check-in` (14 Aug 2026)

**Purpose:** Close F-090, the unauthenticated `CONFIRMED → CHECKED_IN` mutation confirmed live on 14 Aug 2026 against both the direct service and the real public gateway path. This kickoff is deliberately narrow: **authentication only**, one handler, no behaviour change beyond who is allowed to call it.

**Severity:** HIGH — same tier as F-045/F-053/F-061/F-071. Prioritized ahead of lower-stakes queued work because the mutation is irreversible through the API and permanently blocks the legitimate customer's refund path.

---

## 1. What is being fixed

`POST /bookings/:id/check-in` at `services/slot-engine/src/index.ts:2301-2321` performs no caller identity check of any kind. Its only guard is a booking-status check.

Confirmed during F-090's investigation:

- `grep -c "addHook"` over the file returns **0** — there is no `onRequest`/`preHandler`/`preValidation` hook anywhere, so authentication is strictly per-route and nothing supplies it indirectly.
- `fastifyJwt` is registered at `:24-26` as a decorator only.
- **29 of 38 routes in the same file are authenticated.** Check-in is the only booking-scoped route with no identity check, bracketed on both sides by protected siblings — `confirm` at `:2276` and `cancel` at `:2324`.
- Live-fire: unauthenticated `POST` returned `HTTP 200` with `"status":"CHECKED_IN"` while the control `confirm` returned `HTTP 401`; database read-back confirmed a genuine persisted write.
- Reproduced through Caddy's `/api/slot-engine/*` blanket proxy, so it is reachable from the public internet on the live deployment.

## 2. Guard decision — and why it is not `confirm`'s pattern

"Match the siblings" is ambiguous, because `confirm` and `cancel` use different patterns. The decision was settled against real code rather than assumption:

- **The only caller anywhere is the guest PWA.** `apps/admin-web/src` contains zero check-in code; no admin check-in screen exists.
- **The UI is explicitly self-service** — `apps/guest-member-pwa/src/components/BookingHistory.tsx:245` renders a button labelled "I'm Here", and the E2E test names the behaviour "self check-in" (`apps/guest-member-pwa/tests/guest-booking.spec.ts:139`).
- **The guest PWA already sends a JWT** — `BookingHistory.tsx:41-44` passes `token: accessToken`. The client authenticates today; only the server fails to check.

Therefore `requireInternalKey` alone (`confirm`'s pattern) **would break the only working caller**. The decision is `cancel`'s dual-path pattern, which is a drop-in, non-breaking fix.

The separate product question — whether check-in *should* be staff-operated rather than guest-initiated — is deliberately **not** decided here. It is tracked as F-093 so it cannot ride in on a security fix.

## 3. Pre-flight check (completed)

`requireBookingAccess` fails closed on a token carrying no `tenantId` (`index.ts:229`). If guest access tokens lacked that claim, this fix would break "I'm Here" instead of protecting it.

**Verified:** `services/identity-auth/src/index.ts:349-355` signs the guest access token as `{ userId, tenantId, phone, userType, roles }`. `tenantId` is present. The test-harness helper `guestToken()` (`services/slot-engine/src/regression/_fixtures.ts:35-37`) signs the same shape. Risk cleared.

## 4. The change

```ts
server.post('/bookings/:id/check-in', async (request, reply) => {
  let isInternal = false;
  let claims: any = null;

  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch {
    claims = await requireUserJwt(request, reply);
  }

  const { id } = request.params as any;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) { reply.status(404); throw new Error('Booking not found'); }

  if (!isInternal) requireBookingAccess(booking, claims, reply);

  // existing status logic below, unchanged
});
```

### Three implementation constraints, each verified against source

1. **Do not copy `cancel`'s auth block verbatim — it carries F-092's bug.** `index.ts:2334-2337` throws a bare `Error` after `reply.status(401)`, which the envelope maps to HTTP 500. `requireUserJwt` (`:2404-2431`) does the same job and sets `statusCode`/`code` correctly. Building from it fixes F-090 without propagating F-092 into a second route. **F-092 itself stays open and separate.**

2. **`requireUserJwt` returns exactly the shape `requireBookingAccess` consumes** — `{ userId, tenantId, userType, roles }` against `decodedUser.tenantId`, `.userId || .sub || .id`, `.roles` (`:229-240`). No adapter needed.

3. **No Prisma `include` change required.** `requireBookingAccess` reads only `tenantId`, `userId` and `branchId` — all plain scalars already returned by the existing `findUnique`. (`cancel` includes `window`, but for its refund maths, not its guard.)

### Ordering is load-bearing

Authenticate **before** the `findUnique`, and run `requireBookingAccess` **before** the idempotent `CHECKED_IN` early-return at `:2310`. Otherwise an unauthenticated caller can still probe booking existence via 404-vs-401, and an authenticated-but-unauthorised caller can probe booking status.

This is F-045's own stated lesson, recorded in its comment at `:1856-1858`: *"identity is established BEFORE anything else, including the idempotency short-circuit."* `cancel` already follows this shape.

## 5. Verification plan

Live-fire plus database read-back — the same standard that found the defect. Every case run **both** directly against the service **and** through Caddy's `/api/slot-engine/*` prefix, since the gateway hop is what made this publicly exploitable.

| # | Case | Expected |
|---|---|---|
| 1 | No `Authorization` header | **401** (was 200 — the regression that proves the fix) |
| 2 | Guest JWT, booking owner | 200 + `CHECKED_IN` (proves "I'm Here" still works) |
| 3 | Guest JWT, different user, same tenant | 403 (IDOR guard) |
| 4 | Guest JWT, different tenant | 403 (tenant boundary) |
| 5 | Internal service key | 200 (staff/internal path preserved) |
| 6 | Admin JWT, `branch_manager:<other branch>` | 403 (branch scoping) |

- **Database read-back on cases 2 and 5** — a response code is not proof of a write.
- For cases 1, 3, 4 and 6, confirm the row did **not** change.
- **Regression canary:** `apps/guest-member-pwa/tests/guest-booking.spec.ts:137` clicks the real check-in button and asserts the status update. It must still pass. Per F-046, run it **individually**, not as part of the suite.
- Fixtures namespaced and deleted after the run, per F-046 discipline.

## 6. Explicitly out of scope

| Excluded | Tracked as |
|---|---|
| The four other unauthenticated mutating routes in this file | F-091 (needs its own live-fire first) |
| `cancel` returning 500 instead of 401 on auth failure | F-092 (stays separate by decision) |
| Whether self-check-in should exist / be reversible | F-093 (product decision) |
| Server-side check-in timing enforcement | F-094 (reuses `branchTime.ts`; depends on F-088) |

## 7. Expected blast radius

One handler, roughly ten added lines, no new helpers, no schema change, **no client change**. The guest PWA already sends the token — this makes the server verify what the client has been sending all along.
