# Business Discovery Checklist — Unified Guest/Member Identity & Admin-Assisted Manual Booking

**Date:** 10 Sep 2026
**Raised by:** Bala, in conversation with Chief thread, across two connected brainstorms (admin manual/walk-in booking, then unified Gmail-first login)
**Status:** Pre-finding-ID discovery — not yet scoped into implementation

---

## 1. The ask, in the business's own words

Started as: "Manual booking is where the guest enters the court or manually calls" — can an admin book a slot for someone who's physically present or on the phone, without them touching the app?

That pulled in a second, larger idea mid-discussion: "My idea was Gmail login for both member/guest... Admin will add the member through member management getting his Email, Name and Mobile. For guest, the user logs in via Gmail, if he is not a member he gets the guest booking page... only when he decides to book he will have to enter mobile and verify OTP." Refined over several rounds to: uniform login flow for every PWA visitor (Gmail first, always), admin-provisioned members with a manual on/off toggle (no automatic expiry for MVP), and admin can search an existing guest and convert them to member rather than only creating fresh records.

## 2. Evidence anchor

Real, observed operational need — not speculative. JBC is solo-owner-operated; guests routinely show up in person or call ahead, and today there is no way for the admin to record that booking without either using an incomplete workaround (see §3) or turning them away from the system entirely (recorded off-book). The login redesign is anchored in a genuine UX judgment about reducing friction for a walk-in/phone-first customer base, not a hypothetical — but it's a design preference layered on top of the real anchored need (manual booking), and should be labeled as such: **manual booking itself is a requirement; the specific Gmail-first login shape is a reasoned preference.**

## 3. Does it already exist? — checked, not assumed

Checked directly against `main` (raw GitHub fetch of `services/slot-engine`, `services/payment`, `services/identity-auth`, `apps/admin-web`, `apps/admin-v2`, `apps/guest-member-pwa`, and `packages/database/prisma/schema.prisma`), not inferred from the register.

- **Admin-initiated booking with a chosen price:** exists and works, but only in the *old* admin-web app. `POST /payment/payment-links/negotiated` (owner/branch_manager JWT-gated) → internally calls slot-engine's `POST /bookings/negotiated` (creates a `HELD` booking, respects real capacity/availability, accepts an explicit `resourceId` override) → generates a Razorpay Payment Link. **Exists partially**: covers price-setting and slot selection, but requires the guest to already have an account (phone lookup only, no inline creation) and requires online payment — no cash path.
- **Cash / offline payment recording:** genuinely does not exist. Every route in the payment service was enumerated directly (`/payments/intents`, `/create-order`, `/verify-payment`, `/subscriptions`, both webhook handlers, `/refunds`, `/refunds/override`, `/payment-links`, `/payment-links/negotiated`, test-only `/payments/test/simulate-capture`) — none marks a booking `CONFIRMED` without a real Razorpay capture.
- **Gmail login for guest/member recognition:** exists partially, narrower than the new idea. `POST /auth/google/verify` and a "Google OAuth Simulation" UI already exist in `guest-member-pwa`, but today it explicitly rejects `GUEST`-typed accounts with 403 ("restricted to members... to control SMS costs") and is a dev-mock, not real Google token verification. The *shape* — check email/Google ID against `User`, decide a landing — already exists; the *scope* (open to guests, real verification) does not.
- **Admin-provisioned member with a manual toggle:** the toggle itself already exists and works — `User.userType` (GUEST/MEMBER/STAFF) plus `PATCH /users/:id/type` (internal-key-gated promotion route), both real and tested. The *creation form* (name/email/mobile, admin-facing) and the *search-existing-and-convert* flow do not exist anywhere.
- **The negotiated flow's `UserLookup` component** (admin-web) is a real, working precedent for "search an existing user by phone," but is phone-only and find-only — no email search, no create.
- **Port to admin-v2:** the Reservations tab in `GuestManagementScreen.tsx` is a deliberate, honest `EmptyState` today, naming F-204 in its own source comment as the tracked placeholder.

## 4. Reusability — is there a proven pattern here already?

Strong reuse story, most of the hard identity work is already built:

