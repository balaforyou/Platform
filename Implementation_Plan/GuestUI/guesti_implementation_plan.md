# Implementation Plan — Phase 10: Guest Booking Journey & Playwright E2E Verification (Revised)

This phase builds the end-to-end guest booking journey (Path A: predefined slot self-service path) and introduces Playwright automated integration testing. It also addresses open item **F-002** (PWA install prompt dismissal expiry).

---

## User Review Required

> [!IMPORTANT]
> **No Client-Side Secrets / Webhook Simulation**:
> We will NOT perform signature calculations or store the webhook secret in the browser app. Instead, we will add a test-only simulate-capture endpoint (`POST /payments/test/simulate-capture`) in the Payment service. 
> - This endpoint will be strictly gated to non-production environments (`process.env.NODE_ENV !== 'production'`) and will fail closed (return `404 Not Found`) in production.
> - The endpoint will construct a mock Razorpay event payload, calculate the HMAC-SHA256 signature using `process.env.RAZORPAY_WEBHOOK_SECRET`, and fire an HTTP request to `/webhooks/razorpay` internally.
> - In dev/test modes, the PWA client or Playwright test script will call `POST /api/payment/payments/test/simulate-capture` to complete payment confirmation asynchronously, keeping all secrets server-side.

---

## Open Questions

None. The discovery briefs, API specs, and findings register fully cover all rules, cancellations, and flows.

---

## Proposed Changes

### 1. Slot Engine (`services/slot-engine`)

#### [MODIFY] [index.ts](file:///d:/apps/Platform/services/slot-engine/src/index.ts)

- **GET /bookings/my** (NEW):
  - JWT-authorized endpoint for standard users.
  - Slices `userId` from verified token claims.
  - Queries all matching bookings from the database, including the `window` (and its `resourcePool` relation) and `players` relations.

- **GET /bookings/:id/cancel-preview** (NEW):
  - JWT-authorized endpoint.
  - **Explicit IDOR Guard**: Loads the booking and verifies that `booking.userId === jwt.userId` OR `jwt.roles` contains `'owner'` or `'branch_manager'`. If not, returns `403 Forbidden`.
  - Calculates and returns a preview of the refund percent and amount based on the cancellation policy configured for the pool.

- **GET /bookings/:id** (MODIFY):
  - Dual-path authentication: accepts `INTERNAL_SERVICE_KEY` OR verified JWT.
  - **Explicit IDOR Guard**: If JWT is used, verifies that `booking.userId === jwt.userId` OR `jwt.roles` contains `'owner'` or `'branch_manager'`. Returns `403 Forbidden` if validation fails.

- **POST /bookings/:id/cancel** (MODIFY):
  - Dual-path authentication: accepts `INTERNAL_SERVICE_KEY` OR verified JWT.
  - **Explicit IDOR Guard**: If JWT is used, verifies that `booking.userId === jwt.userId` OR `jwt.roles` contains `'owner'` or `'branch_manager'`. Returns `403 Forbidden` if validation fails.
  - Cancels the booking and records the computed refund details in the database.

- **GET /branches/:id/resource-pools** (NEW - Already completed in Phase 9 revision):
  - Returns pools/courts list for a branch without auth.

---

### 2. Payment Service (`services/payment`)

#### [MODIFY] [index.ts](file:///d:/apps/Platform/services/payment/src/index.ts)

- **POST /payments/test/simulate-capture** (NEW):
  - Gated to non-production environment. If `process.env.NODE_ENV === 'production'`, immediately returns `404` and terminates.
  - Gated to system: accepts authorization header matching `INTERNAL_SERVICE_KEY` or a verified JWT belonging to the booking owner.
  - Body: `{ bookingId }`
  - Logic:
    1. Loads the pending `PaymentIntent` matching the `bookingId`.
    2. Builds a standard Razorpay `payment.captured` event body:
       ```json
       {
         "id": "evt_sim_<hex>",
         "event": "payment.captured",
         "payload": {
           "payment": {
             "entity": {
               "id": intent.gatewayRef,
               "amount": intent.amount
             }
           }
         }
       }
       ```
    3. Computes the HMAC-SHA256 signature using `process.env.RAZORPAY_WEBHOOK_SECRET` (defaults to `'test-webhook-secret'`).
    4. Makes an HTTP request to `http://localhost:${PORT}/webhooks/razorpay` passing the computed signature header and payload body.
    5. Returns `{ success: true }`.

---

### 3. Guest PWA (`apps/guest-member-pwa`)

#### [MODIFY] [main.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/main.tsx)
- Reorganize dashboard to support deep routing using `react-router-dom`.
- Define path routes:
  - `/` (Dashboard / Landing)
  - `/branches`: Select active branch.
  - `/branches/:branchId`: View courts at a branch, slot selector, and branch details.
  - `/branches/:branchId/about`: Branch information sheet.
  - `/branches/:branchId/book/:poolId`: Player selection, price preview, hold request.
  - `/bookings/my`: Matches / cancellation / check-in dashboard.
  - `/bookings/:bookingId/pay`: Razorpay standard checkout screen.
  - `/bookings/:bookingId/confirmation`: Booking success view.

