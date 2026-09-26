## Source: `claude/chief-triage-security-retrofit-audit-f290-f298.md`

```markdown
# Triage — independent security/architecture audit, F-290–F-299 assigned, 23 Sep 2026

## Sequencing decision — 23 Sep 2026

Bala's explicit call: finish the in-flight work (F-288, F-276 kickoff, F-044 Phase B) before
starting this batch, overriding this thread's recommendation to run F-297 in parallel immediately.
Recorded here rather than silently applied. This batch stays fully triaged and ready — nothing
below needs re-doing when we pick it up, just re-confirm no drift on the cited lines per rule 8
before kickoff, same as every other piece of work in this project.

## Source

A second Claude thread independently re-verified a separate Claude Code audit brief
("Repo-Wide Code Quality & Architecture Audit") by cloning `balaforyou/Platform` fresh and reading
every cited file:line against live code, plus its own static-pattern pass — doc:
`https://claude.ai/code/artifact/71dcd457-c59c-4cb7-bb08-fd6d7ac9fdb9` ("Slotflow — Security
Retrofit Plan & Way Forward").

## Independent re-verification by this thread, this session (rule 2/8 — not taken on trust)

Spot-checked the highest-severity claims directly against current `main` before assigning
anything:

- **(a)** `payment/src/index.ts:1461` — confirmed, `simulate-capture`'s only gate is
  `NODE_ENV === 'production'`.
- **(b)** `identity-auth/src/index.ts:1320` — confirmed, `GET /users/:id` has zero auth, returns
  the full `User` row.
- **(g)** confirmed `requireInternalKey` real and separately defined in `identity-auth:72`,
  `tenant-management:32`, `slot-engine:105`, each commented as mirroring the others — genuinely
  three copies of one rule, never extracted.
- Notification service (c): confirmed all 4 routes (`/notifications/send`,
  `/notifications/templates`, `/devices/register`, `/notifications/:userId/history`) exist with no
  visible guard call near any of them.
- (d) `/payment-links` and (e) `/subscriptions` routes both confirmed to exist at the cited
  locations.

**One real correction to the audit's own framing — found by re-reading past its citation, not
just confirming it (`identity-auth/src/index.ts:383-400`):**

The report describes the OTP/`NODE_ENV` issue as "hardcoded whenever `NODE_ENV !== 'production'`,"
implying flipping the flag and provisioning `MSG91_AUTH_KEY` closes it. **It does not.** The code
generates `const code = '123456'` unconditionally, before any environment branch. The
`NODE_ENV === 'production'` branch, even with a real `MSG91_AUTH_KEY` present, does nothing but
a comment: `// Perform MSG91 API dispatch here in production` — **no real SMS dispatch call
exists anywhere in this codebase, and no random code is ever generated.** This matches, and is
corroborated by, this project's own existing **F-161** (19 Sep — "the SMS integration does not
actually exist yet," logged there as supporting context for a WhatsApp-OTP proposal, not as its
own auth-bypass finding). So the real fix is not "flip a flag" — it's "build the SMS dispatch
that was never built," with the flag/env split as a separate, necessary but not sufficient, piece.

**This project already has a proven precedent for exactly this class of fix**: F-195 (admin-v2
Slice 1) hit the identical shape — the demo VM's `NODE_ENV=development` was silently unlocking
admin auth — and fixed it by decoupling the dev-bypass onto its own explicit, default-off flag
(`ADMIN_DEV_LOGIN`) rather than trusting `NODE_ENV`. The guest/member OTP fix should reuse that
exact shape (rule 3), not invent a new one.

**Also checked and correctly excluded from new IDs**: the audit's "lower priority" rate-limiting
gap on payment/slot-engine is not new — it's already tracked, in more depth, as **F-080**
(refined 15 Aug into four distinct rate-limiting concerns). No duplicate ID. Worth noting back to
F-080, not opening fresh: the audit's own point that "once auth is fixed, single-request abuse
becomes the live concern" sharpens F-080's existing priority call, it doesn't add new scope.

## Findings assigned (rule 5 — this thread only)

