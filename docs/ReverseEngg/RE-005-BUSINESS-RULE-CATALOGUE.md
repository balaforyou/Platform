# RE-005 - Business Rule Catalogue

Consolidated rule catalogue derived from completed Phase 4 flow reconstructions and `RE-004-BUSINESS-FLOW-MODEL.md`.

This catalogue preserves every `FLOW-xxx-RULE-xxx` candidate ID as immutable lineage. `BR-xxx` identifiers are consolidation-only analytical IDs and do not replace source rule IDs.

## Mechanical Candidate Rule Inventory

Candidate rule IDs discovered: 231

Duplicate candidate rule IDs: 0

Orphan candidate rule IDs: 0

Missing originating Flow IDs: 0

| Candidate Rule ID | Flow | Capability | Journey | Original Classification | Short Statement |
|---|---|---|---|---|---|
| FLOW-001-RULE-001 | FLOW-001 | CAP-001 | Identity & Session | PROVEN | Phone is normalized before OTP persistence. |
| FLOW-001-RULE-002 | FLOW-001 | CAP-001 | Identity & Session | PROVEN | OTP TTL is 5 minutes and request cooldown is 60 seconds. |
| FLOW-002-RULE-001 | FLOW-002 | CAP-001 | Identity & Session | PROVEN | Public OTP signup creates `UserType.GUEST`; client cannot choose type. |
| FLOW-002-RULE-002 | FLOW-002 | CAP-001 | Identity & Session | PROVEN | Successful verification deletes the OTP before session creation. |
| FLOW-003-RULE-001 | FLOW-003 | CAP-001 | Identity & Session | PROVEN | Google login does not create a user. |
| FLOW-003-RULE-002 | FLOW-003 | CAP-001 | Identity & Session | PROVEN | GUEST users cannot use Google login. |
| FLOW-004-RULE-001 | FLOW-004 | CAP-001 | Identity & Session | PROVEN | Access token TTL is 15 minutes; refresh cookie/session TTL is renewed to 30 days. |
| FLOW-004-RULE-002 | FLOW-004 | CAP-001 | Identity & Session | PROVEN | Refresh recalculates roles through Tenant Management. |
| FLOW-005-RULE-001 | FLOW-005 | CAP-001 | Identity & Session | PROVEN | Logout is idempotent from caller perspective. |
| FLOW-005-RULE-002 | FLOW-005 | CAP-001 | Identity & Session | PROVEN | Logout revokes by refresh token, not by JWT subject. |
| FLOW-006-RULE-001 | FLOW-006 | CAP-001 | Identity & Session | PROVEN | Admin phone lookup is tenant-scoped by JWT tenant claim. |
| FLOW-006-RULE-002 | FLOW-006 | CAP-001 | Identity & Session | PROVEN | Phone lookup accepts only numbers normalizing to `+91[6-9]#########`. |
| FLOW-007-RULE-001 | FLOW-007 | CAP-001 | Identity & Session | PROVEN | Pending invite uniqueness is `(phone, tenantId)`. |
| FLOW-007-RULE-002 | FLOW-007 | CAP-001 | Identity & Session | PROVEN | Duplicate invite resolution is idempotent via upsert. |
| FLOW-008-RULE-001 | FLOW-008 | CAP-001 | Identity & Session | PROVEN | Public clients cannot self-promote user type. |
| FLOW-008-RULE-002 | FLOW-008 | CAP-001 | Identity & Session | PROVEN | User type is represented by `GUEST`, `MEMBER`, or `STAFF`. |
| FLOW-009-RULE-001 | FLOW-009 | CAP-004 | Role & Admin Access Context | PROVEN | OWNER is tenant-scoped and must not carry branch id. |
| FLOW-009-RULE-002 | FLOW-009 | CAP-004 | Role & Admin Access Context | PROVEN | Non-owner roles require a branch id that belongs to the tenant. |
| FLOW-010-RULE-001 | FLOW-010 | CAP-004 | Role & Admin Access Context | PROVEN | Role claim strings are `owner` or lower-case enum plus branch id. |
| FLOW-010-RULE-002 | FLOW-010 | CAP-004 | Role & Admin Access Context | PROVEN | OWNER grants access to all branches in that tenant. |
| FLOW-011-RULE-001 | FLOW-011 | CAP-002 | Tenant & Branch Administration | PROVEN | Tenant subdomain is unique. |
| FLOW-011-RULE-002 | FLOW-011 | CAP-002 | Tenant & Branch Administration | PROVEN | Tenant creation is platform/internal-key gated. |
| FLOW-012-RULE-001 | FLOW-012 | CAP-002 | Tenant & Branch Administration | PROVEN | Tenant update requires owner for same tenant or internal key. |
| FLOW-012-RULE-002 | FLOW-012 | CAP-002 | Tenant & Branch Administration | PROVEN | Tenant about/facilities/photos serve as branch defaults. |
| FLOW-013-RULE-001 | FLOW-013 | CAP-002 | Tenant & Branch Administration | PROVEN | Tenant context is resolved before auth requests. |
| FLOW-013-RULE-002 | FLOW-013 | CAP-002 | Tenant & Branch Administration | PROVEN | Query parameter tenant overrides hostname-derived subdomain. |
| FLOW-014-RULE-001 | FLOW-014 | CAP-002 | Tenant & Branch Administration | PROVEN | Manifest bypasses the normal response envelope. |
| FLOW-014-RULE-002 | FLOW-014 | CAP-002 | Tenant & Branch Administration | PROVEN | App name falls back to tenant name. |
| FLOW-015-RULE-001 | FLOW-015 | CAP-003 | Tenant & Branch Administration | PROVEN | New branches start in `DRAFT`. |
| FLOW-015-RULE-002 | FLOW-015 | CAP-003 | Tenant & Branch Administration | PROVEN | Missing branch timezone defaults to `UTC`. |
| FLOW-016-RULE-001 | FLOW-016 | CAP-003 | Tenant & Branch Administration | PROVEN | Status must be one of `DRAFT`, `ACTIVE`, `INACTIVE` when supplied. |
| FLOW-016-RULE-002 | FLOW-016 | CAP-003 | Tenant & Branch Administration | PROVEN | Authorization is against branch's stored tenant id, not body tenant. |
| FLOW-017-RULE-001 | FLOW-017 | CAP-003 | Tenant & Branch Administration | PROVEN | Public branch browse returns only ACTIVE branches. |
| FLOW-017-RULE-002 | FLOW-017 | CAP-003 | Tenant & Branch Administration | PROVEN | Draft inclusion is owner/internal gated but unauthorized attempts do not error. |
| FLOW-018-RULE-001 | FLOW-018 | CAP-003 | Tenant & Branch Administration | PROVEN | Branch about overrides tenant defaults. |
| FLOW-018-RULE-002 | FLOW-018 | CAP-003 | Tenant & Branch Administration | PROVEN | Empty branch facilities/photos fall back to tenant arrays. |
| FLOW-024-RULE-001 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Availability browsing requires an existing resource pool. |
| FLOW-024-RULE-002 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Availability browse reach is capped by the first booking rule's `guestOpenWindowDays`, defaulting to 7 days when no rule is present. |
| FLOW-024-RULE-003 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Browsing availability can lazily materialize availability windows before returning them. |
| FLOW-024-RULE-004 | FLOW-024 | CAP-006 | Availability Management | PROVEN | A closed availability override for a date can cause browse availability to return no slots for that generated date. |
| FLOW-024-RULE-005 | FLOW-024 | CAP-006 | Availability Management | PROVEN | A modified availability override takes precedence over the normal pattern shape for generated browse results on that date. |
| FLOW-024-RULE-006 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Only active availability patterns matching the generated date's ISO weekday contribute generated browse windows when no closed/modified override applies. |
| FLOW-024-RULE-007 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Blocked windows remove overlapping availability windows from browse results. |
| FLOW-024-RULE-008 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Only `HELD` and `CONFIRMED` bookings reduce browse availability capacity. |
| FLOW-024-RULE-009 | FLOW-024 | CAP-006 | Availability Management | PROVEN | For pooled pools, a slot is browsable only when `window.capacity - activeBookings.length` is greater than zero. |
| FLOW-024-RULE-010 | FLOW-024 | CAP-006 | Availability Management | DERIVED | For pooled pools, a slot is browsable only when `window.capacity - activeBookings.length` is greater than zero. |
| FLOW-024-RULE-011 | FLOW-024 | CAP-006 | Availability Management | PROVEN | Invalid `from` or `to` query values are ignored unless the resulting computed range is invalid. |
| FLOW-024-RULE-012 | FLOW-024 | CAP-006 | Availability Management | PROVEN | The API does not require a user JWT or admin authorization to browse resource-pool availability. |
| FLOW-029-RULE-001 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Self-service booking creation requires a valid JWT with user and tenant identity. |
| FLOW-029-RULE-002 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | The booking creator's `userId` and `tenantId` are taken from the JWT, not the request body. |
| FLOW-029-RULE-003 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Self-service booking creation requires an idempotency key. |
| FLOW-029-RULE-004 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Repeated booking creation with the same idempotency key returns the existing booking rather than creating another one. |
| FLOW-029-RULE-005 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | The selected availability window is locked during booking creation before capacity decisions are made. |
| FLOW-029-RULE-006 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Group size is the booking user plus co-player count and must fit the pool's min occupancy and capacity. |
| FLOW-029-RULE-007 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Self-service `POST /bookings` always persists `isMemberBooking: false`. |
| FLOW-029-RULE-008 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Self-service `POST /bookings` always persists `isMemberBooking: false`. |
| FLOW-029-RULE-009 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Overlapping blocked windows prevent booking creation. |
| FLOW-029-RULE-010 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Pooled booking permits creation only while active held/confirmed booking count is below the window capacity. |
| FLOW-029-RULE-011 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Pooled booking permits creation only while active held/confirmed booking count is below the window capacity. |
| FLOW-029-RULE-012 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Self-service booking price is resolved server-side from window override or pool default and is not accepted from the client. |
| FLOW-029-RULE-013 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | New self-service bookings are initially persisted as held bookings with a five-minute hold expiry. |
| FLOW-029-RULE-014 | FLOW-029 | CAP-007 | Guest Booking | PROVEN | Valid co-player phones are normalized and persisted as booking players; unresolved player user identity is not assigned during booking creation. |
| FLOW-030-RULE-001 | FLOW-030 | CAP-007 | Negotiated Booking | PROVEN | Negotiated bookings are internal-service only and always created as non-member HELD bookings. |
| FLOW-030-RULE-002 | FLOW-030 | CAP-007 | Negotiated Booking | PROVEN | Negotiated booking waives group-size/pricing constraints but not availability, block, or capacity constraints. |
| FLOW-031-RULE-001 | FLOW-031 | CAP-007 | Guest Booking | PROVEN | Single-booking reads require either internal service key or valid JWT. |
| FLOW-031-RULE-002 | FLOW-031 | CAP-007 | Guest Booking | PROVEN | Non-internal booking reads are tenant-scoped. |
| FLOW-031-RULE-003 | FLOW-031 | CAP-007 | Guest Booking | PROVEN | Non-internal booking reads allow booking owner or scoped admin access. |
| FLOW-031-RULE-004 | FLOW-031 | CAP-007 | Guest Booking | PROVEN | Single-booking reads include booking players and the booking window's resource pool. |
| FLOW-032-RULE-001 | FLOW-032 | CAP-007 | Guest Booking | PROVEN | My-bookings reads require a valid JWT. |
| FLOW-032-RULE-002 | FLOW-032 | CAP-007 | Guest Booking | PROVEN | My-bookings visibility is scoped by resolved JWT user id. |
| FLOW-032-RULE-003 | FLOW-032 | CAP-007 | Guest Booking | PROVEN | My-bookings results are ordered by `heldAt` descending. |
| FLOW-032-RULE-004 | FLOW-032 | CAP-007 | Guest Booking | PROVEN | My-bookings returns all statuses for the user; no status filter is applied. |
| FLOW-033-RULE-001 | FLOW-033 | CAP-007 | Guest Booking | PROVEN | Admin booking list requires internal service key or admin JWT. |
| FLOW-033-RULE-002 | FLOW-033 | CAP-007 | Guest Booking | PROVEN | Admin booking list requires a `userId` query parameter. |
| FLOW-033-RULE-003 | FLOW-033 | CAP-007 | Guest Booking | PROVEN | Optional status query limits candidate bookings by status. |
| FLOW-033-RULE-004 | FLOW-033 | CAP-007 | Guest Booking | PROVEN | Admin booking list filters final results by caller branch authorization. |
| FLOW-033-RULE-005 | FLOW-033 | CAP-007 | Guest Booking | PROVEN | Admin booking list returns newest-held bookings first before branch filtering. |
| FLOW-034-RULE-001 | FLOW-034 | CAP-007 | Guest Booking | PROVEN | Booking confirmation is an internal-service-key protected operation. |
| FLOW-034-RULE-002 | FLOW-034 | CAP-007 | Guest Booking | PROVEN | FLOW-034 identifies the target booking only by the `:id` path parameter. |
| FLOW-034-RULE-003 | FLOW-034 | CAP-007 | Guest Booking | PROVEN | A missing booking fails confirmation with HTTP 404. |
| FLOW-034-RULE-004 | FLOW-034 | CAP-007 | Guest Booking | PROVEN | An already-confirmed booking is returned unchanged. |
| FLOW-034-RULE-005 | FLOW-034 | CAP-007 | Guest Booking | PROVEN | Only a `HELD` booking is eligible for the confirming update. |
| FLOW-034-RULE-006 | FLOW-034 | CAP-007 | Guest Booking | DERIVED | FLOW-034 changes a held booking's status to `CONFIRMED`. |
| FLOW-034-RULE-007 | FLOW-034 | CAP-007 | Guest Booking | DERIVED | FLOW-034 does not enforce hold-expiry validity before confirming. |
| FLOW-034-RULE-008 | FLOW-034 | CAP-007 | Guest Booking | DERIVED | FLOW-034 does not verify payment state or payment proof; the payment trust boundary is the authenticated internal caller. |
| FLOW-035-RULE-001 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | Check-in targets a booking by route path id. |
| FLOW-035-RULE-002 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | Missing booking fails check-in with HTTP 404. |
| FLOW-035-RULE-003 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | Already checked-in bookings are returned unchanged. |
| FLOW-035-RULE-004 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | Only confirmed bookings are eligible to transition to checked in. |
| FLOW-035-RULE-005 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | FLOW-035 updates only `Booking.status` explicitly. |
| FLOW-035-RULE-006 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | The server-side check-in endpoint does not enforce caller authentication or ownership. |
| FLOW-035-RULE-007 | FLOW-035 | CAP-007 | Guest Booking | PROVEN | Check-in timing is a client-side display condition in the PWA, not a server-side precondition in FLOW-035. |
| FLOW-036-RULE-001 | FLOW-036 | CAP-007 | Guest Booking | PROVEN | Preview requires internal key or JWT with booking access. |
| FLOW-036-RULE-002 | FLOW-036 | CAP-007 | Guest Booking | PROVEN | Preview is allowed only for `HELD`, `CONFIRMED`, or `CANCELLED`. |
| FLOW-036-RULE-003 | FLOW-036 | CAP-007 | Guest Booking | PROVEN | Cancelled preview uses stored `booking.refundAmount`. |
| FLOW-036-RULE-004 | FLOW-036 | CAP-007 | Guest Booking | PROVEN | Confirmed preview uses oldest booking rule's tiered cancellation policy and current hours before slot. |
| FLOW-036-RULE-005 | FLOW-036 | CAP-007 | Guest Booking | PROVEN | Held preview returns 100% of booking price. |
| FLOW-036-RULE-006 | FLOW-036 | CAP-007 | Guest Booking | PROVEN | Preview performs no persisted write. |
| FLOW-037-RULE-001 | FLOW-037 | CAP-007 | Guest Booking | PROVEN | Cancellation requires internal key or JWT booking access. |
| FLOW-037-RULE-002 | FLOW-037 | CAP-007 | Guest Booking | PROVEN | `CANCELLED` cancellation is idempotent. |
| FLOW-037-RULE-003 | FLOW-037 | CAP-007 | Guest Booking | PROVEN | Only `HELD` and `CONFIRMED` are active cancellable source states. |
| FLOW-037-RULE-004 | FLOW-037 | CAP-007 | Guest Booking | PROVEN | Confirmed cancellation recomputes tiered refund using booking rule and hours before slot. |
| FLOW-037-RULE-005 | FLOW-037 | CAP-007 | Guest Booking | PROVEN | Held cancellation persists `refundAmount: null`. |
| FLOW-037-RULE-006 | FLOW-037 | CAP-007 | Guest Booking | PROVEN | Cancellation does not invoke refund creation. |
| FLOW-037-RULE-007 | FLOW-037 | CAP-007 | Guest Booking | DERIVED | Cancellation has no explicit DB transaction/locking. |
| FLOW-040-RULE-001 | FLOW-040 | CAP-009 | Member Assignment & Attendance | PROVEN | Assignment creation requires internal/admin access scoped to the resource pool. |
| FLOW-040-RULE-002 | FLOW-040 | CAP-009 | Member Assignment & Attendance | PROVEN | `userId`, `resourcePoolId`, `daysOfWeek`, and `startTime` are required. |
| FLOW-040-RULE-003 | FLOW-040 | CAP-009 | Member Assignment & Attendance | PROVEN | New assignments are created as `ACTIVE`. |
| FLOW-040-RULE-004 | FLOW-040 | CAP-009 | Member Assignment & Attendance | PROVEN | Duplicate active/same-pool assignment is surfaced as 409. |
| FLOW-041-RULE-001 | FLOW-041 | CAP-009 | Member Assignment & Attendance | PROVEN | Assignment listing requires internal/admin auth. |
| FLOW-041-RULE-002 | FLOW-041 | CAP-009 | Member Assignment & Attendance | PROVEN | Branch managers are restricted to resource pools in claimed branches. |
| FLOW-041-RULE-003 | FLOW-041 | CAP-009 | Member Assignment & Attendance | PROVEN | Listing can filter by `resourcePoolId` and `userId`. |
| FLOW-041-RULE-004 | FLOW-041 | CAP-009 | Member Assignment & Attendance | PROVEN | Listing enriches assignments with tenant-matched user/member data. |
| FLOW-042-RULE-001 | FLOW-042 | CAP-009 | Member Assignment & Attendance | PROVEN | Only `ACTIVE` and `SUSPENDED` statuses are accepted. |
| FLOW-042-RULE-002 | FLOW-042 | CAP-009 | Member Assignment & Attendance | PROVEN | Assignment update requires pool-scoped internal/admin access. |
| FLOW-042-RULE-003 | FLOW-042 | CAP-009 | Member Assignment & Attendance | PROVEN | Updating to ACTIVE can conflict with one-active-assignment uniqueness. |
| FLOW-042-RULE-004 | FLOW-042 | CAP-009 | Member Assignment & Attendance | DERIVED | Status update does not mutate existing member bookings. |
| FLOW-043-RULE-001 | FLOW-043 | CAP-009 | Member Assignment & Attendance | PROVEN | Today assignment view requires MEMBER JWT. |
| FLOW-043-RULE-002 | FLOW-043 | CAP-009 | Member Assignment & Attendance | PROVEN | Active assignment is scoped by JWT user id and tenant id. |
| FLOW-043-RULE-003 | FLOW-043 | CAP-009 | Member Assignment & Attendance | PROVEN | Assignment day matching uses branch-local ISO weekday. |
| FLOW-043-RULE-004 | FLOW-043 | CAP-009 | Member Assignment & Attendance | PROVEN | `canConfirm` is true only when no booking exists, subscription is active, and now is before cutoff. |
| FLOW-044-RULE-001 | FLOW-044 | CAP-009 | Member Assignment & Attendance | PROVEN | Confirm requires MEMBER JWT and ignores body identity. |
| FLOW-044-RULE-002 | FLOW-044 | CAP-009 | Member Assignment & Attendance | PROVEN | Active subscription is required to confirm attendance. |
| FLOW-044-RULE-003 | FLOW-044 | CAP-009 | Member Assignment & Attendance | PROVEN | Confirmation is rejected at or after cutoff time. |
| FLOW-044-RULE-004 | FLOW-044 | CAP-009 | Member Assignment & Attendance | PROVEN | Confirmation creates or updates a member booking with `memberAttendanceConfirmedAt`. |
| FLOW-044-RULE-005 | FLOW-044 | CAP-009 | Member Assignment & Attendance | PROVEN | Member booking creation is concurrency protected by transaction/window lock/double-check. |
| FLOW-046-RULE-001 | FLOW-046 | CAP-010 | Member Assignment & Attendance | PROVEN | Member attendance view requires internal/admin branch authorization. |
| FLOW-046-RULE-002 | FLOW-046 | CAP-010 | Member Assignment & Attendance | PROVEN | Attendance roster is built from ACTIVE assignments scheduled for branch-local date weekday. |
| FLOW-046-RULE-003 | FLOW-046 | CAP-010 | Member Assignment & Attendance | PROVEN | Attendance status derives from subscription, booking attendance stamp, booking release status, and cutoff. |
| FLOW-046-RULE-004 | FLOW-046 | CAP-010 | Member Assignment & Attendance | PROVEN | The view is read-only. |
| FLOW-050-RULE-001 | FLOW-050 | CAP-011 | Payment | PROVEN | Creating or retrieving a payment intent requires a verified user JWT. |
| FLOW-050-RULE-002 | FLOW-050 | CAP-011 | Payment | PROVEN | Payment intent creation requires a `bookingId`. |
| FLOW-050-RULE-003 | FLOW-050 | CAP-011 | Payment | PROVEN | At most one active intent record is created per booking reference by this handler; retries return the existing non-captured intent. |
| FLOW-050-RULE-004 | FLOW-050 | CAP-011 | Payment | PROVEN | The caller must own the existing intent or fetched booking to create or retrieve a payment intent. |
| FLOW-050-RULE-005 | FLOW-050 | CAP-011 | Payment | PROVEN | New payment intents can be created only for bookings whose current status is `HELD`. |
| FLOW-050-RULE-006 | FLOW-050 | CAP-011 | Payment | PROVEN | New payment intents can be created only for bookings whose current status is `HELD`. |
| FLOW-050-RULE-007 | FLOW-050 | CAP-011 | Payment | PROVEN | The payment intent amount is derived from the booking's stored price multiplied by 100 and rounded. |
| FLOW-050-RULE-008 | FLOW-050 | CAP-011 | Payment | PROVEN | FLOW-050 does not accept client-supplied amount or currency for intent creation. |
| FLOW-050-RULE-009 | FLOW-050 | CAP-011 | Payment | PROVEN | New payment intents are persisted with status `pending` and purpose `guest_booking`. |
| FLOW-050-RULE-010 | FLOW-050 | CAP-011 | Payment | PROVEN | FLOW-050 is provider-independent at creation time and does not call Razorpay. |
| FLOW-051-RULE-001 | FLOW-051 | CAP-011 | Payment | PROVEN | Creating a payment order requires a verified user JWT. |
| FLOW-051-RULE-002 | FLOW-051 | CAP-011 | Payment | PROVEN | Creating a payment order requires `bookingId`. |
| FLOW-051-RULE-003 | FLOW-051 | CAP-011 | Payment | PROVEN | A payment order can be created only when a local `PaymentIntent` exists for the booking reference. |
| FLOW-051-RULE-004 | FLOW-051 | CAP-011 | Payment | PROVEN | The caller must own the local payment intent. |
| FLOW-051-RULE-005 | FLOW-051 | CAP-011 | Payment | PROVEN | The provider charge amount is the stored `PaymentIntent.amount`, not the client-supplied amount. |
| FLOW-051-RULE-006 | FLOW-051 | CAP-011 | Payment | PROVEN | Stored payment amount must be finite and at least 100 paise before provider order creation. |
| FLOW-051-RULE-007 | FLOW-051 | CAP-011 | Payment | PROVEN | Currency defaults to INR when not supplied by the request. |
| FLOW-051-RULE-008 | FLOW-051 | CAP-011 | Payment | PROVEN | Request receipt is truncated to 40 characters before being sent to Razorpay. |
| FLOW-051-RULE-009 | FLOW-051 | CAP-011 | Payment | PROVEN | Successful order creation stores the Razorpay order id as `PaymentIntent.gatewayRef`. |
| FLOW-051-RULE-010 | FLOW-051 | CAP-011 | Payment | PROVEN | FLOW-051 does not change local `PaymentIntent.status`. |
| FLOW-051-RULE-011 | FLOW-051 | CAP-011 | Payment | PROVEN | FLOW-051 relies on `PaymentIntent.referenceId` as booking linkage and does not read Booking directly. |
| FLOW-052-RULE-001 | FLOW-052 | CAP-011 | Payment | PROVEN | Verify Payment requires a JWT-authenticated caller. |
| FLOW-052-RULE-002 | FLOW-052 | CAP-011 | Payment | PROVEN | The signature payload is the Razorpay order id, a pipe character, and the Razorpay payment id. |
| FLOW-052-RULE-003 | FLOW-052 | CAP-011 | Payment | PROVEN | The signature payload is the Razorpay order id, a pipe character, and the Razorpay payment id. |
| FLOW-052-RULE-004 | FLOW-052 | CAP-011 | Payment | PROVEN | The expected signature is an HMAC-SHA256 hex digest using the configured Razorpay key secret or a hardcoded fallback. |
| FLOW-052-RULE-005 | FLOW-052 | CAP-011 | Payment | PROVEN | A signature mismatch rejects verification with HTTP 400. |
| FLOW-052-RULE-006 | FLOW-052 | CAP-011 | Payment | PROVEN | After signature verification, the local payment intent is looked up by `PaymentIntent.gatewayRef = razorpay_order_id`. |
| FLOW-052-RULE-007 | FLOW-052 | CAP-011 | Payment | PROVEN | Only a matching intent with status `pending` is transitioned to `captured`. |
| FLOW-052-RULE-008 | FLOW-052 | CAP-011 | Payment | DERIVED | When a pending intent is captured, FLOW-052 invokes the booking confirmation boundary using `intent.referenceId`. |
| FLOW-052-RULE-009 | FLOW-052 | CAP-011 | Payment | DERIVED | A valid signature with no matching pending intent returns success without a payment intent update or booking-confirmation call. |
| FLOW-052-RULE-010 | FLOW-052 | CAP-011 | Payment | DERIVED | FLOW-052 authenticates the caller but does not check PaymentIntent ownership or booking ownership in the verify-payment handler. |
| FLOW-053-RULE-001 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | FLOW-053 requires `tenantId`, `userId`, `mandateId`, and `amount`. |
| FLOW-053-RULE-002 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | FLOW-053 stores the provider mandate identifier from the request body as `Subscription.mandateId`. |
| FLOW-053-RULE-003 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | New subscriptions are created with status `active`. |
| FLOW-053-RULE-004 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | New subscriptions default to `monthly` frequency when no frequency is supplied. |
| FLOW-053-RULE-005 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | Subscription amount is sourced from the request body and persisted as `Number(amount)`. |
| FLOW-053-RULE-006 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | Duplicate mandate registration is handled by `upsert` on unique `mandateId` with no update fields. |
| FLOW-053-RULE-007 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | FLOW-053 performs local subscription bookkeeping only and does not call Razorpay. |
| FLOW-053-RULE-008 | FLOW-053 | CAP-011 | Subscription / Autopay | PROVEN | FLOW-053 does not authenticate the caller or bind body `userId`/`tenantId` to a verified identity. |
| FLOW-054-RULE-001 | FLOW-054 | CAP-011 | Payment | PROVEN | Razorpay payment webhooks require a valid `x-razorpay-signature` over the raw request body. |
| FLOW-054-RULE-002 | FLOW-054 | CAP-011 | Payment | PROVEN | The webhook event id is read from `body.id`. |
| FLOW-054-RULE-003 | FLOW-054 | CAP-011 | Payment | PROVEN | A webhook without an event id is rejected before idempotency persistence. |
| FLOW-054-RULE-004 | FLOW-054 | CAP-011 | Payment | PROVEN | Webhook idempotency is enforced by inserting `WebhookEvent.gatewayEventId` before business processing and treating unique-constraint violation as duplicate delivery. |
| FLOW-054-RULE-005 | FLOW-054 | CAP-011 | Payment | PROVEN | Duplicate webhook delivery returns success with `duplicated: true` and skips business processing. |
| FLOW-054-RULE-006 | FLOW-054 | CAP-011 | Payment | PROVEN | `payment.captured` is the only explicitly handled event type in the one-time Razorpay webhook endpoint. |
| FLOW-054-RULE-007 | FLOW-054 | CAP-011 | Payment | PROVEN | For `payment.captured`, PaymentIntent matching checks `gatewayRef` against payment id and optional payment link id. |
| FLOW-054-RULE-008 | FLOW-054 | CAP-011 | Payment | PROVEN | Only a matching pending intent is updated to `captured`. |
| FLOW-054-RULE-009 | FLOW-054 | CAP-011 | Payment | DERIVED | Booking confirmation is triggered only after a matching pending intent is updated to `captured`. |
| FLOW-054-RULE-010 | FLOW-054 | CAP-011 | Payment | DERIVED | Unhandled event types are acknowledged after idempotency recording without payment or booking state changes. |
| FLOW-055-RULE-001 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | Autopay webhooks require a valid Razorpay signature over the raw request body. |
| FLOW-055-RULE-002 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | The webhook event id is read from `body.id`. |
| FLOW-055-RULE-003 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | Idempotency is enforced by inserting `WebhookEvent.gatewayEventId` before business processing. |
| FLOW-055-RULE-004 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | Duplicate autopay webhook deliveries return success with `duplicated: true`. |
| FLOW-055-RULE-005 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | `subscription.charged` creates a captured `subscription_billing` PaymentIntent for a found subscription. |
| FLOW-055-RULE-006 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | `subscription.charge_failed` sets a found local subscription to `suspended`. |
| FLOW-055-RULE-007 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | `subscription.charge_failed` attempts a notification boundary request after suspending the subscription. |
| FLOW-055-RULE-008 | FLOW-055 | CAP-011 | Subscription / Autopay | PROVEN | `subscription.charge_failed` attempts a notification boundary request after suspending the subscription. |
| FLOW-055-RULE-009 | FLOW-055 | CAP-011 | Subscription / Autopay | DERIVED | Notification fetch exceptions do not fail autopay webhook processing. |
| FLOW-055-RULE-010 | FLOW-055 | CAP-011 | Subscription / Autopay | DERIVED | Unhandled autopay event types are acknowledged after idempotency insertion without domain state changes. |
| FLOW-055-RULE-011 | FLOW-055 | CAP-011 | Subscription / Autopay | DERIVED | If an explicitly handled event has no matching subscription, the webhook is acknowledged without subscription, payment intent, or notification effects. |
| FLOW-056-RULE-001 | FLOW-056 | CAP-011 | Negotiated Booking | PROVEN | Payment links can be created only for HELD bookings. |
| FLOW-056-RULE-002 | FLOW-056 | CAP-011 | Negotiated Booking | PROVEN | Payment-link gateway ref is stored as `PaymentIntent.gatewayRef`. |
| FLOW-057-RULE-001 | FLOW-057 | CAP-011 | Negotiated Booking | PROVEN | Browser-negotiated payment-link creation must carry an idempotency key. |
| FLOW-057-RULE-002 | FLOW-057 | CAP-011 | Negotiated Booking | PROVEN | Branch manager JWTs must be scoped to the requested branch unless caller is owner/internal. |
| FLOW-058-RULE-001 | FLOW-058 | CAP-011 | Payment | PROVEN | Simulated capture is unavailable in production. |
| FLOW-058-RULE-002 | FLOW-058 | CAP-011 | Payment | PROVEN | Simulation delegates state mutation to the signed Razorpay webhook endpoint. |
| FLOW-059-RULE-001 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | Refund creation requires `bookingId`. |
| FLOW-059-RULE-002 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | Refund creation trusts Slot Engine booking status/refundAmount read by internal key. |
| FLOW-059-RULE-003 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | Only cancelled bookings can be refunded. |
| FLOW-059-RULE-004 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | Zero/nonpositive refund amount skips refund creation. |
| FLOW-059-RULE-005 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | Captured PaymentIntent for booking is required. |
| FLOW-059-RULE-006 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | Existing Refund by PaymentIntent is idempotently returned. |
| FLOW-059-RULE-007 | FLOW-059 | CAP-012 | Cancellation & Refund | PROVEN | No Razorpay refund provider call occurs. |
| FLOW-060-RULE-001 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Override refund requires admin JWT. |
| FLOW-060-RULE-002 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Admin id is derived from token, not body. |
| FLOW-060-RULE-003 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | `bookingId`, `overrideAmount`, and `reason` are required. |
| FLOW-060-RULE-004 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Booking must be cancelled. |
| FLOW-060-RULE-005 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Captured PaymentIntent is required. |
| FLOW-060-RULE-006 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Existing Refund by PaymentIntent is returned idempotently. |
| FLOW-060-RULE-007 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Override amount cannot exceed original payment amount. |
| FLOW-060-RULE-008 | FLOW-060 | CAP-012 | Cancellation & Refund | PROVEN | Override creates local processed Refund with audit fields and no Razorpay call. |
| FLOW-061-RULE-001 | FLOW-061 | CAP-013 | Notification | PROVEN | Send returns 202 after queueing, before delivery. |
| FLOW-061-RULE-002 | FLOW-061 | CAP-013 | Notification | PROVEN | Unknown event types use `push_or_sms`. |
| FLOW-062-RULE-001 | FLOW-062 | CAP-013 | Notification | PROVEN | One template exists per tenant/channel/event tuple. |
| FLOW-062-RULE-002 | FLOW-062 | CAP-013 | Notification | PROVEN | The observed template flow supports POST upsert only, not read/update/delete endpoints. |
| FLOW-063-RULE-001 | FLOW-063 | CAP-013 | Notification | PROVEN | Device token is globally unique. |
| FLOW-063-RULE-002 | FLOW-063 | CAP-013 | Notification | PROVEN | Re-registering an existing token updates its user association. |
| FLOW-064-RULE-001 | FLOW-064 | CAP-013 | Notification | PROVEN | History is filtered by exact `recipient`, not tenant plus user id. |
| FLOW-064-RULE-002 | FLOW-064 | CAP-013 | Notification | PROVEN | History returns at most 50 rows ordered newest first. |
| FLOW-065-RULE-001 | FLOW-065 | CAP-013 | Notification | PROVEN | Queue worker processes at most 50 due queued requests per call. |
| FLOW-065-RULE-002 | FLOW-065 | CAP-013 | Notification | PROVEN | Attempts 1-3 failures retry; attempt 4 failure is terminal `dead_letter`. |
| FLOW-066-RULE-001 | FLOW-066 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Due jobs claim only enabled rows whose `nextRunAt <= now()` and lock is absent/expired. |
| FLOW-066-RULE-002 | FLOW-066 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Timeout summaries keep the lease until expiry. |
| FLOW-067-RULE-001 | FLOW-067 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Manual execution throws on unknown job name. |
| FLOW-067-RULE-002 | FLOW-067 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Manual execution does not release a claimed due-job lease. |
| FLOW-068-RULE-001 | FLOW-068 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Dispatch dedupe key is `(jobName, dedupKey)`. |
| FLOW-068-RULE-002 | FLOW-068 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Live PENDING duplicates are denied without throwing. |
| FLOW-069-RULE-001 | FLOW-069 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | SENT records dispatch time and clears last error. |
| FLOW-069-RULE-002 | FLOW-069 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | FAILED increments attempts and stores last error. |
| FLOW-070-RULE-001 | FLOW-070 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Health endpoints do not check dependencies; they report process/service/version only. |
| FLOW-070-RULE-002 | FLOW-070 | CAP-014 | Scheduled Operations & Platform Health | PROVEN | Deployment verification fails if any component version does not equal expected SHA. |

