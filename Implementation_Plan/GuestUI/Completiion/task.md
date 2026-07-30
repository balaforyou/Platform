# Phase 10 — Guest Booking Journey & Playwright Verification

## 1. Slot Engine Updates (`services/slot-engine/src/index.ts`)
- [x] Add `GET /bookings/my` route with JWT owner check
- [x] Add `GET /bookings/:id/cancel-preview` route with IDOR validation
- [x] Modify `GET /bookings/:id` to add IDOR validation check
- [x] Modify `POST /bookings/:id/cancel` to add IDOR validation check

## 2. Payment Service Updates (`services/payment/src/index.ts`)
- [x] Add `POST /payments/test/simulate-capture` endpoint gated to dev/non-prod environments

## 3. Guest PWA Screens & Routing (`apps/guest-member-pwa`)
- [x] Refactor `apps/guest-member-pwa/src/main.tsx` routing layout
- [x] Implement `BranchSelect.tsx` component
- [x] Implement `BranchDashboard.tsx` component
- [x] Implement `BranchAbout.tsx` component
- [x] Implement `CourtBooking.tsx` component (slot selector & price display)
- [x] Implement `BookingPay.tsx` component
- [x] Implement `BookingHistory.tsx` component (cancellation & check-in triggers)
- [x] Implement `CancelBookingModal.tsx` component

## 4. Playwright Setup & E2E Tests
- [x] Install Playwright dependencies in monorepo
- [x] Add `playwright.config.ts` config file
- [x] Implement `guest-booking.spec.ts` E2E test
- [x] Implement `pwa-install-dismissal.spec.ts` dismissal-expiry (F-002) test
- [x] Execute Playwright test suite and verify all pass

## 5. Walkthrough & Commit
- [x] Create `walkthrough.md` with instructions
- [x] Commit all changes to Git and confirm clean working tree
