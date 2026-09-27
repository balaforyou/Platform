# F-195 Phase 2 — Tailwind v4 + light/dark toggle + admin re-theme — Tier A + Tier B (1-4/7) backfill

**Backfill, not a correction — this doc didn't exist until now, despite the work already having shipped.**
Written 2026-09-25, from the real saved plan-mode plan (`calm-growing-lemur.md`) and the real commits that
have landed on `main` to date. This project's root CLAUDE.md requires a `claude/claude-code-plan-<slug>.md`
file alongside any finding fix with a real design decision; this work shipped without one.

**Scope, stated precisely so this doc isn't mistaken for a close-out**: this covers only the Tier A
foundation pass (commit `3019182`) and the four Tier B sections that have landed so far — item 1/7
(Overview, `ab86a7a`) and items 2-4/7 (Resources, Low Occupancy, Negotiated, `b73375b`). It does **not**
cover Refunds, Scheduling, or Assignments (items 5-7/7, the two remaining full ports and the one
provisional reskin), which have not shipped as of this writing. **F-195's register row correctly remains
`Open`** — it is an umbrella track by design ("Stays Open/in-progress" per its own row), and this doc does
not close it or imply it is closed.

**Status:** Tier A + Tier B items 1-4 already implemented and merged to `main`. This is docs-only — no
code, no register change.

---

## 1. Context

F-195 Phase 1 (React 19 / Vite 8 / lucide 1.x, `91ad666`) cleared the toolchain so the admin mockup's
stack (Tailwind v4 via `@tailwindcss/vite`) could land without a second migration. Phase 2 re-themes
`apps/admin-web` — build a design-token architecture + a real light/dark toggle, then port the 7
currently-live admin sections plus `TrendIndicator` onto it. It re-themes what exists; it deliberately does
**not** pull forward unbuilt future work.

Before any design work, the plan investigated the actual reference mockup
(`wireframe/JBC Frontend Reference - Friend Build/src/screens/Admin/AdminDashboard.jsx`) rather than
assuming it was a ready-made token system, and found it wasn't one — see §2.

## 2. Real evidence gathered before design

- **The mockup is a plain JS ternary object (`isDark ? … : …`), not a token system** — zero CSS custom
  properties, hundreds of inline light/dark ternaries, no `dark:` variant, no class on `<html>`/`<body>`.
  Anything "copied" from it needed re-architecting onto real tokens, not literal porting.
- **Many of the mockup's own Tailwind classes are typos that silently no-op** (`text-slate-555`,
  `border-emerald-150`, `bg-emerald-55`, `text-emerald-555`, `border-slate-205`, `text-amber-305`, …) —
  confirmed these needed normalizing to real scale values, not copying verbatim; "matching the mockup"
  therefore means matching its evident *intent*, not its literal broken output.
- **Only 3 of the 7 live admin sections have a real mockup screen at all** (Overview, Scheduling,
  Assignments — "Strong"/"Strong (conceptually)"/"Moderate" fidelity); Resources, Low Occupancy, and
  Negotiated have **no** mockup screen to port from, and Refunds only a partial one (a cancel-policy card
  and cancel modal, no refund queue). This directly shaped the bucketing decision in §3.
- A full e2e selector/class/ID/copy inventory was pulled from every guest-member-pwa spec file touching
  admin-web routes, as a hard constraint the ported markup must not break.

## 3. Alternative considered and rejected: one-shot per-section rewrite (no foundation tier)

The naive approach is porting each of the 7 sections' markup directly onto Tailwind utilities, one at a
time, styling each with its own ad hoc token usage as it's touched. Rejected: this would leave the app
visibly half-themed for the entire rollout — some sections modern, some still on the old plain-CSS,
light-only styling — and would risk each section's markup drifting to slightly different token usage
since there's no shared foundation locking them together first.

**Chosen instead: a two-tier split.** Tier A is a single foundation pass — the token architecture, the
theme toggle, and rewriting every *shared* CSS class (`.panel`, `.form-grid`, buttons, `.muted`,
`.empty-state`, etc.) onto the token layer, with **no section markup changed yet**. After Tier A, every
route already renders in the new palette and responds to the toggle — the app is never visibly
half-themed while Tier B ports sections one at a time. Tier B then reskins/ports sections individually,
each fully verified before the next starts.

## 4. Alternative considered and rejected: porting every section as a full mockup port