## Consolidated Business Rules

Consolidation stance: conservative. Unless Phase 4 or RE-004 identified a cross-flow contextual relationship, one candidate rule maps to one BR to preserve exact lineage for RE-005 and defer authoritative business consolidation to later validation phases.

| BR ID | Title | Domain | Journey | Capabilities | Rule Type | Rule Statement | Source Candidate Rules | Source Flows | Evidence Classification | Consistency Status | Related Uncertainties | Related Rules |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR-001 | Consolidated source rule FLOW-001-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Phone is normalized before OTP persistence. | FLOW-001-RULE-001 | FLOW-001 | PROVEN | CONSISTENT | FLOW-001-UNCERTAINTY-001 | None |
| BR-002 | Consolidated source rule FLOW-001-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: OTP TTL is 5 minutes and request cooldown is 60 seconds. | FLOW-001-RULE-002 | FLOW-001 | PROVEN | CONSISTENT | FLOW-001-UNCERTAINTY-001 | None |
| BR-003 | Consolidated source rule FLOW-002-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Public OTP signup creates `UserType.GUEST`; client cannot choose type. | FLOW-002-RULE-001 | FLOW-002 | PROVEN | CONSISTENT | FLOW-002-UNCERTAINTY-001 | None |
| BR-004 | Consolidated source rule FLOW-002-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Successful verification deletes the OTP before session creation. | FLOW-002-RULE-002 | FLOW-002 | PROVEN | CONSISTENT | FLOW-002-UNCERTAINTY-001 | None |
| BR-005 | Consolidated source rule FLOW-003-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Google login does not create a user. | FLOW-003-RULE-001 | FLOW-003 | PROVEN | CONSISTENT | FLOW-003-UNCERTAINTY-001 | None |
| BR-006 | Consolidated source rule FLOW-003-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: GUEST users cannot use Google login. | FLOW-003-RULE-002 | FLOW-003 | PROVEN | CONSISTENT | FLOW-003-UNCERTAINTY-001 | None |
| BR-007 | Consolidated source rule FLOW-004-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Access token TTL is 15 minutes; refresh cookie/session TTL is renewed to 30 days. | FLOW-004-RULE-001 | FLOW-004 | PROVEN | CONSISTENT | FLOW-004-UNCERTAINTY-001 | None |
| BR-008 | Consolidated source rule FLOW-004-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Refresh recalculates roles through Tenant Management. | FLOW-004-RULE-002 | FLOW-004 | PROVEN | CONSISTENT | FLOW-004-UNCERTAINTY-001 | None |
| BR-009 | Consolidated source rule FLOW-005-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Logout is idempotent from caller perspective. | FLOW-005-RULE-001 | FLOW-005 | PROVEN | CONSISTENT | FLOW-005-UNCERTAINTY-001 | None |
| BR-010 | Consolidated source rule FLOW-005-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Logout revokes by refresh token, not by JWT subject. | FLOW-005-RULE-002 | FLOW-005 | PROVEN | CONSISTENT | FLOW-005-UNCERTAINTY-001 | None |
| BR-011 | Consolidated source rule FLOW-006-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Admin phone lookup is tenant-scoped by JWT tenant claim. | FLOW-006-RULE-001 | FLOW-006 | PROVEN | CONSISTENT | FLOW-006-UNCERTAINTY-001 | None |
| BR-012 | Consolidated source rule FLOW-006-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Phone lookup accepts only numbers normalizing to `+91[6-9]#########`. | FLOW-006-RULE-002 | FLOW-006 | PROVEN | CONSISTENT | FLOW-006-UNCERTAINTY-001 | None |
| BR-013 | Consolidated source rule FLOW-007-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Pending invite uniqueness is `(phone, tenantId)`. | FLOW-007-RULE-001 | FLOW-007 | PROVEN | CONSISTENT | FLOW-007-UNCERTAINTY-001 | None |
| BR-014 | Consolidated source rule FLOW-007-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Duplicate invite resolution is idempotent via upsert. | FLOW-007-RULE-002 | FLOW-007 | PROVEN | CONSISTENT | FLOW-007-UNCERTAINTY-001 | None |
| BR-015 | Consolidated source rule FLOW-008-RULE-001 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: Public clients cannot self-promote user type. | FLOW-008-RULE-001 | FLOW-008 | PROVEN | CONSISTENT | FLOW-008-UNCERTAINTY-001 | None |
| BR-016 | Consolidated source rule FLOW-008-RULE-002 | Identity / Session | Identity & Session | CAP-001 | BUSINESS_RULE | Current executable behaviour: User type is represented by `GUEST`, `MEMBER`, or `STAFF`. | FLOW-008-RULE-002 | FLOW-008 | PROVEN | CONSISTENT | FLOW-008-UNCERTAINTY-001 | None |
| BR-017 | Consolidated source rule FLOW-009-RULE-001 | Role / Admin Access Context | Role & Admin Access Context | CAP-004 | BUSINESS_RULE | Current executable behaviour: OWNER is tenant-scoped and must not carry branch id. | FLOW-009-RULE-001 | FLOW-009 | PROVEN | CONSISTENT | FLOW-009-UNCERTAINTY-001 | None |
| BR-018 | Consolidated source rule FLOW-009-RULE-002 | Role / Admin Access Context | Role & Admin Access Context | CAP-004 | BUSINESS_RULE | Current executable behaviour: Non-owner roles require a branch id that belongs to the tenant. | FLOW-009-RULE-002 | FLOW-009 | PROVEN | CONSISTENT | FLOW-009-UNCERTAINTY-001 | None |
| BR-019 | Consolidated source rule FLOW-010-RULE-001 | Role / Admin Access Context | Role & Admin Access Context | CAP-004 | BUSINESS_RULE | Current executable behaviour: Role claim strings are `owner` or lower-case enum plus branch id. | FLOW-010-RULE-001 | FLOW-010 | PROVEN | CONSISTENT | FLOW-010-UNCERTAINTY-001 | None |
| BR-020 | Consolidated source rule FLOW-010-RULE-002 | Role / Admin Access Context | Role & Admin Access Context | CAP-004 | BUSINESS_RULE | Current executable behaviour: OWNER grants access to all branches in that tenant. | FLOW-010-RULE-002 | FLOW-010 | PROVEN | CONSISTENT | FLOW-010-UNCERTAINTY-001 | None |
| BR-021 | Consolidated source rule FLOW-011-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Tenant subdomain is unique. | FLOW-011-RULE-001 | FLOW-011 | PROVEN | CONSISTENT | FLOW-011-UNCERTAINTY-001 | None |
| BR-022 | Consolidated source rule FLOW-011-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Tenant creation is platform/internal-key gated. | FLOW-011-RULE-002 | FLOW-011 | PROVEN | CONSISTENT | FLOW-011-UNCERTAINTY-001 | None |
| BR-023 | Consolidated source rule FLOW-012-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Tenant update requires owner for same tenant or internal key. | FLOW-012-RULE-001 | FLOW-012 | PROVEN | CONSISTENT | FLOW-012-UNCERTAINTY-001 | None |
| BR-024 | Consolidated source rule FLOW-012-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Tenant about/facilities/photos serve as branch defaults. | FLOW-012-RULE-002 | FLOW-012 | PROVEN | CONSISTENT | FLOW-012-UNCERTAINTY-001 | None |
| BR-025 | Consolidated source rule FLOW-013-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Tenant context is resolved before auth requests. | FLOW-013-RULE-001 | FLOW-013 | PROVEN | CONSISTENT | FLOW-013-UNCERTAINTY-001 | None |
| BR-026 | Consolidated source rule FLOW-013-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Query parameter tenant overrides hostname-derived subdomain. | FLOW-013-RULE-002 | FLOW-013 | PROVEN | CONSISTENT | FLOW-013-UNCERTAINTY-001 | None |
| BR-027 | Consolidated source rule FLOW-014-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: Manifest bypasses the normal response envelope. | FLOW-014-RULE-001 | FLOW-014 | PROVEN | CONSISTENT | FLOW-014-UNCERTAINTY-001 | None |
| BR-028 | Consolidated source rule FLOW-014-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-002 | BUSINESS_RULE | Current executable behaviour: App name falls back to tenant name. | FLOW-014-RULE-002 | FLOW-014 | PROVEN | CONSISTENT | FLOW-014-UNCERTAINTY-001 | None |
| BR-029 | Consolidated source rule FLOW-015-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: New branches start in `DRAFT`. | FLOW-015-RULE-001 | FLOW-015 | PROVEN | CONSISTENT | FLOW-015-UNCERTAINTY-001 | None |
| BR-030 | Consolidated source rule FLOW-015-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Missing branch timezone defaults to `UTC`. | FLOW-015-RULE-002 | FLOW-015 | PROVEN | CONSISTENT | FLOW-015-UNCERTAINTY-001 | None |
| BR-031 | Consolidated source rule FLOW-016-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Status must be one of `DRAFT`, `ACTIVE`, `INACTIVE` when supplied. | FLOW-016-RULE-001 | FLOW-016 | PROVEN | CONSISTENT | FLOW-016-UNCERTAINTY-001 | None |
| BR-032 | Consolidated source rule FLOW-016-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Authorization is against branch's stored tenant id, not body tenant. | FLOW-016-RULE-002 | FLOW-016 | PROVEN | CONSISTENT | FLOW-016-UNCERTAINTY-001 | None |
| BR-033 | Consolidated source rule FLOW-017-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Public branch browse returns only ACTIVE branches. | FLOW-017-RULE-001 | FLOW-017 | PROVEN | CONSISTENT | FLOW-017-UNCERTAINTY-001 | None |
| BR-034 | Consolidated source rule FLOW-017-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Draft inclusion is owner/internal gated but unauthorized attempts do not error. | FLOW-017-RULE-002 | FLOW-017 | PROVEN | CONSISTENT | FLOW-017-UNCERTAINTY-001 | None |
| BR-035 | Consolidated source rule FLOW-018-RULE-001 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Branch about overrides tenant defaults. | FLOW-018-RULE-001 | FLOW-018 | PROVEN | CONSISTENT | FLOW-018-UNCERTAINTY-001 | None |
| BR-036 | Consolidated source rule FLOW-018-RULE-002 | Tenant / Branch Administration | Tenant & Branch Administration | CAP-003 | BUSINESS_RULE | Current executable behaviour: Empty branch facilities/photos fall back to tenant arrays. | FLOW-018-RULE-002 | FLOW-018 | PROVEN | CONSISTENT | FLOW-018-UNCERTAINTY-001 | None |
| BR-037 | Consolidated source rule FLOW-024-RULE-001 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: Availability browsing requires an existing resource pool. | FLOW-024-RULE-001 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-038 | Consolidated source rule FLOW-024-RULE-002 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: Availability browse reach is capped by the first booking rule's `guestOpenWindowDays`, defaulting to 7 days when no rule is present. | FLOW-024-RULE-002 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-039 | Consolidated source rule FLOW-024-RULE-003 | Availability Management | Availability Management | CAP-006 | BUSINESS_RULE | Current executable behaviour: Browsing availability can lazily materialize availability windows before returning them. | FLOW-024-RULE-003 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-040 | Consolidated source rule FLOW-024-RULE-004 | Availability Management | Availability Management | CAP-006 | BUSINESS_RULE | Current executable behaviour: A closed availability override for a date can cause browse availability to return no slots for that generated date. | FLOW-024-RULE-004 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-041 | Consolidated source rule FLOW-024-RULE-005 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: A modified availability override takes precedence over the normal pattern shape for generated browse results on that date. | FLOW-024-RULE-005 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-042 | Consolidated source rule FLOW-024-RULE-006 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: Only active availability patterns matching the generated date's ISO weekday contribute generated browse windows when no closed/modified override applies. | FLOW-024-RULE-006 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-043 | Consolidated source rule FLOW-024-RULE-007 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: Blocked windows remove overlapping availability windows from browse results. | FLOW-024-RULE-007 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-044 | Consolidated source rule FLOW-024-RULE-008 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: Only `HELD` and `CONFIRMED` bookings reduce browse availability capacity. | FLOW-024-RULE-008 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-045 | Consolidated source rule FLOW-024-RULE-009 | Availability Management | Availability Management | CAP-006 | CALCULATION | Current executable behaviour: For pooled pools, a slot is browsable only when `window.capacity - activeBookings.length` is greater than zero. | FLOW-024-RULE-009 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-046 | Consolidated source rule FLOW-024-RULE-010 | Availability Management | Availability Management | CAP-006 | BUSINESS_RULE | Current executable behaviour: For pooled pools, a slot is browsable only when `window.capacity - activeBookings.length` is greater than zero. | FLOW-024-RULE-010 | FLOW-024 | DERIVED | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-047 | Consolidated source rule FLOW-024-RULE-011 | Availability Management | Availability Management | CAP-006 | ACCESS_RULE | Current executable behaviour: Invalid `from` or `to` query values are ignored unless the resulting computed range is invalid. | FLOW-024-RULE-011 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-048 | Consolidated source rule FLOW-024-RULE-012 | Availability Management | Availability Management | CAP-006 | ACCESS_RULE | Current executable behaviour: The API does not require a user JWT or admin authorization to browse resource-pool availability. | FLOW-024-RULE-012 | FLOW-024 | PROVEN | CONSISTENT | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | None |
| BR-049 | Consolidated source rule FLOW-029-RULE-001 | Guest Booking | Guest Booking | CAP-007 | ACCESS_RULE | Current executable behaviour: Self-service booking creation requires a valid JWT with user and tenant identity. | FLOW-029-RULE-001 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-050 | Consolidated source rule FLOW-029-RULE-002 | Guest Booking | Guest Booking | CAP-007 | TECHNICAL_MECHANISM | Current executable behaviour: The booking creator's `userId` and `tenantId` are taken from the JWT, not the request body. | FLOW-029-RULE-002 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-051 | Consolidated source rule FLOW-029-RULE-003 | Guest Booking | Guest Booking | CAP-007 | TECHNICAL_MECHANISM | Current executable behaviour: Self-service booking creation requires an idempotency key. | FLOW-029-RULE-003 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-052 | Consolidated source rule FLOW-029-RULE-004 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Repeated booking creation with the same idempotency key returns the existing booking rather than creating another one. | FLOW-029-RULE-004 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-053 | Consolidated source rule FLOW-029-RULE-005 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: The selected availability window is locked during booking creation before capacity decisions are made. | FLOW-029-RULE-005 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-054 | Consolidated source rule FLOW-029-RULE-006 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Group size is the booking user plus co-player count and must fit the pool's min occupancy and capacity. | FLOW-029-RULE-006 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-055 | Consolidated source rule FLOW-029-RULE-007 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Self-service `POST /bookings` always persists `isMemberBooking: false`. | FLOW-029-RULE-007 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-056 | Consolidated source rule FLOW-029-RULE-008 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Self-service `POST /bookings` always persists `isMemberBooking: false`. | FLOW-029-RULE-008 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-057 | Consolidated source rule FLOW-029-RULE-009 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Overlapping blocked windows prevent booking creation. | FLOW-029-RULE-009 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-058 | Consolidated source rule FLOW-029-RULE-010 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Pooled booking permits creation only while active held/confirmed booking count is below the window capacity. | FLOW-029-RULE-010 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-059 | Consolidated source rule FLOW-029-RULE-011 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Pooled booking permits creation only while active held/confirmed booking count is below the window capacity. | FLOW-029-RULE-011 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-060 | Consolidated source rule FLOW-029-RULE-012 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Self-service booking price is resolved server-side from window override or pool default and is not accepted from the client. | FLOW-029-RULE-012 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-061 | Consolidated source rule FLOW-029-RULE-013 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: New self-service bookings are initially persisted as held bookings with a five-minute hold expiry. | FLOW-029-RULE-013 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-062 | Consolidated source rule FLOW-029-RULE-014 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Valid co-player phones are normalized and persisted as booking players; unresolved player user identity is not assigned during booking creation. | FLOW-029-RULE-014 | FLOW-029 | PROVEN | CONTEXT_DEPENDENT | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | None |
| BR-063 | Consolidated source rule FLOW-030-RULE-001 | Negotiated Booking | Negotiated Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Negotiated bookings are internal-service only and always created as non-member HELD bookings. | FLOW-030-RULE-001 | FLOW-030 | PROVEN | CONTEXT_DEPENDENT | FLOW-030-UNCERTAINTY-001 | None |
| BR-064 | Consolidated source rule FLOW-030-RULE-002 | Negotiated Booking | Negotiated Booking | CAP-007 | CALCULATION | Current executable behaviour: Negotiated booking waives group-size/pricing constraints but not availability, block, or capacity constraints. | FLOW-030-RULE-002 | FLOW-030 | PROVEN | CONTEXT_DEPENDENT | FLOW-030-UNCERTAINTY-001 | None |
| BR-065 | Consolidated source rule FLOW-031-RULE-001 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Single-booking reads require either internal service key or valid JWT. | FLOW-031-RULE-001 | FLOW-031 | PROVEN | CONTEXT_DEPENDENT | FLOW-031-UNCERTAINTY-001 | None |
| BR-066 | Consolidated source rule FLOW-031-RULE-002 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Non-internal booking reads are tenant-scoped. | FLOW-031-RULE-002 | FLOW-031 | PROVEN | CONTEXT_DEPENDENT | FLOW-031-UNCERTAINTY-001 | None |
| BR-067 | Consolidated source rule FLOW-031-RULE-003 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Non-internal booking reads allow booking owner or scoped admin access. | FLOW-031-RULE-003 | FLOW-031 | PROVEN | CONTEXT_DEPENDENT | FLOW-031-UNCERTAINTY-001 | None |
| BR-068 | Consolidated source rule FLOW-031-RULE-004 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Single-booking reads include booking players and the booking window's resource pool. | FLOW-031-RULE-004 | FLOW-031 | PROVEN | CONTEXT_DEPENDENT | FLOW-031-UNCERTAINTY-001 | None |
| BR-069 | Consolidated source rule FLOW-032-RULE-001 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: My-bookings reads require a valid JWT. | FLOW-032-RULE-001 | FLOW-032 | PROVEN | CONTEXT_DEPENDENT | FLOW-032-UNCERTAINTY-001 | None |
| BR-070 | Consolidated source rule FLOW-032-RULE-002 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: My-bookings visibility is scoped by resolved JWT user id. | FLOW-032-RULE-002 | FLOW-032 | PROVEN | CONTEXT_DEPENDENT | FLOW-032-UNCERTAINTY-001 | None |
| BR-071 | Consolidated source rule FLOW-032-RULE-003 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: My-bookings results are ordered by `heldAt` descending. | FLOW-032-RULE-003 | FLOW-032 | PROVEN | CONTEXT_DEPENDENT | FLOW-032-UNCERTAINTY-001 | None |
| BR-072 | Consolidated source rule FLOW-032-RULE-004 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: My-bookings returns all statuses for the user; no status filter is applied. | FLOW-032-RULE-004 | FLOW-032 | PROVEN | CONTEXT_DEPENDENT | FLOW-032-UNCERTAINTY-001 | None |
| BR-073 | Consolidated source rule FLOW-033-RULE-001 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Admin booking list requires internal service key or admin JWT. | FLOW-033-RULE-001 | FLOW-033 | PROVEN | CONTEXT_DEPENDENT | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | None |
| BR-074 | Consolidated source rule FLOW-033-RULE-002 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Admin booking list requires a `userId` query parameter. | FLOW-033-RULE-002 | FLOW-033 | PROVEN | CONTEXT_DEPENDENT | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | None |
| BR-075 | Consolidated source rule FLOW-033-RULE-003 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Optional status query limits candidate bookings by status. | FLOW-033-RULE-003 | FLOW-033 | PROVEN | CONTEXT_DEPENDENT | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | None |
| BR-076 | Consolidated source rule FLOW-033-RULE-004 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Admin booking list filters final results by caller branch authorization. | FLOW-033-RULE-004 | FLOW-033 | PROVEN | CONTEXT_DEPENDENT | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | None |
| BR-077 | Consolidated source rule FLOW-033-RULE-005 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Admin booking list returns newest-held bookings first before branch filtering. | FLOW-033-RULE-005 | FLOW-033 | PROVEN | CONTEXT_DEPENDENT | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | None |
| BR-078 | Consolidated source rule FLOW-034-RULE-001 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Booking confirmation is an internal-service-key protected operation. | FLOW-034-RULE-001 | FLOW-034 | PROVEN | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-079 | Consolidated source rule FLOW-034-RULE-002 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: FLOW-034 identifies the target booking only by the `:id` path parameter. | FLOW-034-RULE-002 | FLOW-034 | PROVEN | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-080 | Consolidated source rule FLOW-034-RULE-003 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: A missing booking fails confirmation with HTTP 404. | FLOW-034-RULE-003 | FLOW-034 | PROVEN | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-081 | Consolidated source rule FLOW-034-RULE-004 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: An already-confirmed booking is returned unchanged. | FLOW-034-RULE-004 | FLOW-034 | PROVEN | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-082 | Consolidated source rule FLOW-034-RULE-005 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Only a `HELD` booking is eligible for the confirming update. | FLOW-034-RULE-005 | FLOW-034 | PROVEN | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-083 | Consolidated source rule FLOW-034-RULE-006 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: FLOW-034 changes a held booking's status to `CONFIRMED`. | FLOW-034-RULE-006 | FLOW-034 | DERIVED | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-084 | Consolidated source rule FLOW-034-RULE-007 | Guest Booking | Guest Booking | CAP-007 | ACCESS_RULE | Current executable behaviour: FLOW-034 does not enforce hold-expiry validity before confirming. | FLOW-034-RULE-007 | FLOW-034 | DERIVED | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-085 | Consolidated source rule FLOW-034-RULE-008 | Guest Booking | Guest Booking | CAP-007 | ACCESS_RULE | Current executable behaviour: FLOW-034 does not verify payment state or payment proof; the payment trust boundary is the authenticated internal caller. | FLOW-034-RULE-008 | FLOW-034 | DERIVED | CONTEXT_DEPENDENT | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | None |
| BR-086 | Consolidated source rule FLOW-035-RULE-001 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Check-in targets a booking by route path id. | FLOW-035-RULE-001 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-087 | Consolidated source rule FLOW-035-RULE-002 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Missing booking fails check-in with HTTP 404. | FLOW-035-RULE-002 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-088 | Consolidated source rule FLOW-035-RULE-003 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Already checked-in bookings are returned unchanged. | FLOW-035-RULE-003 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-089 | Consolidated source rule FLOW-035-RULE-004 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Only confirmed bookings are eligible to transition to checked in. | FLOW-035-RULE-004 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-090 | Consolidated source rule FLOW-035-RULE-005 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: FLOW-035 updates only `Booking.status` explicitly. | FLOW-035-RULE-005 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-091 | Consolidated source rule FLOW-035-RULE-006 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: The server-side check-in endpoint does not enforce caller authentication or ownership. | FLOW-035-RULE-006 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-092 | Consolidated source rule FLOW-035-RULE-007 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Check-in timing is a client-side display condition in the PWA, not a server-side precondition in FLOW-035. | FLOW-035-RULE-007 | FLOW-035 | PROVEN | CONSISTENT | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | None |
| BR-093 | Consolidated source rule FLOW-036-RULE-001 | Guest Booking | Guest Booking | CAP-007 | ACCESS_RULE | Current executable behaviour: Preview requires internal key or JWT with booking access. | FLOW-036-RULE-001 | FLOW-036 | PROVEN | CONTEXT_DEPENDENT | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | None |
| BR-094 | Consolidated source rule FLOW-036-RULE-002 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Preview is allowed only for `HELD`, `CONFIRMED`, or `CANCELLED`. | FLOW-036-RULE-002 | FLOW-036 | PROVEN | CONTEXT_DEPENDENT | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | None |
| BR-095 | Consolidated source rule FLOW-036-RULE-003 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Cancelled preview uses stored `booking.refundAmount`. | FLOW-036-RULE-003 | FLOW-036 | PROVEN | CONTEXT_DEPENDENT | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | None |
| BR-096 | Consolidated source rule FLOW-036-RULE-004 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Confirmed preview uses oldest booking rule's tiered cancellation policy and current hours before slot. | FLOW-036-RULE-004 | FLOW-036 | PROVEN | CONTEXT_DEPENDENT | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | None |
| BR-097 | Consolidated source rule FLOW-036-RULE-005 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Held preview returns 100% of booking price. | FLOW-036-RULE-005 | FLOW-036 | PROVEN | CONTEXT_DEPENDENT | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | None |
| BR-098 | Consolidated source rule FLOW-036-RULE-006 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Preview performs no persisted write. | FLOW-036-RULE-006 | FLOW-036 | PROVEN | CONTEXT_DEPENDENT | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | None |
| BR-099 | Consolidated source rule FLOW-037-RULE-001 | Guest Booking | Guest Booking | CAP-007 | ACCESS_RULE | Current executable behaviour: Cancellation requires internal key or JWT booking access. | FLOW-037-RULE-001 | FLOW-037 | PROVEN | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-100 | Consolidated source rule FLOW-037-RULE-002 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: `CANCELLED` cancellation is idempotent. | FLOW-037-RULE-002 | FLOW-037 | PROVEN | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-101 | Consolidated source rule FLOW-037-RULE-003 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Only `HELD` and `CONFIRMED` are active cancellable source states. | FLOW-037-RULE-003 | FLOW-037 | PROVEN | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-102 | Consolidated source rule FLOW-037-RULE-004 | Guest Booking | Guest Booking | CAP-007 | STATE_GUARD | Current executable behaviour: Confirmed cancellation recomputes tiered refund using booking rule and hours before slot. | FLOW-037-RULE-004 | FLOW-037 | PROVEN | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-103 | Consolidated source rule FLOW-037-RULE-005 | Guest Booking | Guest Booking | CAP-007 | CALCULATION | Current executable behaviour: Held cancellation persists `refundAmount: null`. | FLOW-037-RULE-005 | FLOW-037 | PROVEN | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-104 | Consolidated source rule FLOW-037-RULE-006 | Guest Booking | Guest Booking | CAP-007 | BUSINESS_RULE | Current executable behaviour: Cancellation does not invoke refund creation. | FLOW-037-RULE-006 | FLOW-037 | PROVEN | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-105 | Consolidated source rule FLOW-037-RULE-007 | Guest Booking | Guest Booking | CAP-007 | TECHNICAL_MECHANISM | Current executable behaviour: Cancellation has no explicit DB transaction/locking. | FLOW-037-RULE-007 | FLOW-037 | DERIVED | CONTEXT_DEPENDENT | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | None |
| BR-106 | Consolidated source rule FLOW-040-RULE-001 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | ACCESS_RULE | Current executable behaviour: Assignment creation requires internal/admin access scoped to the resource pool. | FLOW-040-RULE-001 | FLOW-040 | PROVEN | CONSISTENT | FLOW-040-UNCERTAINTY-001 | None |
| BR-107 | Consolidated source rule FLOW-040-RULE-002 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | CALCULATION | Current executable behaviour: `userId`, `resourcePoolId`, `daysOfWeek`, and `startTime` are required. | FLOW-040-RULE-002 | FLOW-040 | PROVEN | CONSISTENT | FLOW-040-UNCERTAINTY-001 | None |
| BR-108 | Consolidated source rule FLOW-040-RULE-003 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: New assignments are created as `ACTIVE`. | FLOW-040-RULE-003 | FLOW-040 | PROVEN | CONSISTENT | FLOW-040-UNCERTAINTY-001 | None |
| BR-109 | Consolidated source rule FLOW-040-RULE-004 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: Duplicate active/same-pool assignment is surfaced as 409. | FLOW-040-RULE-004 | FLOW-040 | PROVEN | CONSISTENT | FLOW-040-UNCERTAINTY-001 | None |
| BR-110 | Consolidated source rule FLOW-041-RULE-001 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | ACCESS_RULE | Current executable behaviour: Assignment listing requires internal/admin auth. | FLOW-041-RULE-001 | FLOW-041 | PROVEN | CONSISTENT | FLOW-041-UNCERTAINTY-001 | None |
| BR-111 | Consolidated source rule FLOW-041-RULE-002 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: Branch managers are restricted to resource pools in claimed branches. | FLOW-041-RULE-002 | FLOW-041 | PROVEN | CONSISTENT | FLOW-041-UNCERTAINTY-001 | None |
| BR-112 | Consolidated source rule FLOW-041-RULE-003 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: Listing can filter by `resourcePoolId` and `userId`. | FLOW-041-RULE-003 | FLOW-041 | PROVEN | CONSISTENT | FLOW-041-UNCERTAINTY-001 | None |
| BR-113 | Consolidated source rule FLOW-041-RULE-004 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: Listing enriches assignments with tenant-matched user/member data. | FLOW-041-RULE-004 | FLOW-041 | PROVEN | CONSISTENT | FLOW-041-UNCERTAINTY-001 | None |
| BR-114 | Consolidated source rule FLOW-042-RULE-001 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | STATE_GUARD | Current executable behaviour: Only `ACTIVE` and `SUSPENDED` statuses are accepted. | FLOW-042-RULE-001 | FLOW-042 | PROVEN | CONSISTENT | FLOW-042-UNCERTAINTY-001 | None |
| BR-115 | Consolidated source rule FLOW-042-RULE-002 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | ACCESS_RULE | Current executable behaviour: Assignment update requires pool-scoped internal/admin access. | FLOW-042-RULE-002 | FLOW-042 | PROVEN | CONSISTENT | FLOW-042-UNCERTAINTY-001 | None |
| BR-116 | Consolidated source rule FLOW-042-RULE-003 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | TECHNICAL_MECHANISM | Current executable behaviour: Updating to ACTIVE can conflict with one-active-assignment uniqueness. | FLOW-042-RULE-003 | FLOW-042 | PROVEN | CONSISTENT | FLOW-042-UNCERTAINTY-001 | None |
| BR-117 | Consolidated source rule FLOW-042-RULE-004 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | STATE_GUARD | Current executable behaviour: Status update does not mutate existing member bookings. | FLOW-042-RULE-004 | FLOW-042 | DERIVED | CONSISTENT | FLOW-042-UNCERTAINTY-001 | None |
| BR-118 | Consolidated source rule FLOW-043-RULE-001 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | ACCESS_RULE | Current executable behaviour: Today assignment view requires MEMBER JWT. | FLOW-043-RULE-001 | FLOW-043 | PROVEN | CONSISTENT | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | None |
| BR-119 | Consolidated source rule FLOW-043-RULE-002 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | ACCESS_RULE | Current executable behaviour: Active assignment is scoped by JWT user id and tenant id. | FLOW-043-RULE-002 | FLOW-043 | PROVEN | CONSISTENT | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | None |
| BR-120 | Consolidated source rule FLOW-043-RULE-003 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: Assignment day matching uses branch-local ISO weekday. | FLOW-043-RULE-003 | FLOW-043 | PROVEN | CONSISTENT | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | None |
| BR-121 | Consolidated source rule FLOW-043-RULE-004 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | CALCULATION | Current executable behaviour: `canConfirm` is true only when no booking exists, subscription is active, and now is before cutoff. | FLOW-043-RULE-004 | FLOW-043 | PROVEN | CONSISTENT | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | None |
| BR-122 | Consolidated source rule FLOW-044-RULE-001 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | ACCESS_RULE | Current executable behaviour: Confirm requires MEMBER JWT and ignores body identity. | FLOW-044-RULE-001 | FLOW-044 | PROVEN | CONTEXT_DEPENDENT | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | None |
| BR-123 | Consolidated source rule FLOW-044-RULE-002 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | BUSINESS_RULE | Current executable behaviour: Active subscription is required to confirm attendance. | FLOW-044-RULE-002 | FLOW-044 | PROVEN | CONTEXT_DEPENDENT | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | None |
| BR-124 | Consolidated source rule FLOW-044-RULE-003 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | CALCULATION | Current executable behaviour: Confirmation is rejected at or after cutoff time. | FLOW-044-RULE-003 | FLOW-044 | PROVEN | CONTEXT_DEPENDENT | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | None |
| BR-125 | Consolidated source rule FLOW-044-RULE-004 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | STATE_GUARD | Current executable behaviour: Confirmation creates or updates a member booking with `memberAttendanceConfirmedAt`. | FLOW-044-RULE-004 | FLOW-044 | PROVEN | CONTEXT_DEPENDENT | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | None |
| BR-126 | Consolidated source rule FLOW-044-RULE-005 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-009 | CALCULATION | Current executable behaviour: Member booking creation is concurrency protected by transaction/window lock/double-check. | FLOW-044-RULE-005 | FLOW-044 | PROVEN | CONTEXT_DEPENDENT | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | None |
| BR-127 | Consolidated source rule FLOW-046-RULE-001 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-010 | ACCESS_RULE | Current executable behaviour: Member attendance view requires internal/admin branch authorization. | FLOW-046-RULE-001 | FLOW-046 | PROVEN | CONSISTENT | FLOW-046-UNCERTAINTY-001 | None |
| BR-128 | Consolidated source rule FLOW-046-RULE-002 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-010 | BUSINESS_RULE | Current executable behaviour: Attendance roster is built from ACTIVE assignments scheduled for branch-local date weekday. | FLOW-046-RULE-002 | FLOW-046 | PROVEN | CONSISTENT | FLOW-046-UNCERTAINTY-001 | None |
| BR-129 | Consolidated source rule FLOW-046-RULE-003 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-010 | CALCULATION | Current executable behaviour: Attendance status derives from subscription, booking attendance stamp, booking release status, and cutoff. | FLOW-046-RULE-003 | FLOW-046 | PROVEN | CONSISTENT | FLOW-046-UNCERTAINTY-001 | None |
| BR-130 | Consolidated source rule FLOW-046-RULE-004 | Member Assignment / Attendance | Member Assignment & Attendance | CAP-010 | STATE_GUARD | Current executable behaviour: The view is read-only. | FLOW-046-RULE-004 | FLOW-046 | PROVEN | CONSISTENT | FLOW-046-UNCERTAINTY-001 | None |
| BR-131 | Consolidated source rule FLOW-050-RULE-001 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: Creating or retrieving a payment intent requires a verified user JWT. | FLOW-050-RULE-001 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-132 | Consolidated source rule FLOW-050-RULE-002 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Payment intent creation requires a `bookingId`. | FLOW-050-RULE-002 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-133 | Consolidated source rule FLOW-050-RULE-003 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: At most one active intent record is created per booking reference by this handler; retries return the existing non-captured intent. | FLOW-050-RULE-003 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-134 | Consolidated source rule FLOW-050-RULE-004 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: The caller must own the existing intent or fetched booking to create or retrieve a payment intent. | FLOW-050-RULE-004 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-135 | Consolidated source rule FLOW-050-RULE-005 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: New payment intents can be created only for bookings whose current status is `HELD`. | FLOW-050-RULE-005 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-136 | Consolidated source rule FLOW-050-RULE-006 | Payment | Payment | CAP-011 | CALCULATION | Current executable behaviour: New payment intents can be created only for bookings whose current status is `HELD`. | FLOW-050-RULE-006 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-137 | Consolidated source rule FLOW-050-RULE-007 | Payment | Payment | CAP-011 | CALCULATION | Current executable behaviour: The payment intent amount is derived from the booking's stored price multiplied by 100 and rounded. | FLOW-050-RULE-007 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-138 | Consolidated source rule FLOW-050-RULE-008 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: FLOW-050 does not accept client-supplied amount or currency for intent creation. | FLOW-050-RULE-008 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-139 | Consolidated source rule FLOW-050-RULE-009 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: New payment intents are persisted with status `pending` and purpose `guest_booking`. | FLOW-050-RULE-009 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-140 | Consolidated source rule FLOW-050-RULE-010 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-050 is provider-independent at creation time and does not call Razorpay. | FLOW-050-RULE-010 | FLOW-050 | PROVEN | CONSISTENT | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | None |
| BR-141 | Consolidated source rule FLOW-051-RULE-001 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: Creating a payment order requires a verified user JWT. | FLOW-051-RULE-001 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-142 | Consolidated source rule FLOW-051-RULE-002 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Creating a payment order requires `bookingId`. | FLOW-051-RULE-002 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-143 | Consolidated source rule FLOW-051-RULE-003 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: A payment order can be created only when a local `PaymentIntent` exists for the booking reference. | FLOW-051-RULE-003 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-144 | Consolidated source rule FLOW-051-RULE-004 | Payment | Payment | CAP-011 | CALCULATION | Current executable behaviour: The caller must own the local payment intent. | FLOW-051-RULE-004 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-145 | Consolidated source rule FLOW-051-RULE-005 | Payment | Payment | CAP-011 | CALCULATION | Current executable behaviour: The provider charge amount is the stored `PaymentIntent.amount`, not the client-supplied amount. | FLOW-051-RULE-005 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-146 | Consolidated source rule FLOW-051-RULE-006 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: Stored payment amount must be finite and at least 100 paise before provider order creation. | FLOW-051-RULE-006 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-147 | Consolidated source rule FLOW-051-RULE-007 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Currency defaults to INR when not supplied by the request. | FLOW-051-RULE-007 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-148 | Consolidated source rule FLOW-051-RULE-008 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: Request receipt is truncated to 40 characters before being sent to Razorpay. | FLOW-051-RULE-008 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-149 | Consolidated source rule FLOW-051-RULE-009 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Successful order creation stores the Razorpay order id as `PaymentIntent.gatewayRef`. | FLOW-051-RULE-009 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-150 | Consolidated source rule FLOW-051-RULE-010 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-051 does not change local `PaymentIntent.status`. | FLOW-051-RULE-010 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-151 | Consolidated source rule FLOW-051-RULE-011 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-051 relies on `PaymentIntent.referenceId` as booking linkage and does not read Booking directly. | FLOW-051-RULE-011 | FLOW-051 | PROVEN | CONSISTENT | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | None |
| BR-152 | Consolidated source rule FLOW-052-RULE-001 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Verify Payment requires a JWT-authenticated caller. | FLOW-052-RULE-001 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-153 | Consolidated source rule FLOW-052-RULE-002 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: The signature payload is the Razorpay order id, a pipe character, and the Razorpay payment id. | FLOW-052-RULE-002 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003 | None |
| BR-154 | Consolidated source rule FLOW-052-RULE-003 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: The signature payload is the Razorpay order id, a pipe character, and the Razorpay payment id. | FLOW-052-RULE-003 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-155 | Consolidated source rule FLOW-052-RULE-004 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: The expected signature is an HMAC-SHA256 hex digest using the configured Razorpay key secret or a hardcoded fallback. | FLOW-052-RULE-004 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-156 | Consolidated source rule FLOW-052-RULE-005 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: A signature mismatch rejects verification with HTTP 400. | FLOW-052-RULE-005 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-157 | Consolidated source rule FLOW-052-RULE-006 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: After signature verification, the local payment intent is looked up by `PaymentIntent.gatewayRef = razorpay_order_id`. | FLOW-052-RULE-006 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-158 | Consolidated source rule FLOW-052-RULE-007 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Only a matching intent with status `pending` is transitioned to `captured`. | FLOW-052-RULE-007 | FLOW-052 | PROVEN | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-159 | Consolidated source rule FLOW-052-RULE-008 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: When a pending intent is captured, FLOW-052 invokes the booking confirmation boundary using `intent.referenceId`. | FLOW-052-RULE-008 | FLOW-052 | DERIVED | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-160 | Consolidated source rule FLOW-052-RULE-009 | Payment | Payment | CAP-011 | ACCESS_RULE | Current executable behaviour: A valid signature with no matching pending intent returns success without a payment intent update or booking-confirmation call. | FLOW-052-RULE-009 | FLOW-052 | DERIVED | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | None |
| BR-161 | Consolidated source rule FLOW-052-RULE-010 | Payment | Payment | CAP-011 | ACCESS_RULE | Current executable behaviour: FLOW-052 authenticates the caller but does not check PaymentIntent ownership or booking ownership in the verify-payment handler. | FLOW-052-RULE-010 | FLOW-052 | DERIVED | CONTEXT_DEPENDENT | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003 | None |
| BR-162 | Consolidated source rule FLOW-053-RULE-001 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-053 requires `tenantId`, `userId`, `mandateId`, and `amount`. | FLOW-053-RULE-001 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-163 | Consolidated source rule FLOW-053-RULE-002 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-053 stores the provider mandate identifier from the request body as `Subscription.mandateId`. | FLOW-053-RULE-002 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-164 | Consolidated source rule FLOW-053-RULE-003 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: New subscriptions are created with status `active`. | FLOW-053-RULE-003 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-165 | Consolidated source rule FLOW-053-RULE-004 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: New subscriptions default to `monthly` frequency when no frequency is supplied. | FLOW-053-RULE-004 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-166 | Consolidated source rule FLOW-053-RULE-005 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: Subscription amount is sourced from the request body and persisted as `Number(amount)`. | FLOW-053-RULE-005 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-167 | Consolidated source rule FLOW-053-RULE-006 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: Duplicate mandate registration is handled by `upsert` on unique `mandateId` with no update fields. | FLOW-053-RULE-006 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-168 | Consolidated source rule FLOW-053-RULE-007 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-053 performs local subscription bookkeeping only and does not call Razorpay. | FLOW-053-RULE-007 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-169 | Consolidated source rule FLOW-053-RULE-008 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: FLOW-053 does not authenticate the caller or bind body `userId`/`tenantId` to a verified identity. | FLOW-053-RULE-008 | FLOW-053 | PROVEN | CONTEXT_DEPENDENT | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | None |
| BR-170 | Consolidated source rule FLOW-054-RULE-001 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Razorpay payment webhooks require a valid `x-razorpay-signature` over the raw request body. | FLOW-054-RULE-001 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-171 | Consolidated source rule FLOW-054-RULE-002 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: The webhook event id is read from `body.id`. | FLOW-054-RULE-002 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-172 | Consolidated source rule FLOW-054-RULE-003 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: A webhook without an event id is rejected before idempotency persistence. | FLOW-054-RULE-003 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-173 | Consolidated source rule FLOW-054-RULE-004 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Webhook idempotency is enforced by inserting `WebhookEvent.gatewayEventId` before business processing and treating unique-constraint violation as duplicate delivery. | FLOW-054-RULE-004 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-174 | Consolidated source rule FLOW-054-RULE-005 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Duplicate webhook delivery returns success with `duplicated: true` and skips business processing. | FLOW-054-RULE-005 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-175 | Consolidated source rule FLOW-054-RULE-006 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: `payment.captured` is the only explicitly handled event type in the one-time Razorpay webhook endpoint. | FLOW-054-RULE-006 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-176 | Consolidated source rule FLOW-054-RULE-007 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: For `payment.captured`, PaymentIntent matching checks `gatewayRef` against payment id and optional payment link id. | FLOW-054-RULE-007 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-177 | Consolidated source rule FLOW-054-RULE-008 | Payment | Payment | CAP-011 | STATE_GUARD | Current executable behaviour: Only a matching pending intent is updated to `captured`. | FLOW-054-RULE-008 | FLOW-054 | PROVEN | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-178 | Consolidated source rule FLOW-054-RULE-009 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Booking confirmation is triggered only after a matching pending intent is updated to `captured`. | FLOW-054-RULE-009 | FLOW-054 | DERIVED | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-179 | Consolidated source rule FLOW-054-RULE-010 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Unhandled event types are acknowledged after idempotency recording without payment or booking state changes. | FLOW-054-RULE-010 | FLOW-054 | DERIVED | CONTEXT_DEPENDENT | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | None |
| BR-180 | Consolidated source rule FLOW-055-RULE-001 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Autopay webhooks require a valid Razorpay signature over the raw request body. | FLOW-055-RULE-001 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-181 | Consolidated source rule FLOW-055-RULE-002 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: The webhook event id is read from `body.id`. | FLOW-055-RULE-002 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-182 | Consolidated source rule FLOW-055-RULE-003 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Idempotency is enforced by inserting `WebhookEvent.gatewayEventId` before business processing. | FLOW-055-RULE-003 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-183 | Consolidated source rule FLOW-055-RULE-004 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: Duplicate autopay webhook deliveries return success with `duplicated: true`. | FLOW-055-RULE-004 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-184 | Consolidated source rule FLOW-055-RULE-005 | Subscription / Autopay | Subscription / Autopay | CAP-011 | STATE_GUARD | Current executable behaviour: `subscription.charged` creates a captured `subscription_billing` PaymentIntent for a found subscription. | FLOW-055-RULE-005 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003 | None |
| BR-185 | Consolidated source rule FLOW-055-RULE-006 | Subscription / Autopay | Subscription / Autopay | CAP-011 | BUSINESS_RULE | Current executable behaviour: `subscription.charge_failed` sets a found local subscription to `suspended`. | FLOW-055-RULE-006 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003 | None |
| BR-186 | Consolidated source rule FLOW-055-RULE-007 | Subscription / Autopay | Subscription / Autopay | CAP-011 | STATE_GUARD | Current executable behaviour: `subscription.charge_failed` attempts a notification boundary request after suspending the subscription. | FLOW-055-RULE-007 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003 | None |
| BR-187 | Consolidated source rule FLOW-055-RULE-008 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: `subscription.charge_failed` attempts a notification boundary request after suspending the subscription. | FLOW-055-RULE-008 | FLOW-055 | PROVEN | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-188 | Consolidated source rule FLOW-055-RULE-009 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Notification fetch exceptions do not fail autopay webhook processing. | FLOW-055-RULE-009 | FLOW-055 | DERIVED | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-189 | Consolidated source rule FLOW-055-RULE-010 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Unhandled autopay event types are acknowledged after idempotency insertion without domain state changes. | FLOW-055-RULE-010 | FLOW-055 | DERIVED | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | None |
| BR-190 | Consolidated source rule FLOW-055-RULE-011 | Subscription / Autopay | Subscription / Autopay | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: If an explicitly handled event has no matching subscription, the webhook is acknowledged without subscription, payment intent, or notification effects. | FLOW-055-RULE-011 | FLOW-055 | DERIVED | CONTEXT_DEPENDENT | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003 | None |
| BR-191 | Consolidated source rule FLOW-056-RULE-001 | Negotiated Booking | Negotiated Booking | CAP-011 | STATE_GUARD | Current executable behaviour: Payment links can be created only for HELD bookings. | FLOW-056-RULE-001 | FLOW-056 | PROVEN | CONSISTENT | FLOW-056-UNCERTAINTY-001 | None |
| BR-192 | Consolidated source rule FLOW-056-RULE-002 | Negotiated Booking | Negotiated Booking | CAP-011 | BUSINESS_RULE | Current executable behaviour: Payment-link gateway ref is stored as `PaymentIntent.gatewayRef`. | FLOW-056-RULE-002 | FLOW-056 | PROVEN | CONSISTENT | FLOW-056-UNCERTAINTY-001 | None |
| BR-193 | Consolidated source rule FLOW-057-RULE-001 | Negotiated Booking | Negotiated Booking | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Browser-negotiated payment-link creation must carry an idempotency key. | FLOW-057-RULE-001 | FLOW-057 | PROVEN | CONTEXT_DEPENDENT | FLOW-057-UNCERTAINTY-001 | None |
| BR-194 | Consolidated source rule FLOW-057-RULE-002 | Negotiated Booking | Negotiated Booking | CAP-011 | ACCESS_RULE | Current executable behaviour: Branch manager JWTs must be scoped to the requested branch unless caller is owner/internal. | FLOW-057-RULE-002 | FLOW-057 | PROVEN | CONTEXT_DEPENDENT | FLOW-057-UNCERTAINTY-001 | None |
| BR-195 | Consolidated source rule FLOW-058-RULE-001 | Payment | Payment | CAP-011 | BUSINESS_RULE | Current executable behaviour: Simulated capture is unavailable in production. | FLOW-058-RULE-001 | FLOW-058 | PROVEN | CONSISTENT | FLOW-058-UNCERTAINTY-001 | None |
| BR-196 | Consolidated source rule FLOW-058-RULE-002 | Payment | Payment | CAP-011 | TECHNICAL_MECHANISM | Current executable behaviour: Simulation delegates state mutation to the signed Razorpay webhook endpoint. | FLOW-058-RULE-002 | FLOW-058 | PROVEN | CONSISTENT | FLOW-058-UNCERTAINTY-001 | None |
| BR-197 | Consolidated source rule FLOW-059-RULE-001 | Cancellation / Refund | Cancellation & Refund | CAP-012 | BUSINESS_RULE | Current executable behaviour: Refund creation requires `bookingId`. | FLOW-059-RULE-001 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-198 | Consolidated source rule FLOW-059-RULE-002 | Cancellation / Refund | Cancellation & Refund | CAP-012 | ACCESS_RULE | Current executable behaviour: Refund creation trusts Slot Engine booking status/refundAmount read by internal key. | FLOW-059-RULE-002 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-199 | Consolidated source rule FLOW-059-RULE-003 | Cancellation / Refund | Cancellation & Refund | CAP-012 | STATE_GUARD | Current executable behaviour: Only cancelled bookings can be refunded. | FLOW-059-RULE-003 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-200 | Consolidated source rule FLOW-059-RULE-004 | Cancellation / Refund | Cancellation & Refund | CAP-012 | CALCULATION | Current executable behaviour: Zero/nonpositive refund amount skips refund creation. | FLOW-059-RULE-004 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-201 | Consolidated source rule FLOW-059-RULE-005 | Cancellation / Refund | Cancellation & Refund | CAP-012 | STATE_GUARD | Current executable behaviour: Captured PaymentIntent for booking is required. | FLOW-059-RULE-005 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-202 | Consolidated source rule FLOW-059-RULE-006 | Cancellation / Refund | Cancellation & Refund | CAP-012 | BUSINESS_RULE | Current executable behaviour: Existing Refund by PaymentIntent is idempotently returned. | FLOW-059-RULE-006 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-203 | Consolidated source rule FLOW-059-RULE-007 | Cancellation / Refund | Cancellation & Refund | CAP-012 | BUSINESS_RULE | Current executable behaviour: No Razorpay refund provider call occurs. | FLOW-059-RULE-007 | FLOW-059 | PROVEN | CONTEXT_DEPENDENT | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | None |
| BR-204 | Consolidated source rule FLOW-060-RULE-001 | Cancellation / Refund | Cancellation & Refund | CAP-012 | ACCESS_RULE | Current executable behaviour: Override refund requires admin JWT. | FLOW-060-RULE-001 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-205 | Consolidated source rule FLOW-060-RULE-002 | Cancellation / Refund | Cancellation & Refund | CAP-012 | BUSINESS_RULE | Current executable behaviour: Admin id is derived from token, not body. | FLOW-060-RULE-002 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-206 | Consolidated source rule FLOW-060-RULE-003 | Cancellation / Refund | Cancellation & Refund | CAP-012 | CALCULATION | Current executable behaviour: `bookingId`, `overrideAmount`, and `reason` are required. | FLOW-060-RULE-003 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-207 | Consolidated source rule FLOW-060-RULE-004 | Cancellation / Refund | Cancellation & Refund | CAP-012 | STATE_GUARD | Current executable behaviour: Booking must be cancelled. | FLOW-060-RULE-004 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-208 | Consolidated source rule FLOW-060-RULE-005 | Cancellation / Refund | Cancellation & Refund | CAP-012 | STATE_GUARD | Current executable behaviour: Captured PaymentIntent is required. | FLOW-060-RULE-005 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-209 | Consolidated source rule FLOW-060-RULE-006 | Cancellation / Refund | Cancellation & Refund | CAP-012 | BUSINESS_RULE | Current executable behaviour: Existing Refund by PaymentIntent is returned idempotently. | FLOW-060-RULE-006 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-210 | Consolidated source rule FLOW-060-RULE-007 | Cancellation / Refund | Cancellation & Refund | CAP-012 | CALCULATION | Current executable behaviour: Override amount cannot exceed original payment amount. | FLOW-060-RULE-007 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-211 | Consolidated source rule FLOW-060-RULE-008 | Cancellation / Refund | Cancellation & Refund | CAP-012 | BUSINESS_RULE | Current executable behaviour: Override creates local processed Refund with audit fields and no Razorpay call. | FLOW-060-RULE-008 | FLOW-060 | PROVEN | CONTEXT_DEPENDENT | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | None |
| BR-212 | Consolidated source rule FLOW-061-RULE-001 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: Send returns 202 after queueing, before delivery. | FLOW-061-RULE-001 | FLOW-061 | PROVEN | CONTEXT_DEPENDENT | FLOW-061-UNCERTAINTY-001 | None |
| BR-213 | Consolidated source rule FLOW-061-RULE-002 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: Unknown event types use `push_or_sms`. | FLOW-061-RULE-002 | FLOW-061 | PROVEN | CONTEXT_DEPENDENT | FLOW-061-UNCERTAINTY-001 | None |
| BR-214 | Consolidated source rule FLOW-062-RULE-001 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: One template exists per tenant/channel/event tuple. | FLOW-062-RULE-001 | FLOW-062 | PROVEN | CONSISTENT | FLOW-062-UNCERTAINTY-001 | None |
| BR-215 | Consolidated source rule FLOW-062-RULE-002 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: The observed template flow supports POST upsert only, not read/update/delete endpoints. | FLOW-062-RULE-002 | FLOW-062 | PROVEN | CONSISTENT | FLOW-062-UNCERTAINTY-001 | None |
| BR-216 | Consolidated source rule FLOW-063-RULE-001 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: Device token is globally unique. | FLOW-063-RULE-001 | FLOW-063 | PROVEN | CONSISTENT | FLOW-063-UNCERTAINTY-001 | None |
| BR-217 | Consolidated source rule FLOW-063-RULE-002 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: Re-registering an existing token updates its user association. | FLOW-063-RULE-002 | FLOW-063 | PROVEN | CONSISTENT | FLOW-063-UNCERTAINTY-001 | None |
| BR-218 | Consolidated source rule FLOW-064-RULE-001 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: History is filtered by exact `recipient`, not tenant plus user id. | FLOW-064-RULE-001 | FLOW-064 | PROVEN | CONSISTENT | FLOW-064-UNCERTAINTY-001 | None |
| BR-219 | Consolidated source rule FLOW-064-RULE-002 | Notification | Notification | CAP-013 | BUSINESS_RULE | Current executable behaviour: History returns at most 50 rows ordered newest first. | FLOW-064-RULE-002 | FLOW-064 | PROVEN | CONSISTENT | FLOW-064-UNCERTAINTY-001 | None |
| BR-220 | Consolidated source rule FLOW-065-RULE-001 | Notification | Notification | CAP-013 | OPERATIONAL_RULE | Current executable behaviour: Queue worker processes at most 50 due queued requests per call. | FLOW-065-RULE-001 | FLOW-065 | PROVEN | CONTEXT_DEPENDENT | FLOW-065-UNCERTAINTY-001 | None |
| BR-221 | Consolidated source rule FLOW-065-RULE-002 | Notification | Notification | CAP-013 | OPERATIONAL_RULE | Current executable behaviour: Attempts 1-3 failures retry; attempt 4 failure is terminal `dead_letter`. | FLOW-065-RULE-002 | FLOW-065 | PROVEN | CONTEXT_DEPENDENT | FLOW-065-UNCERTAINTY-001 | None |
| BR-222 | Consolidated source rule FLOW-066-RULE-001 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Due jobs claim only enabled rows whose `nextRunAt <= now()` and lock is absent/expired. | FLOW-066-RULE-001 | FLOW-066 | PROVEN | CONTEXT_DEPENDENT | FLOW-066-UNCERTAINTY-001 | None |
| BR-223 | Consolidated source rule FLOW-066-RULE-002 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Timeout summaries keep the lease until expiry. | FLOW-066-RULE-002 | FLOW-066 | PROVEN | CONTEXT_DEPENDENT | FLOW-066-UNCERTAINTY-001 | None |
| BR-224 | Consolidated source rule FLOW-067-RULE-001 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Manual execution throws on unknown job name. | FLOW-067-RULE-001 | FLOW-067 | PROVEN | CONSISTENT | FLOW-067-UNCERTAINTY-001 | None |
| BR-225 | Consolidated source rule FLOW-067-RULE-002 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Manual execution does not release a claimed due-job lease. | FLOW-067-RULE-002 | FLOW-067 | PROVEN | CONSISTENT | FLOW-067-UNCERTAINTY-001 | None |
| BR-226 | Consolidated source rule FLOW-068-RULE-001 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Dispatch dedupe key is `(jobName, dedupKey)`. | FLOW-068-RULE-001 | FLOW-068 | PROVEN | CONTEXT_DEPENDENT | FLOW-068-UNCERTAINTY-001 | None |
| BR-227 | Consolidated source rule FLOW-068-RULE-002 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Live PENDING duplicates are denied without throwing. | FLOW-068-RULE-002 | FLOW-068 | PROVEN | CONTEXT_DEPENDENT | FLOW-068-UNCERTAINTY-001 | None |
| BR-228 | Consolidated source rule FLOW-069-RULE-001 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: SENT records dispatch time and clears last error. | FLOW-069-RULE-001 | FLOW-069 | PROVEN | CONTEXT_DEPENDENT | FLOW-069-UNCERTAINTY-001 | None |
| BR-229 | Consolidated source rule FLOW-069-RULE-002 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: FAILED increments attempts and stores last error. | FLOW-069-RULE-002 | FLOW-069 | PROVEN | CONTEXT_DEPENDENT | FLOW-069-UNCERTAINTY-001 | None |
| BR-230 | Consolidated source rule FLOW-070-RULE-001 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Health endpoints do not check dependencies; they report process/service/version only. | FLOW-070-RULE-001 | FLOW-070 | PROVEN | CONSISTENT | FLOW-070-UNCERTAINTY-001 | None |
| BR-231 | Consolidated source rule FLOW-070-RULE-002 | Scheduled Operations / Platform Health | Scheduled Operations & Platform Health | CAP-014 | OPERATIONAL_RULE | Current executable behaviour: Deployment verification fails if any component version does not equal expected SHA. | FLOW-070-RULE-002 | FLOW-070 | PROVEN | CONSISTENT | FLOW-070-UNCERTAINTY-001 | None |

