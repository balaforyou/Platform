# F-228 Step 5 — `PATCH /users/:id/type` dual-path admin JWT — implementation plan

**Backfill, not a correction — this doc didn't exist in `claude/` until now, despite the work already
having shipped.** Commit `3b19a52` ("F-228 Step 5: PATCH /users/:id/type dual-path admin JWT"), on
branch `f228-step5-usertype-admin-jwt`, merged into `main` as part of PR #25. Written 2026-09-25, from
the real saved plan-mode file this work was implemented against
(`snappy-fluttering-stallman.md`, heading "F-228 Step 5 — `PATCH /users/:id/type` dual-path admin JWT"),
cross-checked against the shipped commit diff and the F-228 umbrella register row — not reconstructed
from the diff alone, since the diff only carries the "what," not the grounding or the rejected
alternative.

**A caveat on the source PR, flagged rather than smoothed over:** PR #25 is titled "F228 step6 member
provisioning" with an empty body — it is the branch that carries Step 6 forward, and it happens to
contain Step 5's commit (`3b19a52`) stacked underneath Step 6's own commits (`c72dd7e`, `8d94a1f`), per
`git log --oneline main -- services/identity-auth/src/index.ts`. There is no PR specific to Step 5 alone;
the real per-step description lives in the commit message and the saved plan file, both of which this
doc is built from.

**Status:** already implemented, merged, and deployed as part of F-228's full six-step close-out
(register row confirms `F-228 → Resolved`, 11 Sep 2026). Nothing here changes code or the register —
documentation catching up to already-shipped, already-verified work.

---

## 1. Context — why a new admin route was needed

`PATCH /users/:id/type` (`services/identity-auth/src/index.ts:1279` at the time) updates a user's
`UserType` (`GUEST | MEMBER | STAFF` — member-tier reclassification, not privilege escalation; `OWNER`/
`BRANCH_MANAGER` are tracked separately via `RoleAssignment` in tenant-management). The route existed
already but was internal-key-only (`requireInternalKey`), per a comment tracing back to the original
Phase 2 spec that named only this route and `POST /bookings/resolve-invites` as internal-only. A grep
across the repo confirmed **no production caller exists anywhere** — only the regression fixture called
it.