- `User.phone`/`email`/`googleId` are each independently unique-per-tenant and all nullable — a phone-less, Gmail-only user, or an email-less, phone-only walk-in user, are both already representable without a schema change.
- `phone_tenantId` find-or-create logic in `/auth/otp/verify` already guarantees no duplicate identity if the same person later shows up through a different channel (walk-in today, self-signup tomorrow) — this is the exact mechanism that makes converging multiple entry points onto one `User` table safe.
- `PATCH /users/:id/type` (promotion) and `POST /users/resolve-invite` + `PendingInvite` (admin pre-registration by phone) are both real, tested, internal-key-gated precedents for "admin acts on an identity before the person has logged in themselves" — the new member-provisioning form is an extension of this pattern, not a new one, though it needs to add email as a second match key alongside the existing phone-keyed `PendingInvite`.
- `POST /refunds/override`'s audit shape (JWT-derived `adminId`, never client-supplied, full trail) is the right precedent for the new cash-payment-recording route — same trust boundary (admin-authenticated, high-trust action, must be auditable).
- The `UserLookup` component (admin-web) and the new "search or create" component this work needs are the same shape — one real component, reusable across Member Management, walk-in booking, and (eventually) a replacement for the Negotiated page's narrower lookup, rather than three separate builds.

## 5. Genericity — is this vertical-specific or a reusable capability?