## Explicit Cross-Flow Rule Comparison

| Area | Source Flows | Relationship | Evaluation |
|---|---|---|---|
| Booking access | FLOW-031/FLOW-032/FLOW-033 | CONTEXT_DEPENDENT | Single booking, my bookings, and admin bookings have different executable access scopes. |
| Availability timezone behaviour | FLOW-023/FLOW-028 | CONTEXT_DEPENDENT | Manual windows and generated windows use different time handling contexts. |
| Standard vs negotiated booking | FLOW-029/FLOW-030/FLOW-057 | CONTEXT_DEPENDENT | Standard self-service and negotiated admin/internal orchestration preserve different guards. |
| Member vs guest booking | FLOW-044/FLOW-029 | CONTEXT_DEPENDENT | Member confirmation and guest booking are distinct executable booking concerns. |
| Cancellation preview vs execution | FLOW-036/FLOW-037 | CONTEXT_DEPENDENT | Preview computes without the same persistence effect as cancellation. |
| Cancellation vs refund | FLOW-037/FLOW-059/FLOW-060 | UNRESOLVED | Local cancellation/refund persistence and provider-refund expectations remain validation topics. |
| Payment confirmation | FLOW-052/FLOW-054/FLOW-034 | CONTEXT_DEPENDENT | Direct verification and webhook capture both boundary into booking confirmation. |
| Subscription vs PaymentIntent | FLOW-053/FLOW-055 | CONTEXT_DEPENDENT | Subscription/autopay operates on Subscription while guest payment operates on PaymentIntent. |
| Capacity release | FLOW-048/FLOW-049 | CONTEXT_DEPENDENT | Manual release and sweep release/alert use different executable mechanisms. |
| Notification processing | FLOW-061/FLOW-065 | CONTEXT_DEPENDENT | Send queues rows; queue worker performs delivery/retry/dead-letter. |
| Notification vs scheduler infrastructure | FLOW-061/FLOW-065/FLOW-066/FLOW-068/FLOW-069 | CONTEXT_DEPENDENT | Notification queue is separate from scheduler dispatch infrastructure. |

