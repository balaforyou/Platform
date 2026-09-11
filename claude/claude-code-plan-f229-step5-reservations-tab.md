# F-229 Step 5 — Reservations tab UI (admin-v2) — implementation plan

**Status:** plan-mode, awaiting sign-off. Steps 0–4 signed off; branch `f229-manual-booking` at `64b624a`.
**Scope:** replace `GuestManagementScreen.tsx`'s Reservations `EmptyState` with the walk-in booking form from the approved mockup. Frontend only — no backend change. Built to `Main_v2.dc.html` (the updated mockup the user supplied), not the plan prose.

---

## 1. Mockup read in full (`Main_v2.dc.html`) — the spec this is built to

Card **"New walk-in booking"** / *"For a guest who's here in person or on the phone right now."* — `Card` component, `flex column gap: space-5`. Sections top to bottom:

1. **Guest** (`label` "Guest") — three states, cycled by a real Search:
   - **not-searched:** `[ Mobile number input (flex:1) ] [ green "Search" button + magnifier icon ]`
   - **found:** green box (`accent-soft` bg, `accent` border, `accent-hover` text) — check icon + `<strong>+91 98765 43210</strong> — existing guest, Ramesh K.` + right-aligned underlined **"try another"** (resets to not-searched)
   - **not-found:** blue box (`info-soft`/`info-border`/`info-text`) — info icon + `<strong>+91 99887 65432</strong> — no account found` + **"try another"**, then an `input placeholder="Guest's name"`, then hint *"Creates a guest account with this name and number — no OTP needed, you're verifying them."*
2. **Date + Time of day** — 2-col grid: `Date` (the mockup shows a read-only `10 Sep 2026` — real build uses a native date input, default today, `min` today) and `Time of day` — a 3-button segmented control **Morning / Afternoon / Evening** (active = `accent-soft` bg + `accent` text + weight 700).
3. **Slot** (`max-width: 280px`) — a `Select` of the open windows in the chosen band; option label like `6:00 – 7:00 PM`; hint *"Open slots for {band} on {date} — pick the exact one."*
4. **Court** — label row: `Court` + a **"Show all courts"** `Toggle` (right-aligned, `text-xs` muted). A `repeat(4, 1fr)` grid of court buttons: selected = `2px solid accent` + `accent-soft` bg; a non-guest-bookable court (only visible when the toggle is on) renders its label in `--av2-warning` and adds a tiny uppercase **"RESERVED"** tag. Hint below: *"Showing every court in this pool, including ones reserved for members."* (on) / *"Showing courts open to guest bookings only."* (off). **Toggle off hides reserved courts entirely; on shows all, reserved ones labelled** — Bala's Option B, verbatim.
5. **Price** (`max-width: 200px`) — `₹`-prefixed input, pre-filled, hint *"Pre-filled from the guest {peak|standard|default} rate — edit to override."*
6. **How will they pay?** — 2 cards:
   - **Cash** (wallet icon) — *"Collected now — booking confirms immediately."* — selected border/bg `accent`.
   - **Payment link** (link icon) — *"Sent to their phone, or scan your QR — either way you confirm once they've paid."* — selected border/bg `info-text`/`info-soft`.
   - Link selected → sub-panel (`info-soft`): segmented **"Send Razorpay link" / "Already paid via your QR"**.
     - *Send:* hint *"A real Razorpay link goes to their phone. Confirms automatically once they pay — no action needed from you."*
     - *QR:* hint *"If Razorpay's down or they'd rather scan your static UPI QR directly, enter the transaction reference they show you to confirm the booking yourself."* + `input placeholder="UPI transaction ID"`.
7. **Submit** button (`align-self: flex-start`, accent, weight 700) — **dynamic label**:
   - cash → **"Confirm & mark paid"**
   - link + send → **"Create booking & send link"**
   - link + QR → **"Confirm — paid via QR"**

Colour/spacing tokens in the mockup are admin-v2's own `--av2-*` — so `Card`/`Button`/`Select`/`TextField`/`Toggle`/`Badge`/`Banner` match it directly; the court grid, the found/not-found boxes, and the payment cards are bespoke inline-styled with the same tokens (never the two raw `#ffffff` literals — use `--av2-accent-fg`). Everything is theme-aware for free.

