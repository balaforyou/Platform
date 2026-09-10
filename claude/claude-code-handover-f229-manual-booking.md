# Technical Lead Handover — F-229 (admin-assisted-manual-booking-cash-payment)

**From:** Chief Architect thread
**Date:** 10 Sep 2026
**Supersedes:** F-204 (`Walk-in booking + manual payment recording`, Open, never implemented)
**Discovery record:** `claude/discovery-unified-login-manual-booking.md` (Business Discovery Checklist, closed before assignment per rule 10)
**Depends on:** F-228 (soft — only the shared search-or-create identity component; F-229 does not block on F-228 shipping first and can proceed independently using the narrower walk-in-only identity creation described below)

This is a real, tightly scoped hand-off — every design call below was closed in conversation with Bala, not left open for Technical Lead to guess. Where something reuses existing code, the exact file/route is named so nothing gets reinvented. Standard discipline applies: plan-mode doc first, explicit sign-off before implementation, real evidence (live-fire, not just a code read) before close-out, rebuild before testing.

---

## 1. What this is, in one line

An admin (owner or branch_manager) can book a court for a guest who is physically present or on the phone — no self-service app use required — and either mark the booking paid in cash on the spot, or send a payment link for the guest to pay before arriving. Built fresh in **admin-v2** (not the old admin-web), in the Guest Management screen's Reservations tab, which currently ships as an honest `EmptyState` naming F-204.

## 2. Real precedent already proven — reuse, don't reinvent

- **Booking creation with an admin-set price and an explicit court:** `POST /bookings/negotiated` (`services/slot-engine/src/index.ts:3140`) already exists, already real, already tested. Internal-key-gated, takes `tenantId, branchId, resourcePoolId, resourceId, windowId, userId, negotiatedPrice, coPlayers`, creates a `HELD` booking, honors an explicit `resourceId` override (falls back to `assignPooledCourt` auto-assignment only if omitted), respects real capacity/availability locking. **No slot-engine changes needed** — this route already does everything F-229's booking-creation step needs.
- **The atomic "admin JWT in, internal-key call out, booking + payment-link out" wrapper pattern:** `POST /payment-links/negotiated` (`services/payment/src/index.ts:957`) already does this for the payment-link path — `requirePaymentLinkAdmin` auth (owner or scoped branch_manager), calls slot-engine's negotiated-booking route internally with the service key, then creates a Razorpay Payment Link. **Reuse this route as-is** for F-229's "send a link" payment-method choice — no changes needed.
- **Admin-authenticated audited write with derived (not client-supplied) actor identity:** `POST /refunds/override` (`services/payment/src/index.ts:1061`) is the precedent for the new cash-confirm route — `adminId` always from `request.jwtVerify()`, never the body, full audit trail.
- **Guest pricing:** `guestStandardRate`/`guestPeakRate`/`guestPeakWindows` (F-224, `Branch` model) and `resolveGuestBlanketRate`'s peak-window matching (`services/slot-engine/src/index.ts`) are real and live — use them to pre-fill the price field in the new booking form, not a blank entry like the old Negotiated page.
- **Guest-only booking-list filter:** `Booking.isMemberBooking` (`Boolean @default(false)`) already exists on the schema — the new Transactions view filters on this directly, no new field.
- **Tabbed single-nav-destination pattern:** `GuestManagementScreen.tsx`'s `Tabs` (Reservations | Setup Rules) is the exact precedent for `/ledger`'s new tab structure — reuse the same generic `Tabs` component from Phase 0.2, not a new tab mechanism.
- **Phone-keyed find-or-create identity:** `/auth/otp/verify`'s `prisma.user.findUnique({ where: { phone_tenantId: { phone, tenantId } } })` pattern is the precedent for the new walk-in user-creation route — must find-or-create, never blind-insert, so a walk-in with a phone number that already has an account (guest or otherwise) resolves to that same row.

## 3. New work — what's actually greenfield