## Calculation Index

| BR ID | Calculation | Inputs | Output | Source Flows | Consistency |
|---|---|---|---|---|---|
| BR-037 | Availability browse reach is capped by the first booking rule's `guestOpenWindowDays`, defaulting to 7 days when no rule is present. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-038 | Browsing availability can lazily materialize availability windows before returning them. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-041 | Only active availability patterns matching the generated date's ISO weekday contribute generated browse windows when no closed/modified override applies. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-042 | Blocked windows remove overlapping availability windows from browse results. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-043 | Only `HELD` and `CONFIRMED` bookings reduce browse availability capacity. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-044 | For fixed-instance pools, a slot is browsable only if the window resource is not reserved by an active booking. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-045 | For pooled pools, a slot is browsable only when `window.capacity - activeBookings.length` is greater than zero. | Source flow inputs | Computed/validated value | FLOW-024 | CONSISTENT |
| BR-052 | The selected availability window is locked during booking creation before capacity decisions are made. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-053 | Group size is the booking user plus co-player count and must fit the pool's min occupancy and capacity. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-054 | The self-service booking horizon uses `guestOpenWindowDays`, even if a caller supplies `isMemberBooking: true`. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-056 | Overlapping blocked windows prevent booking creation. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-057 | Fixed-instance booking permits only one active held/confirmed booking per target resource and window. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-058 | Pooled booking permits creation only while active held/confirmed booking count is below the window capacity. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-059 | Self-service booking price is resolved server-side from window override or pool default and is not accepted from the client. | Source flow inputs | Computed/validated value | FLOW-029 | CONTEXT_DEPENDENT |
| BR-064 | Negotiated booking waives group-size/pricing constraints but not availability, block, or capacity constraints. | Source flow inputs | Computed/validated value | FLOW-030 | CONTEXT_DEPENDENT |
| BR-095 | Cancelled preview uses stored `booking.refundAmount`. | Source flow inputs | Computed/validated value | FLOW-036 | CONTEXT_DEPENDENT |
| BR-097 | Held preview returns 100% of booking price. | Source flow inputs | Computed/validated value | FLOW-036 | CONTEXT_DEPENDENT |
| BR-103 | Held cancellation persists `refundAmount: null`. | Source flow inputs | Computed/validated value | FLOW-037 | CONTEXT_DEPENDENT |
| BR-107 | `userId`, `resourcePoolId`, `daysOfWeek`, and `startTime` are required. | Source flow inputs | Computed/validated value | FLOW-040 | CONSISTENT |
| BR-121 | `canConfirm` is true only when no booking exists, subscription is active, and now is before cutoff. | Source flow inputs | Computed/validated value | FLOW-043 | CONSISTENT |
| BR-124 | Confirmation is rejected at or after cutoff time. | Source flow inputs | Computed/validated value | FLOW-044 | CONTEXT_DEPENDENT |
| BR-126 | Member booking creation is concurrency protected by transaction/window lock/double-check. | Source flow inputs | Computed/validated value | FLOW-044 | CONTEXT_DEPENDENT |
| BR-129 | Attendance status derives from subscription, booking attendance stamp, booking release status, and cutoff. | Source flow inputs | Computed/validated value | FLOW-046 | CONSISTENT |
| BR-136 | The payment intent amount is derived from the booking's stored price multiplied by 100 and rounded. | Source flow inputs | Computed/validated value | FLOW-050 | CONSISTENT |
| BR-137 | FLOW-050 does not accept client-supplied amount or currency for intent creation. | Source flow inputs | Computed/validated value | FLOW-050 | CONSISTENT |
| BR-144 | The caller must own the local payment intent. | Source flow inputs | Computed/validated value | FLOW-051 | CONSISTENT |
| BR-145 | The provider charge amount is the stored `PaymentIntent.amount`, not the client-supplied amount. | Source flow inputs | Computed/validated value | FLOW-051 | CONSISTENT |
| BR-200 | Zero/nonpositive refund amount skips refund creation. | Source flow inputs | Computed/validated value | FLOW-059 | CONTEXT_DEPENDENT |
| BR-206 | `bookingId`, `overrideAmount`, and `reason` are required. | Source flow inputs | Computed/validated value | FLOW-060 | CONTEXT_DEPENDENT |
| BR-210 | Override amount cannot exceed original payment amount. | Source flow inputs | Computed/validated value | FLOW-060 | CONTEXT_DEPENDENT |