F-228 Step 5 adds a second auth path: a real owner/branch_manager admin JWT, alongside the unchanged
internal-key path, so a future admin-v2 UI feature (promoting a guest/member — not built yet at this
step, landed two steps later in Step 6's `MemberProvisioningPanel.tsx`) can call this route directly
from an admin's own session instead of needing a backend-to-backend call. Backend-only at this step, the
same shape as Step 2 being backend-ahead-of-Step-3's-UI.

## 2. Alternative considered and rejected — reusing `requireWalkInAdmin`'s shape

`requireWalkInAdmin` (`index.ts:100-143`, F-229) is the established dual-path precedent in this same
file: internal key OR owner/branch_manager JWT. The obvious move was to reuse it, or copy its shape
outright, for this route too.

**Rejected for a real, concrete reason: `requireWalkInAdmin`'s tenant check trusts a client-supplied
value.** It compares `decoded.tenantId` against a **body-supplied `tenantId`** — correct for
`POST /users/walk-in`, a CREATE, where the tenant of the row being created genuinely *is* whatever the
body says. It is wrong for this route: a PATCH against an arbitrary existing `:id`. Naively reusing the
same shape here would have let a caller holding a legitimate owner/branch_manager JWT for **Tenant A**
supply **Tenant B's** `tenantId` in the request body, pass the tenant check against their own token, and
promote or demote a real user that actually belongs to Tenant B — a genuine cross-tenant authorization
bypass, not a hypothetical one, since nothing about the body's `tenantId` is verified against the
resource being modified.

**Built instead:** a new, distinctly-named helper (`requireUserTypeAdmin`, not a reuse of
`requireWalkInAdmin`) that defers the tenant check until the target row's **real tenantId** has been
looked up server-side, and compares the caller's JWT `tenantId` against *that* — never a value the
client supplied. This removes the spoofing vector entirely rather than matching `requireWalkInAdmin`'s
shape by rote. The plan is explicit that this deserves its own name "so a future reader isn't confused
about which route it's for."

## 3. Blast-radius check (rule 3a)

Per the plan file's own investigation, before implementation:

| Touched / considered | Consumers | Effect |
|---|---|---|
| `PATCH /users/:id/type` (existing route, auth changed) | Zero production callers anywhere in the repo (confirmed by grep) — only `jwt-session.regression.ts:82-98`'s internal-key-path assertions (401-without-key, 200-with-key). Those assertions are unaffected: the internal-key path's behaviour is unchanged, still no target lookup, still no tenant check. | additive-only in practice; existing coverage re-asserted, not broken |
| **new** `requireUserTypeAdmin` helper | only the new route | additive |
| `requireWalkInAdmin` (F-229) | unrelated route (`POST /users/walk-in`); not modified, only used as a design reference (and explicitly rejected as a direct reuse — see §2) | untouched |
| `GET /users/lookup` (`index.ts:181-186`) | Investigated while researching the "owner or branch_manager" check: this same 2-line predicate is already duplicated there, inline, a second time, even though `requireWalkInAdmin` already exists as a named helper. The plan flags this as a **third** occurrence once this step's own code lands, but deliberately scopes it out — "won't refactor the other two existing occurrences (that's a separate, wider cleanup, not this step's job)." | untouched by this step; noted for a future cleanup, not filed as its own finding here |

No frontend caller existed at this step (admin-v2's promote-user UI was Step 6, two steps later), so
there was nothing else in the two frontend apps or the other four services to check for this specific
route.

## 4. What was actually built

Matches the plan's design closely, confirmed against the real diff (`3b19a52`):

- **New helper `requireUserTypeAdmin(request, reply)`** (`services/identity-auth/src/index.ts`):
  - `Bearer <INTERNAL_SERVICE_KEY>` → returns `null` (fully trusted, unchanged behaviour).
  - No auth header → 401 `UNAUTHORIZED`.
  - `request.jwtVerify()` fails → 401 `UNAUTHORIZED`.
  - Valid JWT, role not `owner` or `branch_manager:*` → 403 `FORBIDDEN` ("Owner or Branch Manager role
    required").
  - Valid admin JWT → returns the decoded token. **No tenant check happens inside this helper** — the
    target user isn't known yet at this point, exactly as planned.
- **Route body** (`PATCH /users/:id/type`): reads `:id`, calls `requireUserTypeAdmin`, validates
  `userType` (unchanged 400 `BAD_REQUEST` behaviour), then — **only on the admin-JWT path**
  (`if (decoded)`) — looks up the target row's real `tenantId` via `prisma.user.findUnique`, 404s
  `USER_NOT_FOUND` if the row doesn't exist, 403s `FORBIDDEN` ("Tenant mismatch") if
  `decoded.tenantId !== target.tenantId`, then proceeds to the same `prisma.user.update` as before.
  The internal-key path (`decoded === null`) skips the lookup and tenant check entirely — unchanged,
  fully trusted, matching today's behaviour exactly.
- **Regression**: a new section in `jwt-session.regression.ts` covering exactly the plan's list —
  no-auth 401, non-admin-role 403, correct-tenant JWT 200 with a DB read-back confirming the new
  `userType`, cross-tenant JWT 403 `FORBIDDEN` with a DB read-back confirming **no write occurred**, and
  the internal-key path re-asserted unchanged. (The plan's proposed 404-on-nonexistent-`:id` case for the
  admin path is present in the shipped route logic; not independently re-confirmed against the
  regression file's exact assertions in this backfill pass, but the code path matches the design.)

**A real gap between the plan and what shipped, flagged rather than smoothed over:** the plan states,
in its blast-radius section, an intent to "extract just that 2-line `isAdmin` predicate into a tiny local
helper for my own new code to use" (referring to the owner/branch_manager role check duplicated a second
time in `GET /users/lookup`, per §3 above). The shipped diff does **not** do this — the role check
(`roles.includes('owner') || roles.some(r => r.startsWith('branch_manager:'))`) is written inline inside
`requireUserTypeAdmin`, the same way it is inline in `requireWalkInAdmin` and in `GET /users/lookup`. So
this step's own code became a **third** inline occurrence of that check, not a consumer of a new shared
predicate as the plan proposed. Functionally identical and not a bug — but a real, honest divergence from
the plan's stated intent, worth recording rather than silently treating the shipped code as if it matched
the plan in full.

## 5. Verification — real evidence (from the commit message and the regression diff)

Per the plan's verification gate and the commit's own claims:

- Whole-repo typecheck clean.
- Rebuilt before testing (F-085 discipline) — commit message states the rebuild-before-test rule was
  followed.
- Full 5-service regression suite against `badminton_db_test`, run **three times** (one transient
  "slot-engine did not become healthy" startup-timing failure on the first attempt — the project's own
  documented environmental-failure class, not a real regression — clean 5/5 twice after, ports confirmed
  clear before each run).
- Live-fire regression coverage for the new route specifically (`jwt-session.regression.ts`, confirmed
  in the diff):
  1. No auth at all → 401.
  2. Non-admin JWT (no owner/branch_manager role) → 403.
  3. Admin JWT, correct tenant → 200; DB read-back confirms `userType` actually changed.
  4. Admin JWT, different tenant, targeting a real user in the first tenant → 403 `FORBIDDEN`; DB
     read-back confirms **no write occurred**.
  5. Internal-key path unchanged (401 without key, 200 with key — pre-existing assertions re-run, not
     newly written).
- No browser live-fire this step — correctly so, per the plan: no frontend caller existed yet (Step 6
  built the first one), so HTTP-level regression evidence is the real evidence here, the same shape as
  Step 2's close-out before Step 3 built its UI.

This matches the standard this project already runs for backend-only steps: Claude Code investigates and
implements with real execution access → Technical Lead spot-checks and gatekeeps → independent
re-verification of the pushed branch before the next step begins. The F-228 umbrella register row
confirms every step's diff was independently re-pulled and re-verified against the real pushed branch
before the following step started.

## 6. Sign-off

Already merged (as part of PR #25, alongside Step 6) and deployed as part of F-228's full close-out
(register row: `F-228 → Resolved`, 11 Sep 2026). This backfill doc requires only doc-level sign-off
before it is treated as complete — no code, no register change, nothing to re-verify beyond the
cross-checks already performed above (plan file, register row, and the real shipped commit diff, each
checked against the other two).
