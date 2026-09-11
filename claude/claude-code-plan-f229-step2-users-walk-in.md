# F-229 Step 2 — `POST /users/walk-in` (identity-auth) — implementation plan

**Status:** plan-mode, awaiting sign-off. Step 1 (`User.name`) signed off; branch `f229-manual-booking` at `004c25f`.
**Scope:** the admin-authenticated, no-OTP walk-in identity route only. No booking, no payment (Step 3), no UI (Step 5).

---

## 1. Real code checked (rule 8 — every citation re-verified against the branch)

| Claim in the hand-off | Verified |
|---|---|
| `requirePaymentLinkAdmin` dual-path shape | `services/payment/src/index.ts:704` — `Bearer <INTERNAL_SERVICE_KEY>` → returns `null`; else `request.jwtVerify()`, `roles.some(r => r === 'owner' || r.startsWith('branch_manager:'))`, 403 if not, returns `decoded`. Exactly as described. Note: **no tenant check on the JWT path.** |
| `phone_tenantId` find-or-create in `/auth/otp/verify` | `services/identity-auth/src/index.ts:318` — `prisma.user.findUnique({ where: { phone_tenantId: { phone, tenantId } } })` then `prisma.user.create({ data: { phone, tenantId, userType: UserType.GUEST, isPhoneVerified: true, googleId, email } })`. |
| identity-auth internal-key helper | `requireInternalKey` at `services/identity-auth/src/index.ts:70` — internal-key **only** (no JWT path). F-119 precedent: "extracted rather than copied when a second route needed it." |
| `GET /users/lookup` | `services/identity-auth/src/index.ts:90` — JWT-only (no internal-key path), `decoded.tenantId === tenantId` else 403, admin-role check, `normalizePhone` + `/^\+91[6-9]\d{9}$/`, `select: { id, phone, userType }` (**no `name`, no `email` — email exclusion is asserted by regression**). |
| `normalizePhone` | `services/identity-auth/src/index.ts:43` — `10 digits → +91…`, strips leading `0`, keeps `+` prefixes. |
| `UserType` enum | imported already: `import { PrismaClient, UserType } from '@badminton/database'`. |
| regression harness | explicit section registry in `services/identity-auth/src/regression/run.ts`; `cleanDatabase()` in `_fixtures.ts:57` wipes `user`; `signJwt` from `@badminton/test-harness`. |

Line-number drift noted in the hand-off review is real: Chief's doc says `requirePaymentLinkAdmin` at `:704` (correct on this branch) but `/payment-links/negotiated` at `:957` — will re-verify each in Step 3, not here.

## 2. What gets built

### 2a. New helper `requireWalkInAdmin` (identity-auth)

A local named helper mirroring `requirePaymentLinkAdmin`'s dual-path shape — genuinely a new shape in identity-auth (its only existing helpers are internal-key-only `requireInternalKey` and inline JWT checks), so a named extraction per the F-119 precedent, not a copy.

```
async function requireWalkInAdmin(request, reply, bodyTenantId): Promise<any | null>
  - Bearer <INTERNAL_SERVICE_KEY>            → return null   (trusted service caller)
  - no auth header                           → 401 UNAUTHORIZED
  - request.jwtVerify():
      roles.some(owner | branch_manager:*)   → else 403 FORBIDDEN
      decoded.tenantId === bodyTenantId       → else 403 FORBIDDEN   (this is stricter than
                                                requirePaymentLinkAdmin, matching /users/lookup's
                                                own tenant check — an admin JWT may only create a
                                                walk-in in its own tenant)
      return decoded
```

### 2b. New route `POST /users/walk-in` (identity-auth), placed right after `GET /users/lookup`

Body `{ phone, name, tenantId }`.

1. `requireWalkInAdmin(request, reply, body.tenantId)` **before** reading/normalizing the rest (F-090/F-045/F-071 — auth before parse).
2. Validate `phone`, `name`, `tenantId` all present → 400 `BAD_REQUEST`.
3. `name`: trimmed, non-empty, ≤ 120 chars → else 400 `INVALID_NAME`.
4. `phone = normalizePhone(rawPhone)`; `/^\+91[6-9]\d{9}$/` → else 400 `INVALID_PHONE` (reused verbatim from `/users/lookup`).
5. `findUnique({ where: { phone_tenantId: { phone, tenantId } } })`.
   - **Found** → return it **unchanged** (`created: false`). Do **not** overwrite `name` on an existing row (hand-off: "not this route's job").
   - **Not found** → `create({ data: { phone, tenantId, name, userType: UserType.GUEST, isPhoneVerified: false } })`, `created: true`.
     - Wrap the `create` in a `P2002` catch (concurrent walk-in for the same phone) → re-`findUnique`, return existing with `created: false`. Same catch-and-return-existing shape `createPaymentLinkForHeldBooking` uses; cheap insurance since the submit button is admin-clickable twice.
