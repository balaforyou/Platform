# Tasks — Phase 5: Notification

- [x] Database Schema Update
  - [x] Add `NotificationTemplate`, `NotificationRequest`, and `DeviceToken` models to `schema.prisma`
  - [x] Run Prisma migration dev: `pnpm prisma:migrate -- --name phase5_notification`
- [x] Implement Notification Service
  - [x] Align Payment service call to POST `/notifications/send` (canonical spec endpoint)
  - [x] Implement channel policy routing matrix (Push-if-avail-else-SMS, SMS+Push both for slot release and charge failure, SMS-only for invite, email-if-avail-else-SMS for receipt)
  - [x] Implement database-backed async queue with 3-retry exponential backoff (1m, 5m, 15m)
  - [x] Expose registration endpoints `/devices/register` and overrides `/notifications/templates`
- [x] Verification and Testing
  - [x] Implement integration test script `services/notification/src/notification.test.ts`
  - [x] Test 1: Channel policy matrix routing rules
  - [x] Test 2: Retry exponential backoff and dead-letter log transitions
  - [x] Test 3: Re-run Payment service test suite verifying `TypeError: fetch failed` is resolved and real request record is saved
  - [x] Run typescript typechecks and eslint across all workspaces
