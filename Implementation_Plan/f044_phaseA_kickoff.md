This is Phase A of the approved F-044 plan (`C:\Users\HP\.claude\plans\binary-napping-whale.md`). Read the full plan before starting — it contains the complete design, including a "Findings" section (A through D) documenting real, adjacent defects discovered during design investigation.

Standing rules apply: plan first if anything is ambiguous, real evidence per rule 8, no commit without explicit sign-off.

## Scope-boundary requirement — read this before touching any code

**All findings (A through D) in the plan document are report-only for this work. None may be fixed, worked around, or silently avoided as part of implementing this scheduler.** This includes, explicitly:
- **Finding A**: `POST /bookings/sweep` must NOT be wired into the new scheduler in this phase, regardless of how natural or tempting that wiring might seem once a working job-runner exists. That endpoint's own auth gap (F-053) is a separate, already-logged, high-severity finding with its own dedicated fix pending — this phase must not touch it, reference it as fixed, or route real traffic through it.
- Findings B, C, and D: treat exactly as documented in the plan itself — read them directly there rather than relying on a restatement here. If implementing this scheduler would require touching, working around, or otherwise interacting with any of them, stop and report back rather than proceeding.

## Phase A scope — the generic mechanism only, proven in isolation

Build `packages/job-scheduler`: the tick loop, the claim mechanism, the dedup ledger, and the missed-check/skip-if-stale logic — with **zero domain knowledge**, tested against a dummy/fake job handler. No wiring into slot-engine yet, no real member-attendance logic yet — that's Phase B.

## Two technical requirements, non-negotiable, easy to get subtly wrong

**1. The claim must be raw SQL, not `prisma.updateMany`.** This is not a style preference — `prisma.updateMany` can look correct, pass a sequential test cleanly, and still not be genuinely lock-free-safe under real concurrent load, depending on the exact SQL Prisma emits underneath and whether it correctly uses the database's own clock rather than a per-process `now()`. **Show the actual emitted SQL as evidence** — not just that a test using this mechanism passes. A passing test using an unsafe mechanism proves nothing.

**2. The two concurrency protections (the claim, and the dedup ledger's unique constraint) must be proven with genuinely separate tests, not one combined test.** A single test using `runDueJobsOnce()` alone would pass whether or not the dedup unique constraint actually exists — the claim mechanism could be silently doing all the real work while the ledger sits untested. You need a **second, distinct test using `runJobNow()`** (deliberately bypassing the claim) specifically to isolate and prove the dedup constraint holds on its own merits. This mirrors F-006's lesson from earlier in this project — a test that looks like it proves concurrency safety while only proving sequential correctness is worse than no test at all, since it creates false confidence.

## Verification required for Phase A

- The actual raw SQL used for the claim, shown directly — not just described.
- A genuine concurrent-claim test (real simultaneous callers, not sequential calls dressed up as concurrent) proving exactly one caller successfully claims a given job.
- A **separate** `runJobNow()`-based test proving the dedup ledger's unique constraint independently rejects a duplicate, isolated from the claim mechanism.
- The missed-check/skip-if-stale behavior demonstrated with a real simulated outage window.
- Explicit confirmation that none of Findings A-D were touched, fixed, or worked around — list what (if anything) came close to requiring that, and how it was avoided.
- Build/typecheck passing for the new package.

Stop after Phase A's evidence is complete. Wait for explicit sign-off before starting Phase B (wiring in the real member-attendance use case).
