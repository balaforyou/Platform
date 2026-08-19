# Theming Path B — tokens, JBC brand identity, and the three data-backed slot states

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> Sequenced per your decision: this is the fast, low-risk piece. The full re-theme is scoped
> separately below with a real estimate, not committed to here.

## Context

JBC currently renders under a placeholder brand colour (`#c8102e`, a red) with **no logo at all** —
its `Tenant.logo` is null. The palette work introduces universal design tokens. Both run through the
existing, already-proven `Tenant.themeColor` → `--brand-primary` mechanism; the tenant theming data
model does not change.

---

## The flagged ambiguity — resolved, and your lean is already what the code does

**Selected should use `--brand-primary`. Confirmed by evidence, not preference.**

`CourtBooking.tsx:246` already renders the selected slot as
`bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]`. So Selected is **already
tenant-derived today**, and has been all along. Your lean isn't a change — it's the existing, proven
behaviour.

Choosing `Court Green #15803D` instead would mean *introducing* a new fixed token that diverges from
what the component already does, and would visibly clash for any future non-green tenant. The same
reasoning applies to the **Book a Court** card: `--brand-primary`, not a fixed `Deep Green`.

Once JBC's `themeColor` becomes `#166534`, Selected renders as that green anyway — the intended
appearance, arrived at through the tenant mechanism rather than a hardcoded second green.

**Assumption stated plainly:** `Court Green #15803D` and `Deep Green #14532D` are **not** added as
tokens. If either is genuinely wanted as a fixed shade independent of tenant, say so and I'll add it.

**Inter confirmed available**: already loaded in `index.html:13` alongside Outfit. Note it is *not*
currently the base font — `index.css:12` sets a system stack — so applying Inter is part of the token
work.

---

## Scope now — the three items you approved

### 1. Universal tokens as CSS variables

Add the fixed palette, radii and typography scale to `apps/guest-member-pwa/src/index.css` `:root`,
alongside the existing `--brand-primary`. Tailwind already maps `brand.primary` to it
(`tailwind.config.js:11`); the new tokens follow that same pattern so components consume variables
rather than literals.

**Nothing is repainted.** Defining tokens changes no pixels on its own — that is what makes this the
low-risk piece.

### 2. JBC's logo and real brand colour

**Convention, matched not invented:** `courtowner1.logo` is `/logo.png`, served from
`apps/guest-member-pwa/public/logo.png`. So tenant logos are static assets in the PWA's `public/`,
referenced root-relative.

**One correction to that convention is needed:** `public/logo.png` is a single generic filename. JBC's
logo must not overwrite it, so it lands as **`public/logo-jbc.png`** with `Tenant.logo = '/logo-jbc.png'`.

Then `Tenant.themeColor` `#c8102e` → **`#166534`** for JBC only.

### 3. The three data-backed slot states

- **Available** — default; `remainingCapacity > 0`.
- **Selected** — `--brand-primary` (unchanged behaviour, now tokenised).
- **Almost Full** — the only genuinely new state: computed from
  `slot.remainingCapacity / slot.window.capacity`, both already present in the availability response.

**Where the two decisions interact — my recommendation, flag it if you disagree.** You chose "don't
repaint components yet" *and* "build the three states now". Applying the specified
`#FFF7ED` / `#C2410C` to a card sitting on `bg-gray-900` would look broken — exactly the half-light
problem that motivated sequencing. So: **build the state logic and wire it to tokens now, with token
values that read correctly on today's dark surface.** The re-theme then flips the token *values* to
the light palette without touching component code again. The data-backed behaviour ships now; the
final colours ship with the re-theme.

---

## Three findings to report, not silently drop

1. **Full state has no data path.** `GET /resource-pools/:id/availability` pushes a slot only when
   `remainingCapacity > 0` (`slot-engine/src/index.ts:1990`; FIXED_INSTANCE equivalently at `:1985`).
   Full slots never reach the guest, so the state cannot render without a server contract change.
2. **Member slot has no data path.** The response is `{ window, remainingCapacity }` only —
   `isMemberBooking` is not exposed. Member bookings *do* consume capacity, so the effect is visible
   while the cause is not.
3. **The dynamic PWA manifest hardcodes `type: 'image/png'` and `sizes: '512x512'`**
   (`tenant-management/src/index.ts:200-206`), and the manifest is **live** — injected at runtime by
   `TenantContext.tsx:124-127`. JBC's source image is a **JPEG, 1600×1425**. Converting to PNG is the
   reason for the `logo-jbc.png` filename above; the declared `512x512` will still be wrong for any
   non-square logo, which is a real correctness issue for PWA install and connects to F-002/F-003's
   existing install debt.

**No image tooling is available here** — no ImageMagick, no `sharp` (the `convert` on PATH is Windows'
disk utility, not ImageMagick). So the PNG conversion needs either a tool you run, or a one-off
dependency, or the JPEG is referenced as-is with the manifest left wrong. **This needs your call.**

---

## The full re-theme — real estimate, not committed to here

Measured, not guessed: **11 files, 2,672 lines, 348 dark-class occurrences** to convert
(`bg-gray-*`, `text-white`, `text-gray-*`, `border-white/*`, `bg-white/*`).

| File | Lines | Dark uses |
|---|---|---|
| main.tsx | 384 | 47 |
| LoginScreen | 310 | 46 |
| CourtBooking | 333 | 40 |
| BookingHistory | 280 | 39 |
| BranchDashboard | 171 | 33 |
| BranchAbout | 206 | 30 |
| BookingPay | 298 | 29 |
| BranchSelect | 138 | 23 |
| BookingConfirmation | 202 | 22 |
| CancelBookingModal | 137 | 21 |
| PwaInstallPrompt | 213 | 18 |

**Risk is concentrated in contrast and state legibility, not effort.** The mechanical swap is
straightforward; what needs real verification is that every state stays readable — error banners,
disabled buttons, the `.status-pill` variants, selected/hover states, and the payment and
confirmation screens that carry money values. A browser pass per screen is the actual cost, and it is
the same shape as SCREEN-002's five-step walkthrough rather than a find-and-replace.

**My read:** the swap is perhaps a third of the work; the verification is the rest. It deserves its
own kickoff, its own screen-by-screen evidence, and should not be squeezed in beside demo-critical
items.

---

## Verification

- **JBC in a real browser**: logo renders on `LoginScreen` and the app header (`main.tsx:66`), and
  `--brand-primary` resolves to `#166534` — read from the live DOM, not assumed from the DB value.
- **Slot states from real data**: construct pools whose capacity genuinely puts a slot near threshold
  and confirm Almost Full appears from the capacity calculation, never a hardcoded per-slot colour.
- **`courtowner1` and `club1` unaffected**: both loaded in the browser afterwards, their own
  `themeColor` and logo unchanged. Only universal tokens (which apply uniformly by design) and JBC's
  own record change.
- Regression across all five suites; whole-repo typecheck and build; rebuild before testing (F-085).

## Out of scope

The full re-theme (estimated above). Full and Member slot states (findings 1–2). Any change to the
tenant theming data model. `Court Green` / `Deep Green` as separate tokens unless you confirm you want
them.
