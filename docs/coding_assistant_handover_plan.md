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
6. **Scoped git commit at the end of every approved phase** — added 30 Jul 2026, after discovering nine backend phases plus frontend work had accumulated with zero git history. Once a phase is approved and its walkthrough confirmed, commit the changes with a message identifying the phase and what it covers (e.g. "Phase 9: pricing modes, member group assignments, negotiated bookings, refund override"). Confirm the working tree is clean (nothing untracked or modified left hanging) before moving to the next phase. This isn't optional cleanup — it's the durable record of what actually happened, and the only real rollback point if a future phase needs to be reverted.

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
