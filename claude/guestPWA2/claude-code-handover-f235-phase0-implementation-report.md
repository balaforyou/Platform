# Claude Code Implementation Report — F-235 Phase 0: Tokens/Theming, Components, Nav/Shell

**Branch:** `f235-phase0` (off `main`@`fe918121e0`)
**Status:** Implemented and locally verified to the extent this environment allows (no Docker/Postgres available in this session — see §3). **Not committed, not pushed, not merged** — per project rule 6 and the handover's own §0, this is uncommitted on disk pending review. Awaiting explicit sign-off before any commit.

---

## 1. What was implemented

### 1.1 Auth module split (Option C) — with Correction 1
- Trimmed `packages/ui-shared/src/context/AuthContext.tsx` to session/token plumbing (`accessToken`, `user`, `isAuthenticated`, `loading`, `setSession`, `mergeUser`, `logout`); `parseJwt`/`refreshSession`/the `activeRefreshPromise` dedup guard untouched.
- New `apps/guest-member-pwa/src/lib/auth.ts`: `verifyGoogle`, `attachPhone` **plus `requestOtp`/`verifyOtp`** (Correction 1 — see §2).
- New `apps/admin-web/src/lib/auth.ts`: `requestOtp`, `verifyOtp`, `verifyGoogleMock`.
- Updated call sites: `LoginScreen.tsx`, `CompleteSignupScreen.tsx` (guest-pwa), `main.tsx:417-459` (admin-web).

### 1.2 Tokens & theming
- `apps/guest-member-pwa/src/index.css`: `--color-accent-2-*` ramp replaced with the resolved gold values; new `:root[data-theme="dark"]` block + `@media (prefers-color-scheme: dark)` mirror appended.
- New `apps/guest-member-pwa/src/lib/theme.ts`, ported from `apps/admin-v2/src/lib/theme.ts` (storage key `gpwa-theme`).
- `main.tsx`: pre-paint `applyTheme(getStoredTheme())` call added at the top of the entry file.

### 1.3 Reusable components (`apps/guest-member-pwa/src/components/ui/`)
`Button.tsx`, `LoadingState.tsx` (full/compact/inline + reduced-motion static frame — **see caveat in §2**), `ConfirmDialog.tsx` (on `@radix-ui/react-dialog`), `StatusPill.tsx` (5 statuses — Correction 2), `AccountSheet.tsx` (theme segmented control + user info + logout).

