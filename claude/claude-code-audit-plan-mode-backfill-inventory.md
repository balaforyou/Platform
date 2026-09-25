# Audit: local plan-mode session files vs. findings register — `claude/` backfill inventory

**Written 2026-09-25.** This project's root `CLAUDE.md` requires a `claude/claude-code-plan-<slug>.md`
file alongside any finding fix carrying a real design decision or rejected alternative. Two findings
(F-269, F-302) were found to have shipped without one and were backfilled first (PR #102). This audit
extends that check across every other locally saved Claude Code plan-mode session file
(`C:\Users\HP\.claude\plans\`, 14 files total on this machine, one per plan-mode session) — mapping each
to its finding(s), its register status, and whether a dedicated `claude/` doc already existed — to decide
which of the rest needed the same backfill treatment.

This doc is the mapping/inventory itself. It does not contain the backfilled design reasoning — that
lives in the 10 individual `claude-code-plan-*.md` files listed in the table below plus the two from
PR #102, each following the same rigor bar (cross-checked against the real plan file, the register's
Resolution text, and the real merged PR/commit — not reconstructed from a diff alone).

## Full inventory — all 14 plan-mode files

| Plan-mode file | Finding(s) | Register status (at time of audit) | Existing `claude/` doc before this pass? | Disposition |
|---|---|---|---|---|
| `abstract-wobbling-meteor.md` | F-230 | Resolved | No | **Backfilled** → `claude-code-plan-f230-concurrency-guest-release.md` |
| `calm-growing-lemur.md` | F-195 Phase 2 (Tier A + Tier B 1-4/7) | Open (umbrella track, by design) | No | **Backfilled, scoped to what's landed** → `claude-code-plan-f195-phase2-tierb-tailwind-v4-darkmode.md`. Does not cover Refunds/Scheduling/Assignments (items 5-7/7), not yet shipped. F-195 correctly remains Open. |
| `fluffy-frolicking-pudding.md` | Not a finding — "Infra Option B: VM app compute + managed Cloud SQL Postgres" | No register row (references F-214 only to flag it's the wrong ID for this topic) | No | **Skipped** — this is an infrastructure options doc, not a finding fix; no evidence it has shipped at all. Out of scope for a findings backfill. Worth flagging to Chief separately if a general infra-decision record is wanted, but not part of this campaign. |
| `fluffy-marinating-milner.md` | F-260 (+ bundled F-264/F-265/F-267 in the same session) | F-260: was Open despite a merged PR (#62, 20 Sep) — a real register-accuracy drift, fixed in its own separate PR (not part of this docs campaign). F-264/F-265/F-267: Resolved. | No (for any of the four) | **F-260 backfilled** → `claude-code-plan-f260-vm-image-retention.md`. **F-264/F-265/F-267 skipped, by user decision** — each already carries real rejected-alternative reasoning in its own register Resolution text (sticky-container fix, `color-scheme` vs. `filter: invert`, wall-clock formatter), duplicating that into separate `claude/` docs judged low marginal value. |
| `hashed-drifting-pancake.md` | F-225 | Resolved | No | **Backfilled** → `claude-code-plan-f225-guest-court-exclusion.md` |
| `imperative-imagining-lynx.md` | F-193 (Batch 4) | Resolved | No | **Backfilled** → `claude-code-plan-f193-gcp-promotion-script.md` |
| `jolly-squishing-gray.md` | F-269 | Resolved | No (fixed first, in PR #102) | **Backfilled in PR #102** → `claude-code-plan-f269-pooled-court-placement.md` (not part of this second pass) |
| `prancy-orbiting-tome.md` | F-220 §3.3 (+ related gap F-227) | Resolved (F-220 umbrella) | No | **Backfilled** → `claude-code-plan-f220-3.3-cancellation-refund-policy.md` |
| `snappy-fluttering-stallman.md` | F-228 Step 5 | Resolved (F-228 umbrella) | No | **Backfilled** → `claude-code-plan-f228-step5-user-type-patch.md` |
| `stateful-hopping-pillow.md` | F-192 (guest-pwa Slice F token migration) | Resolved | No | **Skipped, by user decision** — mostly mechanical restyling; the one real judgment call (D1 scope boundary excluding wireframe frames 03/04) was judged too thin for a standalone plan doc. |
| `synthetic-discovering-squirrel.md` | F-190 Slice 5 | Resolved | No | **Skipped — trivial.** No real alternative rejected; mostly an e2e-lock inventory and mechanical restyling. Backfilling it would mean inventing a design-decision narrative that doesn't exist in the source material, which this campaign deliberately avoids. |
| `tender-popping-robin.md` | F-197 + F-025 | F-197 Resolved; F-025 partially Open (push half shipped, SMS deliberately deferred) | No | **Backfilled, honestly scoped** → `claude-code-plan-f197-f025-notification-push-dispatch.md`. Does not claim F-025 is fully closed — it isn't. |
| `witty-seeking-engelbart.md` | F-240/241/242/243/245/246/247/248 (batch; F-244 deliberately not in this numbering) | All Resolved | No | **Backfilled, as one doc** → `claude-code-plan-f240-248-followup-findings.md`, mirroring the single PR (#44) and single plan-mode session. Honestly notes which sub-items were real design decisions (Group C) vs. straightforward fixes (Groups A/B) — no invented alternatives for the mechanical ones. |
| `zazzy-jumping-river.md` | F-183 (Multi-Slot-Time Booking, Phase 1) | Resolved | No | **Backfilled — flagship of this batch** → `claude-code-plan-f183-multi-slot-time-booking-phase1.md`. Contains this pass's most consequential finding: a real billing-integrity/IDOR bug (`CHILD_BOOKING_NOT_MUTABLE`) found and closed mid-plan, described in full in that doc's §4. |

## Summary

- **10 findings backfilled in this pass**: F-230, F-195 (Tier A + Tier B 1-4/7 only), F-260, F-225, F-193,
  F-220 §3.3, F-228 Step 5, F-197/F-025, F-240-248 (one batch doc), F-183.
- **2 findings backfilled in the prior pass** (PR #102, not re-touched here): F-269, F-302.
- **3 deliberate skips**, each with a stated reason above: F-192 (mostly mechanical, user call),
  F-190 Slice 5 (genuinely trivial, no real alternative to document), F-264/F-265/F-267 (already carry
  real reasoning in their own register rows, user call to skip duplicating it).
- **1 out-of-scope item**: `fluffy-frolicking-pudding.md` — not a finding, an infra options doc with no
  confirmed shipped status.
- **1 register-accuracy issue found and fixed separately, not as part of this docs campaign**: F-260's
  register row was left `Open` for 5 days after its real fix (PR #62) had already merged — corrected in
  its own small, register-only PR, independent of the documentation work here.

## Method (for reproducing or extending this audit later)

For each finding: (1) read the real saved plan-mode file in full — the actual proposal, alternatives
weighed, and evidence gathered before design; (2) grep `docs/findings_register.md` for the finding's row(s)
and read the Description/Resolution text — the register is this project's source of truth for what
actually shipped, and may differ from what the plan proposed; (3) find and read the real merged PR or
commit (`gh pr view` / `git show` / `git log --grep`) — the best evidence of what was actually verified,
since a plan file only reflects intent. All three were cross-checked against each other for every
backfilled doc; any disagreement between them is stated explicitly in that finding's own doc rather than
smoothed over.
