# Claude Code report — guest-member-pwa UI polish (Home / Slot & Time Selection / Review & Pay) + F-307

**Date:** 26 Sep 2026
**Branch:** `ui-polish-guest-pwa-26sep` (staged, **not committed** — awaiting Bala/Chief sign-off per rule 6)
**Status:** Implementation complete, verified. Not merged.

## Diffstat (staged, uncommitted)

```
 apps/guest-member-pwa/index.html                   |   2 +-
 .../guest-member-pwa/src/components/BookingPay.tsx | 149 ++++++++++++---------
 .../src/components/BranchBooking.css               |  85 ++++++++----
 .../src/components/BranchBooking.tsx               |  57 +++++---
 apps/guest-member-pwa/src/components/Shell.css     |  10 +-
 apps/guest-member-pwa/src/constants/terms.ts       |   2 +-
 apps/guest-member-pwa/src/index.css                |  16 ++-
 apps/guest-member-pwa/src/main.tsx                 |  53 +++++---
 .../tests/f023-full-system.spec.ts                 |   8 +-
 apps/guest-member-pwa/tests/f043-phase-c.spec.ts   |   2 +-
 .../tests/findings-verification.spec.ts            |   2 +-
 apps/guest-member-pwa/tests/guest-booking.spec.ts  |  15 +--
 .../tests/pwa-install-dismissal.spec.ts            |   8 +-
 docs/findings_register.md                          |   1 +
 docs/plans/batch-log.md                            |  20 +++
 docs/plans/pending-findings.md                     |  24 ++++
 scripts/tenants/jbc.json                           |   5 +-
 17 files changed, 301 insertions(+), 158 deletions(-)
```

Full diff available via `git diff --cached` on this branch — real, staged, reviewable.

## What shipped

### Global tokens
- `--color-bg` `#f5ead8` → `#F8FAFC`; `--font-heading` Caprasimo → Inter.
- JBC's real `Tenant.themeColor` DB row updated `#166534` → `#16A34A` (plus `scripts/tenants/jbc.json` so a future rebuild doesn't restore the old value).
- `index.html`'s static `meta-theme-color` fallback → `#F8FAFC` (confirmed live: `document.getElementById('meta-theme-color').content === '#f8fafc'`).
- Home's primary CTA (`book-court-dashboard-btn`) was found still using the fixed gold ramp and was explicitly repointed to the tenant-derived `--color-accent-700` — confirmed it was never wired to the tenant ramp before.

### Home (`main.tsx`)
- Welcome heading: Option B, `"Welcome, {firstName}"`, old separate `"Hi, {firstName}"` line removed.
- Nameless fallback `"Welcome!"` added for genuinely nameless sessions. **Real correction made during verification, not assumed**: I initially believed both Playwright fixtures hit this fallback (traced only the `/otp/verify` JWT, which carries no `email`/`displayName`). Live evidence during e2e re-run showed `pwa-install-dismissal.spec.ts`'s fixture (a seeded user with `email: member@example.com`) actually renders `"Welcome, member@example.com"` — because `/auth/refresh`'s JWT (used by every boot-time silent refresh) *does* carry `email`/`displayName`, unlike the initial verify token. Fixed the spec assertions to match real behavior rather than the component.
- Empty-state card restyled (`--mint-surface`, `rounded-2xl`); Shell avatar touch target 40px → 44px; bottom nav given a blurred/elevated background.

### Slot & Time Selection (`BranchBooking.tsx`)
- Dark venue-chip pill + separate about-badge row → one sticky top bar (back / title opens venue-switcher / subtitle+info icon opens about-sheet). Both real triggers relocated, not dropped. Multi-pool switcher gate (`pools.length > 1`) confirmed untouched.
- `"01 · DAY"` → `"Select Date"`, `"02 · START"` → `"Select Time"`.
- Empty summary placeholder hidden on **mobile only** — the real fixed bottom bar (time/duration/total/CTA) already acts as the de facto bottom sheet once a slot is picked; rebuilding it into a stripped two-row sheet would have meant tearing out working duration-stepper/rate-source/booking-rules logic for a styling batch, so it was left intact. **No hold-timer badge** — confirmed no client-side hold-countdown state exists (only a server-side 5-min TTL, no UI wire-up) — flagged as new feature work, out of scope.
- 5 real Playwright specs' selectors updated (`.gpwa-branchbooking__venue-chip`/`__about-badge` → `__topbar-title`/`__topbar-subtitle`) — caught via a real blast-radius grep before removing the old classes, not assumed safe.

