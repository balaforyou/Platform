# Phase 10 — Guest Booking Journey & Playwright E2E Verification Walkthrough

This walkthrough details the implementation, security gating, and comprehensive E2E validation of the guest court booking journey and PWA install prompt dismissal expiry logic.

---

## 1. Summary of Changes

### Backend Enhancements

#### A. Slot Engine (`services/slot-engine/src/index.ts`)
- Added `GET /bookings/my` to retrieve bookings belonging to the currently authenticated JWT user.
- Added `GET /bookings/:id/cancel-preview` to calculate the dynamic, tiered refund preview amount based on how many hours are left before the slot starts.
- Enforced strict IDOR (Insecure Direct Object Reference) ownership checks on `GET /bookings/:id`, `POST /bookings/:id/cancel`, and `GET /bookings/:id/cancel-preview` to ensure only the booking owner, tenant owner, or branch manager can access or modify bookings.

#### B. Payment Service Webhook Capture Simulation (`services/payment/src/index.ts`)
- Added `POST /payments/test/simulate-capture` which is gated strictly to non-production environments (`process.env.NODE_ENV !== 'production'`).
- The simulator securely computes the HMAC-SHA256 signature using the server-side `RAZORPAY_WEBHOOK_SECRET` and calls the webhook handler internally. Client-side code never exposes secrets or signs payloads.

---

### Guest Member PWA Screens (`apps/guest-member-pwa`)

- Refactored `src/main.tsx` routing structure with `react-router-dom` and a globally wrapped `Layout` incorporating the PWA installation banner.
- **BranchSelect**: Lists all active tenant branches.
- **BranchDashboard**: Displays branch welcome info and lists active court categories (resource pools).
- **BranchAbout**: Showcases venue vision, operating schedule, hotlinked photo gallery, and facility amenities.
- **CourtBooking**: Interactive court reservation screen with date selection, availability slot grid, co-player input lists, and live group pricing recomputation.
- **BookingPay**: Renders checkout summary with a developer-only "Pay with Mock Razorpay" trigger to hit our backend simulation endpoint.
- **BookingHistory**: Tabbed view of matches with visual statuses, "I'm Here" self check-in triggers, and match cancellation action buttons.
- **CancelBookingModal**: Overlaid panel displaying the live, dynamic tiered refund preview (e.g. ₹0 refund for short-notice cancellation) prior to cancellation.
- **BookingConfirmation**: Success page that polls backend booking status until transitioning from `HELD` to `CONFIRMED`.

---

## 2. Automated Test Coverage (Playwright E2E)

We established a comprehensive automated E2E test suite running on Chromium.

### Tests Implemented

1. **Guest Booking Journey (`tests/guest-booking.spec.ts`)**:
   - Resets database state by running a local seeding script.
   - Logs in using the development mock OTP code `123456`.
   - Selects branch `Coimbatore Main Arena`.
   - Browses dashboard and verifies facility/about page navigation.
   - Selects an upcoming court slot and adds 2 players (verifies price re-computes to ₹450).
   - Holds the slot, redirects to payment, and clicks the mock payment simulation trigger.
   - Polls and verifies status changes to `Confirmed`.
   - Executes self check-in ("I'm Here") and asserts status updates to `Checked In`.
   - Simulates short-notice cancellation (1.9 hours before start) and verifies the tiered policy calculates a ₹0 refund preview before successfully cancelling.

2. **PWA Install Banner Dismissal (`tests/pwa-install-dismissal.spec.ts`)**:
   - Logs in and removes PWA dismissal state from localStorage.
   - Simulates a browser `beforeinstallprompt` event.
   - Asserts the custom, white-labeled banner slides up 3 seconds after loading.
   - Clicks "Later" to dismiss and checks that a dismissal timestamp is stored in localStorage.
   - Reloads page and checks that the banner remains suppressed.
   - Mutates localStorage timestamp to simulate 8 days ago (expiry) and verifies reload prompts the user again.

### Validation & Assertion Results

The Playwright E2E test runs with verbose step-level console logging. These outputs prove that the exact database seeding, dynamic pricing re-computation, payment intent status, self check-in triggers, and tiered refund engines are verified under assertion checkmarks:

```bash
$ playwright test
Running 2 tests using 1 worker

[1/2] [chromium] › tests\guest-booking.spec.ts:12:3 › Guest Booking Flow E2E › should execute complete guest booking journey successfully
Running test database seed...
[ASSERT SUCCESS] Verified group size computed price is: ₹450
[ASSERT SUCCESS] Verified checkout payment page amount is: ₹450
[STEP] Triggered server-side Razorpay webhook capture simulation...
[ASSERT SUCCESS] Verified booking status transitioned from HELD to CONFIRMED successfully.
[ASSERT SUCCESS] Verified self check-in triggers status update to Checked In.
[ASSERT SUCCESS] Verified tiered refund preview for 1.9 hours cutoff computes to: ₹0
[ASSERT SUCCESS] Verified cancellation updates booking status to Cancelled.
  ✓  1 [chromium] › tests\guest-booking.spec.ts:12:3 › Guest Booking Flow E2E › should execute complete guest booking journey successfully (16.9s)

[2/2] [chromium] › tests\pwa-install-dismissal.spec.ts:5:3 › PWA Install Prompt Dismissal Expiry (F-002) › should verify 7-day dismissal window logic for custom Android install prompt
  ✓  2 [chromium] › tests\pwa-install-dismissal.spec.ts:5:3 › PWA Install Prompt Dismissal Expiry (F-002) › should verify 7-day dismissal window logic for custom Android install prompt (8.2s)

  2 passed (25.8s)
```

---

## 3. Real-Device Manual UPI / payment Verification Walkthrough

To perform manual payment checks on a physical mobile device, follow this walkthrough:

1. **Configure Cloudflare Tunnel (Origin)**:
   - Expose the Caddy reverse proxy port (8080) by running:
     ```bash
     cloudflared tunnel --url http://localhost:8080
     ```
   - Copy the generated `.trycloudflare.com` HTTPS URL.

2. **Access PWA on Mobile Device**:
   - Open a mobile browser (Chrome on Android, Safari on iOS) and navigate to the Cloudflare URL.
   - Login using the dev OTP (`123456`).

3. **Verify App Installability**:
   - Observe that the custom install banner slides up after 3 seconds.
   - For Android, click "Install App" and confirm the system PWA prompt.
   - For iOS, verify that Safari-specific "Add to Home Screen" instructions are displayed.

4. **Verify Mobile UPI Intent Checkout**:
   - Proceed through the booking funnel on mobile.
   - On the checkout page (`/bookings/:id/pay`), click "Pay via Razorpay".
   - Select the UPI payment method on the Razorpay overlay.
   - Verify that standard mobile UPI intent choices (GPay, PhonePe, Paytm) launch the native payment application securely.
