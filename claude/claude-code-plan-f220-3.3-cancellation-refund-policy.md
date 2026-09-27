# F-220 §3.3 — Cancellation & Refund Policy (Setup Rules section 3 of 4) — implementation plan

**Backfill, not a correction — this doc didn't exist in `claude/` until now, despite the work already
having shipped.** §3.3 merged as part of PR #18, "F220 guest management" (`55e7c54`, merged 10 Sep 2026),
against this project's own standing practice of committing a `claude/claude-code-plan-<slug>.md` file
alongside any finding fix with a real design decision. Written 2026-09-25, from the real saved plan-mode
file this work was implemented against (`prancy-orbiting-tome.md`, heading "F-220 §3.3 — Cancellation &
Refund Policy (Setup Rules section 3 of 4)"), cross-checked against `docs/findings_register.md`'s F-220
and F-227 rows and against the real commit history — not reconstructed from a diff alone.

**Status:** already implemented, merged, and deployed. Nothing here changes code or the register — this
is documentation catching up to already-shipped work.

**A note on PR #18 itself, stated plainly rather than smoothed over:** PR #18's top-level GitHub body is
**empty** (`gh pr view 18 --json body` returns `""`), and the PR is a squash of six F-220 sub-sections
(§1a Branch Settings, §1b Special Hours, §2 shell, §3.1 Authorized Guest Courts, §3.2 Custom Pricing
Rates, §3.3 this section) landed as one merge commit with per-section commit messages inside it — not
one PR per section. §3.3 is **not cleanly separable as a standalone diff** from the rest of that PR's
file set (`schemas.ts`, `queries.ts`, `types.ts`, `SetupRulesPanel.tsx` are shared/incrementally edited
across §3.1/§3.2/§3.3). It **is** cleanly separable at the commit-message level: the merge commit
(`git show --format=%B -s 55e7c54`) contains one distinct sub-commit titled "F-220 §3.3 — Cancellation &
Refund Policy (Setup Rules section 3/4)" with its own scoped description and evidence, which this doc is
written from.

## 1. Context — what the screen needed

F-220 v2 rebuilds admin-v2's Guest Management "Setup Rules" tab as a vertical stack of independent
full-width cards, one per mockup section. §3.1 (Authorized Guest Courts) and §3.2 (Custom Pricing Rates)
had already landed (Batch 31, `main`@`6fc02ac`). §3.3 is the third card: **Cancellation & Refund
Policy** — letting a branch owner configure a tiered guest refund schedule (more notice before the slot
→ higher refund %) that already existed and was already enforced server-side, but had no admin UI at
all.

Why this was mostly frontend work rather than a new feature: `BookingRule.cancellationPolicyJson` already
existed, was already persisted, and was already consumed at real cancellation time —
`services/slot-engine/src/index.ts:3529` and `:4363` read `{ type: 'tiered', tiers: [{
min_hours_before_slot, refund_percent }] }`, sort descending by hours, and pick the first tier whose
threshold the booking's notice window clears. The write route `PUT /resource-pools/:id/booking-rule`
(`:2298`) already upserted `cancellationPolicyJson` verbatim with no server-side shape validation on
`tiers`. `GET /branches/:id/resource-pools` (already used by this screen's `usePools(branchId)`) already
included `bookingRules`. So the real gap was: no admin surface to *set* the tiers, and no client-side
validation ensuring the descending-hours invariant the cancellation-time matcher relies on.

## 2. Real alternative considered and rejected: an add/remove tier list

The plan's own text is explicit that this was evaluated and turned down: *"exactly 3 rows, fixed, both
sides — not an add/remove tier list (considered and rejected, no evidenced need)."* An arbitrary-length
tier list (add a row, delete a row, reorder) is the more general design and would have mirrored the
already-shipped peak-window pattern in §3.2 (`PricingRates.tsx`'s repeatable, addable/removable peak
windows). It was rejected in favor of a fixed 3-row layout because:

- The real mockup (`AdminDashboard.jsx:2488-2588`) itself shows exactly 3 rows with no add/remove
  control — the source of truth for the UI shape doesn't ask for arbitrary tiers.
- No evidenced product need for more or fewer than 3 tiers existed at the time (unlike §3.2's peak
  windows, which genuinely needed to support an arbitrary count).
- A fixed 3-row form is materially simpler to validate (a `z.tuple([...])` of exactly 3 with one
  `superRefine` for strict descending order) than an arbitrary-length list, and simpler for an owner to
  reason about ("more than 24 hours," "6 to 24 hours," "under 6 hours") than a free-form tier editor.

## 3. Real scope correction: both sides of a tier are editable, not just the refund %

The plan documents a specific, deliberate correction to what the mockup appears to show: *"the mockup
shows 3 rows with fixed hour boundaries (`>24 / 12–24 / <12`) and only the refund % editable. Correction:
both sides of every tier are real schema variables — nothing hardcodes 24/12/0 server-side — so both the
hour threshold and the refund % are editable."* In other words, the initial reading of the mockup (only
the percentage is a variable; the hour boundaries — 24, 12, 0 — are fixed presentation constants) was
checked against the real schema and found wrong: `cancellationPolicyJson.tiers[i].min_hours_before_slot`
is exactly as free a variable server-side as `refund_percent`. Building the screen as "3 fixed hour
labels, 3 editable percentages" would have silently prevented an owner from ever setting a policy the
mockup's own numbers don't happen to match (e.g. a 48-hour notice window), even though the backend always
supported it. The shipped design edits **both** fields per row (6 inputs total), with the row labels
(`Above {h1} hrs`, `{h2}–{h1} hrs`, `Below {h2} hrs`) computed live from the entered hour values rather
than hardcoded — so the mockup's `24/12/0` numbers are the seeded defaults, not fixed labels.

## 4. Deliberate backend-gap deferral — logged as F-227

While building §3.3, a real gap was found and deliberately **not** fixed in this batch: `PUT
/resource-pools/:id/booking-rule` (`services/slot-engine/src/index.ts:2298`) composes only
`getInternalOrAdminAuth` → `requirePoolScope` — **no owner-only check, no `GUEST_BOOKING` entitlement
check** — unlike its sibling routes this same Setup Rules screen uses (§3.1's `guest-court-eligibility`
and §3.2's `guest-pricing` are both owner + entitlement gated). `requirePoolScope` explicitly permits
`branch_manager`, so a non-owner branch manager could change refund terms — a revenue-affecting setting —
through the API directly, even though the shipped UI is owner-gated.

The plan logged this "described, not numbered" per root `CLAUDE.md`'s finding-ID rule, into
`docs/plans/pending-findings.md`, for Chief to assign an ID. That ID is **F-227**, confirmed present in
`docs/findings_register.md` (row 143): *"`PUT /resource-pools/:id/booking-rule` ... composes only
`getInternalOrAdminAuth` → `requirePoolScope` — no owner check, no `GUEST_BOOKING` entitlement check.
Confirmed directly, independently, by both the reviewing thread and Chief. Same combined class as
[[F-221]] (missing entitlement) and [[F-223]] (missing owner check) on one route ... Deferred — add both
checks to this route for real parity with every other write route this same Setup Rules screen uses."*
F-227 remains an open, separately-tracked finding — its own row, its own future fix, not silently folded
into F-220's close-out text (root `CLAUDE.md` rule 9).

## 5. Blast-radius check (rule 3a) — as stated in the real plan

| Touched | Other consumers | Impact |
|---|---|---|
| `guestManagement/schemas.ts` — add `refundPercent`, `hourThreshold`, `cancellationPolicySchema` | Existing exports (`poolSchema`, `guestPricingSchema`, `validateTimeWindows`, `nonNegativeAmount`, …) imported by `PricingRates.tsx`, `AuthorizedCourts.tsx` | Additive only — no existing export changed |
| `guestManagement/queries.ts` — add `useSaveCancellationPolicy` | `useBranches`, `usePools`, `useSaveGuestPricing`, `useSaveGuestCourts`, `courtGroupsKeys` | Additive — reuses `courtGroupsKeys.pools` for invalidation |
| `guestManagement/types.ts` — extend `BookingRule` with `cancellationPolicyJson` | `ResourcePool.bookingRules` typing | Additive optional field, no runtime effect |
| `guestManagement/SetupRulesPanel.tsx` — mount `<CancellationPolicy>`, edit footer copy | Rendered by `GuestManagementScreen.tsx` only | One added child + copy text ("2 more" → "1 more") |
| `guestManagement/sections/CancellationPolicy.tsx` — new | none (new file) | — |
| `docs/plans/pending-findings.md` — append "Awaiting confirmation" entry | `pnpm register:check` parses this file | Empty `Confirmed-ID:`/`Confirmed:` — no register row added, F-179+ gate not triggered |
| **`services/slot-engine/src/index.ts` — not touched this batch** | — | The owner/entitlement gap on the PUT route is logged only (became F-227), no backend code change in §3.3 |

## 6. What was actually built

Per the §3.3 commit message inside PR #18 (`55e7c54`):

- **`sections/CancellationPolicy.tsx`** (new) — mirrors `PricingRates.tsx`'s shape; owner-gated
  (non-owner sees read-only inputs + an info `Banner`); seeds from the pool's real
  `cancellationPolicyJson` tiers when present, else from slot-engine's real
  `DEFAULT_CANCELLATION_POLICY` (24 hrs/100%, 6 hrs/50%, 0 hrs/0%) — not `|| 0`, since the system already
  applies that default at cancellation time before any explicit save.
- **`queries.ts` — `useSaveCancellationPolicy`**: one `PUT` per pool; "apply globally" fans out across
  every branch's pools (`useBranches` + per-branch `resource-pools`), **deduplicated by pool id before
  the fan-out** because `includeDraft=true` can return both a draft and a published row for the same
  branch. This dedup step is a real implementation detail not spelled out in the plan's own pseudocode
  (§4 of the plan shows a plain `Promise.all` over `perBranch.flat()` with no dedup) — a legitimate
  refinement added during implementation, called out here rather than silently smoothed over.
- **`schemas.ts`** — `refundPercent`, `hourThreshold`, `cancellationPolicySchema`: a `z.tuple` of exactly
  3 rows with a `superRefine` enforcing strictly descending notice hours (`h1 > h2 > h3 >= 0`), matching
  the plan's design exactly.
- **`types.ts`** — `CancellationTier` / `CancellationPolicyJson`, `BookingRule.cancellationPolicyJson`.
- **`SetupRulesPanel.tsx`** — mounts the new card; footer copy "2 more" → "1 more" (Dynamic Guest
  Scheduler, §3.4, still pending — later separately descoped from the F-220 MVP per the register's
  F-220 row).
- **`docs/plans/pending-findings.md`** — the "Awaiting confirmation" entry for the booking-rule gap
  (described, not numbered), later confirmed and assigned **F-227** by Chief.

## 7. Verification — real evidence (from the shipped commit's own evidence note)

- Typecheck / build / lint clean (8 pre-existing warnings, none new).
- `pnpm register:check` green.
- Full 5-service regression green against `badminton_db_test` — identity-auth showed the documented
  false-alarm-on-first-run pattern (root `CLAUDE.md`'s "single suite failing is often environmental"
  trap), passed in isolation and on a full re-run.
- Live-fire on the dev stack against real JBC data, both branches: seed values loaded from the real
  saved rule; computed row labels rendered correctly; the descending-order guard disabled Save with no
  API call on out-of-order input; single-branch save (exactly one `PUT`) and global fan-out (exactly one
  `PUT` per branch pool) both confirmed via DB read-back; persisted across a full page reload.

**A real gap between the plan and what shipped, flagged rather than smoothed over:** the plan's own
verification section (step 2) calls for testing the **non-owner** read-only path live, including logging
in as a real `branch_manager` on both tenants. The shipped evidence note instead says: *"Non-owner path
verified by code against the identical proven pattern in `PricingRates.tsx` / `AuthorizedCourts.tsx` (no
seeded JBC branch_manager to log in as)."* That is real code-review verification, not the live-fire
browser verification the plan called for and root `CLAUDE.md`'s "live-fire every slice" rule generally
expects — a weaker form of proof than planned, for a real practical reason (no branch_manager credential
existed to test with), not disguised as equivalent.

## 8. Sign-off

Already merged (PR #18, `55e7c54`, 10 Sep 2026) and deployed as part of F-220's overall delivery
(`docs/findings_register.md`'s F-220 row, Resolved 10 Sep 2026, lists §3.3 explicitly and cites this same
commit). This backfill doc requires only doc-level sign-off before merging to `main` — no code, no
register change, nothing to re-verify beyond what F-220's and F-227's own register rows already record.
