Read docs/coding_assistant_handover_plan.md Section 4 (Phase 5 row) and docs/notification_service_api_spec.md in full before planning anything.

Phases 0-4 are complete and approved. We are now starting Phase 5: Notification (services/notification), which currently only contains the placeholder /health and /error-test routes from Phase 0.

Same working agreement as previous phases (handover plan Section 1) — comments on non-trivial logic, flag performance trade-offs explicitly, stop and ask on anything the spec doesn't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

## Scope for this phase

Implement the Notification service exactly as specced in docs/notification_service_api_spec.md:
- Core entities: NotificationTemplate, NotificationRequest, DeviceToken (Section 2)
- All endpoints in Section 3
- The channel policy matrix from Section 5 (Resolved decisions) — push-if-available-else-SMS for most events, SMS+push both for `slot_release_reminder` and `subscription_charge_failed`, SMS-only for `group_invite`, email-if-available-else-SMS for `payment_receipt`
- FCM as the push provider, MSG91 for SMS
- Async, queued dispatch with 3-retry exponential backoff (1/5/15 min) before landing in a dead-letter log — the calling service should never block waiting on actual delivery

## Boundary reminder

Per Section 1 of the spec, OTP delivery is NOT routed through this service — Identity & Auth already calls MSG91 directly for OTP, since that's a synchronous, latency-sensitive flow tightly coupled to login. Do not rebuild OTP dispatch here; this service handles everything else (confirmations, reminders, receipts, alerts).

## A real contract mismatch to resolve first, before writing any code

Payment service (Phase 4) is already calling this service — go read the actual implementation in services/payment/src/index.ts (the `subscription.charge_failed` handler in `POST /webhooks/razorpay/autopay`) to see exactly what endpoint path and payload shape it's calling. Based on the Phase 4 review discussion, Payment calls `POST /notifications/trigger`, but the spec you're building from defines the endpoint as `POST /notifications/send`. These need to be reconciled — either this service implements the endpoint Payment is actually calling, or Payment's caller needs a small follow-up fix to call the spec'd path. Determine which is correct by reading Payment's actual code (not assuming the spec is automatically right, and not assuming Payment's prior implementation is automatically right either), state your recommendation in the plan, and confirm with me before implementing either side.

## The concrete, non-negotiable checkpoint for this phase

This is different from previous phases' checkpoints — the proof isn't a new test you write in isolation, it's an **existing test that's currently failing for an infrastructure reason, now passing for real**. Phase 4's payment integration test suite already exercises the `subscription.charge_failed` → notification-dispatch path, but it currently fails with `TypeError: fetch failed` because this service doesn't exist yet (caught gracefully, logged as a warning, doesn't crash the webhook — that part is fine and stays as a safety net).

Once this service is built and spawned, re-run Phase 4's full payment.test.ts suite alongside this service. The acceptance bar for this phase is: that fetch-failed warning is gone, replaced by a real successful dispatch, and you can show the NotificationRequest record that got created as a result. This is the real proof the two services are actually wired together, not just individually functional.

## Also required in your plan and tests
- A test proving the channel-policy matrix is followed correctly for at least two contrasting cases — one push-or-SMS-fallback event, and the `slot_release_reminder` or `subscription_charge_failed` case that requires both channels, not either/or
- A test proving the retry/dead-letter behavior actually works (simulate a failing send, confirm it retries per the backoff schedule and eventually lands in the dead-letter log rather than retrying forever or silently dropping)
- Confirm whether MSG91/FCM calls in tests are mocked or hit real sandbox/test endpoints, and state that choice explicitly

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
