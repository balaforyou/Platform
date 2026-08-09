# Coding Assistant Handover Plan (v0)

**Status:** Drafted 26 Jul 2026, for handover via Google Antigravity.
**Covers:** All 6 specced services + cross-cutting standards. Premium add-ons and the driver app are explicitly out of scope for this handover.
**Related docs:** every service spec, `tech_stack_architecture.md`, `api_standards_cross_cutting.md`

---

## 1. Working agreement (the ground rules)

These apply to every phase below, not just the first one:

1. **Comments required** — every non-trivial function gets a comment explaining *why*, not just *what* (the code already says what). Especially: the concurrency-safe reservation logic (Slot Engine), the webhook idempotency handling (Payment), and any tenant-scoping check — these are the places a future reader (including future-you) most needs the reasoning preserved.
2. **Performance considerations flagged, not silently optimized away** — if the agent makes a choice with a performance trade-off (e.g. an index, a caching decision, N+1 query risk), it should say so in the plan artifact or a code comment, not bury it.
3. **Stop at open questions** — if the agent hits something the spec doesn't answer, it stops and asks rather than assuming a reasonable default. The specs are detailed specifically so this should be rare, but rare isn't zero.
4. **Any deviation from spec requires confirmation first** — if implementation reveals the spec should change (a real possibility — specs are plans, not prophecy), that's a conversation before a code change, not a code change with a note after.
5. **Implementation plan required before code, every phase** — use Antigravity's **Plan Mode**, not Fast Mode, for all 6 phases below. Review and explicitly approve the plan artifact before letting it proceed to implementation.
6. **Scoped git commit only after explicit user sign-off — never self-triggered.** Added 30 Jul 2026, tightened 30 Jul 2026 after observing commits happening "whenever the agent feels the work is done" (e.g. mid-way through a self-directed testing/debugging loop, before the user had actually reviewed anything). **A passing test suite is not sign-off. A completed walkthrough is not sign-off. Only an explicit message from the user approving the work is sign-off** — something like "approved," "looks good, commit it," or equivalent. If that message hasn't been received, do not commit, no matter how confident the current state feels or how many tests pass. Once sign-off is actually given: commit with a message identifying the phase and what it covers (e.g. "Phase 9: pricing modes, member group assignments, negotiated bookings, refund override"), then confirm the working tree is clean (nothing untracked or modified left hanging) before moving to the next phase. This is the durable record of what actually happened — a commit made before real review defeats the entire point of having a review step at all.
7. **Every plan artifact must include an explicit Technical Design section — approach, edge cases, and test plan, not just a list of proposed changes.** Added 31 Jul 2026, after a full validation sweep caught multiple real bugs (trust-boundary gaps, a sequential-vs-concurrent testing gap, a real-browser-vs-script blind spot, a dev-runtime-vs-production-build gap, a multi-tab race condition) that were all things the *plan* never asked about up front, not things the implementation got wrong in isolation. Formalizing this turns hard-won lessons into a standing checklist instead of relying on catching each new instance during review. Every plan must explicitly address:
   - **Technical approach**: not just what changes, but why this approach over alternatives, stated plainly.
   - **Edge cases considered**, checked against these standing categories (add to this list as new categories get discovered — don't let it go stale):
     - *Trust boundaries*: can a client supply, override, or spoof anything that should be server-authoritative (price, identity fields, roles, amounts)? This project has found this exact bug 4+ separate times across different endpoints.
     - *Concurrency*: does "tested" mean genuinely simultaneous requests, or sequential calls that merely look the same from the outside? A DB-level constraint needs a real concurrent test to prove it's actually what's enforcing correctness.
     - *Real browser/device vs. script-level testing*: does an automated check actually render and interact with the real UI, or does it call an API directly while described as if it exercises the frontend? These are not equivalent and this project has been burned by the gap twice.
     - *Production build vs. dev runtime*: does this code path get type-checked and compiled the way it will actually ship (`tsc`), not just executed via a transpile-only dev runner (`tsx`) that can silently mask real errors?
     - *Multi-instance scenarios*: multiple browser tabs, multiple concurrent sessions for the same user, retries — does a fix that works for "one caller at a time" actually hold when there's more than one?
   - **Test plan mapped directly to the edge cases above** — not a generic "we'll test the happy path," but a stated test for each edge case actually identified, so review can check the coverage claim against the edge case list rather than trusting a summary.
8. **Every walkthrough must show real evidence, not summarize it.** Added 31 Jul 2026, after a walkthrough reported a working screen that turned out to silently fail on save with no error feedback anywhere — a summary-style report ("Added X, Added Y, verification passed") had no way to surface that, since it described intent rather than showing what actually happened. Every walkthrough must include:
   - **Actual code** for any non-trivial logic change — real snippets, not a prose description of what the code does.
   - **Actual request/response evidence** for anything backend — real payloads and status codes from an actual call, not "tests passed."
   - **A real screenshot for any UI change**, showing the actual rendered result, not a description of what should render.
   - **Explicit before/after for any bug fix** — what was actually broken (with evidence it was broken), what changed, and why that specific change addresses the specific symptom.
   - **An explicit statement of what was NOT verified** — if something couldn't be tested (no real device, a dependency wasn't available, etc.), say so plainly rather than letting a gap in coverage read as a gap in the walkthrough's confidence.
   A walkthrough that only describes intent is not evidence the work happened correctly — it's a claim, and this project's whole review discipline exists specifically to not take claims at face value.
