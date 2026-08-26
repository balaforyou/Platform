# Chief continuity — status as of 22 Aug 2026, end of session

This document exists because a Chief/PO thread accumulates strategic context that doesn't belong
in `CLAUDE.md` (operational rules for anyone touching the repo) but still needs to survive when
this conversation is closed out and a new Chief thread picks up. Read this alongside the register,
`batch-log.md`, and `CLAUDE.md` — not instead of them.

## Process lesson that hasn't been written anywhere durable — fix this first

**New threads opened in this project inherit shared memory, which describes "this thread acting
as Chief."** A new Technical Lead thread reading that has no way to know it describes a different,
specific conversation — from its own perspective, "this thread" reads as itself. This caused real
confusion twice today (a thread tried to review a handoff and "send it to the Technical Lead
thread," not realizing it *was* that thread). Every Technical Lead handoff going forward needs an
explicit disambiguation paragraph stating plainly that any Chief-description in memory refers to a
separate conversation, not the one currently running. **A new Chief thread should also know this
about itself** — if its own memory describes "separate Technical Lead threads," that's accurate,
but it should actively watch for the same confusion propagating to whatever threads it spins up,
and always include the disambiguation paragraph in handoffs rather than assuming it's obvious.

## Architecture assessment (given directly to Bala, worth preserving)

Rated: solid structural bones (clean service boundaries, generic resource-pool vocabulary, reused
auth patterns), but several under-hardened areas cluster predictably:
1. No canonical date/time module — the same validation gap got reimplemented independently in
   `branchLocalToUtc`, `parseBranchLocalDateTime`, `dateOnly()` (F-173/F-176/F-179's shared root
   cause).
2. No shared validation schema between frontend and backend — direct cause of F-174/F-175/
   F-177/F-182's papercut pattern.
3. `/health` checks liveness, not readiness — direct cause of F-181's two-hour undetected outage.
4. Deployment is manual, 10 documented traps in `deploy/gcp-vm/CLAUDE.md` as of today — the 22
   Aug outage happened because a manual step got skipped between two similar-but-not-identical
   rotation procedures.
5. Secrets handled via hand-edited `.env` over SSH — root cause of F-180's exposure incident.
6. No real job scheduler (F-044) — sweep only runs when explicitly triggered.
7. No external monitoring/alerting — today's outage was discovered by Bala noticing, not by any
   system.

**Golden standards recommended before JBC fully depends on this daily** (Bala's own eight-item
list, already in project memory, restated here for the new thread's convenience): canonical
date/time module, shared validation schemas, real readiness checks, scripted deployment, real
secrets management, real job scheduler, external monitoring, a gating CI journey test.

## In-flight discovery threads — not yet returned as of this writing

1. **Multi-slot-time booking** (`discovery/multislot_booking_discovery_update.md` content, sent
   to a Technical Lead thread — confirm whether it actually landed there or is still pending).
   Evidence anchor strong (friend feedback + market comparison + Bala's own billing-granularity
   reasoning). Scope: whole-hour granularity only, both contiguous and non-contiguous multi-slot
   selection, partial cancellation required (resolves atomicity toward linked-bookings model, not
   a single spanning row), pricing resolved as sum-of-per-window-rate, build using existing
   generic resource-pool vocabulary.
2. **Multi-court group booking** (separate discovery handoff sent). Evidence anchor weaker —
   Bala's own instinct from a Playo comparison, not yet grounded in JBC-specific need. Real
   clarifying insight from discussion: the existing `Capacity` field likely already means "max
   players per court" (matching Playo's model) — the actual gap is a group whose headcount
   exceeds one court's cap needing multiple courts booked together, not a change to what capacity
   means. Discovery scoped to investigate F-114/F-125/F-152 and the real current capacity model
   first, since this likely extends existing partially-built functionality rather than being
   greenfield.

**Sequencing decision, confirmed with Bala: multi-slot-time first.** Reasoning: stronger evidence
anchor, more mature discovery (most open questions already resolved), and — the load-bearing
strategic point — if the underlying "book multiple resource-window pairs atomically, with
independent partial cancellation" mechanism gets built generically for multi-slot-time, multi-court
booking could become a smaller incremental extension of the same infrastructure rather than a
second mechanism built from scratch. Multi-court's *discovery* investigation can run in parallel;
its *build* work should not start before multi-slot-time's atomicity model is locked in.

## Design/wireframe work — received, not yet integrated

A Claude Design wireframe zip for the guest-facing PWA redesign (Organic design system — warm
cream/terracotta/sage, Caprasimo+Figtree, token-based CSS, `.btn`/`.card`/`.field` component
classes) has been reviewed at a high level but not mapped against real `guest-member-pwa` routes.
Separately, admin UI observations (screenshots + notes) surfaced real findings (F-034 reproduced
twice, likely F-100/F-088 real-world confirmation via observed timezone offset, a stale-capacity-
preview bug logged as described-not-numbered, not yet investigated) plus product questions now
resolved through discussion (capacity semantics, addressed above). Integration work — mapping
wireframes to real components, deciding what's pure visual refresh vs. implies behavioral change —
has not started. Its own kickoff when picked up.

## Roadmap, Bala's own stated plan

Three weeks from 22 Aug to stabilize guest and member booking, then move to notifications
(F-138/F-139 already parked in the register, waiting for exactly this).

## Loose ends, unresolved as of this writing — check current status before assuming any of these

- **F-153's live production spot-check** (Batch 18 handoff sent) — confirm whether it actually
  completed; last status was "handoff rephrased and resent," not confirmed done.
- **F-155 discrepancy** — register showed it Open despite earlier framing as fixed and
  production-proven, predating this session. Never investigated.
- **`docs/plans/guest-flow-fix-groups.md` Groups A–H** — 0/36 resolved as of the last check. Group
  G partially advanced (F-087, F-088 part 2). Full status needs re-verification, not assumption.
- **F-088 parts (1)/(3)/(4)** — still held for its own dedicated session. Coupling constraint
  between parts 3/4 remains real and must stay explicit in whatever plan eventually covers it.

## Standing practice, confirmed and in effect

Two-tier Chief/Technical Lead model, batches tracked in `docs/plans/batch-log.md`, findings tracked
in `docs/findings_register.md` with `pending-findings.md` + `check-register.mjs` enforcing
Chief-only ID assignment, push-verification required for any batch to count as Done, register
status must match reality at batch close (not just checked at batch start). Claude Code plans
(with real execution access) and Technical Lead threads review/gatekeep — adopted as the default
flow, not a one-off experiment.

---

**For whoever starts the new Chief thread:** read this file, then the register, `batch-log.md`,
and `CLAUDE.md` directly — confirm current state rather than trusting this document's snapshot,
same discipline as everything else in this project. This file describes state as of 22 Aug 2026;
it will drift the moment new work happens.
