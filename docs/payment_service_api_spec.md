# Payment Service — API Contract (v0)

**Status:** Fourth Platform Core component.
**Related docs:** `slot_resource_engine_api_spec.md`, `identity_auth_service_api_spec.md`, `tenant_whitelabel_management_api_spec.md`, `badminton_app_discovery_brief.md`

---

## 1. Scope

Owns: payment capture, refunds, member subscription billing (UPI AutoPay), and a wallet/ledger. Does **not** own fare calculation (driver-app-specific), booking logic (Slot Engine), or which specific policy applies to a given cancellation — this service *executes* refunds/charges, the *policy* (how much, under what condition) is decided by the calling context (badminton brief Section 7, tournament spec Section 5) and passed in.

## 2. Core entities

| Entity | Purpose |
|---|---|
| `PaymentIntent` | One payment attempt — tenant_id, user_id, amount, purpose (`guest_booking` \| `tournament_entry`), reference_id (the Slot Engine `Booking` or Tournament `Registration` it's for), status (`pending` → `captured`/`failed`/`expired`), gateway_ref |
| `Subscription` | A member's recurring billing setup — user_id, tenant_id, UPI AutoPay mandate_id, amount, frequency, status |
| `Refund` | payment_intent_id, amount, reason, status |
| `WalletLedger` | user_id, tenant_id, running balance, individual credit/debit entries with reason |
| `WebhookEvent` | Raw gateway webhook log, deduplicated by gateway event id — needed for idempotency and reconciliation |

## 3. Endpoints (v0 draft)

| Method & path | Purpose |
|---|---|
| `POST /payments/intents` | Create a `PaymentIntent` for a booking or tournament entry — returns the UPI Intent deep link (with QR fallback for desktop) |
| `POST /webhooks/razorpay` | Gateway webhook receiver — verifies signature, updates `PaymentIntent` status, and on success calls back to the Slot Engine's `POST /bookings/{id}/confirm` or the Tournament module's registration-confirm equivalent |
| `POST /subscriptions` | Create a UPI AutoPay mandate for a member's recurring monthly billing |
| `POST /webhooks/razorpay/autopay` | Receives the result of a Razorpay-native recurring AutoPay debit (success/failure) — this service reacts to it (e.g. notify member on failure) rather than triggering the charge itself |
| `POST /refunds` | Issue a refund against a `PaymentIntent`, per whatever cancellation policy the calling context applies |
| `GET /wallet/{user_id}` | Fetch wallet balance and recent entries |
| `POST /wallet/{user_id}/credit` | Issue a wallet credit (e.g. cancellation compensation, if the wallet-credit policy option is used) |

## 4. Two things worth getting right early

**Webhook-driven confirmation, never client-claimed.** A `Booking` only moves from `held` to `confirmed` on the Slot Engine when *this service* calls it, triggered by a verified gateway webhook — never because the client app says "payment succeeded." This is what prevents someone from spoofing a successful payment by just calling the confirm endpoint directly. Webhooks can also arrive late, out of order, or duplicated — `WebhookEvent` dedup by gateway event id makes the handler idempotent so a retried webhook doesn't double-process.

**Reconciliation isn't optional.** Webhooks get missed occasionally — a daily job comparing your `PaymentIntent` records against the gateway's settlement report is what catches the gap before it silently becomes a missing-money or stuck-booking problem. Worth building this from day one rather than adding it after the first support ticket about a paid-but-unconfirmed booking.

## 5. Guest cancellation policy — resolved (26 Jul 2026)

**Decided:** tiered refund, with a flat (no-refund) zone once close to slot time — and the thresholds themselves are **tenant-configurable**, not hardcoded, since different tenants will want different windows.

Schema (lives on the Slot Engine's `BookingRule`, see `slot_resource_engine_api_spec.md` Section 2, this service just reads it at refund time):
```
cancellation_policy: {
  type: "tiered",
  tiers: [
    { min_hours_before_slot: 24, refund_percent: 100 },
    { min_hours_before_slot: 6,  refund_percent: 50  },
    { min_hours_before_slot: 0,  refund_percent: 0   }
  ]
}
```
`POST /refunds` finds the matching tier by how many hours before slot start the cancellation request lands, and computes the refund accordingly. The example above (100% beyond 24h, 50% between 6-24h, flat 0% inside 6h) is a sensible default to seed new tenants with — each tenant can edit their own tier list via the Tenant service's branch/rule configuration, no code change required to adjust the numbers.

**Note on booking lead time:** the discussion also raised that same-day bookings might reasonably need a different (likely stricter) policy than bookings made a day+ ahead, since there's less time for the tiers to matter. For v0, keep it to one policy per pool based on time-to-slot only — a separate rule keyed on time-since-booking is a real refinement but adds complexity that can wait until real cancellation data shows it's needed.

## 6. Resolved decisions

- ~~Subscription charge scheduling~~ — **decided:** Razorpay-native UPI AutoPay trigger. No custom scheduler needed for the charge itself; this service only reacts to the resulting webhook (success/failure), e.g. to notify the member on a failed charge.
- ~~Refund timing SLA~~ — **decided:** standard gateway refund flow (~24-48h). Instant settlement (the extra-fee option from the earlier gateway comparison) only affects how fast *you* receive merchant funds, not how fast a customer refund processes — so it's not needed for this.

## 7. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Guest cancellation: tiered, tenant-configurable (Section 5) |
| 26 Jul 2026 | Subscription charges: Razorpay-native AutoPay trigger, no custom scheduler |
| 26 Jul 2026 | Refund SLA: standard gateway flow (~24-48h), no instant settlement needed |

---
*Fifth and final Basic-tier component once this is closed: Notification Service.*