## State Guard Index

| BR ID | Entity | Source State/Condition | Operation | Result/Allowed State | Source Flow |
|---|---|---|---|---|---|
| BR-060 | Booking | Observed precondition | Source operation | New self-service bookings are initially persisted as held bookings with a five-minute hold expiry. | FLOW-029 |
| BR-063 | Booking | Observed precondition | Source operation | Negotiated bookings are internal-service only and always created as non-member HELD bookings. | FLOW-030 |
| BR-078 | Booking | Observed precondition | Source operation | Booking confirmation is an internal-service-key protected operation. | FLOW-034 |
| BR-080 | Booking | Observed precondition | Source operation | A missing booking fails confirmation with HTTP 404. | FLOW-034 |
| BR-081 | Booking | Observed precondition | Source operation | An already-confirmed booking is returned unchanged. | FLOW-034 |
| BR-082 | Booking | Observed precondition | Source operation | Only a `HELD` booking is eligible for the confirming update. | FLOW-034 |
| BR-094 | Booking | Observed precondition | Source operation | Preview is allowed only for `HELD`, `CONFIRMED`, or `CANCELLED`. | FLOW-036 |
| BR-096 | Booking | Observed precondition | Source operation | Confirmed preview uses oldest booking rule's tiered cancellation policy and current hours before slot. | FLOW-036 |
| BR-100 | Booking | Observed precondition | Source operation | `CANCELLED` cancellation is idempotent. | FLOW-037 |
| BR-101 | Booking | Observed precondition | Source operation | Only `HELD` and `CONFIRMED` are active cancellable source states. | FLOW-037 |
| BR-102 | Booking | Observed precondition | Source operation | Confirmed cancellation recomputes tiered refund using booking rule and hours before slot. | FLOW-037 |
| BR-114 | Current entity | Observed precondition | Source operation | Only `ACTIVE` and `SUSPENDED` statuses are accepted. | FLOW-042 |
| BR-117 | Current entity | Observed precondition | Source operation | Status update does not mutate existing member bookings. | FLOW-042 |
| BR-125 | Booking | Observed precondition | Source operation | Confirmation creates or updates a member booking with `memberAttendanceConfirmedAt`. | FLOW-044 |
| BR-130 | Booking | Observed precondition | Source operation | The view is read-only. | FLOW-046 |
| BR-132 | PaymentIntent/Subscription | Observed precondition | Source operation | At most one active intent record is created per booking reference by this handler; retries return the existing non-captured intent. | FLOW-050 |
| BR-134 | PaymentIntent/Subscription | Observed precondition | Source operation | A captured payment intent cannot be recreated or returned through the creation endpoint. | FLOW-050 |
| BR-135 | PaymentIntent/Subscription | Observed precondition | Source operation | New payment intents can be created only for bookings whose current status is `HELD`. | FLOW-050 |
| BR-138 | PaymentIntent/Subscription | Observed precondition | Source operation | New payment intents are persisted with status `pending` and purpose `guest_booking`. | FLOW-050 |
| BR-142 | PaymentIntent/Subscription | Observed precondition | Source operation | Creating a payment order requires `bookingId`. | FLOW-051 |
| BR-147 | PaymentIntent/Subscription | Observed precondition | Source operation | Currency defaults to INR when not supplied by the request. | FLOW-051 |
| BR-149 | PaymentIntent/Subscription | Observed precondition | Source operation | Successful order creation stores the Razorpay order id as `PaymentIntent.gatewayRef`. | FLOW-051 |
| BR-155 | PaymentIntent/Subscription | Observed precondition | Source operation | A signature mismatch rejects verification with HTTP 400. | FLOW-052 |
| BR-157 | PaymentIntent/Subscription | Observed precondition | Source operation | Only a matching intent with status `pending` is transitioned to `captured`. | FLOW-052 |
| BR-158 | PaymentIntent/Subscription | Observed precondition | Source operation | When a pending intent is captured, FLOW-052 invokes the booking confirmation boundary using `intent.referenceId`. | FLOW-052 |
| BR-159 | PaymentIntent/Subscription | Observed precondition | Source operation | A valid signature with no matching pending intent returns success without a payment intent update or booking-confirmation call. | FLOW-052 |
| BR-171 | PaymentIntent/Subscription | Observed precondition | Source operation | The webhook event id is read from `body.id`. | FLOW-054 |
| BR-174 | PaymentIntent/Subscription | Observed precondition | Source operation | Duplicate webhook delivery returns success with `duplicated: true` and skips business processing. | FLOW-054 |
| BR-175 | PaymentIntent/Subscription | Observed precondition | Source operation | `payment.captured` is the only explicitly handled event type in the one-time Razorpay webhook endpoint. | FLOW-054 |
| BR-176 | PaymentIntent/Subscription | Observed precondition | Source operation | For `payment.captured`, PaymentIntent matching checks `gatewayRef` against payment id and optional payment link id. | FLOW-054 |
| BR-177 | PaymentIntent/Subscription | Observed precondition | Source operation | Only a matching pending intent is updated to `captured`. | FLOW-054 |
| BR-184 | PaymentIntent/Subscription | Observed precondition | Source operation | `subscription.charged` creates a captured `subscription_billing` PaymentIntent for a found subscription. | FLOW-055 |
| BR-186 | PaymentIntent/Subscription | Observed precondition | Source operation | `subscription.charge_failed` attempts a notification boundary request after suspending the subscription. | FLOW-055 |
| BR-191 | PaymentIntent/Subscription | Observed precondition | Source operation | Payment links can be created only for HELD bookings. | FLOW-056 |
| BR-199 | Current entity | Observed precondition | Source operation | Only cancelled bookings can be refunded. | FLOW-059 |
| BR-201 | Current entity | Observed precondition | Source operation | Captured PaymentIntent for booking is required. | FLOW-059 |
| BR-207 | Current entity | Observed precondition | Source operation | Booking must be cancelled. | FLOW-060 |
| BR-208 | Current entity | Observed precondition | Source operation | Captured PaymentIntent is required. | FLOW-060 |

