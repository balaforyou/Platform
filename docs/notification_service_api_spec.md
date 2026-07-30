# Notification Service — API Contract (v0)

**Status:** Fifth and final Basic-tier component.
**Related docs:** `slot_resource_engine_api_spec.md`, `identity_auth_service_api_spec.md`, `tenant_whitelabel_management_api_spec.md`, `payment_service_api_spec.md`

---

## 1. Scope

Owns: dispatching SMS, push, and email notifications for events other services fire (booking confirmations, grace-deadline reminders, group-booking invites, payment receipts, refund processed, subscription charge failed). Fire-and-forget, not part of any critical-path transaction — a notification failing should never roll back a booking or payment.

**Boundary with Identity:** OTP delivery is **not** routed through this service — the Identity spec already calls MSG91 directly for `POST /auth/otp/request`, since OTP is a synchronous, latency-sensitive flow tightly coupled to login, not a fire-and-forget notification. This service handles everything else.

## 2. Core entities

| Entity | Purpose |
|---|---|
| `NotificationTemplate` | tenant_id (nullable — null means platform default), channel (`sms`\|`push`\|`email`), event_type (e.g. `booking_confirmed`, `slot_release_reminder`, `group_invite`, `payment_receipt`, `refund_processed`, `subscription_charge_failed`), template body with variable placeholders. Tenants can override the platform default per event/channel for their own branding/voice |
| `NotificationRequest` | tenant_id, recipient (user_id, or a raw mobile/email for a `PendingInvite` who isn't a registered user yet), channel, event_type, variables, status (`queued`→`sent`/`failed`), provider_ref |
| `DeviceToken` | user_id, push subscription details (Web Push endpoint/keys, since guests/members are on a PWA) — registered when the user opts into push |

## 3. Endpoints (v0 draft)

| Method & path | Purpose |
|---|---|
| `POST /notifications/send` | Fire a notification: `{event_type, recipient, variables}` — resolves the right template (tenant override, falling back to platform default) and dispatches via the configured channel(s) for that event |
| `POST /notifications/templates` | Create/update a tenant's template override for a given event + channel |
| `POST /devices/register` | Register a Web Push subscription for a user |
| `GET /notifications/{user_id}/history` | Recent notification log — mainly for support/debugging when someone says "I never got my confirmation" |

## 4. Two things worth getting right early

**Async with retry, not fire-and-hope.** `POST /notifications/send` should queue the request and return immediately — the calling service (Slot Engine, Payment) shouldn't wait on SMS delivery. Transient failures (provider timeout) should retry with backoff; permanent failures (invalid number) go to a dead-letter log rather than silently vanishing, since a support agent will eventually need to explain why a guest says they never got a booking confirmation.

**iOS Web Push has real limitations.** Since guests/members are on a PWA (per the earlier platform-mode decision), push notifications on iOS only work if the PWA has been added to the home screen and requires iOS 16.4+ — a guest who never installed it, or is on an older iOS version, simply won't receive push at all. This is the same category of PWA constraint we hit with geofencing earlier: every event that matters (e.g. the slot-release grace-deadline reminder) needs an SMS fallback, not push as the sole channel, for exactly this reason.

## 5. Resolved decisions

- ~~Channel policy per event~~ — **decided:** default matrix below, tenant-overridable like templates.

  | Event | Default channel(s) |
  |---|---|
  | `booking_confirmed`, `refund_processed`, `tournament_fixture_scheduled` | Push if available, else SMS |
  | `slot_release_reminder` | SMS **+** push, always both — the time-critical one that can't depend on push alone (see iOS caveat, Section 4) |
  | `group_invite` | SMS only — recipient may not be a registered user yet |
  | `payment_receipt` | Email if on file, else SMS |
  | `subscription_charge_failed` | Push **+** SMS, both — revenue-affecting, needs to actually land |

- ~~Push provider~~ — **decided:** Firebase Cloud Messaging, unified backend for Web Push across Android/iOS/desktop.
- ~~Retry/backoff~~ — **decided:** 3 retries, exponential backoff at 1/5/15 minutes, then dead-letter.

## 6. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Channel policy: default matrix above, tenant-overridable |
| 26 Jul 2026 | Push provider: Firebase Cloud Messaging |
| 26 Jul 2026 | Retry: 3 attempts, backoff 1/5/15 min, then dead-letter |

---
*All five Basic-tier Platform Core components are now specced: Slot Engine, Identity & Auth, Tenant/White-Label, Payment, Notification. Every open decision across all five is now resolved. Premium add-ons (Tournament, Student attendance) remain parked per `badminton_app_discovery_brief.md` Section 8a.*