Vertical-specific in its business shape (court booking, badminton-branch context), but the underlying mechanism — "any identity can arrive via multiple channels (self-service digital signup, admin-assisted in-person/phone) and must converge on one canonical record, with different proof-of-identity requirements per channel" — is a generic identity pattern, not unique to Slotflow. Not claiming it as a reusable package (no second concrete use case in hand today, so per the template's own bar this stays product-specific, not promoted to shared infrastructure) — noted only so a future generic identity/CRM extraction isn't a surprise if this product line grows.

## 6. Dependencies and blockers

- **Hard blocker on the login-unification piece:** none technical — this is a scope/policy change to an existing route (loosening the GUEST 403), not blocked on other findings.
- **Hard blocker on real Google verification:** `/auth/google/verify` is currently a dev mock (string-prefix matching, not real JWKS token verification). Shipping this to production guests requires real Google token verification to be built first — admin-v2 already has this pattern (`/auth/admin/google/verify`, real JWKS) to reuse, but it needs to be ported/adapted for the guest/member context. This is real, non-trivial work, not a toggle.
- **Soft ordering preference:** the cash-payment-recording route should land before or alongside the walk-in UI, since the UI is useless without it — but there's no reason the identity/login redesign can't ship first and independently.
- **No dependency on F-207/F-209** as originally scoped (term-based subscription billing) — this conversation explicitly narrowed member "active" status to a manual admin toggle with automatic expiry deferred post-MVP, which means this work does NOT need F-207's Contract unification to proceed. Worth flagging to Chief/register: this may reduce F-207/F-209's own urgency, a real downstream effect of this discovery, not something to quietly absorb into this scope.
- **No dependency on F-088** (timestamp investigation) — none of this touches slot-timestamp data.

## 7. Data reality

- **Schema supports it:** yes, confirmed directly — `User.phone`/`email`/`googleId` nullable and independently unique; `userType` already the right field for the membership toggle; `Booking.resourceId` already accepts an explicit override.
- **Something writes it today:** partially. Phone-based identity is written today (OTP flow). Email/Google identity is written today only for members/staff attempting Google (and blocked for guests). Nothing today writes an admin-provisioned member record or a cash-payment record — both are new write paths.
- **Enough real history to be useful:** N/A for a net-new capability — this is forward-looking, not analytics-dependent.

## 8. Real design questions — settled during discovery, recorded here so they aren't re-litigated

1. **Does the walk-in guest need OTP?** No — a new admin-authenticated route creates the lightweight `GUEST` user directly from phone + name, skipping the OTP code exchange (the admin is the trust boundary, not the guest's device).
2. **Payment: cash-confirm, link, or both?** Both — a new "Mark Paid — Cash" action (`HELD → CONFIRMED` directly, audited like `/refunds/override`) for the in-person case, alongside the existing payment-link path for the phone-call-ahead case.
3. **Pricing on manual bookings:** pre-fill from `guestStandardRate`/`guestPeakRate` (F-224), editable override — not blank entry every time like the current negotiated flow.
4. **Court/slot selection:** reuse the real availability grid (respects F-225's authorized-guest-court filter), with the already-real `resourceId` override for pinning an exact court.
5. **Is Gmail open to guests, or members-only?** Open to everyone — the existing 403-for-guests rule is deliberately loosened; the *outcome* (member vs. guest landing) differs, not who's allowed to attempt login.
6. **What does "member active" mean?** A simple admin-controlled toggle on `userType` — not a computed entitlement, not tied to a subscription/contract. Automatic expiry is explicitly out of scope for MVP, a named post-MVP follow-up.
7. **Does admin-search-and-convert need to find existing guests, or only create new members?** Both — search by phone/email first, convert if found; create fresh if not, to avoid duplicate records for someone who already has a guest history.
8. **OTP frequency for returning members:** once only — first booking after becoming phone-verified, not re-verified on every subsequent booking. Guests still verify every time (no persistent trust signal for them yet).
9. **Mobile number changes:** explicitly deferred — "change my number" with new-number OTP verification is a named post-MVP follow-up, not MVP scope.

## 9. Scope verdict

This is **new data modelling plus new write paths**, not a UI-only addition — real new backend surface on three fronts (a cash-payment-recording route in the payment service, an admin-authenticated no-OTP user-creation route in identity-auth, and a loosened + genuinely-verified Google auth path for guests), each touching a different service. Given rule 9 (scope discipline), this should **not** become one finding — recommend splitting into at least two, sequenced:

- **Finding A — Unified Gmail-first login & admin member management.** Loosen the guest-Google restriction, build real (non-mock) Google verification for guest-member-pwa, the guest/member landing split, the admin member-provisioning form + toggle, and the shared search-or-create component. This is the dependency both walk-in booking and any future member-facing work sit on top of.
- **Finding B — Admin-assisted manual booking (walk-in + phone-call).** The cash-payment-recording route, the walk-in booking UI in admin-v2's Reservations tab, and porting/replacing the old admin-web Negotiated page. Depends on Finding A's search-or-create component for identity lookup, but the cash-payment piece specifically can be scoped independently if Chief wants to sequence it first.

---

## 10. Chief finding-ID assignment — 10 Sep 2026

**F-228 assigned — `unified-gmail-login-guest-member-identity`** (Finding A above). Next available ID after F-227 (this session's booking-rule gap). Real new backend surface across identity-auth (loosen the `GOOGLE_LOGIN_ONLY_FOR_MEMBERS` rejection, real JWKS Google verification replacing the current dev-mock, a new admin-authenticated no-OTP guest-creation route) and guest-member-pwa (the landing-split routing, the admin member-provisioning + toggle UI, the shared search-or-create component). No dependency on F-207/F-209.

**F-229 assigned — `admin-assisted-manual-booking-cash-payment`** (Finding B above). **Supersedes F-204** (`Walk-in booking + manual payment recording`, Open, never implemented) — same real gap F-204 always named, now fully scoped through this discovery pass rather than left as a one-line placeholder. F-204 should be marked superseded, not left standing as a second, conflicting entry once F-229 is written up. Depends on F-228 for the shared search-or-create identity component; the cash-payment-recording route itself has no hard dependency on F-228 and could sequence first if useful.

**Relay instruction, same mechanism as F-221–F-227:** whoever has repo write access — write new `### unified-gmail-login-guest-member-identity` and `### admin-assisted-manual-booking-cash-payment` entries into `docs/plans/pending-findings.md` with `Confirmed-ID: F-228`/`Confirmed-ID: F-229` and `Confirmed: 10 Sep 2026` already applied (these are Chief-originated, not pre-existing draft entries awaiting confirmation — same shape as F-224/F-225's original assignment). Mark F-204's own entry as superseded by F-229, pointing to this discovery doc.