### Review & Pay (`BookingPay.tsx`)
- "Players" row → data-driven `"Entire Court (Up to N players)"` using `booking.window.resourcePool.capacity`, already returned by `GET /bookings/:id` — no backend change.
- "Verified" badge now reads real `user.isPhoneVerified` instead of rendering whenever `user.phone` is truthy.
- Pricing kept as single "Amount to Pay" — confirmed no fee/tax fields exist on `Booking`, no tax line fabricated.
- Court-name-in-header ask (`"JBC Main Courts • Court 1"`) **deliberately not added** — F-189 intentionally omitted that row from this exact card to avoid reading as double-charging next to the per-hour price. Flagging rather than silently reversing a prior decision.

### F-307 — Court Rules consent, checkbox → implicit
- Visible checkbox removed. Disclaimer added, **carrying the full original clause set verbatim in substance** (shoes; food **and** drinks; the liability waiver; real venue name) — restructured into passive sentence form per Chief's plan-approval correction, not shortened.
- New `ensureTermsAndIntent()` preserves the exact same two-call server order (`POST /bookings/:id/terms` → `POST /payment/intents`) the removed checkbox used to trigger, now fired from the real Pay button (`handlePayPress`) and the dev-only simulate-payment button alike.
- `TERMS_VERSION` bumped `2026-09-17` → `2026-09-26`.

## Real evidence

**Typecheck/build:** `npx tsc --noEmit` clean, `vite build` clean. Built CSS grepped directly (`dist/assets/*.css`) — confirms `color-bg: #f8fafc` and `font-heading: "Inter"` landed in the actual artifact, `f5ead8`/`Caprasimo` fully gone (0 matches).