### 1.4 Navigation & shell
- `Shell.tsx` replaces `Layout()`: bottom-nav (Home / My Bookings), no fixed header, plus a shell-level account-trigger button (see §2, Correction 3).
- Route collapse in `main.tsx`: `/branches`, `/branches/:id`, `/branches/:id/about`, `/branches/:id/book/:poolId` replaced by a single `/book` → `BranchBooking.tsx` (compiling placeholder only, no real content — that's a future slice).
- `ProtectedRoute`'s phone-gate redirect left exactly as-is, per the handover's explicit instruction — not touched.

### 1.5 Backend — T&C schema
`packages/database/prisma/schema.prisma`, `model Booking`: added `termsAcceptedAt DateTime?` and `termsVersion String?`. Migration written by hand at `packages/database/prisma/migrations/20260916120000_booking_terms_acceptance_f235/migration.sql` (simple `ALTER TABLE ADD COLUMN`, same shape as the `memberAttendanceConfirmedAt` precedent). **Not applied to a real database this session — see §3.**

---

## 2. Deviations from the handover, found and corrected (or flagged) during implementation

These were surfaced during the required blast-radius check (project rule 3a) before/during implementation, not discovered after the fact. Each was either raised to you directly (three were, via `AskUserQuestion`) or is a mechanical correction with no real design choice involved.

**Correction 1 — auth-split caller list was incomplete.** The handover's §0.0/§1 said guest-member-pwa's only real `AuthContext` callers were `LoginScreen.tsx → verifyGoogle` and `CompleteSignupScreen.tsx → attachPhone`. Direct read of both files showed `LoginScreen.tsx` also calls `requestOtp`/`verifyOtp` (the live phone-OTP flow is still in the UI today — the Gmail-only redesign is a future slice) and `CompleteSignupScreen.tsx` also calls `requestOtp`. Fixed by giving `apps/guest-member-pwa/src/lib/auth.ts` its own `requestOtp`/`verifyOtp` too, mirroring admin-web's. Without this the guest-pwa build would not have compiled after the split.

**Correction 2 — `StatusPill`'s status union was incomplete.** The handover's §3 spec'd 4 statuses; the real `BookingStatus` Prisma enum has a 5th, `RELEASED_NO_SHOW`, already rendered today in `BookingHistory.tsx` ("Expired", neutral tokens). Added to `StatusPill.tsx`/`StatusPill.css` reusing the CANCELLED-family neutral treatment, matching what `BookingHistory.tsx` already does.

**Correction 3 (your decision) — route collapse implemented literally, breakage accepted.** You confirmed collapsing `/branches...` into `/book` now, even though `MainDashboard` (`main.tsx`), `BranchSelect.tsx`, `BranchDashboard.tsx`, and `CourtBooking.tsx` all `navigate()`/`Link` to the old paths. Those components are now orphaned (still present in the repo, no longer routed to) and their real navigation is dead until the future Branch+Court-Booking screen slice rebuilds `/book`'s real content. **This also means `apps/guest-member-pwa/tests/findings-verification.spec.ts`, `guest-booking.spec.ts`, `f043-phase-c.spec.ts`, and `f023-full-system.spec.ts` (all of which reference the old `/branches/...` paths) will fail** until that slice lands — I did not update these four, since fixing them meaningfully requires the real screen content this slice deliberately doesn't build. Flagging this explicitly since the handover's own §6 item 3 names `guest-booking.spec.ts` as a canary that should pass — it will not, for this reason, until the next slice.

**Correction 4 (your decision) — account/logout entry point moved to shell level, not deferred to Home.** The handover's §4.2 put `AccountSheet` behind an avatar circle "already present in the Home screen mockup's header" — but Home's real content isn't rebuilt this slice, so that avatar doesn't exist, and `AccountSheet` (carrying the only logout control, per §2.3/§3) would have been completely unreachable. Two real Playwright specs (`member-self-confirm.spec.ts:160`, `f041-verification.spec.ts:186`) click `#logout-btn` directly today. Per your direction to follow admin-v2's own precedent (`apps/admin-v2/src/screens/shell/AppShell.tsx`'s always-visible avatar trigger in shell-level chrome, not per-screen), I added a small always-visible account-trigger button to `Shell.tsx` itself (not a full header — just a 40px corner control) that opens `AccountSheet`. Its Sign Out button keeps `id="logout-btn"`. Updated both specs' one line each to open the sheet (`button[aria-label="Account"]`) before clicking logout — both specs now pass the same real assertions, just via one extra click.

**Flagged, not fixed — two real WCAG contrast failures found while computing §6's required numbers (see §3.4).** These come directly from values in the handover's own approved spec (not from any interpretation of mine); I did not invent replacement values, per charter §2a.

---

## 3. Verification evidence (handover §6, project rules 2/7)

### 3.1 Build — real output, rebuilt from clean
```
cd packages/ui-shared && npx tsc            # dist rebuilt, no errors
cd packages/database && npx prisma generate # client regenerated, no errors
cd apps/guest-member-pwa && npx tsc --noEmit -p tsconfig.json   # clean
cd apps/admin-web && npx tsc --noEmit -p tsconfig.json          # clean
cd apps/guest-member-pwa && npm run build
  ✓ 1931 modules transformed, built in 12.54s
  dist/assets/index-BN8eEBpW.js   344.08 kB │ gzip: 103.07 kB
cd apps/admin-web && npm run build
  ✓ 1872 modules transformed, built in 1.26s
  dist/assets/index-uI7DXXbQ.js   374.26 kB │ gzip: 107.62 kB
```

### 3.2 Real login through both apps, both channels — **not done, environment limitation**
Docker is not running in this session (`docker ps` fails: "cannot connect to the Docker API"), and no backend service or Postgres is reachable on any expected port (checked 3001–3005, 65432, 65500 — all unreachable). I could not bring up the real stack to exercise `/identity/auth/*` for real, so **this item from §6 is not evidenced** — flagging honestly rather than claiming it works. What I *could* verify: both apps typecheck and build clean against the trimmed `AuthContext` shape, and every real call site (`LoginScreen.tsx`, `CompleteSignupScreen.tsx`, `admin-web/main.tsx`) was updated and re-read after editing to confirm the new imports/params line up with what `apiRequest` and the backend routes expect (unchanged request bodies/methods from the original inline implementations — this was a direct extraction, not a rewrite). This needs a real pass against the dev stack before sign-off, same as the charter's real-device requirement.

### 3.3 Playwright canary — **not run, same environment limitation**
Same Docker/Postgres unavailability blocks `pnpm test:e2e`. Additionally, per Correction 3, `guest-booking.spec.ts` is now expected to fail regardless of environment (it drives the collapsed routes). `member-self-confirm.spec.ts` and `f041-verification.spec.ts` were edited for Correction 4 but not run.

### 3.4 Dark-mode contrast — **real computed numbers, two failures found**
Computed via a standalone WCAG relative-luminance/contrast implementation (not eyeballed), against real values from `index.css` and the real JBC tenant accent ramp (`generateAccentRamp('#166534')` in `packages/ui-shared/src/lib/colorRamp.ts`, computed with the same OKLCH math the library uses):

| Pair | Ratio | AA (4.5:1) |
|---|---|---|
| `--color-bg` / `--color-text` (page body) | 15.24:1 | Pass |
| `--color-neutral-100` / `--color-text` (cards) | 13.92:1 | Pass |
| `--color-neutral-100` / `--color-neutral-700` (muted text) | 7.58:1 | Pass |
| StatusPill CONFIRMED/CHECKED_IN dark (real JBC `accent-800` bg `#224d2f` / `accent-100` text `#eef8f0`) | 8.90:1 | Pass |
| StatusPill CANCELLED/RELEASED_NO_SHOW dark (`neutral-700` bg / `neutral-200` text) | 6.79:1 | Pass |
| Button primary (`accent-2-400` `#e6ad02` bg / `#3a2800` text, same both themes) | 6.97:1 | Pass |
| **Shell active-nav-item / AccountSheet active-segment text: real JBC `accent-700` (`#316c42`) as text on dark `neutral-100` (`#201d17`)** | **2.68:1** | **FAIL** |
| StatusPill HELD dark, as literally spec'd in handover §2.2/§3 (`accent-2-800` bg `#fcf5e5` / `accent-2-200` text `#f8e6c1`) | **1.13:1** | **FAIL** |

**Root cause, both failures:** the handover's dark-mode plan keeps `--color-accent-*` "tenant-driven, unchanged" on the theory that the existing ramp "already spans 100-900" at "a dark-safe lightness step" (§2.2's own comment). `generateAccentRamp()` (`packages/ui-shared/src/lib/colorRamp.ts`) uses one fixed lightness curve regardless of theme — step 700 is always L≈0.48, tuned for use as text-on-light-neutral, not text-on-dark-neutral. For JBC's real green, that produces a 2.68:1 failure anywhere `--color-accent-700`/`800` is used as text against the new dark neutral backgrounds (Shell's active nav item, AccountSheet's active segment — both literally spec'd this way in §3/§4.2). Separately, the handover's own §2.2 dark accent-2 values invert the ramp (100↔900 roughly swapped) so that accent-2-800 and accent-2-200 land within 4% lightness of each other in dark mode — StatusPill's HELD row (§3: dark bg=accent-2-800, text=accent-2-200) inherits that inversion directly and becomes near-invisible.

