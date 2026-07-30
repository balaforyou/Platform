# Implementation Plan — Phase 5: Notification

This plan covers the implementation of the Notification service (`services/notification`). It details database schema updates, API contract alignment, cross-service boundary verification, async database-backed queuing, exponential retry backoffs, and integration tests.

## User Review Required

> [!IMPORTANT]
> **API Contract Alignment**:
> - We will **not** build permanent dual-contract support into the Notification service.
> - The Notification service will only expose the canonical, spec-defined endpoint **`POST /notifications/send`** (taking `{ event_type, recipient, variables }`).
> - We will perform a small in-scope task in the **Payment service** to update the webhook AutoPay failure trigger (`services/payment/src/index.ts`) to call `/notifications/send` with `{ event_type: 'subscription_charge_failed', recipient: sub.userId, variables: { subscriptionId: sub.id, amount: sub.amount } }`.

> [!IMPORTANT]
> **Retry Backoff Semantics (3 Retries / 4 Total Attempts)**:
> We will enforce the exact retry backoff rules:
> - **Attempt 1 (Initial try)**: Executed immediately. On failure, schedule retry in **1 minute**.
> - **Attempt 2 (Retry 1)**: Executed after 1 min. On failure, schedule retry in **5 minutes**.
> - **Attempt 3 (Retry 2)**: Executed after 5 min. On failure, schedule retry in **15 minutes**.
> - **Attempt 4 (Retry 3)**: Executed after 15 min. On failure, transition status terminal to **`dead_letter`** and record errors.
> - Total attempts = 4 (Initial try + 3 retries). This lines up with the defined backoff intervals (1/5/15 min).

> [!IMPORTANT]
> **Cross-Service Ownership Boundaries**:
> - The Notification service will **not** query the `User` table directly.
> - To resolve recipient contact information (phone, email) for a given `userId` UUID, the Notification service will make a secure HTTP request to the Identity service's **`GET /users/:id`** endpoint, authorizing using `INTERNAL_SERVICE_KEY`.
> - The `DeviceToken` table is owned by the Notification service, so we will query it directly via Prisma.

---

## Proposed Changes

### Database Layer (`packages/database`)

We will update the Prisma schema to add the Notification models.

#### [MODIFY] [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma)
Add Notification models to the end of the schema file:
```prisma
model NotificationTemplate {
  id           String   @id @default(uuid())
  tenantId     String   @default("platform")
  channel      String   // sms | push | email
  eventType    String
  templateBody String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([tenantId, channel, eventType])
}

model NotificationRequest {
  id           String    @id @default(uuid())
  tenantId     String
  recipient    String    // userId, or raw mobile/email
  channel      String    // sms | push | email
  eventType    String
  variables    Json
  status       String    // queued | sent | failed | dead_letter
  attempts     Int       @default(0)
  retryAfter   DateTime?
  providerRef  String?
  errorMessage String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model DeviceToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

### Payment Service (`services/payment`)

#### [MODIFY] [services/payment/src/index.ts](file:///d:/apps/Platform/services/payment/src/index.ts)
- Modify the `subscription.charge_failed` handler to call `POST /notifications/send` with the canonical parameter structure:
```typescript
      // 2. Dispatch call to Notification service (using INTERNAL_SERVICE_KEY)
      const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
      const notificationUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
      try {
        await fetch(`${notificationUrl}/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalKey}`,
          },
          body: JSON.stringify({
            event_type: 'subscription_charge_failed',
            recipient: sub.userId,
            variables: {
              subscriptionId: sub.id,
              amount: sub.amount,
            },
          }),
        });
      } catch (e) {
        server.log.warn('Could not trigger notification for AutoPay failure: ' + String(e));
      }
```

---

### Notification Service (`services/notification`)

#### [NEW] [services/notification/src/index.ts](file:///d:/apps/Platform/services/notification/src/index.ts)
Implement Notification service endpoints and background queue worker:

- **`POST /notifications/send`**:
  - Accepts: `{ event_type, recipient, variables, tenantId }` (tenantId defaults to `"platform"`).
  - **Channel Policy Routing**:
    - If `recipient` is a UUID: Queries Identity service `GET /users/:recipient` (with internal key) to resolve phone/email. Queries local `DeviceToken` table to retrieve registered Web Push tokens.
    - If `recipient` contains `@`: Resolves as `email`.
    - If `recipient` starts with `+` or numbers: Resolves as `phone`.
    - Mapped routing policies:
      - `booking_confirmed` / `refund_processed` / `tournament_fixture_scheduled`: Push if device tokens exist, else SMS.
      - `slot_release_reminder`: Both SMS and Push.
      - `group_invite`: SMS only.
      - `payment_receipt`: Email if email exists, else SMS.
      - `subscription_charge_failed`: Both Push and SMS.
    - Creates `NotificationRequest` records with `status: 'queued'`.
    - Schedules immediate async background dispatch (non-blocking, returns `202 Accepted` to calling service).
- **`POST /notifications/templates`**: Registers or overrides a template for a tenant.
- **`POST /devices/register`**: Registers a FCM device token for a user.
- **`GET /notifications/:userId/history`**: Lists the recent notification requests for debugging.
- **Background Queue Worker**:
  - Implements polling queue runner checking for `NotificationRequest` with `status: 'queued'` and `retryAfter <= now` (or `retryAfter = null`).
  - Executes mock dispatch. On success: sets `status = 'sent'`, sets `providerRef`.
  - On failure: increments `attempts`. If `attempts < 4`, calculates next retry backoff (1m, 5m, 15m) and sets `retryAfter`. If `attempts >= 4`, sets `status = 'dead_letter'`.

---

## Verification Plan

### Automated Integration Tests
We will write a dedicated test suite at `services/notification/src/notification.test.ts`. It will run the following verification cases:

1. **Channel Policy Routing**:
   - Register a user with an email and phone, but no device tokens. Send `booking_confirmed`. Assert it falls back to SMS.
   - Register a user with device tokens. Send `booking_confirmed`. Assert it routes to Push.
   - Send `slot_release_reminder`. Assert both SMS and Push requests are queued concurrently.

2. **Retry Backoff & Dead-Letter Log**:
   - Queue a request with the simulated failure trigger (`"fail_me": true`).
   - Run the queue worker execution loop.
   - Assert the attempt count increments, `retryAfter` is set for future time, and status remains `queued`.
   - Force tick/simulate passing time. Run worker until attempts reach 4.
   - Assert status transitions to `dead_letter` and error message is saved.

3. **E2E Payment Service Wiring check**:
   - Run the Notification service alongside the full Payment integration tests (`services/payment/src/payment.test.ts`).
   - Confirm that the `TypeError: fetch failed` warning on Payment's `subscription.charge_failed` webhook is gone.
   - Retrieve the `NotificationRequest` created during the payment test run, confirming it processed correctly.

### Manual Verification
- Deploy PostgreSQL, run migrations, and run all test suites (`test:concurrency`, `test:auth`, `test:tenant`, `test:payment` & new `test:notification`).