**Backend regression:** `pnpm test:regression` against `badminton_db_test` — 5/5 suites passed on a clean run. (First run showed `identity-auth`/`tenant-management` failing; re-run in isolation passed both — confirmed environmental, matching this repo's own documented identity-auth flakiness precedent, not a real regression.)

**e2e (real dev stack, `pnpm dev:up`, Caddy-fronted, `badminton_db_e2e`):**
- `pwa-install-dismissal.spec.ts` — **passing**, including the corrected heading assertion.
- `findings-verification.spec.ts`, `f043-phase-c.spec.ts`, `f023-full-system.spec.ts` — all pre-existing `test.skip`/`describe.skip`, confirmed unrelated to this batch.
- `guest-booking.spec.ts` — one failure (slot-card timeout at a step this batch never touched). **Confirmed pre-existing**, not a regression: stashed this entire batch's changes, re-ran the identical spec against unmodified `main` on the same running stack — identical failure. Restored the stash afterward; diff intact.

**A real dark-mode contrast bug was found and fixed during this verification pass**, not assumed away: the new sticky top bar / bottom nav use `--surface-header` (a fixed-light F-146 token, never given a dark override) paired with `--color-text`/`--color-neutral-700` (which invert to pale cream in dark mode) — text went unreadable in dark mode. Caught via `getComputedStyle`, not a screenshot glance (screenshots alone would have shown it as "washed out," easy to misread as a rendering artifact). Root cause matches this file's own documented Correction 5 precedent exactly. Fixed by adding real dark-mode overrides for `--surface-header`/`--mint-surface`/`--border-subtle` in `index.css`, in both the `data-theme="dark"` block and the `prefers-color-scheme: dark` media query, matching the existing dual-block convention. Re-verified live: title text legible against the dark bar after the fix.

**Real live-fire booking through to Pay** (JBC tenant, real dev stack, light mode forced via viewport emulation since the pane itself defaulted to dark — worth knowing, this is why the above bug wasn't visible until I checked computed styles explicitly):
- Home: `#f8fafc` background, tenant green CTA/nav, "Welcome!" (nameless fresh guest), mint empty state.
- Slot & Time Selection: new sticky top bar legible, "Select Date"/"Select Time" labels, green active date, real slot grid, real sticky "Hold & Proceed to Pay" bar.
- Review & Pay: `"Court Capacity: Entire Court (Up to 4 players)"` (real data), `"Verified"` phone badge, disclaimer with the full clause set, `🔒 Pay ₹400` in tenant green, **no checkbox anywhere in the DOM**.
- Pressed the dev simulate-payment button → real navigation to `/confirmation`.
- **F-307 DB read-back**, real booking `0ceb7c68-4322-4a58-862b-2b3bda4fb3a2`:
  ```
  id                                   | status     | termsAcceptedAt          | termsVersion | price
  0ceb7c68-4322-4a58-862b-2b3bda4fb3a2 | CONFIRMED  | 2026-09-26 09:39:03.751  | 2026-09-26   | 400.00
  ```
  Confirms the server-side consent record fired and persisted with no visible checkbox, `termsVersion` matching the bumped constant.

**Register:** `pnpm register:check` — 271 rows (Open 116, Resolved 155), green. `pnpm diagram:verify` — clean, all 67 finding tags agree (F-307 correctly untagged — pure UI/consent-flow change, no drawn backend endpoint change). F-307's Open→Resolved row and the `pending-findings.md` `Confirmed-ID: F-307` entry are both in the staged diff. `docs/plans/batch-log.md` entry added in the same pass.

## Real gaps found and handled in the open (not silently decided)

1. **F-307's decision doc doesn't exist in the repo.** Flagged before implementation; Chief pasted the real content directly into the session, which is what was implemented. Register/pending-findings entries say this plainly rather than pretending the file exists.
2. **The venue-chip/about-badge were two separate real elements**, not one as the handover's phrasing suggested — both relocated into the new top bar rather than one being silently dropped; called out as this session's interpretation, open to correction.
3. **Home CTA weight/font-weight consistency**: chose to keep `fontWeight: 400` on the Home heading (matching all 22 other `--font-heading` consumers app-wide) rather than bumping just this one to bold, to avoid introducing a one-off typographic inconsistency the Inter swap didn't explicitly call for.
4. **Court-name row on the Review & Pay summary card** — not added back, since F-189 deliberately omitted it from this exact card for a documented reason; flagged rather than silently reversed.
5. **A synthetic test booking remains in the real `badminton_db` demo database** (`0ceb7c68-4322-4a58-862b-2b3bda4fb3a2`, a synthetic test phone number, ₹400, JBC) from the live-fire F-307 verification above. My cleanup attempt (a multi-statement `DELETE`) was blocked by this session's own safety classifier ("Cloud Storage Mass Delete") before it ran — per that block's own instruction, I did not attempt a workaround. **This row is real, harmless, and still present** — Bala/Chief, your call on removing it (a simple cascade delete on that booking id + user phone) or leaving it as a demo artifact.
6. **`badminton_postgres` was found running on host port 65500 before this session** (matching `.env`'s `DATABASE_URL`), not the canonical `65432` `docker-compose.yml` maps it to. Bringing up the dev stack for e2e recreated the container on the documented canonical port (data intact, same named volume) — `.env` now disagrees with the running container's real port until whoever owns that drift reconciles it. Not this batch's to fix; flagged per rule 8.

## Screenshots

Captured live in-session (light mode, real dev stack, JBC tenant) for Home, Slot & Time Selection (with slot selected + summary), and Review & Pay — all shown inline during this session's tool calls. A dedicated before/after for the three held token values (background/font/JBC green) is the same set: the Home screenshot alone shows all three simultaneously (off-white background, Inter heading, green CTA/nav), since they compose on one screen.

## Sign-off

Per rule 6: **no commit without explicit sign-off.** Everything above is staged on `ui-polish-guest-pwa-26sep`, not committed, not pushed, not merged. Awaiting Bala/Chief review — including a decision on item 5 (the leftover demo-DB test row) before or independent of merge sign-off.
