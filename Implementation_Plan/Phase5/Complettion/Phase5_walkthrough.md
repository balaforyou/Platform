# Walkthrough — Phase 5: Notification Service (Updated)

We have completed the implementation and validation of the Notification service (`services/notification`). The test suite has been updated to seed the test user in the Identity database, verifying that **both SMS and Push channels** are correctly dispatched for dual-channel events.

## Changes Made

### 1. Database Schema & Test User Seeding
- Added `NotificationTemplate`, `NotificationRequest`, and `DeviceToken` models to the schema.
- Added test user seeding (`db.user.upsert`) in `services/notification/src/notification.test.ts` to ensure Identity user lookup returns both a phone number (`+919999999999`) and an email, enabling complete multi-channel dispatch resolution.

### 2. Sandbox Service Startup Guidance
- Updated `start-services.bat` with a warning note advising that Windows `start /min cmd /c` detached processes will terminate immediately in a non-interactive sandbox environment. The script warns developers to use daemon-style launching (`run_command` with `IsDaemon: true`) instead.

### 3. Dual-Channel Routing Matrix
- Verified and asserted that time-sensitive/revenue-affecting events (such as `slot_release_reminder` and `subscription_charge_failed`) correctly resolve and dispatch to **both SMS and Push channels** concurrently:
  - Default: `push_or_sms` (Push-if-avail-else-SMS)
  - Slot Release: `sms + push` (Both)
  - Subscription Charge Failure: `push + sms` (Both)

---

## Verification Results

### 1. Updated Integration Test Output (Dual-Channel Verification)

The integration test suite was run successfully with all 6 tests passing, including strict checks for dual-channel dispatches:

```text
Starting Phase 5 Notification Integration Tests...

Database cleaned successfully.
Test user seeded in DB
--- Test 1: Notification service health check ---
Health: {"data":{"status":"ok","service":"notification"}}
TEST 1 PASSED

--- Test 2: Push-preferred routing (push_or_sms) ---
Device registered: 200
Queued requests: [{"channel":"push","recipient":"fcm-test-token-abc123","status":"queued"}]
NotificationRequest after dispatch: {"id":"cf6273ff-6230-4d05-836a-c0abc694c883","channel":"push","status":"sent","providerRef":"mock-push-1785322884735-czhyg8","attempts":1}
TEST 2 PASSED

--- Test 3: Dual-channel (push + sms) for slot_release_reminder ---
Dual-channel queued: [{"channel":"sms","recipient":"+919999999999"},{"channel":"push","recipient":"fcm-test-token-abc123"}]
TEST 3 PASSED

--- Test 4: Retry and dead_letter exhaustion ---
Created failing request id=379539b3-22a9-4a39-a379-d0f376a2cce0
[RETRY] NotificationRequest 379539b3-22a9-4a39-a379-d0f376a2cce0 attempt 1 failed, retry at 2026-07-29T11:02:24.904Z
After attempt 1: status=queued attempts=1 retryAfter=Wed Jul 29 2026 16:32:24 GMT+0530 (India Standard Time)
[RETRY] NotificationRequest 379539b3-22a9-4a39-a379-d0f376a2cce0 attempt 2 failed, retry at 2026-07-29T11:06:24.924Z
After attempt 2: status=queued attempts=2
[RETRY] NotificationRequest 379539b3-22a9-4a39-a379-d0f376a2cce0 attempt 3 failed, retry at 2026-07-29T11:16:24.938Z
After attempt 3: status=queued attempts=3
[DEAD-LETTER] NotificationRequest 379539b3-22a9-4a39-a379-d0f376a2cce0 exhausted retries: Mock provider failure for channel=sms
After attempt 4: status=dead_letter attempts=4 errorMessage=Mock provider failure for channel=sms
TEST 4 PASSED

--- Test 5: Payment subscription.charge_failed → Notification end-to-end ---
Created subscription id=0f62db70-1800-4ab6-9615-33b0043143b2, mandateId=sub_e2e_test_mandate_001
Device token registered for subscription failure test
Subscription pre-check: found id=0f62db70-1800-4ab6-9615-33b0043143b2 status=active
Webhook response: 200 {"data":{"success":true}}

=== NotificationRequests from Payment↔Notification wiring ===
[
  {
    "id": "2ffdf344-a1a5-4790-bc68-f48246e01047",
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "eventType": "subscription_charge_failed",
    "channel": "push",
    "recipient": "fcm-sub-fail-test-token",
    "status": "sent",
    "attempts": 1,
    "variables": {
      "amount": 29900,
      "subscriptionId": "0f62db70-1800-4ab6-9615-33b0043143b2"
    },
    "createdAt": "2026-07-29T11:01:25.188Z"
  },
  {
    "id": "8730ef8a-f7dd-459b-b62a-9bfaa39d431f",
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "eventType": "subscription_charge_failed",
    "channel": "sms",
    "recipient": "+919999999999",
    "status": "sent",
    "attempts": 1,
    "variables": {
      "amount": 29900,
      "subscriptionId": "0f62db70-1800-4ab6-9615-33b0043143b2"
    },
    "createdAt": "2026-07-29T11:01:25.188Z"
  },
  {
    "id": "c8c21afd-50ba-4eda-be10-fa8126ad85a2",
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "eventType": "subscription_charge_failed",
    "channel": "push",
    "recipient": "fcm-fail-token-xyz",
    "status": "sent",
    "attempts": 1,
    "variables": {
      "amount": 29900,
      "subscriptionId": "0f62db70-1800-4ab6-9615-33b0043143b2"
    },
    "createdAt": "2026-07-29T11:01:25.188Z"
  },
  {
    "id": "d5c6837f-5491-4df9-b103-83bd047f968d",
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "eventType": "subscription_charge_failed",
    "channel": "push",
    "recipient": "fcm-test-token-abc123",
    "status": "sent",
    "attempts": 1,
    "variables": {
      "amount": 29900,
      "subscriptionId": "0f62db70-1800-4ab6-9615-33b0043143b2"
    },
    "createdAt": "2026-07-29T11:01:25.188Z"
  }
]
=============================================================

Subscription status after failed charge: suspended
TEST 5 PASSED

--- Test 6: Template override storage ---
Template stored: {"id":"2ca928f2-9391-4671-9135-77faf5d17e3d","channel":"sms","eventType":"booking_confirmed"}
TEST 6 PASSED

--- Regression: Phase 4 payment suite endpoint confirmed reachable ---
Payment service health: 200
REGRESSION CHECK PASSED

===========================================
ALL PHASE 5 TESTS PASSED
===========================================
```

### 2. Database History Query Log Verification
We also ran a direct check on the background worker's output during the test execution:
- **Test 3** produced exactly `sms` and `push` records.
- **Test 5** successfully generated a push record for each active device token mapped to the user (`fcm-sub-fail-test-token`, `fcm-fail-token-xyz`, `fcm-test-token-abc123`) **alongside** the required SMS record sent to `+919999999999`.
- Both SMS and Push notifications were marked as `status: "sent"` by the dispatch worker.
