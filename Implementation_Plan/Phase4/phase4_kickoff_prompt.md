Read docs/coding_assistant_handover_plan.md Section 4 (Phase 4 row) and docs/payment_service_api_spec.md in full before planning anything.

Phases 0-3 are complete and approved. We are now starting Phase 4: Payment (services/payment), which currently only contains the placeholder /health and /error-test routes from Phase 0.

Same working agreement as previous phases (handover plan Section 1) — comments on non-trivial logic, flag performance trade-offs explicitly, stop and ask on anything the spec doesn't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

## Scope for this phase

Implement the Payment service exactly as specced in docs/payment_service_api_spec.md:
- Core entities: PaymentIntent, Subscription, Refund, WebhookEvent (Section 2)
- All endpoints in Section 3
- UPI Intent flow for guest one-time payments, Razorpay-native AutoPay trigger for member subscriptions (this service reacts to the AutoPay webhook, it does not initiate the charge itself — already decided)
- Webhook-driven confirmation only — a booking must never move to confirmed because a client claims payment succeeded, only because this service verifies a real gateway webhook

## Two things that changed based on how Phase 1 actually got built — read before planning

**1. Refund amount is already computed by Slot Engine, don't recompute it here.** When Phase 1 implemented `POST /bookings/:id/cancel`, the agent had Slot Engine itself parse `BookingRule.cancellationPolicyJson` and compute+store the refund amount on `Booking` at cancellation time — this is slightly different from how the original Payment spec described it (Payment reading the policy and computing the tier). Don't duplicate that tiered-percentage logic here. This service should read the already-computed refund amount from the Booking record (via an API call to Slot Engine, not a database read — different service, no DB relation) and execute the actual monetary refund through Razorpay's refund API. Confirm this division of responsibility in your plan before implementing — if you think the calculation should move here instead, that's a valid position, but it's a deviation from what Phase 1 built and needs to be flagged as such, not silently done differently in each service.

**2. The booking price trust boundary needs closing now, as promised at the Phase 1 checkpoint.** `POST /bookings` currently accepts a client-supplied `price` with no server-side source of truth — flagged at Phase 1 sign-off as deferred to this phase. This means **reopening Slot Engine again** (same pattern as Phase 2's `BookingPlayer` addition): add a pricing field to `ResourcePool` and/or `BookingRule` (your call on which, given hourly/time-of-day variation might matter — say so in your plan), and change `POST /bookings` to resolve price server-side from that field rather than accepting it from the caller. This is a prerequisite for Payment to trust the amount it's charging — don't build PaymentIntent creation against a client-supplied price.

## Scope question to answer in your plan, not assume

The spec's `WalletLedger` entity was designed for a wallet-credit cancellation model — but the actual decided cancellation policy (badminton brief Section 7, Payment spec Section 5) is tiered **direct refund via the gateway**, not wallet credit. Confirm in your plan whether `WalletLedger` is actually needed for this phase's scope, or whether it should be stubbed/deferred since nothing in the current decided flows uses it yet.

## Internal service-to-service auth

This service will call Slot Engine's `POST /bookings/:id/confirm` (on successful payment webhook) and read booking/refund data from it. Per the pattern established in Phases 2 and 3, that call needs `INTERNAL_SERVICE_KEY` authentication — confirm Slot Engine's `confirm` endpoint actually enforces this (it may not yet, since it predates the internal-auth pattern) and add it if missing, flagging that as another small Slot Engine touch-point.

## The non-negotiable checkpoints for this phase

1. **Webhook idempotency/signature verification** — a replayed or duplicated webhook event must not double-confirm a booking or double-process a refund. Test this directly: fire the same webhook payload twice, assert only one state transition occurs.
2. **Real end-to-end proof, not a mocked confirm** — an integration test that creates a held booking via Slot Engine, creates a PaymentIntent, simulates a signed webhook from Razorpay's test/sandbox mode (not a fake internal call), and confirms the booking actually transitions to `confirmed` in Slot Engine as a result. This mirrors how Phase 3 proved the JWT role chain end-to-end rather than testing each side in isolation.
3. **Tiered refund execution test** — using a real cancelled booking with a Slot-Engine-computed refund amount, confirm this service calls Razorpay's refund API with that exact amount, not a recalculated one.

Use Razorpay test-mode keys and their webhook signature test utilities for all of this — no real transactions.

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