6. Response (envelope-wrapped `{ data: … }`): `{ id, phone, name, userType, created }`.

**No OTP, no session, no `PendingInvite` resolution, no cross-service call.** `isPhoneVerified: false` is deliberate — the admin is the trust boundary; this account never proves phone ownership itself (hand-off §3a).

### 2c. `GET /users/lookup` — add `name` to the select — **flagged decision, see §4**

## 3. Blast radius

| Touched | Consumers | Effect |
|---|---|---|
| **new** `POST /users/walk-in` | none yet (Step 5 UI is the first) | additive |
| **new** `requireWalkInAdmin` | only the new route | additive |
| `GET /users/lookup` select (**if §4 = yes**) | (a) `services/identity-auth/src/regression/admin-phone-lookup.regression.ts:62` — asserts `data.id` present and `data.email` **absent**; `name` additive, safe. (b) `apps/admin-web/src/main.tsx:672` `UserLookupResult` type — old admin-web negotiated page; additive optional field, runtime unaffected, TS type only sees it if the interface is extended. | additive, safe |
| `services/identity-auth/src/regression/run.ts` | +1 section import (`walkInSections`) | additive |
| `_fixtures.ts` | none — `cleanDatabase()` already wipes `user`; `walk-in.regression.ts` seeds its own users | none |

Nothing else in the 5 services / 2 frontends / seed scripts / test harness reads `/users/walk-in` or calls `requireWalkInAdmin`. `User.name` from Step 1 is already live in all three DBs.

## 4. One decision for the reviewer — `GET /users/lookup` returning `name`

Step 5's guest-lookup "found" state shows **the resolved name**. `/users/lookup` currently returns `{ id, phone, userType }` only. Two ways:

- **(A) Add `name: true` to `/users/lookup`'s select now, in Step 2.** Same file, same walk-in admin surface, one line, additive, blast radius above is clean. Step 5 then has everything it needs from an already-verified route.
- **(B) Defer to Step 5.** Keep Step 2 to strictly the new route; add the `name` field when the UI that needs it lands.

**Recommend (A)** — it's the identity-auth half of the same walk-in feature, trivially safe, and keeps Step 5 frontend-only. But it is a change to an existing route, so calling it out rather than folding it in silently.

## 5. Verification (live-fire, before reporting back)

Direct API calls against the dev stack (identity-auth :3002), real `badminton_db` JBC tenant, both auth paths:

1. **Internal key, new phone** → 200, `created: true`; DB read-back: row exists, `userType: GUEST`, `isPhoneVerified: false`, `name` set.
2. **Internal key, existing phone** (re-run of 1) → 200, `created: false`, same `id`; DB read-back: `name` **unchanged** even if a different `name` was sent.
3. **Owner JWT, own tenant, new phone** → 200, `created: true`.
4. **Owner JWT, wrong tenant** → 403 `FORBIDDEN`.
5. **Member (non-admin) JWT** → 403 `FORBIDDEN`.
6. **No auth** → 401.
7. **Bad phone / empty name** → 400 with the right code.
8. If §4=(A): `GET /users/lookup` for a walk-in-created user returns `name`; regression still asserts no `email`.

New regression suite `services/identity-auth/src/regression/walk-in.regression.ts` covering 1–7 (+8 if §4=A), added to `run.ts`. Then: `pnpm -r build` (rebuild — suites run from `dist`), whole-repo typecheck/lint, full 5-service regression against `badminton_db_test`.

## 6. Commit / push / sign-off

One commit `F-229 Step 2: POST /users/walk-in (identity-auth)` + a `docs(F-229): batch-log Batch 36` commit (per-step cadence). Push to `f229-manual-booking`, report back with raw evidence for independent re-verification **before Step 3**. No PR to `main` yet. **No commit until this plan is signed off.**