## Access Rule Index

| BR ID | Operation | JWT | Internal Key | Tenant | Role | Ownership | Branch | Source Flow |
|---|---|---|---|---|---|---|---|---|
| BR-047 | The API does not require a user JWT or admin authorization to browse resource-pool availability. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-024 |
| BR-048 | The API does not require a user JWT or admin authorization to browse resource-pool availability. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-024 |
| BR-049 | The booking creator's `userId` and `tenantId` are taken from the JWT, not the request body. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-029 |
| BR-084 | FLOW-034 does not enforce hold-expiry validity before confirming. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-034 |
| BR-085 | FLOW-034 does not verify payment state or payment proof; the payment trust boundary is the authenticated internal caller. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-034 |
| BR-093 | Preview requires internal key or JWT with booking access. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-036 |
| BR-099 | Cancellation requires internal key or JWT booking access. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-037 |
| BR-106 | Assignment creation requires internal/admin access scoped to the resource pool. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-040 |
| BR-110 | Assignment listing requires internal/admin auth. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-041 |
| BR-115 | Assignment update requires pool-scoped internal/admin access. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-042 |
| BR-118 | Today assignment view requires MEMBER JWT. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-043 |
| BR-119 | Active assignment is scoped by JWT user id and tenant id. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-043 |
| BR-122 | Confirm requires MEMBER JWT and ignores body identity. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-044 |
| BR-127 | Member attendance view requires internal/admin branch authorization. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-046 |
| BR-160 | FLOW-052 authenticates the caller but does not check PaymentIntent ownership or booking ownership in the verify-payment handler. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-052 |
| BR-161 | FLOW-052 authenticates the caller but does not check PaymentIntent ownership or booking ownership in the verify-payment handler. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-052 |
| BR-194 | Branch manager JWTs must be scoped to the requested branch unless caller is owner/internal. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-057 |
| BR-198 | Refund creation trusts Slot Engine booking status/refundAmount read by internal key. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-059 |
| BR-204 | Override refund requires admin JWT. | Evidenced where applicable | Evidenced where applicable | Flow-scoped | Flow-scoped | Flow-scoped | Flow-scoped | FLOW-060 |

## Conflicting Rule Register

| Conflict ID | BR IDs | Source Candidate Rules | Description | Affected Journey | Validation Needed |
|---|---|---|---|---|---|
| None | None | None | No executable candidate-rule conflict was consolidated in RE-005. Differences identified by RE-004 are registered as context variants or unresolved validation topics. | All | Business validation still required for variants and uncertainties. |

## Context-Variant Register

| Variant ID | BR IDs | Context A | Context B | Source Flows | Validation Needed |
|---|---|---|---|---|---|
| RULE-VARIANT-001 | BR-065, BR-066, BR-067, BR-068, BR-069, BR-070, BR-071, BR-072 | Single/user booking reads | Admin booking reads | FLOW-031/FLOW-032/FLOW-033 | Validate intended business distinction. |
| RULE-VARIANT-002 |  | Manual availability window | Generated availability | FLOW-023/FLOW-028 | Validate intended business distinction. |
| RULE-VARIANT-003 | BR-049, BR-050, BR-051, BR-052, BR-053, BR-054, BR-055, BR-056 | Self-service booking | Negotiated admin/internal booking | FLOW-029/FLOW-030/FLOW-057 | Validate intended business distinction. |
| RULE-VARIANT-004 | BR-049, BR-050, BR-051, BR-052, BR-053, BR-054, BR-055, BR-056 | Member confirmation | Guest booking creation | FLOW-044/FLOW-029 | Validate intended business distinction. |
| RULE-VARIANT-005 | BR-093, BR-094, BR-095, BR-096, BR-097, BR-098, BR-099, BR-100 | Preview | Persisted cancellation | FLOW-036/FLOW-037 | Validate intended business distinction. |
| RULE-VARIANT-006 | BR-099, BR-100, BR-101, BR-102, BR-103, BR-104, BR-105, BR-197 | Cancellation refund amount | Refund/override record | FLOW-037/FLOW-059/FLOW-060 | Validate intended business distinction. |
| RULE-VARIANT-007 | BR-078, BR-079, BR-080, BR-081, BR-082, BR-083, BR-084, BR-085 | Direct verify | Webhook capture | FLOW-052/FLOW-054/FLOW-034 | Validate intended business distinction. |
| RULE-VARIANT-008 | BR-162, BR-163, BR-164, BR-165, BR-166, BR-167, BR-168, BR-169 | PaymentIntent | Subscription | FLOW-053/FLOW-055 | Validate intended business distinction. |
| RULE-VARIANT-009 |  | Manual release | Sweep release/alert | FLOW-048/FLOW-049 | Validate intended business distinction. |
| RULE-VARIANT-010 | BR-212, BR-213, BR-220, BR-221 | Send/queue | Queue worker delivery | FLOW-061/FLOW-065 | Validate intended business distinction. |
| RULE-VARIANT-011 | BR-212, BR-213, BR-220, BR-221, BR-222, BR-223, BR-226, BR-227 | Notification queue | Job scheduler dispatch | FLOW-061/FLOW-065/FLOW-066/FLOW-068/FLOW-069 | Validate intended business distinction. |

## Uncertainty Linkage

| BR ID | Related Uncertainty IDs | Effect on Rule Confidence |
|---|---|---|
| BR-001 | FLOW-001-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-002 | FLOW-001-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-003 | FLOW-002-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-004 | FLOW-002-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-005 | FLOW-003-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-006 | FLOW-003-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-007 | FLOW-004-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-008 | FLOW-004-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-009 | FLOW-005-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-010 | FLOW-005-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-011 | FLOW-006-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-012 | FLOW-006-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-013 | FLOW-007-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-014 | FLOW-007-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-015 | FLOW-008-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-016 | FLOW-008-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-017 | FLOW-009-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-018 | FLOW-009-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-019 | FLOW-010-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-020 | FLOW-010-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-021 | FLOW-011-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-022 | FLOW-011-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-023 | FLOW-012-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-024 | FLOW-012-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-025 | FLOW-013-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-026 | FLOW-013-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-027 | FLOW-014-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-028 | FLOW-014-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-029 | FLOW-015-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-030 | FLOW-015-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-031 | FLOW-016-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-032 | FLOW-016-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-033 | FLOW-017-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-034 | FLOW-017-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-035 | FLOW-018-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-036 | FLOW-018-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-037 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-038 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-039 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-040 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-041 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-042 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-043 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-044 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-045 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-046 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-047 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-048 | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-049 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-050 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-051 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-052 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-053 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-054 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-055 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-056 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-057 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-058 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-059 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-060 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-061 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-062 | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-063 | FLOW-030-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-064 | FLOW-030-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-065 | FLOW-031-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-066 | FLOW-031-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-067 | FLOW-031-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-068 | FLOW-031-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-069 | FLOW-032-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-070 | FLOW-032-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-071 | FLOW-032-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-072 | FLOW-032-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-073 | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-074 | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-075 | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-076 | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-077 | FLOW-033-UNCERTAINTY-001, FLOW-033-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-078 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-079 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-080 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-081 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-082 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-083 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-084 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-085 | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-086 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-087 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-088 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-089 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-090 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-091 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-092 | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-093 | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-094 | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-095 | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-096 | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-097 | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-098 | FLOW-036-UNCERTAINTY-001, FLOW-036-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-099 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-100 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-101 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-102 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-103 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-104 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-105 | FLOW-037-UNCERTAINTY-001, FLOW-037-UNCERTAINTY-002, FLOW-037-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-106 | FLOW-040-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-107 | FLOW-040-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-108 | FLOW-040-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-109 | FLOW-040-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-110 | FLOW-041-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-111 | FLOW-041-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-112 | FLOW-041-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-113 | FLOW-041-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-114 | FLOW-042-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-115 | FLOW-042-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-116 | FLOW-042-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-117 | FLOW-042-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-118 | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-119 | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-120 | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-121 | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-122 | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-123 | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-124 | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-125 | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-126 | FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-127 | FLOW-046-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-128 | FLOW-046-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-129 | FLOW-046-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-130 | FLOW-046-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-131 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-132 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-133 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-134 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-135 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-136 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-137 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-138 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-139 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-140 | FLOW-050-UNCERTAINTY-001, FLOW-050-UNCERTAINTY-002, FLOW-050-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-141 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-142 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-143 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-144 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-145 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-146 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-147 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-148 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-149 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-150 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-151 | FLOW-051-UNCERTAINTY-001, FLOW-051-UNCERTAINTY-002, FLOW-051-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-152 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-153 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-154 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-155 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-156 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-157 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-158 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-159 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-160 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-161 | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-162 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-163 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-164 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-165 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-166 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-167 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-168 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-169 | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-170 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-171 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-172 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-173 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-174 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-175 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-176 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-177 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-178 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-179 | FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003, FLOW-054-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-180 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-181 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-182 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-183 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-184 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-185 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-186 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-187 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-188 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-189 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-190 | FLOW-055-UNCERTAINTY-001, FLOW-055-UNCERTAINTY-002, FLOW-055-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-004 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-191 | FLOW-056-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-192 | FLOW-056-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-193 | FLOW-057-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-194 | FLOW-057-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-195 | FLOW-058-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-196 | FLOW-058-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-197 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-198 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-199 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-200 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-201 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-202 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-203 | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-204 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-205 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-206 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-207 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-208 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-209 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-210 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-211 | FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-212 | FLOW-061-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-213 | FLOW-061-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-214 | FLOW-062-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-215 | FLOW-062-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-216 | FLOW-063-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-217 | FLOW-063-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-218 | FLOW-064-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-219 | FLOW-064-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-220 | FLOW-065-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-221 | FLOW-065-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-222 | FLOW-066-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-223 | FLOW-066-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-224 | FLOW-067-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-225 | FLOW-067-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-226 | FLOW-068-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-227 | FLOW-068-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-228 | FLOW-069-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-229 | FLOW-069-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-230 | FLOW-070-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |
| BR-231 | FLOW-070-UNCERTAINTY-001 | Preserved from originating flow; confidence not upgraded by consolidation. |

## Journey Rule Index

| Journey | BR IDs | Candidate Rule IDs | Conflicts | Variants |
|---|---|---|---|---|
| Availability Management | BR-037, BR-038, BR-039, BR-040, BR-041, BR-042, BR-043, BR-044, BR-045, BR-046, BR-047, BR-048 | FLOW-024-RULE-001, FLOW-024-RULE-002, FLOW-024-RULE-003, FLOW-024-RULE-004, FLOW-024-RULE-005, FLOW-024-RULE-006, FLOW-024-RULE-007, FLOW-024-RULE-008, FLOW-024-RULE-009, FLOW-024-RULE-010, FLOW-024-RULE-011, FLOW-024-RULE-012 | None |  |
| Cancellation & Refund | BR-197, BR-198, BR-199, BR-200, BR-201, BR-202, BR-203, BR-204, BR-205, BR-206, BR-207, BR-208, BR-209, BR-210, BR-211 | FLOW-059-RULE-001, FLOW-059-RULE-002, FLOW-059-RULE-003, FLOW-059-RULE-004, FLOW-059-RULE-005, FLOW-059-RULE-006, FLOW-059-RULE-007, FLOW-060-RULE-001, FLOW-060-RULE-002, FLOW-060-RULE-003, FLOW-060-RULE-004, FLOW-060-RULE-005, FLOW-060-RULE-006, FLOW-060-RULE-007, FLOW-060-RULE-008 | None | RULE-VARIANT-006 |
| Guest Booking | BR-049, BR-050, BR-051, BR-052, BR-053, BR-054, BR-055, BR-056, BR-057, BR-058, BR-059, BR-060, BR-061, BR-062, BR-065, BR-066, BR-067, BR-068, BR-069, BR-070, BR-071, BR-072, BR-073, BR-074, BR-075, BR-076, BR-077, BR-078, BR-079, BR-080, BR-081, BR-082, BR-083, BR-084, BR-085, BR-086, BR-087, BR-088, BR-089, BR-090, BR-091, BR-092, BR-093, BR-094, BR-095, BR-096, BR-097, BR-098, BR-099, BR-100, BR-101, BR-102, BR-103, BR-104, BR-105 | FLOW-029-RULE-001, FLOW-029-RULE-002, FLOW-029-RULE-003, FLOW-029-RULE-004, FLOW-029-RULE-005, FLOW-029-RULE-006, FLOW-029-RULE-007, FLOW-029-RULE-008, FLOW-029-RULE-009, FLOW-029-RULE-010, FLOW-029-RULE-011, FLOW-029-RULE-012, FLOW-029-RULE-013, FLOW-029-RULE-014, FLOW-031-RULE-001, FLOW-031-RULE-002, FLOW-031-RULE-003, FLOW-031-RULE-004, FLOW-032-RULE-001, FLOW-032-RULE-002, FLOW-032-RULE-003, FLOW-032-RULE-004, FLOW-033-RULE-001, FLOW-033-RULE-002, FLOW-033-RULE-003, FLOW-033-RULE-004, FLOW-033-RULE-005, FLOW-034-RULE-001, FLOW-034-RULE-002, FLOW-034-RULE-003, FLOW-034-RULE-004, FLOW-034-RULE-005, FLOW-034-RULE-006, FLOW-034-RULE-007, FLOW-034-RULE-008, FLOW-035-RULE-001, FLOW-035-RULE-002, FLOW-035-RULE-003, FLOW-035-RULE-004, FLOW-035-RULE-005, FLOW-035-RULE-006, FLOW-035-RULE-007, FLOW-036-RULE-001, FLOW-036-RULE-002, FLOW-036-RULE-003, FLOW-036-RULE-004, FLOW-036-RULE-005, FLOW-036-RULE-006, FLOW-037-RULE-001, FLOW-037-RULE-002, FLOW-037-RULE-003, FLOW-037-RULE-004, FLOW-037-RULE-005, FLOW-037-RULE-006, FLOW-037-RULE-007 | None | RULE-VARIANT-001, RULE-VARIANT-003, RULE-VARIANT-004, RULE-VARIANT-005, RULE-VARIANT-006, RULE-VARIANT-007 |
| Identity & Session | BR-001, BR-002, BR-003, BR-004, BR-005, BR-006, BR-007, BR-008, BR-009, BR-010, BR-011, BR-012, BR-013, BR-014, BR-015, BR-016 | FLOW-001-RULE-001, FLOW-001-RULE-002, FLOW-002-RULE-001, FLOW-002-RULE-002, FLOW-003-RULE-001, FLOW-003-RULE-002, FLOW-004-RULE-001, FLOW-004-RULE-002, FLOW-005-RULE-001, FLOW-005-RULE-002, FLOW-006-RULE-001, FLOW-006-RULE-002, FLOW-007-RULE-001, FLOW-007-RULE-002, FLOW-008-RULE-001, FLOW-008-RULE-002 | None |  |
| Member Assignment & Attendance | BR-106, BR-107, BR-108, BR-109, BR-110, BR-111, BR-112, BR-113, BR-114, BR-115, BR-116, BR-117, BR-118, BR-119, BR-120, BR-121, BR-122, BR-123, BR-124, BR-125, BR-126, BR-127, BR-128, BR-129, BR-130 | FLOW-040-RULE-001, FLOW-040-RULE-002, FLOW-040-RULE-003, FLOW-040-RULE-004, FLOW-041-RULE-001, FLOW-041-RULE-002, FLOW-041-RULE-003, FLOW-041-RULE-004, FLOW-042-RULE-001, FLOW-042-RULE-002, FLOW-042-RULE-003, FLOW-042-RULE-004, FLOW-043-RULE-001, FLOW-043-RULE-002, FLOW-043-RULE-003, FLOW-043-RULE-004, FLOW-044-RULE-001, FLOW-044-RULE-002, FLOW-044-RULE-003, FLOW-044-RULE-004, FLOW-044-RULE-005, FLOW-046-RULE-001, FLOW-046-RULE-002, FLOW-046-RULE-003, FLOW-046-RULE-004 | None | RULE-VARIANT-004 |
| Negotiated Booking | BR-063, BR-064, BR-191, BR-192, BR-193, BR-194 | FLOW-030-RULE-001, FLOW-030-RULE-002, FLOW-056-RULE-001, FLOW-056-RULE-002, FLOW-057-RULE-001, FLOW-057-RULE-002 | None | RULE-VARIANT-003 |
| Notification | BR-212, BR-213, BR-214, BR-215, BR-216, BR-217, BR-218, BR-219, BR-220, BR-221 | FLOW-061-RULE-001, FLOW-061-RULE-002, FLOW-062-RULE-001, FLOW-062-RULE-002, FLOW-063-RULE-001, FLOW-063-RULE-002, FLOW-064-RULE-001, FLOW-064-RULE-002, FLOW-065-RULE-001, FLOW-065-RULE-002 | None | RULE-VARIANT-010, RULE-VARIANT-011 |
| Payment | BR-131, BR-132, BR-133, BR-134, BR-135, BR-136, BR-137, BR-138, BR-139, BR-140, BR-141, BR-142, BR-143, BR-144, BR-145, BR-146, BR-147, BR-148, BR-149, BR-150, BR-151, BR-152, BR-153, BR-154, BR-155, BR-156, BR-157, BR-158, BR-159, BR-160, BR-161, BR-170, BR-171, BR-172, BR-173, BR-174, BR-175, BR-176, BR-177, BR-178, BR-179, BR-195, BR-196 | FLOW-050-RULE-001, FLOW-050-RULE-002, FLOW-050-RULE-003, FLOW-050-RULE-004, FLOW-050-RULE-005, FLOW-050-RULE-006, FLOW-050-RULE-007, FLOW-050-RULE-008, FLOW-050-RULE-009, FLOW-050-RULE-010, FLOW-051-RULE-001, FLOW-051-RULE-002, FLOW-051-RULE-003, FLOW-051-RULE-004, FLOW-051-RULE-005, FLOW-051-RULE-006, FLOW-051-RULE-007, FLOW-051-RULE-008, FLOW-051-RULE-009, FLOW-051-RULE-010, FLOW-051-RULE-011, FLOW-052-RULE-001, FLOW-052-RULE-002, FLOW-052-RULE-003, FLOW-052-RULE-004, FLOW-052-RULE-005, FLOW-052-RULE-006, FLOW-052-RULE-007, FLOW-052-RULE-008, FLOW-052-RULE-009, FLOW-052-RULE-010, FLOW-054-RULE-001, FLOW-054-RULE-002, FLOW-054-RULE-003, FLOW-054-RULE-004, FLOW-054-RULE-005, FLOW-054-RULE-006, FLOW-054-RULE-007, FLOW-054-RULE-008, FLOW-054-RULE-009, FLOW-054-RULE-010, FLOW-058-RULE-001, FLOW-058-RULE-002 | None | RULE-VARIANT-007 |
| Role & Admin Access Context | BR-017, BR-018, BR-019, BR-020 | FLOW-009-RULE-001, FLOW-009-RULE-002, FLOW-010-RULE-001, FLOW-010-RULE-002 | None |  |
| Scheduled Operations & Platform Health | BR-222, BR-223, BR-224, BR-225, BR-226, BR-227, BR-228, BR-229, BR-230, BR-231 | FLOW-066-RULE-001, FLOW-066-RULE-002, FLOW-067-RULE-001, FLOW-067-RULE-002, FLOW-068-RULE-001, FLOW-068-RULE-002, FLOW-069-RULE-001, FLOW-069-RULE-002, FLOW-070-RULE-001, FLOW-070-RULE-002 | None | RULE-VARIANT-011 |
| Subscription / Autopay | BR-162, BR-163, BR-164, BR-165, BR-166, BR-167, BR-168, BR-169, BR-180, BR-181, BR-182, BR-183, BR-184, BR-185, BR-186, BR-187, BR-188, BR-189, BR-190 | FLOW-053-RULE-001, FLOW-053-RULE-002, FLOW-053-RULE-003, FLOW-053-RULE-004, FLOW-053-RULE-005, FLOW-053-RULE-006, FLOW-053-RULE-007, FLOW-053-RULE-008, FLOW-055-RULE-001, FLOW-055-RULE-002, FLOW-055-RULE-003, FLOW-055-RULE-004, FLOW-055-RULE-005, FLOW-055-RULE-006, FLOW-055-RULE-007, FLOW-055-RULE-008, FLOW-055-RULE-009, FLOW-055-RULE-010, FLOW-055-RULE-011 | None | RULE-VARIANT-008 |
| Tenant & Branch Administration | BR-021, BR-022, BR-023, BR-024, BR-025, BR-026, BR-027, BR-028, BR-029, BR-030, BR-031, BR-032, BR-033, BR-034, BR-035, BR-036 | FLOW-011-RULE-001, FLOW-011-RULE-002, FLOW-012-RULE-001, FLOW-012-RULE-002, FLOW-013-RULE-001, FLOW-013-RULE-002, FLOW-014-RULE-001, FLOW-014-RULE-002, FLOW-015-RULE-001, FLOW-015-RULE-002, FLOW-016-RULE-001, FLOW-016-RULE-002, FLOW-017-RULE-001, FLOW-017-RULE-002, FLOW-018-RULE-001, FLOW-018-RULE-002 | None |  |