9. **Every implementation submission uses the standard review report format below.** Added 8 Aug 2026, after F-044 Phase A took five review rounds to close. Rule 8 established that a walkthrough must *show* evidence rather than summarize it — F-055 exposed the next failure mode past that: a submission can show real-looking evidence from tests that are structurally incapable of failing. Phase A's four headline proofs were an in-memory `Map` standing in for a Postgres unique constraint, a string-equality check asserting a SQL constant equalled itself, a `packageJson` object literal defined inside the test it was "verifying", and four hardcoded strings claiming scope compliance. Every one produced genuine console output and a passing run. Rule 8 was satisfied and the work was still unproven. The format below front-loads the questions that actually caught it:
   - **A — Scope confirmation**: what was in and out of scope per the kickoff, plus explicit confirmation nothing excluded was touched, worked around, or silently fixed.
   - **B — Per-requirement checklist**: one row per requirement, defect, and test. Columns: requirement | Fully Evidenced / Partial / Not Done | the actual artifact (real code, real command output, real screenshot — never a description of one) | **"would this fail if the real thing were broken?"**, with reasoning. That last column is the point of the whole table; it is the question none of the F-055 tests could have survived.
   - **C — Concurrency/race claims**: name the genuine parallelism mechanism used — separate connections, separate processes, `Promise.all` over truly independent operations — never sequential calls producing similar-looking output. This is rule 7's concurrency category, restated as something that must be evidenced rather than asserted.
   - **D — Regression check**: real evidence that previously-proven behaviour still holds, not "nothing else was touched."
   - **E — New findings**: anything found but not fixed, reported with real evidence and held for the reviewer to assign an ID. Never silently fixed, never silently dropped — see the process note on ID assignment in `findings_register.md`.
   - **F — Red/green, on by default**: for any claim that a mechanism *prevents* something — a constraint, a lock, a validation — break the real thing, show the test fail, restore it, show it pass. Not a special request; the default for this class of claim. Where a red/green genuinely cannot be constructed, say so and say why: an explicit "not constructible, because…" is honest, whereas an omitted row reads as done. Note that an honest red/green can also come back green-green — F-044's `prisma.updateMany` substitution passed, correctly proving the test asserted on outcome rather than mechanism. Report that result rather than hunting for a mutation that fails.
   - **G — Self-assessed uncertainty**: the implementer proactively lists what they are not confident about, before being asked. This is the section most likely to compress review cycles, since it surfaces the next round's questions in this round.

   This format applies to reviews as well as submissions. A reviewer using it must keep the boundary explicit between what they verified first-hand and what rests on the implementer's report — "the tests now prove what they claim" is a different statement from "I ran the tests," and conflating them reintroduces exactly the gap this rule exists to close.