#### [NEW] [BranchSelect.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/BranchSelect.tsx)
- Renders branch selection list with details. Fetches active branches from `/api/tenant/tenants/:tenantId/branches`.
- Saves selected branch to localStorage/state.

#### [NEW] [BranchDashboard.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/BranchDashboard.tsx)
- Renders branch information snippet, links to dedicated About page.
- Lists bookable courts/pools using `GET /api/slot-engine/branches/:branchId/resource-pools`. Clicking a court navigates to court booking calendar.

#### [NEW] [BranchAbout.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/BranchAbout.tsx)
- Displays working hours, descriptions, facilities, and photo gallery via `/api/tenant/branches/:branchId/about`.
- Falls back gracefully to tenant level if branch fields are blank.

#### [NEW] [CourtBooking.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/CourtBooking.tsx)
- Date picker (default today).
- Grid layout of availability windows from `GET /api/slot-engine/resource-pools/:poolId/availability?date=YYYY-MM-DD`.
- Displays slot times, remaining capacity, pricing mode, and base rate.
- Form to add co-players dynamically by phone number.
- Re-calculates and displays booking price in real time:
  - Flat rate: shows default rate.
  - Per-person: recompute total as players are added.
- "Reserve Court" button: creates holding booking via `POST /api/slot-engine/bookings` and redirects to `/bookings/:bookingId/pay`.

#### [NEW] [BookingPay.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/BookingPay.tsx)
- Creates payment intent `POST /api/payment/intents`.
- Integrates with Razorpay Checkout: loads SDK script from CDN, opens checkout modal with options.
- Intercepts checkout call in non-production environments to call `POST /api/payment/payments/test/simulate-capture` on the payment service instead of loading standard Razorpay widget, completing payment.

#### [NEW] [BookingHistory.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/BookingHistory.tsx)
- Renders the user's booking history by calling `GET /api/slot-engine/bookings/my`.
- Details card for each booking: status, courts, branch, players.
- "Check-In" action: displays check-in button when status is `CONFIRMED` and slot is active/upcoming. Hits `POST /bookings/:id/check-in`.
- "Cancel Booking" action: triggers cancellation confirmation.

#### [NEW] [CancelBookingModal.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/CancelBookingModal.tsx)
- Preview modal opened before cancellation.
- Fetches `/api/slot-engine/bookings/:id/cancel-preview` to display computed refund amount before cancellation takes place.
- Calls `POST /api/slot-engine/bookings/:id/cancel` upon confirmation.

---

### 4. Playwright E2E Setup

#### [NEW] [playwright.config.ts](file:///d:/apps/Platform/apps/guest-member-pwa/playwright.config.ts)
- Configures Playwright runner context for `@badminton/guest-member-pwa`.
- Targets multiple web engines. Sets base URL to `http://localhost:5173`.
- Set up `webServer` option to spin up `pnpm run dev` before tests execute.

#### [NEW] [guest-booking.spec.ts](file:///d:/apps/Platform/apps/guest-member-pwa/tests/guest-booking.spec.ts)
- Full E2E guest booking scenario:
  1. Login via mock OTP / Mock Google.
  2. Navigate branch select → click a branch.
  3. Click a court to book.
  4. Select an availability window.
  5. Add 2 co-players. Verify price recomputes.
  6. Confirm hold.
  7. Fire call directly via Playwright's API context to `/api/payment/payments/test/simulate-capture` to confirm the booking in backend.
  8. Confirm redirect to booking confirmation screen, status is `CONFIRMED`.
  9. Click "Cancel Booking" from history. Confirm cancel preview shows computed refund amount, click confirm cancellation, status is updated to `CANCELLED`.

#### [NEW] [pwa-install-dismissal.spec.ts](file:///d:/apps/Platform/apps/guest-member-pwa/tests/pwa-install-dismissal.spec.ts)
- Verification test for **F-002**:
  1. Open Dashboard, verify custom PWA installation banner slides up.
  2. Click "Later" to dismiss.
  3. Verify banner vanishes, and verify localStorage contains dismissal timestamp.
  4. Reload page, verify prompt remains hidden.
  5. Set localStorage timestamp to 8 days ago.
  6. Reload page, verify installation prompt displays again.

---

## Verification Plan

### Automated Tests
1. **Playwright test suite**:
   - Install Playwright in monorepo: `pnpm --filter @badminton/guest-member-pwa exec playwright install`
   - Run tests: `pnpm --filter @badminton/guest-member-pwa run test:e2e` (will define script in package.json)
   Ensure all tests pass.

### Manual Verification
1. **Real-device walkthrough**:
   - Fire up all services and the local Caddy reverse proxy.
   - Run the Cloudflare Tunnel command to expose the Vite server.
   - Open the trycloudflare URL on a mobile device.
   - Execute the login OTP flow.
   - Choose a branch, court, and time window.
   - Enter co-players.
   - Complete standard Razorpay test checkout (using Razorpay's native sandbox test mode options, mimicking card/UPI capture).
   - Redirect to success screen.
   - Verify booking confirmation page.
