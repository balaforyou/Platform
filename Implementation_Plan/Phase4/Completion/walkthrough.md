# Walkthrough — Phase 4: Payment Service

We have completed the implementation and validation of the Payment service (`services/payment`) and successfully closed the pricing security trust boundary in the Slot Engine.

## Changes Made

### 1. Database Schema (`packages/database`)
- Mapped a required `basePrice` Decimal field to `ResourcePool` to house server-side pricing.
- Added `PaymentIntent` and `Refund` tables for guest billing history and transactional logs.
- Added `Subscription` table mapping `userId`, `tenantId`, and `mandateId` for AutoPay bookkeeping.
- Added `WebhookEvent` with a unique constraint on `gatewayEventId` for atomic idempotency gates.
- Generated and successfully executed the Prisma migration.

### 2. Slot Engine Reopening & Security Fixes (`services/slot-engine`)
- **Pricing Enforcement**: Changed `POST /bookings` to retrieve `pool.basePrice` dynamically during resource hold. Any client-provided `price` body parameter is completely ignored.
- **Service Gating**: Secured `POST /bookings/:id/confirm` to block unauthenticated calls, enforcing `Authorization: Bearer <INTERNAL_SERVICE_KEY>` checks.
- **Cross-Service Lookup**: Exposed a new `GET /bookings/:id` endpoint (secured via `INTERNAL_SERVICE_KEY`) to let other services safely query booking attributes.

### 3. Payment Service Implementation (`services/payment`)
- **`POST /payments/intents`**: Created guest payment checkouts. Checks for existing intents to prevent double-charging (returns existing pending intent or rejects captured checkouts).
- **`POST /subscriptions`**: Registers membership mandates purely for database bookkeeping (Razorpay mandate setup remains client-side).
- **`POST /webhooks/razorpay`**: Validates webhook signatures using HMAC-SHA256. Uses the **atomic insert-first-catch-constraint-violation** pattern on `WebhookEvent` to safely discard replayed webhooks. On payment success, dispatches a secure request to confirm the booking in the Slot Engine.
- **`POST /webhooks/razorpay/autopay`**: Receives recurring AutoPay webhooks. On successful debit (`subscription.charged`), transitions status to `active` (auto-recovery). On failed debit (`subscription.charge_failed`), flips status to `suspended` and dispatches alerts to the Notification service.
- **`POST /refunds`**: Securely refunds cancelled bookings. Reads `refundAmount` directly from the Slot Engine record, executing the gateway refund against the exact calculated rupee value.

---

## Verification Results

We implemented and ran the multi-service integration test suite at [payment.test.ts](file:///d:/apps/Platform/services/payment/src/payment.test.ts) covering all requirements.

### Integration Test Run Output

```text
Starting local servers (Slot Engine, Identity & Auth, Payment)...
Slot Engine service running at http://localhost:3001
Payment service running at http://localhost:3004
Identity Auth service running at http://localhost:3002
Local servers are ready. Executing integration tests...
Starting Phase 4 Payment Integration Tests...
Database cleaned successfully.

--- Test 1: Server-Side Pricing & Spoofing Defense ---
Server successfully resolved ResourcePool.basePrice (125.00) and ignored client-supplied price.
Test 1 passed successfully!

--- Test 2: Webhook Signature Validation ---
Webhook signature validation verified (invalid signature rejected, valid accepted).
Test 2 passed successfully!

--- Test 3: Webhook Idempotency ---
Webhook idempotency successfully intercepted duplicate event (no double-processing).
Test 3 passed successfully!

--- Test 4: E2E Webhook Booking Confirmation ---
E2E payment flow successful. Webhook captured payment and transitioned Slot Engine booking HELD -> CONFIRMED.
Test 4 passed successfully!

--- Test 5: Member AutoPay Billing & Recovery ---
Subscription suspended successfully on debit failure.
Subscription recovered back to active successfully on successful retry webhook.
Test 5 passed successfully!

--- Test 6: PaymentIntent Duplicate Prevention ---
Duplicate prevention successfully returned existing pending intent.
Test 6 passed successfully!

--- Test 7: Direct Refund Execution ---
Booking cancelled in Slot Engine. Computed refundAmount: 125
Refund executed successfully using the pre-calculated refundAmount from Slot Engine.
Test 7 passed successfully!

All Phase 4 Payment Tests Passed Successfully!
Shutting down local servers...
```

All 7 integration test scenarios, as well as the monorepo linter and TypeScript typechecks, have passed with **0 errors and 0 warnings**.
