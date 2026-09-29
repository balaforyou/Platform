# Chief handover — F-319: dark-mode-safe colors for the "almost full" slot tile

**From:** Chief (reviewer thread)
**Date:** 29 Sep 2026
**Status:** Assigned, fast-planned, implemented, live-verified in both themes, landed.

## Context

Spotted by Bala while asking for F-318's back-navigation restore fix to also be checked in light
mode — the "1 left" tiles' washed-out white/cream color in the existing dark-mode screenshots
turned out to be a real, separate, pre-existing bug, not an F-318/F-317 side effect. Confirmed via
`git blame`: `--slot-almostfull-surface`/`-border`/`-text` (`apps/guest-member-pwa/src/index.css`,
lines ~72-74) were last touched 19 Aug 2026, before any change this session — a genuinely
pre-existing gap, not a regression.

## Root cause

These three tokens never got a dark-mode override at all — the same bug class this same file has
already fixed three times (`--slot-available-surface`, `--surface-header`, `--mint-surface`, each
documented in its own comment as "never given a dark override"). In light mode the hardcoded
value (`#fff7ed`/`#fed7aa`/`#c2410c`) is correct and intentional (a warm peach highlight on a
white page); in dark mode the same light value leaks through unchanged.

## Assignment

**F-319** — Chief-assigned. Severity: Low, cosmetic-but-real — no functional/business impact, but
a readability regression on the exact tile guests need to notice (low capacity, "1 left"), and the
fourth instance of a bug class this same file has already fixed three times.

## Fix

Mapped onto the existing dual-mode `--color-accent-2-*` gold ramp (already documented in
`main.tsx:558` as "the fixed gold ramp," deliberately not tenant-derived — the correct property
for a warning color) instead of inventing new hex values, reusing the same
"give the next occurrence somewhere obvious to go" pattern the three prior corrections used:

- `--slot-almostfull-surface` → `var(--color-accent-2-100)`
- `--slot-almostfull-border` → `var(--color-accent-2-300)`
- `--slot-almostfull-text` → `var(--color-accent-2-600)`

Applied to all three token-definition sites in `index.css`: the light `:root` block, the
`:root[data-theme="dark"]` block (where the tokens didn't exist at all — the actual bug), and the
`@media (prefers-color-scheme: dark)` block (same duplication pattern every other dark-mode token
in this file already follows).

## A second, related fix folded in during the same review pass

Live testing the dark-mode fix surfaced a follow-up design question from Bala: rather than just
fixing the color, remove the separate "almost full" tile background/border distinction entirely —
every non-selected tile should share one background regardless of remaining capacity, with "X
left" vs "X courts open" (the existing text) as the only signal. Implemented in
`BranchBooking.tsx`: the tile's `background`/`borderColor` no longer branch on `isAlmostFull` at
all (only `isSelected` still matters); the `--slot-almostfull-surface`/`-border` tokens remain
defined in `index.css` (correctly dark-mode-safe now) but are no longer read by this component —
kept, not deleted, since removing an already-correct, reusable token definition for zero benefit
would be needless churn.

## Real evidence, both themes, before and after

- **Dark mode, before**: washed-out light cream tile, visually inconsistent with the surrounding
  dark UI (the bug Bala originally flagged).
- **Dark mode, after**: initial color fix confirmed via real screenshot — proper dark warm-brown/
  gold tile. Final state (background-uniformity) confirmed via a second real screenshot on the
  actual PR branch (fresh off the real merged `main`, not the original working tree) — the "1
  left" tile and every other tile share the identical dark background; only the gold "1 left"
  text distinguishes it.
- **Light mode, before and after**: confirmed visually unaffected both times — the accent-2 ramp
  substitution is close enough to the original hardcoded values that light mode looks the same,
  and the later background-uniformity change makes all tiles match by design.
- Whole-app typecheck and build clean.
- Re-verified a second time on the real PR branch (`f319-almostfull-dark-mode-colors-29sep`,
  branched fresh off the real post-#118-merge `main`) rather than assumed still correct from the
  original working-tree verification.

## Sign-off

Landed per Chief's explicit "no further sign-off needed for this sequence" handover (29 Sep
2026) for the color-token fix; the background-uniformity follow-up was a live, in-conversation
design call from Bala during the same review pass, implemented and re-verified in both themes
before this same close-out.
