# Step-by-Step Guest Booking Journey

This document presents the visual flow of the Guest Booking Journey inside the Elite Courts PWA, captured chronologically during E2E automated test runs. Use this guide to understand each screen and transition.

---

## 1. OTP Authentication (Login)

Guests enter their phone number on the login page to receive a 6-digit mock OTP (`123456`).

![OTP Authentication](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/01_login.png)

---

## 2. Guest Member Dashboard

Upon verification, the guest is redirected to the home dashboard showing a welcome message and a quick-action "Book Court Now" button.

![Guest Member Dashboard](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/02_dashboard.png)

---

## 3. Branch Selection

Clicking "Book Court Now" directs the user to browse active branches within the tenant.

![Branch Selection](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/03_branches.png)

---

## 4. Branch Dashboard (Courts & Pools)

Selecting a branch opens the dashboard containing active court categories (resource pools), operating hours, and basic metadata.

![Branch Dashboard](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/04_branch_dashboard.png)

---

## 5. Branch Facilities & Details (About)

Users can read operating hours, a detailed description, and a list of active amenities (Locker Rooms, Cafeteria, etc.) in the Branch About panel.

![Branch Facilities](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/05_branch_about.png)

---

## 6. Time Slot Picker

Choosing a court category opens the slot selection grid where active time slots are shown with availability counts and default base rates.

![Time Slot Picker](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/06_slot_selection.png)

---

## 7. Co-player Inputs & Group Pricing

Selecting a slot opens the co-players panel. Entering phone numbers dynamically updates the group pricing in real time (e.g. 1 booker + 2 players = 3 players * ₹150 = ₹450 total).

![Co-player & Group Pricing](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/07_booking_coplayers.png)

---

## 8. Payment Checkout Panel

Reserving the slot redirects the user to the payment page. In development/test environments, a mock simulation trigger is rendered to sign webhook payloads server-side.

![Payment Checkout Panel](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/08_payment_screen.png)

---

## 9. Booking Confirmation (Webhook Polling)

Simulating the payment redirects the user optimistically to the confirmation page, which polls backend states until the webhook transitions the booking to `CONFIRMED`.

![Booking Confirmation](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/09_confirmation_success.png)

---

## 10. Match History (Dashboard)

Navigating to "My Bookings" lists active matches with their status badges (`Confirmed`).

![Match History](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/10_bookings_history.png)

---

## 11. Self Check-In Triggered ("I'm Here")

When within the active check-in window, the "I'm Here" action appears. Clicking it updates the booking status badge to `Checked In`.

![Self Check-In](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/11_checked_in.png)

---

## 12. Cancellation Refund Preview Modal

Clicking "Cancel Match" on a confirmed booking fetches a refund preview (e.g. 1.9 hours cutoff computes to a 0% refund = ₹0).

![Cancellation Modal](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/12_cancel_modal.png)

---

## 13. Cancelled Booking State

Confirming the cancellation updates the status badge to `Cancelled` in the match history list.

![Cancelled Booking](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/13_cancelled_match.png)