**Not fixed here** — per charter §2a, a real design decision (either a tenant-ramp dark-mode step-selection strategy, similar to admin-v2's `--av2-accent: var(--av2-accent-400, ...)` pattern of picking a *different* ramp step per theme rather than reusing 700/800 in both, or specific override values for these three usages) needs your/Bala's call before it ships, not a guess from me.

### 3.5 Theme persistence — real, verified live
Started `guest-member-pwa`'s dev server, set `localStorage['gpwa-theme'] = 'dark'` via the browser, did a genuine full page navigation/reload, and confirmed `document.documentElement.getAttribute('data-theme')` read back `"dark"` — i.e. `applyTheme(getStoredTheme())` in `main.tsx` really does apply the stored theme before first paint on a real reload, not just in theory. Verified `--color-bg`/`--color-neutral-100`/etc. resolve to the real dark hex values via `getComputedStyle`, and cross-checked one of them against the actual rendered pixel color of a real DOM element (`rgb(32, 29, 23)` = `#201d17`, matching `--color-neutral-100` dark) rather than trusting a screenshot's visual impression — same discipline as the frozen-transition/invisible-gradient traps in this repo's CLAUDE.md.
Private-mode `localStorage` throw path (`theme.ts`'s try/catch): verified by code inspection only — could not force a real private-mode throw from this browser tooling; the try/catch mirrors admin-v2's identical, already-shipped code exactly.

### 3.6 `prefers-reduced-motion` — **not verified with a real OS toggle**
No real device/OS available in this session to flip the setting. The CSS rules for `LoadingState`'s static frame and `AccountSheet`'s cross-fade (both under `@media (prefers-reduced-motion: reduce)`) were authored and are present in the stylesheets; not exercised against a real toggled preference.

### 3.7 Real Android Chrome / iOS Safari — **needs Bala directly**
No real device in this environment, consistent with charter §3's own acknowledgment that this needs a real pass outside Claude Code.

---

## 4. LoadingState — a real caveat on the illustration itself

The design canvas (`https://claude.ai/artifact/4DapjUsKWiVahKfS8cCm8y`) requires your claude.ai sign-in; this session's browser tooling is an isolated, unauthenticated browser and could not open it. `LoadingState.tsx`'s two-racket rally SVG/CSS is a good-faith reconstruction from the written spec (two independently-fixed rackets, each striking only on its own side; feather ink / cork green-yellow-green / racket teal colors; static single frame under reduced motion) — **not a pixel-verified port of Bala's actual supplied component.** This should be diffed against the real canvas artboard before treating it as done; I did not want to silently present a guess as "ported from the canvas" per this project's evidence standard.

---

## 5. Blast-radius items confirmed clean (no regression)

- `apps/admin-v2` — zero references to the shared `AuthContext`, confirmed by grep both before and after; untouched.
- Every other `useAuth()` call site in both apps (`BookingConfirmation.tsx`, `BookingHistory.tsx`, `BookingPay.tsx`, `BranchAbout.tsx`, `BranchDashboard.tsx`, `BranchSelect.tsx`, `CancelBookingModal.tsx`, `CourtBooking.tsx`, admin-web's dashboard/booking screens) only destructures `accessToken`/`user`/`logout`/`isAuthenticated`/`loading` — none touch the removed login methods, none needed changes.
- `CourtBooking.tsx`'s `--slot-available-accent: var(--color-accent-2-700)` now resolves to the new gold ramp instead of the old sage ramp — this is the intended, spec'd change (design brief §0.1), named here since `CourtBooking.tsx` itself isn't otherwise touched this slice.
- `CancelBookingModal.tsx` — read, not touched; still uses its own bespoke markup (a future slice migrates it onto `ConfirmDialog.tsx`, per the handover).

---

## 6. Explicit non-goals honored
No per-screen content rebuild; no `admin-v2` changes; `ProtectedRoute`'s phone-gate redirect untouched; no PDF/imagery work.

---

## 7. What's needed before this can be signed off for commit
1. A decision on the two contrast failures in §3.4 (tenant-accent-on-dark-neutral, and StatusPill HELD's inverted accent-2 dark pairing).
2. A real dev-stack pass (Docker/Postgres up) for §3.2/§3.3 — login through both channels in both apps, and the Playwright suite (with the four now-broken specs named in Correction 3 treated as expected failures, not surprises).
3. A diff of `LoadingState.tsx` against the real canvas artboard (§4).
4. Real Android Chrome / iOS Safari passes (§3.7).
5. Confirmation that Correction 3's and Correction 4's resolutions (both made with your direct input this session) are what you want landed, vs. revised further.

No commit, push, or merge has been made — everything above is on the `f235-phase0` branch, currently uncommitted on disk, pending this review.