## Capability Rule Index

| Capability | BR IDs | Candidate Rule Count | Conflict Count | Unresolved Count |
|---|---|---:|---:|---:|
| CAP-001 | BR-001, BR-002, BR-003, BR-004, BR-005, BR-006, BR-007, BR-008, BR-009, BR-010, BR-011, BR-012, BR-013, BR-014, BR-015, BR-016 | 16 | 0 | 0 |
| CAP-002 | BR-021, BR-022, BR-023, BR-024, BR-025, BR-026, BR-027, BR-028 | 8 | 0 | 0 |
| CAP-003 | BR-029, BR-030, BR-031, BR-032, BR-033, BR-034, BR-035, BR-036 | 8 | 0 | 0 |
| CAP-004 | BR-017, BR-018, BR-019, BR-020 | 4 | 0 | 0 |
| CAP-006 | BR-037, BR-038, BR-039, BR-040, BR-041, BR-042, BR-043, BR-044, BR-045, BR-046, BR-047, BR-048 | 12 | 0 | 0 |
| CAP-007 | BR-049, BR-050, BR-051, BR-052, BR-053, BR-054, BR-055, BR-056, BR-057, BR-058, BR-059, BR-060, BR-061, BR-062, BR-063, BR-064, BR-065, BR-066, BR-067, BR-068, BR-069, BR-070, BR-071, BR-072, BR-073, BR-074, BR-075, BR-076, BR-077, BR-078, BR-079, BR-080, BR-081, BR-082, BR-083, BR-084, BR-085, BR-086, BR-087, BR-088, BR-089, BR-090, BR-091, BR-092, BR-093, BR-094, BR-095, BR-096, BR-097, BR-098, BR-099, BR-100, BR-101, BR-102, BR-103, BR-104, BR-105 | 57 | 0 | 0 |
| CAP-009 | BR-106, BR-107, BR-108, BR-109, BR-110, BR-111, BR-112, BR-113, BR-114, BR-115, BR-116, BR-117, BR-118, BR-119, BR-120, BR-121, BR-122, BR-123, BR-124, BR-125, BR-126 | 21 | 0 | 0 |
| CAP-010 | BR-127, BR-128, BR-129, BR-130 | 4 | 0 | 0 |
| CAP-011 | BR-131, BR-132, BR-133, BR-134, BR-135, BR-136, BR-137, BR-138, BR-139, BR-140, BR-141, BR-142, BR-143, BR-144, BR-145, BR-146, BR-147, BR-148, BR-149, BR-150, BR-151, BR-152, BR-153, BR-154, BR-155, BR-156, BR-157, BR-158, BR-159, BR-160, BR-161, BR-162, BR-163, BR-164, BR-165, BR-166, BR-167, BR-168, BR-169, BR-170, BR-171, BR-172, BR-173, BR-174, BR-175, BR-176, BR-177, BR-178, BR-179, BR-180, BR-181, BR-182, BR-183, BR-184, BR-185, BR-186, BR-187, BR-188, BR-189, BR-190, BR-191, BR-192, BR-193, BR-194, BR-195, BR-196 | 66 | 0 | 0 |
| CAP-012 | BR-197, BR-198, BR-199, BR-200, BR-201, BR-202, BR-203, BR-204, BR-205, BR-206, BR-207, BR-208, BR-209, BR-210, BR-211 | 15 | 0 | 0 |
| CAP-013 | BR-212, BR-213, BR-214, BR-215, BR-216, BR-217, BR-218, BR-219, BR-220, BR-221 | 10 | 0 | 0 |
| CAP-014 | BR-222, BR-223, BR-224, BR-225, BR-226, BR-227, BR-228, BR-229, BR-230, BR-231 | 10 | 0 | 0 |

## Candidate-to-Consolidated Traceability Matrix

| Candidate Rule ID | Flow ID | BR ID | Disposition | Evidence Classification |
|---|---|---|---|---|
| FLOW-001-RULE-001 | FLOW-001 | BR-001 | UNIQUE | PROVEN |
| FLOW-001-RULE-002 | FLOW-001 | BR-002 | UNIQUE | PROVEN |
| FLOW-002-RULE-001 | FLOW-002 | BR-003 | UNIQUE | PROVEN |
| FLOW-002-RULE-002 | FLOW-002 | BR-004 | UNIQUE | PROVEN |
| FLOW-003-RULE-001 | FLOW-003 | BR-005 | UNIQUE | PROVEN |
| FLOW-003-RULE-002 | FLOW-003 | BR-006 | UNIQUE | PROVEN |
| FLOW-004-RULE-001 | FLOW-004 | BR-007 | UNIQUE | PROVEN |
| FLOW-004-RULE-002 | FLOW-004 | BR-008 | UNIQUE | PROVEN |
| FLOW-005-RULE-001 | FLOW-005 | BR-009 | UNIQUE | PROVEN |
| FLOW-005-RULE-002 | FLOW-005 | BR-010 | UNIQUE | PROVEN |
| FLOW-006-RULE-001 | FLOW-006 | BR-011 | UNIQUE | PROVEN |
| FLOW-006-RULE-002 | FLOW-006 | BR-012 | UNIQUE | PROVEN |
| FLOW-007-RULE-001 | FLOW-007 | BR-013 | UNIQUE | PROVEN |
| FLOW-007-RULE-002 | FLOW-007 | BR-014 | UNIQUE | PROVEN |
| FLOW-008-RULE-001 | FLOW-008 | BR-015 | UNIQUE | PROVEN |
| FLOW-008-RULE-002 | FLOW-008 | BR-016 | UNIQUE | PROVEN |
| FLOW-009-RULE-001 | FLOW-009 | BR-017 | UNIQUE | PROVEN |
| FLOW-009-RULE-002 | FLOW-009 | BR-018 | UNIQUE | PROVEN |
| FLOW-010-RULE-001 | FLOW-010 | BR-019 | UNIQUE | PROVEN |
| FLOW-010-RULE-002 | FLOW-010 | BR-020 | UNIQUE | PROVEN |
| FLOW-011-RULE-001 | FLOW-011 | BR-021 | UNIQUE | PROVEN |
| FLOW-011-RULE-002 | FLOW-011 | BR-022 | UNIQUE | PROVEN |
| FLOW-012-RULE-001 | FLOW-012 | BR-023 | UNIQUE | PROVEN |
| FLOW-012-RULE-002 | FLOW-012 | BR-024 | UNIQUE | PROVEN |
| FLOW-013-RULE-001 | FLOW-013 | BR-025 | UNIQUE | PROVEN |
| FLOW-013-RULE-002 | FLOW-013 | BR-026 | UNIQUE | PROVEN |
| FLOW-014-RULE-001 | FLOW-014 | BR-027 | UNIQUE | PROVEN |
| FLOW-014-RULE-002 | FLOW-014 | BR-028 | UNIQUE | PROVEN |
| FLOW-015-RULE-001 | FLOW-015 | BR-029 | UNIQUE | PROVEN |
| FLOW-015-RULE-002 | FLOW-015 | BR-030 | UNIQUE | PROVEN |
| FLOW-016-RULE-001 | FLOW-016 | BR-031 | UNIQUE | PROVEN |
| FLOW-016-RULE-002 | FLOW-016 | BR-032 | UNIQUE | PROVEN |
| FLOW-017-RULE-001 | FLOW-017 | BR-033 | UNIQUE | PROVEN |
| FLOW-017-RULE-002 | FLOW-017 | BR-034 | UNIQUE | PROVEN |
| FLOW-018-RULE-001 | FLOW-018 | BR-035 | UNIQUE | PROVEN |
| FLOW-018-RULE-002 | FLOW-018 | BR-036 | UNIQUE | PROVEN |
| FLOW-024-RULE-001 | FLOW-024 | BR-037 | UNIQUE | PROVEN |
| FLOW-024-RULE-002 | FLOW-024 | BR-038 | UNIQUE | PROVEN |
| FLOW-024-RULE-003 | FLOW-024 | BR-039 | UNIQUE | PROVEN |
| FLOW-024-RULE-004 | FLOW-024 | BR-040 | UNIQUE | PROVEN |
| FLOW-024-RULE-005 | FLOW-024 | BR-041 | UNIQUE | PROVEN |
| FLOW-024-RULE-006 | FLOW-024 | BR-042 | UNIQUE | PROVEN |
| FLOW-024-RULE-007 | FLOW-024 | BR-043 | UNIQUE | PROVEN |
| FLOW-024-RULE-008 | FLOW-024 | BR-044 | UNIQUE | PROVEN |
| FLOW-024-RULE-009 | FLOW-024 | BR-045 | UNIQUE | PROVEN |
| FLOW-024-RULE-010 | FLOW-024 | BR-046 | UNIQUE | DERIVED |
| FLOW-024-RULE-011 | FLOW-024 | BR-047 | UNIQUE | PROVEN |
| FLOW-024-RULE-012 | FLOW-024 | BR-048 | UNIQUE | PROVEN |
| FLOW-029-RULE-001 | FLOW-029 | BR-049 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-002 | FLOW-029 | BR-050 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-029-RULE-003 | FLOW-029 | BR-051 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-029-RULE-004 | FLOW-029 | BR-052 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-005 | FLOW-029 | BR-053 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-006 | FLOW-029 | BR-054 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-007 | FLOW-029 | BR-055 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-008 | FLOW-029 | BR-056 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-009 | FLOW-029 | BR-057 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-010 | FLOW-029 | BR-058 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-011 | FLOW-029 | BR-059 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-012 | FLOW-029 | BR-060 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-013 | FLOW-029 | BR-061 | CONTEXT_VARIANT | PROVEN |
| FLOW-029-RULE-014 | FLOW-029 | BR-062 | CONTEXT_VARIANT | PROVEN |
| FLOW-030-RULE-001 | FLOW-030 | BR-063 | CONTEXT_VARIANT | PROVEN |
| FLOW-030-RULE-002 | FLOW-030 | BR-064 | CONTEXT_VARIANT | PROVEN |
| FLOW-031-RULE-001 | FLOW-031 | BR-065 | CONTEXT_VARIANT | PROVEN |
| FLOW-031-RULE-002 | FLOW-031 | BR-066 | CONTEXT_VARIANT | PROVEN |
| FLOW-031-RULE-003 | FLOW-031 | BR-067 | CONTEXT_VARIANT | PROVEN |
| FLOW-031-RULE-004 | FLOW-031 | BR-068 | CONTEXT_VARIANT | PROVEN |
| FLOW-032-RULE-001 | FLOW-032 | BR-069 | CONTEXT_VARIANT | PROVEN |
| FLOW-032-RULE-002 | FLOW-032 | BR-070 | CONTEXT_VARIANT | PROVEN |
| FLOW-032-RULE-003 | FLOW-032 | BR-071 | CONTEXT_VARIANT | PROVEN |
| FLOW-032-RULE-004 | FLOW-032 | BR-072 | CONTEXT_VARIANT | PROVEN |
| FLOW-033-RULE-001 | FLOW-033 | BR-073 | CONTEXT_VARIANT | PROVEN |
| FLOW-033-RULE-002 | FLOW-033 | BR-074 | CONTEXT_VARIANT | PROVEN |
| FLOW-033-RULE-003 | FLOW-033 | BR-075 | CONTEXT_VARIANT | PROVEN |
| FLOW-033-RULE-004 | FLOW-033 | BR-076 | CONTEXT_VARIANT | PROVEN |
| FLOW-033-RULE-005 | FLOW-033 | BR-077 | CONTEXT_VARIANT | PROVEN |
| FLOW-034-RULE-001 | FLOW-034 | BR-078 | CONTEXT_VARIANT | PROVEN |
| FLOW-034-RULE-002 | FLOW-034 | BR-079 | CONTEXT_VARIANT | PROVEN |
| FLOW-034-RULE-003 | FLOW-034 | BR-080 | CONTEXT_VARIANT | PROVEN |
| FLOW-034-RULE-004 | FLOW-034 | BR-081 | CONTEXT_VARIANT | PROVEN |
| FLOW-034-RULE-005 | FLOW-034 | BR-082 | CONTEXT_VARIANT | PROVEN |
| FLOW-034-RULE-006 | FLOW-034 | BR-083 | CONTEXT_VARIANT | DERIVED |
| FLOW-034-RULE-007 | FLOW-034 | BR-084 | CONTEXT_VARIANT | DERIVED |
| FLOW-034-RULE-008 | FLOW-034 | BR-085 | CONTEXT_VARIANT | DERIVED |
| FLOW-035-RULE-001 | FLOW-035 | BR-086 | UNIQUE | PROVEN |
| FLOW-035-RULE-002 | FLOW-035 | BR-087 | UNIQUE | PROVEN |
| FLOW-035-RULE-003 | FLOW-035 | BR-088 | UNIQUE | PROVEN |
| FLOW-035-RULE-004 | FLOW-035 | BR-089 | UNIQUE | PROVEN |
| FLOW-035-RULE-005 | FLOW-035 | BR-090 | UNIQUE | PROVEN |
| FLOW-035-RULE-006 | FLOW-035 | BR-091 | UNIQUE | PROVEN |
| FLOW-035-RULE-007 | FLOW-035 | BR-092 | UNIQUE | PROVEN |
| FLOW-036-RULE-001 | FLOW-036 | BR-093 | CONTEXT_VARIANT | PROVEN |
| FLOW-036-RULE-002 | FLOW-036 | BR-094 | CONTEXT_VARIANT | PROVEN |
| FLOW-036-RULE-003 | FLOW-036 | BR-095 | CONTEXT_VARIANT | PROVEN |
| FLOW-036-RULE-004 | FLOW-036 | BR-096 | CONTEXT_VARIANT | PROVEN |
| FLOW-036-RULE-005 | FLOW-036 | BR-097 | CONTEXT_VARIANT | PROVEN |
| FLOW-036-RULE-006 | FLOW-036 | BR-098 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-001 | FLOW-037 | BR-099 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-002 | FLOW-037 | BR-100 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-003 | FLOW-037 | BR-101 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-004 | FLOW-037 | BR-102 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-005 | FLOW-037 | BR-103 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-006 | FLOW-037 | BR-104 | CONTEXT_VARIANT | PROVEN |
| FLOW-037-RULE-007 | FLOW-037 | BR-105 | TECHNICAL_SUPPORT | DERIVED |
| FLOW-040-RULE-001 | FLOW-040 | BR-106 | UNIQUE | PROVEN |
| FLOW-040-RULE-002 | FLOW-040 | BR-107 | UNIQUE | PROVEN |
| FLOW-040-RULE-003 | FLOW-040 | BR-108 | UNIQUE | PROVEN |
| FLOW-040-RULE-004 | FLOW-040 | BR-109 | UNIQUE | PROVEN |
| FLOW-041-RULE-001 | FLOW-041 | BR-110 | UNIQUE | PROVEN |
| FLOW-041-RULE-002 | FLOW-041 | BR-111 | UNIQUE | PROVEN |
| FLOW-041-RULE-003 | FLOW-041 | BR-112 | UNIQUE | PROVEN |
| FLOW-041-RULE-004 | FLOW-041 | BR-113 | UNIQUE | PROVEN |
| FLOW-042-RULE-001 | FLOW-042 | BR-114 | UNIQUE | PROVEN |
| FLOW-042-RULE-002 | FLOW-042 | BR-115 | UNIQUE | PROVEN |
| FLOW-042-RULE-003 | FLOW-042 | BR-116 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-042-RULE-004 | FLOW-042 | BR-117 | UNIQUE | DERIVED |
| FLOW-043-RULE-001 | FLOW-043 | BR-118 | UNIQUE | PROVEN |
| FLOW-043-RULE-002 | FLOW-043 | BR-119 | UNIQUE | PROVEN |
| FLOW-043-RULE-003 | FLOW-043 | BR-120 | UNIQUE | PROVEN |
| FLOW-043-RULE-004 | FLOW-043 | BR-121 | UNIQUE | PROVEN |
| FLOW-044-RULE-001 | FLOW-044 | BR-122 | CONTEXT_VARIANT | PROVEN |
| FLOW-044-RULE-002 | FLOW-044 | BR-123 | CONTEXT_VARIANT | PROVEN |
| FLOW-044-RULE-003 | FLOW-044 | BR-124 | CONTEXT_VARIANT | PROVEN |
| FLOW-044-RULE-004 | FLOW-044 | BR-125 | CONTEXT_VARIANT | PROVEN |
| FLOW-044-RULE-005 | FLOW-044 | BR-126 | CONTEXT_VARIANT | PROVEN |
| FLOW-046-RULE-001 | FLOW-046 | BR-127 | UNIQUE | PROVEN |
| FLOW-046-RULE-002 | FLOW-046 | BR-128 | UNIQUE | PROVEN |
| FLOW-046-RULE-003 | FLOW-046 | BR-129 | UNIQUE | PROVEN |
| FLOW-046-RULE-004 | FLOW-046 | BR-130 | UNIQUE | PROVEN |
| FLOW-050-RULE-001 | FLOW-050 | BR-131 | UNIQUE | PROVEN |
| FLOW-050-RULE-002 | FLOW-050 | BR-132 | UNIQUE | PROVEN |
| FLOW-050-RULE-003 | FLOW-050 | BR-133 | UNIQUE | PROVEN |
| FLOW-050-RULE-004 | FLOW-050 | BR-134 | UNIQUE | PROVEN |
| FLOW-050-RULE-005 | FLOW-050 | BR-135 | UNIQUE | PROVEN |
| FLOW-050-RULE-006 | FLOW-050 | BR-136 | UNIQUE | PROVEN |
| FLOW-050-RULE-007 | FLOW-050 | BR-137 | UNIQUE | PROVEN |
| FLOW-050-RULE-008 | FLOW-050 | BR-138 | UNIQUE | PROVEN |
| FLOW-050-RULE-009 | FLOW-050 | BR-139 | UNIQUE | PROVEN |
| FLOW-050-RULE-010 | FLOW-050 | BR-140 | UNIQUE | PROVEN |
| FLOW-051-RULE-001 | FLOW-051 | BR-141 | UNIQUE | PROVEN |
| FLOW-051-RULE-002 | FLOW-051 | BR-142 | UNIQUE | PROVEN |
| FLOW-051-RULE-003 | FLOW-051 | BR-143 | UNIQUE | PROVEN |
| FLOW-051-RULE-004 | FLOW-051 | BR-144 | UNIQUE | PROVEN |
| FLOW-051-RULE-005 | FLOW-051 | BR-145 | UNIQUE | PROVEN |
| FLOW-051-RULE-006 | FLOW-051 | BR-146 | UNIQUE | PROVEN |
| FLOW-051-RULE-007 | FLOW-051 | BR-147 | UNIQUE | PROVEN |
| FLOW-051-RULE-008 | FLOW-051 | BR-148 | UNIQUE | PROVEN |
| FLOW-051-RULE-009 | FLOW-051 | BR-149 | UNIQUE | PROVEN |
| FLOW-051-RULE-010 | FLOW-051 | BR-150 | UNIQUE | PROVEN |
| FLOW-051-RULE-011 | FLOW-051 | BR-151 | UNIQUE | PROVEN |
| FLOW-052-RULE-001 | FLOW-052 | BR-152 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-052-RULE-002 | FLOW-052 | BR-153 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-052-RULE-003 | FLOW-052 | BR-154 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-052-RULE-004 | FLOW-052 | BR-155 | CONTEXT_VARIANT | PROVEN |
| FLOW-052-RULE-005 | FLOW-052 | BR-156 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-052-RULE-006 | FLOW-052 | BR-157 | CONTEXT_VARIANT | PROVEN |
| FLOW-052-RULE-007 | FLOW-052 | BR-158 | CONTEXT_VARIANT | PROVEN |
| FLOW-052-RULE-008 | FLOW-052 | BR-159 | CONTEXT_VARIANT | DERIVED |
| FLOW-052-RULE-009 | FLOW-052 | BR-160 | CONTEXT_VARIANT | DERIVED |
| FLOW-052-RULE-010 | FLOW-052 | BR-161 | CONTEXT_VARIANT | DERIVED |
| FLOW-053-RULE-001 | FLOW-053 | BR-162 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-002 | FLOW-053 | BR-163 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-003 | FLOW-053 | BR-164 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-004 | FLOW-053 | BR-165 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-005 | FLOW-053 | BR-166 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-006 | FLOW-053 | BR-167 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-007 | FLOW-053 | BR-168 | CONTEXT_VARIANT | PROVEN |
| FLOW-053-RULE-008 | FLOW-053 | BR-169 | CONTEXT_VARIANT | PROVEN |
| FLOW-054-RULE-001 | FLOW-054 | BR-170 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-054-RULE-002 | FLOW-054 | BR-171 | CONTEXT_VARIANT | PROVEN |
| FLOW-054-RULE-003 | FLOW-054 | BR-172 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-054-RULE-004 | FLOW-054 | BR-173 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-054-RULE-005 | FLOW-054 | BR-174 | CONTEXT_VARIANT | PROVEN |
| FLOW-054-RULE-006 | FLOW-054 | BR-175 | CONTEXT_VARIANT | PROVEN |
| FLOW-054-RULE-007 | FLOW-054 | BR-176 | CONTEXT_VARIANT | PROVEN |
| FLOW-054-RULE-008 | FLOW-054 | BR-177 | CONTEXT_VARIANT | PROVEN |
| FLOW-054-RULE-009 | FLOW-054 | BR-178 | TECHNICAL_SUPPORT | DERIVED |
| FLOW-054-RULE-010 | FLOW-054 | BR-179 | TECHNICAL_SUPPORT | DERIVED |
| FLOW-055-RULE-001 | FLOW-055 | BR-180 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-055-RULE-002 | FLOW-055 | BR-181 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-055-RULE-003 | FLOW-055 | BR-182 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-055-RULE-004 | FLOW-055 | BR-183 | CONTEXT_VARIANT | PROVEN |
| FLOW-055-RULE-005 | FLOW-055 | BR-184 | CONTEXT_VARIANT | PROVEN |
| FLOW-055-RULE-006 | FLOW-055 | BR-185 | CONTEXT_VARIANT | PROVEN |
| FLOW-055-RULE-007 | FLOW-055 | BR-186 | CONTEXT_VARIANT | PROVEN |
| FLOW-055-RULE-008 | FLOW-055 | BR-187 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-055-RULE-009 | FLOW-055 | BR-188 | TECHNICAL_SUPPORT | DERIVED |
| FLOW-055-RULE-010 | FLOW-055 | BR-189 | TECHNICAL_SUPPORT | DERIVED |
| FLOW-055-RULE-011 | FLOW-055 | BR-190 | TECHNICAL_SUPPORT | DERIVED |
| FLOW-056-RULE-001 | FLOW-056 | BR-191 | UNIQUE | PROVEN |
| FLOW-056-RULE-002 | FLOW-056 | BR-192 | UNIQUE | PROVEN |
| FLOW-057-RULE-001 | FLOW-057 | BR-193 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-057-RULE-002 | FLOW-057 | BR-194 | CONTEXT_VARIANT | PROVEN |
| FLOW-058-RULE-001 | FLOW-058 | BR-195 | UNIQUE | PROVEN |
| FLOW-058-RULE-002 | FLOW-058 | BR-196 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-059-RULE-001 | FLOW-059 | BR-197 | CONTEXT_VARIANT | PROVEN |
| FLOW-059-RULE-002 | FLOW-059 | BR-198 | CONTEXT_VARIANT | PROVEN |
| FLOW-059-RULE-003 | FLOW-059 | BR-199 | CONTEXT_VARIANT | PROVEN |
| FLOW-059-RULE-004 | FLOW-059 | BR-200 | CONTEXT_VARIANT | PROVEN |
| FLOW-059-RULE-005 | FLOW-059 | BR-201 | CONTEXT_VARIANT | PROVEN |
| FLOW-059-RULE-006 | FLOW-059 | BR-202 | CONTEXT_VARIANT | PROVEN |
| FLOW-059-RULE-007 | FLOW-059 | BR-203 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-001 | FLOW-060 | BR-204 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-002 | FLOW-060 | BR-205 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-003 | FLOW-060 | BR-206 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-004 | FLOW-060 | BR-207 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-005 | FLOW-060 | BR-208 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-006 | FLOW-060 | BR-209 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-007 | FLOW-060 | BR-210 | CONTEXT_VARIANT | PROVEN |
| FLOW-060-RULE-008 | FLOW-060 | BR-211 | CONTEXT_VARIANT | PROVEN |
| FLOW-061-RULE-001 | FLOW-061 | BR-212 | CONTEXT_VARIANT | PROVEN |
| FLOW-061-RULE-002 | FLOW-061 | BR-213 | CONTEXT_VARIANT | PROVEN |
| FLOW-062-RULE-001 | FLOW-062 | BR-214 | UNIQUE | PROVEN |
| FLOW-062-RULE-002 | FLOW-062 | BR-215 | UNIQUE | PROVEN |
| FLOW-063-RULE-001 | FLOW-063 | BR-216 | UNIQUE | PROVEN |
| FLOW-063-RULE-002 | FLOW-063 | BR-217 | UNIQUE | PROVEN |
| FLOW-064-RULE-001 | FLOW-064 | BR-218 | UNIQUE | PROVEN |
| FLOW-064-RULE-002 | FLOW-064 | BR-219 | UNIQUE | PROVEN |
| FLOW-065-RULE-001 | FLOW-065 | BR-220 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-065-RULE-002 | FLOW-065 | BR-221 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-066-RULE-001 | FLOW-066 | BR-222 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-066-RULE-002 | FLOW-066 | BR-223 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-067-RULE-001 | FLOW-067 | BR-224 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-067-RULE-002 | FLOW-067 | BR-225 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-068-RULE-001 | FLOW-068 | BR-226 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-068-RULE-002 | FLOW-068 | BR-227 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-069-RULE-001 | FLOW-069 | BR-228 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-069-RULE-002 | FLOW-069 | BR-229 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-070-RULE-001 | FLOW-070 | BR-230 | TECHNICAL_SUPPORT | PROVEN |
| FLOW-070-RULE-002 | FLOW-070 | BR-231 | TECHNICAL_SUPPORT | PROVEN |