## 2. What gets built

**New:** `apps/admin-v2/src/screens/guestManagement/sections/ReservationsPanel.tsx` (the form), `reservationHelpers.ts` (band grouping, `resolveGuestRate`, phone normalise), and 3 hooks in `queries.ts`.

**Changed:**
- `GuestManagementScreen.tsx` — the `tab === 'reservations'` `EmptyState` → `<ReservationsPanel branchId={branchId} />`.
- `apps/admin-v2/src/lib/useAdminApi.ts` — `post` gains an optional 3rd `headers` arg (additive; exactly the shape `apps/admin-web`'s own `useAdminApi.post` already has — `apiRequest` already accepts `headers`). `/bookings/manual` needs `Idempotency-Key`.

**3 new hooks in `queries.ts`:**
| hook | call | notes |
|---|---|---|
| `useGuestLookup()` | `GET /identity/users/lookup?tenantId=&phone=` | returns a `mutate(phone)` — 200 → `{id,name,phone,userType}`, 404 → "not found" (not an error state). Step 2 added `name` to this route. |
| `useCreateWalkIn()` | `POST /identity/users/walk-in` `{ phone, name, tenantId }` | returns `{ id, phone, name, userType, created }` |
| `useCreateManualBooking()` | `POST /payment/bookings/manual` + `Idempotency-Key: crypto.randomUUID()` | body = `{ tenantId, branchId, resourcePoolId, resourceId?, windowId, userId, negotiatedPrice, paymentMethod, upiTransactionId? }` |

**Pool resolution:** the screen already has a **Branch** `Select`. Inside the panel, `usePools(branchId)` → if exactly one pool (JBC), use it silently; if >1, render a **Pool** `Select` above the form. (The mockup's single top selector conflates branch+pool — noted as a deliberate deviation for the multi-pool case.)

**Availability / bands:** `useAvailability(poolId, date)` → `{ window: { id, startTime, endTime, price }, remainingCapacity }[]`. Band from the window's **start hour** (branch-local; JBC is `UTC`, and admin-v2's `Branch` type has no `timezone` — §4): `< 12` Morning, `12–16` Afternoon, `≥ 17` Evening. The Slot `Select` lists that band's windows with `remainingCapacity > 0`.

**Price pre-fill — `resolveGuestRate(branch, pool, window)`** mirroring slot-engine's `resolveGuestBlanketRate` (`:956`): `window.price` (per-slot override) → branch peak (window start inside a `guestPeakWindow` **and** `guestPeakRate` set) → `guestStandardRate` → `pool.defaultRate`. The hint names which one won. Editable; re-derives when the slot changes unless the admin has typed.

**Submit flow:**
1. If guest state is *not-found* → `useCreateWalkIn().mutateAsync({ phone, name, tenantId })` → `userId`. If *found* → `userId` from the lookup.
2. `useCreateManualBooking().mutateAsync({ ...fields, userId, paymentMethod })` where `paymentMethod` = `cash` (Cash) / `razorpay_link` (link+Send) / `upi_qr` (link+QR, `+ upiTransactionId`).
3. **Success:** `useToast` success; reset the form (keep branch/pool/date). For `razorpay_link`, also show a persistent `Banner` with the `paymentLink.shortUrl` (copyable) — the mockup has no success state, so this is the minimal honest "here's the link to send".
4. **Error:** `Banner tone="error"` with `errorMessage(err)` (the house helper).

**Client validation before enabling Submit:** guest resolved (found, or not-found + non-empty name); a slot selected; price a positive number; if QR mode → `upiTransactionId` non-empty. Phone: 10 digits `^[6-9]\d{9}$` before Search is allowed.

## 3. Blast radius

| Touched | Effect |
|---|---|
| **new** `ReservationsPanel.tsx`, `reservationHelpers.ts` | additive |
| `queries.ts` | +3 hooks, +query keys — additive; existing hooks untouched |
| `GuestManagementScreen.tsx` | one `EmptyState` → `<ReservationsPanel>`; nothing else on the screen changes (Setup Rules tab, branch select, entitlement gate all as-is) |
| `lib/useAdminApi.ts` | `post` signature gains an **optional** `headers` param — additive, admin-v2-only file, matches admin-web's own shape. No existing call site changes. |
| backend / other services / other screens | **not touched** |

## 4. Decisions for the reviewer

1. **Court picker vs. POOLED auto-assignment.** `POST /bookings/negotiated` **ignores a passed `resourceId` for a POOLED pool** (`slot-engine:3303` — `FIXED_INSTANCE ? (resourceId || window.resourceId) : pooledResourceId`), so on JBC (both pools POOLED) the court a picker selects has **no server effect** — `assignPooledCourt` decides. The mockup shows an interactive picker that pre-selects a court. Options:
   - **(a)** Build the picker per the mockup, send `resourceId` (honored for a future FIXED_INSTANCE tenant, ignored for POOLED), and show a line *"Court is assigned automatically for this pool"* under the grid when the pool is POOLED — the grid then reads as "these are the guest-bookable courts" + the Option-B toggle, which is what F-225 actually governs, not per-court pinning. **Recommend (a).**
   - **(b)** Send `resourceId` silently and say nothing — risks an admin picking Court 2 and the guest getting Court 1.
   - **(c)** Flag a backend follow-up to honor `resourceId` on the POOLED negotiated path — out of Step 5 scope, its own finding.
   This is the one real design gap between the mockup and the backend; needs your call.
2. **`Branch.timezone` absent in admin-v2's type.** Band grouping + peak-window matching need the window's *branch-local* hour. JBC is `UTC` so parsing the ISO string's UTC hour is correct today. Recommend: derive from UTC for now with a `// F-229: assumes branch tz — see plan §4` comment; a real multi-tz fix is its own small follow-up (add `timezone` to the `/tenant/.../branches` response shape). Not a blocker for JBC.
3. **`razorpay_link` success surface.** The mockup has no post-submit state. Recommend a persistent `Banner` showing the `shortUrl` so the admin can copy/send it; cash/QR just toast + reset.
4. **Pool selector** when a branch has >1 pool (§2). Recommend the silent-single / `Select`-when-many approach.

## 5. Verification (browser live-fire — both tenants, per the standing rule)

Dev stack, admin-v2 at `:5175`, dev-login. **JBC owner** and **`courtowner1`** both:
- `/guests` → **Reservations** tab renders the form (no `EmptyState`).
- **Found guest:** enter an existing JBC guest's 10-digit phone → Search → green "existing guest, <name>" box → pick a slot → **Cash** → "Confirm & mark paid" → success toast; verify via `GET /resource-pools/:id/guest-ledger` (Step 4) the booking is `CONFIRMED` with a `cash_` intent.
- **New guest:** unknown phone → "no account found" → enter a name → **Payment link → Already paid via your QR** → enter a UPI txn id → "Confirm — paid via QR" → success; ledger shows `upi_` `captured`, and the walk-in `User` row exists with that name.
- **Razorpay link:** **Payment link → Send Razorpay link** → "Create booking & send link" → `Banner` shows a working `rzp.io/l/mock-…` URL; ledger shows `plink_mock_` `pending`, booking `HELD`.
- **Court toggle:** "Show all courts" off → only guest-bookable courts; on → the F-225-reserved court appears with the **RESERVED** tag in warning colour.
- **Price:** pre-fills from the branch guest rate (set one via Setup Rules → Custom Pricing Rates first), hint names the rate; editable.
- **375px viewport:** no horizontal scroll; the 2-col grids collapse acceptably. **Dark mode:** tokens carry it — spot-check the payment cards and the found/not-found boxes.
- All test bookings/intents/walk-in users deleted from `badminton_db` afterwards, `SELECT count(*)` = 0.
- `pnpm -r build` / whole-repo typecheck / lint clean. Full 5-service regression against `badminton_db_test` (no backend change — expect unchanged counts, run per rule 7).

## 6. Commit / push / sign-off

One commit `F-229 Step 5: Reservations tab UI (admin-v2)` + `docs(F-229): batch-log Batch 39`. Push, report evidence + screenshots for independent re-verification **before Step 6** (`/ledger` rebuild). No PR to `main`. **No commit until sign-off.**