Highest existing register ID before this batch: F-289 (this session's own prior assignments).

| ID | Severity | What |
|---|---|---|
| **F-290** | Structural | No shared internal-key auth helper — `requireInternalKey` hand-copied 3x, root cause underlying F-291/F-292/F-294's fix shape |
| **F-291** | Critical, live exploitable | `GET /users/:id` (identity-auth) — zero auth, full PII exposure |
| **F-292** | Critical, live exploitable | notification service — all 4 routes have zero auth |
| **F-293** | Critical, live exploitable | `POST /subscriptions` (payment) — zero auth |
| **F-294** | Critical, live exploitable | `POST /payments/test/simulate-capture` — `NODE_ENV` gate never engages on the live (dev-mode) deployment |
| **F-295** | Critical, live exploitable | `POST /payment-links` — trusts client-supplied tenant/user/amount, no cross-check against the real booking |
| **F-296** | High, silent | Webhook capture-confirm ordering — duplicate-guard write precedes the slot-engine confirm call; an unrecoverable gap if confirm fails |
| **F-297** | **Critical — highest severity in this batch** | `NODE_ENV=development` in production ⇒ guest/member OTP is always `123456`, and real SMS dispatch is genuinely unimplemented (not just gated) even with a real key configured. Live authentication bypass on every guest-facing login today, not a single endpoint — corrected/upgraded from the source report's framing per the re-verification above. |
| **F-298** | Structural/High | `'test-service-key'` fallback literal, 26 raw occurrences — should fail closed at service startup if `INTERNAL_SERVICE_KEY` is unset, rather than silently degrading to a guessable shared secret |
| **F-299** | Structural, defense-in-depth (not live-exploitable) | Added 23 Sep, surfaced during F-276's kickoff plan review — see below |

Not assigned — already covered: rate limiting on payment/slot-engine → **F-080** (existing,
refined). No new ID.

Not yet assigned — logged as real but lower-priority infra/ops gaps, pending Bala's call on
whether to formalize now or bundle into a later "production hardening" pass: no automated DB
backups, no error tracking/APM, no container resource limits, no graceful shutdown (SIGTERM)
handling, single-VM/single-region, no uptime monitoring, no dependency vulnerability scanning in
CI. None are live-exploitable the way F-291–F-297 are — operational resilience gaps, not active
attack surface.

## F-299 — the admin walk-in write path has no server-side member-collision check

Surfaced by Claude Code during F-276's kickoff plan review (23 Sep), correctly described-not-
numbered per rule 5, assigned here. The admin walk-in booking write path (`WalkInBookingFlow.tsx`
→ `POST /payment/bookings/manual` → `POST /bookings/negotiated` on slot-engine) has no server-side
call to `collidesWithMemberAssignment` anywhere in that chain — independently confirmed this
session directly (`services/slot-engine/src/index.ts:4202` onward, `/bookings/negotiated`'s full
body has no reference to the collision helper or any member-exclusion check). Today this is masked
entirely by the frontend: the slot dropdown sources from `GET /resource-pools/:id/availability`,
which does run the real collision check, so a member-blocked window never appears as pickable —
but the write route itself has no server-side reinforcement of that exclusion.

**Severity: Structural/defense-in-depth, not live-exploitable.** The route is admin-only,
`INTERNAL_SERVICE_KEY`-gated already, not guest-facing — a real gap, but not active attack surface
the way F-291–F-297 are. Not urgent standalone.

**Sequencing note**: real, natural pairing with F-276's own eventual implementation, since F-276's
Section C is already committing to "server-side re-validation, not a client-trusted bypass" on
this exact write path for its own release-eligibility check. Worth deciding together whether one
change closes both, once F-276's implementation-level plan is designed — not before.

## Recommended sequencing (adopting the source report's, one adjustment)

1. **F-290 first** — mechanical extraction into `packages/shared-middleware`, the dependency every
   other item in this batch touches. Also closes F-298's fail-open gap in the same pass (same
   file, same PR — not scope creep, it's the natural home).
2. **F-291, F-292, F-293** — one-line-per-route once F-290 lands.
3. **F-294** — pairs naturally with the above, same guard, added alongside the existing env check.
4. **F-295** — needs the extra branch/tenant cross-check logic (F-274's pattern) on top of the
   guard swap; slightly more work, sequence after the mechanical ones.
5. **F-297** — real, standalone build (SMS dispatch + `ADMIN_DEV_LOGIN`-style flag decoupling),
   larger than the others individually but not dependent on F-290. Originally recommended to run
   in parallel with 1–4 given severity — **superseded by Bala's 23 Sep sequencing decision above**:
   waits behind the in-flight work like everything else in this batch.
6. **F-296** — the one item needing a design decision between two retrofit options (reorder vs.
   compensating retry via `job-scheduler`, which is already independently getting wired up for
   real as **F-044 Phase B** — corrected 23 Sep, this was originally mislabeled F-279, see
   `claude/chief-decision-f279-sweep-never-scheduled.md`'s correction note — real synergy, not
   coincidence, worth having that build inform this one's implementation once both exist). Flag
   for explicit sign-off, not bundled into the mechanical PRs.
7. **F-299** — pairs with F-276's implementation once designed; not urgent standalone.

## Relative to currently in-flight work

**Superseded 23 Sep — see sequencing decision at top.** This thread's original read was that this
batch, being live-exploitable, should jump the queue ahead of anything not yet started. Bala's
call: finish in-flight work first regardless. Noted, not argued further — a real production
judgment call is his to make.

## Decisions needed from Bala before kickoff

1. Confirm F-290–F-299 as assigned (or adjust/merge/split).
2. Confirm the sequencing above, or adjust.
3. Pick F-296's retrofit shape: reorder + retry-safe key (cleaner, wider blast radius) vs.
   compensating retry via `job-scheduler` (lower risk, recommended by the source report and by
   this thread given F-044 Phase B is already standing up that same infrastructure).
4. Confirm the 7 lower-priority infra/ops items stay logged-but-unassigned for now, or formalize
   them into findings today.
5. ~~Whether F-297 should start immediately, ahead of even F-290~~ — resolved 23 Sep, waits behind
   in-flight work.
```

## Source: `claude/claude-code-handover-security-retrofit-f290-f299-kickoff.md`

```markdown
# Security retrofit batch — F-290 through F-299 — kickoff handover

Approved 23 Sep 2026, Bala + Chief. All citations re-confirmed against real `origin/main` this
session (rule 8) — zero drift found on any of them. Full triage/reasoning:
`claude/chief-triage-security-retrofit-audit-f290-f298.md` — read that first for context on each
finding; this doc is the sequencing and go-ahead.

## Sequencing — proceed in this order, one PR per stage unless noted

1. **F-290** — extract `requireInternalKey` (currently hand-copied identically at
   `identity-auth:72`, `tenant-management:32`, `slot-engine:180`) into `packages/shared-middleware`
   (new package, or confirm an existing natural home first). **Same PR**: close F-298's fail-open
   gap — service startup should fail closed if `INTERNAL_SERVICE_KEY` is unset, rather than
   silently falling back to the literal `'test-service-key'` (27 real occurrences today, confirmed
   this session). Same file/PR, not scope creep — it's the natural home for both.
2. **F-291** — `identity-auth`'s `GET /users/:id` (`:1388`, confirmed zero auth, returns full real
   `User` row) — add the shared guard.
3. **F-292** — notification service, all 4 routes (`/notifications/send`,
   `/notifications/templates`, `/devices/register`, `/notifications/:userId/history`, confirmed all
   unguarded) — same guard, four one-line additions.
4. **F-293** — payment's `POST /subscriptions` (`:387`, confirmed zero auth) — same guard.
5. **F-294** — payment's `POST /payments/test/simulate-capture` (`:1497`) — confirmed its only gate
   today is `if (process.env.NODE_ENV === 'production') { 404 }`; add the shared internal-key guard
   alongside the existing env check, don't replace it.
6. **F-295** — payment's `POST /payment-links` (`:940`) — needs more than the guard swap: add the
   branch/tenant cross-check against the real booking (F-274's existing pattern is the precedent,
   reuse don't invent — rule 3) so a client can't supply an arbitrary tenant/user/amount.
7. **F-297** — real, standalone build, largest item in the batch. Two real parts:
   - Guest/member OTP: `identity-auth:383` generates `const code = '123456'` **unconditionally**,
     before any environment branch — confirmed still true this session. The
     `NODE_ENV === 'production'` branch does nothing but a comment
     (`// Perform MSG91 API dispatch here in production`) — no real SMS dispatch exists anywhere in
     this codebase (matches pre-existing F-161). Real fix: actually build the MSG91 dispatch call,
     not just gate the existing stub.
   - Decouple the dev-bypass from `NODE_ENV` onto its own explicit, default-off flag — reuse
     F-195's exact `ADMIN_DEV_LOGIN` shape (rule 3), don't invent a new pattern. Today
     `NODE_ENV=development` in production silently means every guest/member login accepts `123456`
     — this is a live, guest-facing auth bypass, the highest-severity item in this batch.
8. **F-296** — webhook capture-confirm ordering (`payment/src/index.ts:416-495`,
   `POST /webhooks/razorpay`). Real bug: the `WebhookEvent` idempotency-guard insert happens
   *before* the slot-engine confirm call; if confirm fails, the retry hits the dedup guard and the
   confirm is never retried — a real captured payment can get permanently stuck unconfirmed.
   **Decided shape (two stages, not one)**:
   - **Stage 1, this batch**: compensating retry via `packages/job-scheduler` — new job (same
     pattern as F-044 Phase B's three jobs) that scans for payment intents `status: 'captured'`
     whose booking never confirmed, and retries the confirm call. Purely additive, zero change to
     the existing webhook handler. F-296 moves to Resolved once this is live with real evidence
     (a real forced-failure test: kill slot-engine mid-webhook, confirm the compensating job
     catches and completes it on its own next tick).
   - **Stage 2, tracked but not this batch**: reorder the webhook's dedup-write to happen only
     after confirm succeeds (the real root-cause fix) — deliberately deferred until Stage 1's
     compensating job has real production evidence of how often it actually fires, which is the
     informed moment to judge whether the higher-risk core-logic reorder is worth it. Log this as
     a follow-up note tied to F-296, not a new ID — don't let it get lost the way F-044 Phase B
     nearly did between Phase A and B.
9. **F-299** — admin walk-in write path (`/bookings/negotiated`) has no server-side
   `collidesWithMemberAssignment` check, masked entirely by the frontend today. Not urgent
   standalone (admin-only, internal-key-gated route) — hold until F-276-adjacent work naturally
   revisits this path, don't force it into this batch. No action needed now; noted here so it
   isn't forgotten.

## Not in this batch

The 7 lower-priority infra/ops gaps (no automated DB backups, no error tracking/APM, no container
resource limits, no graceful shutdown/SIGTERM handling, single-VM/single-region, no uptime
monitoring, no dependency vulnerability scanning in CI) stay logged-but-unassigned per Bala's
call — real gaps, none live-exploitable the way F-291-F-297 are, bundle into a later dedicated
production-hardening pass rather than diluting this batch's focus. F-080 (rate limiting) already
covers the audit's rate-limiting point in more depth — no duplicate ID, nothing to do here.

## Standing rules apply as always

Plan mode first on anything non-mechanical (F-295's cross-check logic, F-297's build, F-296's new
job) — investigate fresh against current code before implementing, stop for sign-off. The
mechanical guard-swap items (F-291-F-294) can move faster but still get real evidence (a real
401/403 before, real success after, for both an internal caller and an external one) and still
stop for sign-off before merge (rule 6). Real evidence per rule 2 throughout — especially F-297
(prove the OTP is no longer always `123456` in a prod-like config, prove SMS dispatch genuinely
fires) and F-296 Stage 1 (prove the compensating job genuinely recovers a stuck payment, not just
that it runs).

Start with F-290 + F-298 together.
```