Given only 3 of 7 sections have real mockup material (§2), porting all 7 identically was rejected as
dishonest to the actual source material — Resources/Low Occupancy/Negotiated/Refunds have no mockup layout
to diff against. The plan instead locked a bucketing decision (Technical Lead sign-off, "Decisions locked"
§2 of the plan file):

- **3 sections, FULL PORT** (real mockup material → Tailwind utility markup, property-by-property
  verified against the mockup's *normalised* intent): Overview, Scheduling, Assignments.
- **3 sections, TOKEN-RESKIN ONLY, final** (no mockup, no scoped future work on the horizon — light
  touch, existing layout kept): Resources, Low Occupancy, Negotiated.
- **1 section, TOKEN-RESKIN ONLY, explicitly provisional**: Refunds — same light touch as the reskin-only
  three *for now*, but flagged in the plan and (per the plan) the batch-log as due for a real layout
  revisit once a separate future feature (Force-Cancel-into-refund-override, "build-order slot 2") lands
  and needs that exact screen's territory — a full mockup port now would mean redoing the screen twice.

This gave each of the 4 reskin-only/provisional sections a real, cheaper verification bar (token
compliance grep + contrast check + visual-coherence pass) instead of a mockup diff they have no mockup to
diff against — see §7.

## 5. Alternative considered and rejected: hardcoding a default theme

The reference mockup defaults to dark (`useState(() => localStorage.getItem('smashsync_theme') ?? 'dark')`).
The plan's locked decision instead sets **default theme = `system`** (follow the OS's
`prefers-color-scheme` when the admin has never made an explicit choice), with the toggle itself a
2-state light/dark control that, once used, leaves `system` behind and stores an explicit preference.
Rejected hardcoding either light or dark as the default — an admin's OS-level preference is a real signal
worth respecting on first visit, and the explicit-choice/system split is the same three-state pattern
(`bare :root` / `:root[data-theme="dark"]` / `@media (prefers-color-scheme: dark)`) the token layer itself
already needed for CSS, so the JS state model mirrors it rather than inventing a second scheme.

## 6. What was built

**Tier A** (`3019182`, "F-195 Phase 2 Tier A: Tailwind v4 + design tokens + light/dark toggle"):
- `@tailwindcss/vite` + `tailwindcss` ^4.3.3 added (no `tailwind.config`/`postcss.config` — v4 runs
  entirely through the Vite plugin); `pnpm-lock.yaml` regenerated.