## 2. Antigravity-specific setup

- **Terminal Policy: set to manual confirmation, not Auto** — at least for this first project with a new tool. "Agent Decides" is a reasonable middle ground once trust is established after a phase or two, but starting manual matches the "any changes should be confirmed" requirement directly.
- **One phase = one task in Agent Manager** — keeps each phase's plan artifact, execution, and your review scoped cleanly, rather than one sprawling task covering everything.
- **Use artifact comments as the review/feedback loop** — rather than re-prompting from scratch when something needs adjusting, comment directly on the plan or code artifact; this is the mechanism Antigravity is built around for guiding the agent.

## 3. Phase 0 — Repo scaffolding (before any service logic)

Not in any service spec, but needed before Phase 1 can start:
- Monorepo skeleton per `tech_stack_architecture.md` Section 2 (pnpm workspaces, `services/`, `apps/`, `packages/shared-types`, `packages/shared-middleware`)
- **Local Postgres via Docker (`docker-compose.yml`)** — development runs against this, not Cloud SQL directly; see `tech_stack_architecture.md` Section 4a for why
- Prisma initialized against the local Postgres container, with migrations that apply identically once pointed at Cloud SQL later
- The standard response envelope + error format from `api_standards_cross_cutting.md` implemented once in `shared-middleware`, not per-service
- Basic CI (lint + typecheck on push) — lightweight, not elaborate, at this stage

**Checkpoint:** review the repo structure and shared-middleware implementation before any service-specific code begins — this is the foundation every later phase builds on, worth getting right first.

## 4. Phases 1-5 — the five Basic-tier services

Same order as the build priority table in `platform_core_reusable_components.md`, since each phase's service depends on the ones before it being real.

| Phase | Service | Plan artifact must cover | Checkpoint acceptance criteria (from the spec itself) |
|---|---|---|---|
| 1 | Slot Engine | Entity schema, endpoint list, the atomic reservation approach for Section 5's concurrency requirement | A concrete test proving two simultaneous booking attempts on the same slot can't both succeed — this is non-negotiable given Section 5's own framing |
| 2 | Identity & Auth | OTP + Google OAuth flows, JWT claim structure, rate-limiting approach | OTP request endpoint demonstrably rate-limited (Section 4); invite-to-account linking works as specced (Section 4) |
| 3 | Tenant/White-Label | Draft→active branch gate, RoleAssignment model, subdomain resolution | A branch in `draft` status is confirmed invisible to guest-facing queries; role scoping actually restricts a Branch Manager to their own branch |
| 4 | Payment | Webhook handler, idempotency/dedup logic, tiered refund calculation | Refund amount computed correctly against the tiered schema (Section 5) for a few worked examples across the tier boundaries; webhook replay doesn't double-process |
| 5 | Notification | Channel policy matrix, retry/dead-letter logic | The `slot_release_reminder` event actually fires both SMS and push (not push-only) per the decided policy |

For each phase: **Plan Mode → your review/approval → implementation → the checkpoint test(s) above passing → your sign-off → next phase starts.** Don't let the agent begin Phase 2 while Phase 1's checkpoint is still open.

## 5. Phase 6 — Integration pass

Once all 5 exist individually: a pass specifically testing the *cross-service* flows that no single service's spec fully covers alone — e.g. a booking going `held → confirmed` via a real (or sandboxed) payment webhook, then a slot-release reminder actually firing through Notification. This is where bugs hide that unit tests per service won't catch.

## 6. What's deliberately excluded from this handover

- Tournament module, Student attendance (premium add-ons — parked)
- Driver app (separate codebase/team)
- Full production-grade DDoS protection (deferred per `api_standards_cross_cutting.md` Section 5)
- Exact pricing numbers (business decision, not a build task)

---
*Suggested first move: run Phase 0 in Antigravity's Plan Mode and review the generated plan artifact together before approving it.*