**3a. Walk-in identity creation (no OTP).** New admin-authenticated route in `identity-auth` (exact path TL's call, e.g. `POST /users/walk-in`), owner/scoped-branch_manager JWT-gated (same role check as `requirePaymentLinkAdmin`), body `{ phone, name, tenantId }`. Finds existing user by `phone_tenantId` first; if none, creates a `userType: GUEST` row directly (`isPhoneVerified: false` — this account has not proven phone ownership, and never needs to for admin-created bookings, since the admin is the trust boundary). No OTP exchange. `name` needs a new nullable column on `User` if one doesn't already exist — confirm before assuming; not present in the schema section reviewed for this handover.

**3b. Cash-confirm route.** New route in `payment` (e.g. `POST /bookings/manual` or extend the negotiated-booking wrapper with a `paymentMethod: 'cash' | 'link'` branch — TL's call which is cleaner given the two paths share most of their body). Owner/scoped-branch_manager JWT-gated, same shape as `payment-links/negotiated`'s auth. On `cash`: calls slot-engine's `/bookings/negotiated` internally (same as the link path), then immediately transitions the resulting booking `HELD → CONFIRMED` with a payment record marked cash/manual, admin identity captured from the JWT, timestamp recorded. Needs a real `Payment`/similar row created for the cash amount so it shows up in the Transactions view and reconciles — check `Payment` model shape before designing this row structure, don't invent a parallel record type if one already fits.

**3c. Reservations tab UI (admin-v2).** Replace the current `EmptyState` in `GuestManagementScreen.tsx`'s Reservations tab with: branch/pool/date/window picker (reuse existing `useAvailability`-style hooks, same pattern as admin-web's `NegotiatedPage`/`OccupancyPage`), a search-or-create guest lookup (phone or email — reuse to the extent §2's identity precedent allows; new UI, not a new backend pattern), a court picker/override, a price field pre-filled from `guestStandardRate`/`guestPeakRate` with an editable override, and a payment-method choice (Cash / Link) that calls the appropriate route from 3a/3b.

**3d. `/ledger` tabbed rebuild.** Replace the current `StubScreen` (title "Subscription Ledger," mis-scoped copy) with a `Tabs`-based screen: one real **Guest** tab (table of `isMemberBooking: false` bookings — date, guest name/phone, amount, payment method, status; needs a new read endpoint, likely in `payment` or `slot-engine` wherever bookings can already be listed with payment status joined — check for an existing listing route before adding one), and two **greyed, clickable** placeholder tabs — **Members** and **Students** — each showing a short, honest one-line teaser of what's coming (e.g., "Member Ledger — launching with the Membership module") rather than being disabled outright. This is a deliberate demo-value decision (Bala's call, 10 Sep 2026): shows the client the product's broader roadmap during a live demo. Real staleness risk flagged and accepted, not overlooked — if Members/Students don't ship on a visible timeline, these placeholders should be revisited rather than left indefinitely, same lesson as the §3.4 footer-copy incident.

## 4. Explicitly out of scope for F-229

- Real Google/Gmail login work — that's F-228, not this.
- Member dues/subscription billing — F-207/F-209, not started, not needed here.
- The "Students module" — mentioned by Bala as a future third ledger segment, not otherwise scoped anywhere in this project yet. Do not infer requirements from the one-line mention; it needs its own discovery pass when it becomes real.
- Automatic membership expiry, "change my mobile number" flow — both explicitly deferred post-MVP per F-228's own discovery doc.

## 5. Real design questions already closed — do not re-litigate

1. Walk-in guest needs no OTP (admin is the trust boundary).
2. Both payment methods ship together (cash-confirm and payment-link), not cash-only for v1.
3. Price pre-fills from F-224's guest rates, editable.
4. Court selection reuses the real availability grid with an explicit `resourceId` override.
5. `/ledger` is the home for the new Transactions view, tabbed, not a separate new nav destination.
6. Only the Guest tab is real; Members/Students are greyed, clickable, honest placeholders — a deliberate demo-value decision, not a default.

## 6. Sign-off requirements

Per standing rule 1/6: plan-mode doc back to Bala (via this thread) before implementation, explicit "stop after the plan" checkpoint, real live-fire evidence (not just a passing regression suite) before close-out — this project has caught real bugs specifically because live-fire was insisted on (F-126/F-127, the gradient-blindspot catch). Given this touches three services (identity-auth, payment, slot-engine indirectly via the existing negotiated route) plus two frontend surfaces (Reservations tab, `/ledger`), expect the plan-mode doc to be a real one, not a formality.
