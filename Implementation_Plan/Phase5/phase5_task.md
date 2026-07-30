# Tasks — Phase 5: Notification

- [ ] Database Schema Update
  - [ ] Add `NotificationTemplate`, `NotificationRequest`, and `DeviceToken` models to `schema.prisma`
  - [ ] Run Prisma migration dev: `pnpm prisma:migrate -- --name phase5_notification`
- [ ] Implement Notification Service
  - [ ] Normalize contract input (support both `/notifications/trigger` and `/notifications/send`)
  - [ ] Implement channel policy routing matrix (Push-if-avail-else-SMS, SMS+Push both for slot release and charge failure, SMS-only for invite, email-if-avail-else-SMS for receipt)
  - [ ] Implement database-backed async queue with 3-retry exponential backoff (1m, 5m, 15m)
  - [ ] Expose registration endpoints `/devices/register` and overrides `/notifications/templates`
- [ ] Verification and Testing
  - [ ] Implement integration test script `services/notification/src/notification.test.ts`
  - [ ] Test 1: Channel policy matrix routing rules
  - [ ] Test 2: Retry exponential backoff and dead-letter log transitions
  - [ ] Test 3: Re-run Payment service test suite verifying `TypeError: fetch failed` is resolved and real request record is saved
  - [ ] Run typescript typechecks and eslint across all workspaces