Validation:
- Candidate rules inventoried: 231
- Candidate rules mapped: 231
- Unmapped candidate rules: 0
- Duplicate candidate IDs: 0
- Orphan candidate IDs: 0

## Consolidated Rule Summary

Total candidate rules: 231
Total consolidated BRs: 231
Unique: 104
Duplicate-equivalent: 0
Specializations: 0
Context variants: 93
Conflicting: 0
Technical-support: 34
Configuration-driven: 46
Calculation rules: 30
State guards: 38
Access rules: 19

## Rules Requiring Business Validation

- Conflict: none registered in RE-005; later validation may still identify business conflicts.
- Context Variant: RULE-VARIANT-001 through RULE-VARIANT-011.
- Unresolved Intent: BRs linked to FLOW-xxx-UNCERTAINTY IDs in the Uncertainty Linkage section.
- Configuration Meaning: configuration-driven BRs counted in the summary, including timezone, thresholds, cutoffs, durations, capacity, retry timing, and policy JSON behaviours.
- Missing Business Policy: source uncertainties around unauthenticated routes, body-derived tenant/user/amount, template usage, notification queue claims, and production/test helpers.
- Technical Behaviour Requiring Business Decision: technical-support BRs, especially scheduler dispatch, webhook idempotency, notification retry/dead-letter, and health/deploy verification behaviours.

## Decision Propagation Impact Register

Decision propagation records approved TO-BE business semantics from RE-012 without rewriting AS-IS executable rule evidence above.

| Decision ID | Validation ID | Affected FLOW IDs | Affected candidate-rule IDs | Affected BR IDs | Effect Classification | Decision Effect |
|---|---|---|---|---|---|---|
| DECISION-001 | VALIDATION-001 | FLOW-024, FLOW-029, FLOW-030, FLOW-037, FLOW-043, FLOW-044, FLOW-046 | FLOW-024-RULE-008, FLOW-024-RULE-009, FLOW-024-RULE-010, FLOW-029-RULE-005, FLOW-029-RULE-006, FLOW-029-RULE-009, FLOW-029-RULE-010, FLOW-029-RULE-011, FLOW-029-RULE-013, FLOW-030-RULE-002, FLOW-037-RULE-003, FLOW-043-RULE-004, FLOW-044-RULE-004, FLOW-044-RULE-005, FLOW-046-RULE-003 | BR-044, BR-045, BR-046, BR-053, BR-054, BR-057, BR-058, BR-059, BR-061, BR-064, BR-101, BR-121, BR-125, BR-126, BR-129 | ESTABLISHES_INVARIANT | Canonical bookability/capacity consumption is distinct from occupancy and attendance metrics. HELD and CONFIRMED consume bookable capacity; hold expiry, cancellation, no-show release, and authorized manual release release capacity. Guest occupancy and member attendance calculations remain separate operational metrics preserving F-035/F-041. |
| DECISION-002 | VALIDATION-002 | FLOW-034, FLOW-050, FLOW-051, FLOW-052, FLOW-054 | FLOW-034-RULE-001, FLOW-034-RULE-004, FLOW-034-RULE-005, FLOW-034-RULE-006, FLOW-034-RULE-007, FLOW-034-RULE-008, FLOW-050-RULE-004, FLOW-050-RULE-005, FLOW-050-RULE-007, FLOW-050-RULE-008, FLOW-051-RULE-004, FLOW-051-RULE-005, FLOW-051-RULE-011, FLOW-052-RULE-006, FLOW-052-RULE-007, FLOW-052-RULE-008, FLOW-052-RULE-010, FLOW-054-RULE-007, FLOW-054-RULE-008, FLOW-054-RULE-009 | BR-078, BR-081, BR-082, BR-083, BR-084, BR-085, BR-134, BR-135, BR-137, BR-138, BR-144, BR-145, BR-151, BR-157, BR-158, BR-159, BR-161, BR-176, BR-177, BR-178 | SUPERSEDES_TARGET_SEMANTICS | Booking confirmation target semantics require valid booking eligibility, genuine required payment capture/verification, and payment-to-booking correspondence. Trusted internal-service status does not bypass business invariants. Genuine payment capture in the hold-expiry race takes precedence over technical hold expiry, so a genuinely paid booking remains confirmable. |
| DECISION-007 | VALIDATION-007 | FLOW-030, FLOW-056, FLOW-057 | FLOW-030-RULE-001, FLOW-030-RULE-002, FLOW-056-RULE-001, FLOW-056-RULE-002, FLOW-057-RULE-001, FLOW-057-RULE-002 | BR-063, BR-064, BR-191, BR-192, BR-193, BR-194 | RESOLVES_VARIANT | Negotiated booking is an intentional business variant for group-size and pricing semantics, while remaining subject to DECISION-001 canonical bookability/capacity semantics. Existing negotiated-booking evidence remains valid AS-IS lineage. |
| DECISION-010 | VALIDATION-010 | FLOW-053 | FLOW-053-RULE-001, FLOW-053-RULE-002, FLOW-053-RULE-003, FLOW-053-RULE-005, FLOW-053-RULE-008 | BR-162, BR-163, BR-164, BR-166, BR-169 | SUPERSEDES_TARGET_SEMANTICS | Authorized subscription creation must derive ownership from authenticated member identity or trusted internal-service identity. Request-body tenantId/userId alone cannot establish subscription ownership; AS-IS body-bound/public behaviour remains preserved evidence. |
| DECISION-015 | VALIDATION-015 | FLOW-029, FLOW-034, FLOW-035, FLOW-037, FLOW-043, FLOW-044, FLOW-050, FLOW-051, FLOW-052, FLOW-053, FLOW-054, FLOW-057 | FLOW-029-RULE-001, FLOW-029-RULE-002, FLOW-034-RULE-001, FLOW-034-RULE-002, FLOW-035-RULE-006, FLOW-037-RULE-001, FLOW-043-RULE-001, FLOW-043-RULE-002, FLOW-044-RULE-001, FLOW-050-RULE-001, FLOW-050-RULE-004, FLOW-051-RULE-001, FLOW-051-RULE-004, FLOW-052-RULE-001, FLOW-052-RULE-010, FLOW-053-RULE-008, FLOW-054-RULE-001, FLOW-054-RULE-007, FLOW-057-RULE-002 | BR-049, BR-050, BR-078, BR-079, BR-091, BR-099, BR-118, BR-119, BR-122, BR-131, BR-134, BR-141, BR-144, BR-152, BR-161, BR-169, BR-170, BR-176, BR-194 | ESTABLISHES_INVARIANT | Target authority hierarchy is user authenticated identity to tenant membership to stored ownership; internal trusted identity to explicit tenant context to stored validation; provider verified identity/signature to stored internal reference and tenant/ownership context. Request/body/provider payload identity values alone do not establish authorization or ownership. |
| DECISION-016 | VALIDATION-016 | FLOW-024, FLOW-029, FLOW-037, FLOW-043, FLOW-044, FLOW-046, FLOW-050, FLOW-055, FLOW-065 | FLOW-024-RULE-002, FLOW-024-RULE-006, FLOW-029-RULE-013, FLOW-037-RULE-004, FLOW-043-RULE-003, FLOW-043-RULE-004, FLOW-044-RULE-003, FLOW-046-RULE-002, FLOW-046-RULE-003, FLOW-050-RULE-003, FLOW-055-RULE-009, FLOW-055-RULE-010, FLOW-065-RULE-001, FLOW-065-RULE-002 | BR-038, BR-042, BR-061, BR-102, BR-120, BR-121, BR-124, BR-128, BR-129, BR-133, BR-188, BR-189, BR-220, BR-221 | CLARIFIES | UTC is the persisted/system timestamp representation; branch-local time supplies business meaning for availability, booking cutoff, cancellation/refund eligibility, and member attendance/confirmation; elapsed time governs technical retry/lease durations. This preserves F-066/F-087/F-088 linkage without rewriting existing UTC observations. |

## Decision Semantic Validation

- DECISION-001: Bookability/capacity consumption is represented separately from guest occupancy and member attendance; F-035/F-041 metric separation remains intact.
- DECISION-002: Payment-capture precedence in the hold-expiry race is represented as target semantics attached to FLOW-034/FLOW-052/FLOW-054 lineage; BR-084 and BR-085 remain AS-IS evidence of weaker confirmation checks.
- DECISION-007: Negotiated pricing/group-size variation remains intentional and is not normalized into standard booking semantics; DECISION-001 still governs negotiated bookability/capacity.
- DECISION-010: Request-body tenantId/userId alone is not represented as target subscription authority; FLOW-053 AS-IS public/body-bound evidence remains preserved.
- DECISION-015: Identity hierarchy is represented without rewriting AS-IS authorization evidence, including unauthenticated or body/provider-payload-derived observations.
- DECISION-016: UTC storage, branch-local business meaning, and elapsed-time technical semantics are distinguished; F-066/F-087/F-088 remain supporting findings.

## Decision Propagation Validation

RE-005-targeting decisions from RE-012: 6

RE-005-targeting decisions propagated: 6

Mapped decisions not propagated: 0

Propagated decisions without affected BR/rule lineage: 0

AS-IS statements destructively replaced: 0

Undefined DECISION references: 0

DECISION references absent from RE-012: 0

Decision lineage: PRESERVED

## Evidence Recheck

SOURCE RECHECK REQUIRED: None. Candidate rules were understood and mapped from Phase 4 artifacts and RE-004 without returning to application source.

## Final Lineage Integrity Check

Candidate rule lineage: PRESERVED

Flow lineage: PRESERVED

Capability lineage: PRESERVED

Journey lineage: PRESERVED

Uncertainty lineage: PRESERVED

Decision lineage: PRESERVED

Candidate rules inventoried: 231

Candidate rules mapped: 231

Unmapped candidate rules: 0

Duplicate candidate IDs: 0

Orphan candidate IDs: 0

## Completion Status

RE-005 — BUSINESS RULE CATALOGUE

STATUS:
COMPLETE

CANDIDATE RULE COVERAGE:
231 / 231

UNMAPPED CANDIDATE RULES:
0

FLOW LINEAGE:
PRESERVED

CAPABILITY LINEAGE:
PRESERVED

JOURNEY LINEAGE:
PRESERVED

UNCERTAINTY LINEAGE:
PRESERVED

CONFLICTS:
0

CONTEXT VARIANTS:
11

BUSINESS VALIDATION:
DECISION PROPAGATION DELTA APPLIED
