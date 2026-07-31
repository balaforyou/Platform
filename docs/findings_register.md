# Findings Register — Running Log

**Purpose:** One live place tracking every gap, bug, or open decision surfaced during review — from the moment it's found until it's actually resolved. Modeled on the BCC governance-trail discipline: nothing gets fixed silently and forgotten, nothing stays open without being visible. Update this file the moment something is found, and again the moment it's closed — don't let resolution happen only in chat history where it's easy to lose track.

**How to use this:** Before starting any new phase, check this register for anything still `OPEN` that the new phase might touch. Before closing a phase, confirm nothing new got left `OPEN` without being logged here.

---

## Open

| ID | Found | Context | Description | Next step |
|---|---|---|---|---|
| F-001 | 30 Jul 2026 | Phase 9 kickoff | `GET /branches/:id/resource-pools` never existed — kickoff incorrectly assumed it did. Guest booking's browse step depends on it. | **Confirmed still missing as of Phase 9 delivery (30 Jul 2026)** — not in task.md or the walkthrough. Addendum re-sent, needs explicit confirmation of action this time. |
| F-006 | 30 Jul 2026 | Phase 9 verification | Checkpoint 2's concurrency claim (`MemberGroupAssignment` partial unique index, sweep idempotency) was verified with **sequential** calls, not genuinely **concurrent** ones — matches the outward behavior a weaker app-level check would also produce, doesn't actually prove the DB-level race protection works under real simultaneous load. Same standard Phase 1's original concurrency tests were held to. | Requesting a real concurrent test: fire two simultaneous requests, confirm exactly one succeeds via the database constraint |
| F-002 | 29 Jul 2026 | Phase 8 (PWA installability) | 7-day dismissal-expiry logic never cleanly confirmed on real device — testing was confounded by the manifest-icon bug at the time | Deferred to Playwright automated coverage, to be built in the guest-booking phase |
| F-003 | 29 Jul 2026 | Phase 8 (PWA installability) | iOS install-instructions banner only confirmed via Chrome's iPhone emulation, never a real iOS device | Deferred until a real iPhone is available |
| F-004 | 30 Jul 2026 | Admin UI discussion | Production routing (Firebase Hosting rewrites mapping `/api/*` paths to each Cloud Run service) — never formally documented as a decision, only proposed. **Sub-item added 30 Jul 2026:** currently every backend endpoint is reachable directly by URL (no network-level restriction) — protection relies entirely on each endpoint's own auth check, which is correct standard practice (never rely on a URL being secret), but a real defense-in-depth option exists: Cloud Run's ingress setting can restrict a service to only accept traffic through the load balancer/hosting layer, rejecting direct hits to the raw `*.run.app` URL. Worth deciding whether to add this on top of the existing endpoint-level auth, not instead of it. | Parked, to be discussed and formalized together with the rest of production routing |
| F-005 | 30 Jul 2026 | Business discovery session 2 | Low-occupancy alert threshold — mechanism decided (percentage, admin-configurable, now a real schema field per Phase 9), but no default percentage value has actually been chosen | Needs a business decision on the default (e.g. 50%) |

## Resolved

| ID | Found | Resolved | Context | Description | Resolution |
|---|---|---|---|---|---|
| F-009 | 30 Jul 2026 | 31 Jul 2026 | Phase 10 feedback | Co-player phone number input accepts any string without validation on client or server. | Replicated normalization and valid format checks (+91 starting with 6-9) on both client input/submission and backend bookings endpoints. |
| F-010 | 30 Jul 2026 | 31 Jul 2026 | Phase 10 feedback | Availability windows generated do not align to clean slot boundaries matching the pool's duration. | Snapped seed script times, and strictly validate / reject unaligned API inputs with computed suggestion recommendations. |
| F-000 | 30 Jul 2026 | 30 Jul 2026 | Phase 9 revision | Manual refund override audit trail — needed design (who/when/reason) | `adminId` sourced from JWT (not request body), full audit fields on `Refund` model, tested in Checkpoint 3 |
| F-001 | 30 Jul 2026 | 30 Jul 2026 | Phase 9 delivery (2nd pass) | `GET /branches/:id/resource-pools` never existed — guest booking's browse step depends on it | Endpoint added, public/no-auth, verified in Checkpoint 1 with a real assertion ("returns correct array of pools"), not just present in the route list |
| F-006 | 30 Jul 2026 | 30 Jul 2026 | Phase 9 verification (2nd pass) | Concurrency claim on `MemberGroupAssignment`'s partial unique index was only tested sequentially, not proving the DB-level race protection | Both sequential AND genuinely concurrent test cases now present as distinct assertions — concurrent case fires simultaneous requests and confirms exactly one 201 / one 409, proving the database constraint itself resolves the race |

---

## Backlog (not bugs — deliberately deferred scope, tracked so they're not forgotten)

- Split-payment for group bookings (Phase 2/Premium)
- Per-branch training-hours actual timings — needs real data from the owner, not a technical gap
- Staff training/rollout plan per branch
- Member onboarding — migration path from existing WhatsApp-based coordination
- Real iOS device QA pass (see F-003, same underlying gap, listed here too since it's a standing "before real launch" item, not just this one phase's checkpoint)

---
*Started 30 Jul 2026. Every future phase's review should check this file first and update it on close.*