- `styles.css`'s token layer: a semantic set (`--surface`, `--border`, `--text`, `--accent`, `--radius-*`,
  `--shadow-*`, etc.) defined on bare `:root` (light, "Crisp Court"), redefined under
  `:root[data-theme="dark"]` (dark, "Tennis Green") and under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` for system-preference
  users with no explicit choice — plus a `@theme inline` block so both `var(--surface)` and Tailwind
  utilities (`bg-surface`, etc.) resolve to the same tokens. `--brand-primary`/`--color-accent-*` stay
  owned by the existing `TenantContext` mechanism; the token layer references them rather than redefining.
- New `theme.ts`: `'light' | 'dark' | 'system'` state, `localStorage['admin-theme']`, live `matchMedia`
  tracking — deliberately local to `admin-web`, not `packages/ui-shared` (guest-pwa has no toggle; same
  "no shared infra before a second consumer" discipline this codebase already applies elsewhere).
- A pre-paint `<script>` in `index.html` applies the stored theme before first paint (no flash of the
  wrong theme).
- Every *shared* CSS class rewritten onto the token layer (`.panel`, `.form-grid`, buttons, `.muted`,
  `.empty-state`, `.success-box`, `.result-box`, `.table-row`, `.status-pill`/`.attendance-*`, inputs,
  `.occupancy-*`, `.time-slot*`, etc.) — layout (grid/flex/gap/padding) unchanged, only color/surface
  values move onto tokens.

**Tier B, item 1/7** (`ab86a7a`, "Overview — port adminHub card vocabulary"): full markup port of the
Overview screen from the mockup's `adminHub` — rounded-2xl token cards with uppercase micro-labels,
the utilisation-rate card treatment, per-pool occupancy rows with the progress-bar pattern,
`TrendIndicator` re-themed onto `--trend-up`/`--trend-down`/`--trend-flat` tokens (light values from the
mockup's normalised intent; **dark designed fresh**, since the mockup has no dark treatment for this
element at all). Deliberately does **not** port the mockup's Members/Guests sub-tabs or "Upcoming 3-Hour
Slot Monitor" — those are new features needing data/aggregation that doesn't exist yet; Phase 2 re-themes
what's live, it doesn't pull forward unbuilt work.

**Tier B, items 2-4/7** (`b73375b`, "Resources, Low Occupancy, Negotiated — verified"): confirmed, rather
than assumed, that these three sections needed **no markup port at all** — they render entirely through
the shared classes Tier A already rewrote onto the token layer, with zero hardcoded colors and zero
section-private CSS in any of the three. This is the two-tier design paying off exactly as intended: the
reskin landed for free in Tier A, these sections only needed verification. The one real code change: two
shared token values (`.panel`/`.login-panel` radius and shadow) bumped to match Overview's rounded-2xl
card treatment, applied consistently everywhere via the shared class rather than per-section.

**Not yet shipped** (items 5-7/7, per the plan's own suggested build order — Refunds, Scheduling,
Assignments — described here for completeness, not part of what this doc backfills): Refunds' full port
is explicitly deferred until a separate future feature lands in its territory (§4); Scheduling and
Assignments are the two remaining full ports, both real mockup material, not yet started as of this
writing.

## 7. Blast-radius check (rule 3a)

- Every shared CSS class Tier A rewrote was checked against **every** consumer listed in the plan's own
  class/consumer table (e.g. `.panel` — all 8 sections + the onboarding wizard; `.spin` — every section +
  login + `RequireAdmin` + `UserLookup`) — none are retired until their *last* consumer has actually
  ported, so nothing goes dark mid-rollout.
- `packages/ui-shared` and `apps/guest-member-pwa` deliberately untouched — guest-pwa stays on Tailwind
  v3; no shared package gained new theme infrastructure ahead of a second real consumer.
- A full e2e selector inventory (CSS classes, DOM IDs, label text, button text, `<h2>` text) was pulled
  from every guest-member-pwa spec touching admin-web routes before any markup changed, as a hard
  constraint the ports must preserve.
- No service, and no register file, touched by any of this.

## 8. Verification (real evidence, per the plan's own split bar)

**Tier A:** `pnpm --filter admin-web typecheck`+`build` clean; full `pnpm -r typecheck` (13 packages)
green; e2e vs. baseline (stash-compare) — `f023` and `f043` pass, `f061` fails identically on clean `main`
(pre-existing, unrelated to this change) — no new failures; production `Dockerfile.caddy-static` build +
serve confirmed working (`/admin/`, `/admin/version.json` OK, pre-paint script present in built HTML,
guest-pwa bundle byte-identical/untouched); manual smoke of all 7 sections, light + dark, both tenants
(JBC + courtowner1's red accent) — coherent, zero console errors, toggle persists, no flash; token
compliance confirmed (zero hardcoded hex outside the token layer).

**Tier B item 1 (full port):** property-by-property computed-style diff against the mockup's normalised
intent; screenshots light + dark, both tenants; e2e hooks confirmed intact.

**Tier B items 2-4 (token-reskin only):** token compliance (grep of all three sections' markup + CSS —
zero hardcoded hex/`rgb()`/named colors bypassing the token layer); real rendered-output contrast checks
(dark 6.6-12.6:1, light 5.6-14.8:1 for text on panel — all pass WCAG AA); visual-coherence pass against
the already-ported Overview screen (screenshots, JBC, light + dark). `styles.css` unchanged at 982 lines
for this commit (no new CSS needed — the whole point of the reskin-only bucket).

Full close-out verification (regression, full e2e set, `register:check`/`diagram:verify`) is deferred to
after all 7 Tier B sections + `TrendIndicator` land, per the plan's own stated close-out gate — not run
per-tier, and correctly not run here either.

## 9. Sign-off

Tier A and Tier B items 1-4 are already merged to `main` (`3019182`, `ab86a7a`, `b73375b`) under this
project's standard review flow — the plan file itself records Technical Lead sign-off on the "Decisions
locked" section (two-tier foundation, section bucketing, default theme, Tailwind depth, e2e close-out bar)
before implementation began, matching rule 1/6. This backfill doc requires only doc-level sign-off — no
code, no register change. **F-195 remains Open**, and stays open until Refunds, Scheduling, Assignments,
and the full Phase 2 close-out land — this doc does not represent or imply that closure.
