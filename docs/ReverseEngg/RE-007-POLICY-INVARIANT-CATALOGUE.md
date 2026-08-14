# RE-007 - Policy & Invariant Catalogue

Consolidated from RE-001 through RE-006 and applicable Phase 4 reconstruction artifacts. This catalogue preserves CAP, FLOW, FLOW-RULE, FLOW-UNCERTAINTY, BR, STATE-MODEL, TRANSITION, and STATE-CONFLICT identities. POLICY and INVARIANT IDs are analytical consolidation IDs only.

## Scope And Method

Authoritative inputs: RE-001-SOURCE-BASELINE.md, RE-002-CAPABILITY-CATALOGUE.md, RE-003-FLOW-CATALOGUE.md, RE-004-BUSINESS-FLOW-MODEL.md, RE-005-BUSINESS-RULE-CATALOGUE.md, RE-006-STATE-MODEL.md, and applicable Phase 4 flow/journey artifacts.

No application source recheck was required. RE-005 supplied BR and candidate rule lineage. RE-006 supplied state ownership, transition guards, derived state semantics, cross-entity dependencies, atomicity boundaries, and STATE-CONFLICT-001 through STATE-CONFLICT-003.

## Mechanical Candidate Extraction

BRs inspected: 231

Policy/invariant-relevant BRs: 152

Not-applicable BRs: 79

| BR ID | Source Flow | Candidate Type | Reason | Related State Model |
|---|---|---|---|---|
| BR-001-BR-002 | FLOW-001 | BOTH | Phone normalization, OTP expiry, and cooldown constrain authentication behaviour. | STATE-MODEL-AUTH-SESSION |
| BR-003-BR-004 | FLOW-002 | INVARIANT | Public signup user type and OTP consumption are structural session/account constraints. | STATE-MODEL-AUTH-SESSION |
| BR-005-BR-010 | FLOW-003/FLOW-004/FLOW-005 | BOTH | Login eligibility, refresh renewal, and logout revocation constrain session lifecycle. | STATE-MODEL-AUTH-SESSION |
| BR-013-BR-014 | FLOW-007 | INVARIANT | PendingInvite uniqueness and duplicate upsert behaviour are identity integrity constraints. | STATE-MODEL-PENDING-INVITE |
| BR-017-BR-020 | FLOW-009/FLOW-010 | INVARIANT | Role claims preserve tenant and branch scope. | None |
| BR-021-BR-023 | FLOW-011/FLOW-012 | BOTH | Tenant subdomain uniqueness and tenant update access constrain tenant administration. | None |
| BR-025-BR-026 | FLOW-013 | POLICY | Tenant context resolution and query override are contextual routing policies. | None |
| BR-029-BR-034 | FLOW-015/FLOW-016/FLOW-017 | BOTH | Branch status lifecycle, status value guard, tenant check, and public visibility rules. | STATE-MODEL-BRANCH |
| BR-037-BR-048 | FLOW-024 | BOTH | Availability horizon, override, pattern, block, capacity, public browse, and query handling policies. | STATE-MODEL-AVAILABILITY-PATTERN; STATE-MODEL-AVAILABILITY-OVERRIDE; STATE-MODEL-AVAILABILITY-WINDOW; STATE-MODEL-BLOCKED-WINDOW; STATE-MODEL-BOOKING |
| BR-049-BR-064 | FLOW-029/FLOW-030 | BOTH | Guest and negotiated booking identity, idempotency, horizon, block, capacity, pricing, hold, and player constraints. | STATE-MODEL-BOOKING; STATE-MODEL-AVAILABILITY-WINDOW; STATE-MODEL-BLOCKED-WINDOW; STATE-MODEL-PENDING-INVITE |
| BR-065-BR-077 | FLOW-031/FLOW-032/FLOW-033 | BOTH | Booking read visibility, ownership, tenant, admin, and result-shaping constraints. | STATE-MODEL-BOOKING |
| BR-078-BR-085 | FLOW-034 | BOTH | Internal confirmation access, idempotent confirmed return, HELD guard, HELD -> CONFIRMED mutation, and missing expiry/payment validation. | STATE-MODEL-BOOKING |
| BR-086-BR-092 | FLOW-035 | BOTH | Check-in target, state guard, mutation, and weak auth/timing enforcement. | STATE-MODEL-BOOKING |
| BR-093-BR-105 | FLOW-036/FLOW-037 | BOTH | Preview/cancellation access, cancellable states, refund calculation, idempotency, and non-atomic refund boundary. | STATE-MODEL-BOOKING; STATE-MODEL-REFUND |
| BR-106-BR-117 | FLOW-040/FLOW-041/FLOW-042 | BOTH | Member assignment access, required fields, ACTIVE/SUSPENDED states, and assignment uniqueness. | STATE-MODEL-MEMBER-ASSIGNMENT |
| BR-120-BR-129 | FLOW-043/FLOW-044/FLOW-046 | BOTH | Member JWT, active subscription, cutoff, booking creation/update, lock/double-check, and derived attendance. | STATE-MODEL-MEMBER-ASSIGNMENT; STATE-MODEL-ATTENDANCE-DERIVED; STATE-MODEL-SUBSCRIPTION; STATE-MODEL-BOOKING |
| BR-132-BR-138 | FLOW-050 | BOTH | PaymentIntent booking linkage, idempotency, ownership, HELD guard, amount derivation, purpose, and provider independence. | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-BOOKING |
| BR-149-BR-159 | FLOW-051/FLOW-052 | BOTH | Order creation auth/ownership/amount/gatewayRef and direct verification capture/confirmation boundary. | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-BOOKING |
| BR-164-BR-190 | FLOW-053/FLOW-054/FLOW-055 | BOTH | Subscription creation, mandate uniqueness, weak identity binding, payment webhook idempotency/capture, autopay idempotency, subscription state, billing PaymentIntent, notifications, and acknowledged no-op cases. | STATE-MODEL-SUBSCRIPTION; STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-NOTIFICATION-REQUEST |
| BR-191-BR-196 | FLOW-056/FLOW-057/FLOW-058 | BOTH | Negotiated payment link HELD guard, gatewayRef metadata, idempotency/access, production simulation block, and webhook delegation. | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-BOOKING |
| BR-197-BR-211 | FLOW-059/FLOW-060 | BOTH | Refund creation/override required fields, booking/payment guards, positive amount, idempotency, cap, local-only provider boundary. | STATE-MODEL-REFUND; STATE-MODEL-BOOKING; STATE-MODEL-PAYMENT-INTENT |
| BR-212-BR-221 | FLOW-061/FLOW-062/FLOW-063/FLOW-064/FLOW-065 | BOTH | Queueing, channel default, template/device uniqueness, history limits, due queue eligibility, retries, sent/dead_letter. | STATE-MODEL-NOTIFICATION-REQUEST |
| BR-222-BR-229 | FLOW-066/FLOW-067/FLOW-068/FLOW-069 | BOTH | Scheduled job claimability, lease, manual execution, dispatch dedupe, PENDING/SENT/FAILED outcome. | STATE-MODEL-SCHEDULED-JOB; STATE-MODEL-SCHEDULED-JOB-DISPATCH |
| BR-230-BR-231 | FLOW-070 | POLICY | Health/deployment verification are operational policies rather than domain invariants. | None |

Not-applicable BRs: BR-011-BR-012, BR-015-BR-016, BR-024, BR-027-BR-028, BR-035-BR-036, BR-118-BR-119, BR-130-BR-131, BR-139-BR-148, BR-160-BR-163, and source BRs not carrying policy/invariant semantics beyond representational or descriptive mechanics.

## Consolidated Policies

| Policy ID | Title | Domain | Policy Type | Current Executable Behaviour | Configuration Source | Default | Override Scope | Consumers | Source BR IDs | Source Candidate Rules | Source FLOW IDs | Related State Models | Related Transitions | Related Uncertainties | Consistency Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POLICY-001 | OTP timing policy | Identity / Session | TEMPORAL | OTP TTL is 5 minutes and request cooldown is 60 seconds. | Source rule evidence | 5 minutes / 60 seconds | None evidenced | OTP request/verification | BR-002 | FLOW-001-RULE-002 | FLOW-001 | STATE-MODEL-AUTH-SESSION | None | FLOW-001-UNCERTAINTY-001 | CONSISTENT |
| POLICY-002 | Refresh session lifetime policy | Identity / Session | TEMPORAL | Access token TTL is 15 minutes; refresh cookie/session TTL is renewed to 30 days. | Source rule evidence | 15 minutes / 30 days | None evidenced | Session refresh | BR-007 | FLOW-004-RULE-001 | FLOW-004 | STATE-MODEL-AUTH-SESSION | None | FLOW-004-UNCERTAINTY-001 | CONSISTENT |
| POLICY-003 | Tenant context resolution policy | Tenant | ACCESS | Tenant context is resolved before auth; query parameter tenant can override hostname-derived subdomain. | Source flow context | UNKNOWN | Request query/hostname context | Auth and tenant-scoped requests | BR-025, BR-026 | FLOW-013-RULE-001/002 | FLOW-013 | None | None | FLOW-013-UNCERTAINTY-001 | CONTEXT_DEPENDENT |
| POLICY-004 | Branch visibility policy | Branch | ACCESS | Public branch browse returns ACTIVE branches; draft inclusion is owner/internal gated but unauthorized draft attempts do not error. | Branch status | ACTIVE public | Owner/internal context | Branch browse | BR-033, BR-034 | FLOW-017-RULE-001/002 | FLOW-017 | STATE-MODEL-BRANCH | None | FLOW-017-UNCERTAINTY-001 | CONTEXT_DEPENDENT |
| POLICY-005 | Availability browse horizon policy | Availability | TEMPORAL | Browse reach is capped by first booking rule guestOpenWindowDays, defaulting to 7 days if no rule exists. | Booking rule | 7 days | First booking rule | Availability browsing | BR-037 | FLOW-024-RULE-001 | FLOW-024 | STATE-MODEL-AVAILABILITY-WINDOW | None | FLOW-024-UNCERTAINTY-001/002/003 | CONSISTENT |
| POLICY-006 | Availability override policy | Availability | SCHEDULING | Closed override suppresses generated slots; modified override takes precedence over normal pattern shape. | Availability override rows | UNKNOWN | Branch-local date | Availability browsing/generation | BR-039, BR-040 | FLOW-024-RULE-003/004 | FLOW-024 | STATE-MODEL-AVAILABILITY-OVERRIDE | None | FLOW-024-UNCERTAINTY-001/002/003 | CONSISTENT |
| POLICY-007 | Active availability pattern policy | Availability | SCHEDULING | Only active patterns matching generated date ISO weekday contribute generated browse windows when no override applies. | Pattern status/weekdays | ACTIVE only | Generated date | Availability browsing/generation | BR-041 | FLOW-024-RULE-005 | FLOW-024 | STATE-MODEL-AVAILABILITY-PATTERN | None | FLOW-024-UNCERTAINTY-001/002/003 | CONSISTENT |
| POLICY-008 | Availability public browse access policy | Availability | ACCESS | Resource-pool availability browse does not require user JWT or admin authorization. | Endpoint behaviour | Public | None evidenced | Availability browsing | BR-047, BR-048 | FLOW-024-RULE-011/012 | FLOW-024 | STATE-MODEL-AVAILABILITY-WINDOW | None | FLOW-024-UNCERTAINTY-001/002/003 | CONSISTENT |
| POLICY-009 | Standard booking horizon policy | Booking | TEMPORAL | Self-service booking horizon uses guestOpenWindowDays even if caller supplies isMemberBooking true. | Booking rule | UNKNOWN | Guest/self-service operation | Standard booking creation | BR-054 | FLOW-029-RULE-006 | FLOW-029 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-001/002/003 | CONTEXT_DEPENDENT |
| POLICY-010 | Standard booking pricing policy | Booking | PRICING | Self-service booking price is server-side from window override or pool default; client price is not accepted. | Window override or pool default | UNKNOWN | Window/pool | Standard booking creation | BR-059 | FLOW-029-RULE-011 | FLOW-029 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-001/002/003 | CONSISTENT |
| POLICY-011 | Held booking expiry policy | Booking | TEMPORAL | New self-service bookings persist HELD with a five-minute hold expiry. | Source rule evidence | 5 minutes | Self-service booking | Standard booking creation; payment path | BR-060 | FLOW-029-RULE-012 | FLOW-029 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-001/002/003 | CONTEXT_DEPENDENT |
| POLICY-012 | Internal confirmation access policy | Booking | ACCESS | Booking confirmation is internal-service-key protected. | Internal key | Internal only | FLOW-034 | Booking confirmation | BR-078 | FLOW-034-RULE-001 | FLOW-034 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-003/004 | FLOW-034-UNCERTAINTY-* | CONSISTENT |
| POLICY-013 | Check-in access/timing policy | Booking | ACCESS / TEMPORAL | Server check-in does not enforce caller auth/ownership; timing is client-side display condition only. | PWA/server split | Not server-enforced | Client display only | Check-in | BR-091, BR-092 | FLOW-035-RULE-006/007 | FLOW-035 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-005 | FLOW-035-UNCERTAINTY-* | UNRESOLVED |
| POLICY-014 | Cancellation preview policy | Booking | REFUND | Preview requires internal key or booking access, allows HELD/CONFIRMED/CANCELLED, computes refund without persisted write. | Booking rule tiers for CONFIRMED | UNKNOWN | Preview only | Cancellation preview | BR-093-BR-098 | FLOW-036-RULE-001 through FLOW-036-RULE-006 | FLOW-036 | STATE-MODEL-BOOKING; STATE-MODEL-REFUND | None | FLOW-036-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| POLICY-015 | Cancellation execution policy | Booking | REFUND | Cancellation requires internal key or booking access, is idempotent for CANCELLED, and only HELD/CONFIRMED are active cancellable states. | Booking rule tiers for CONFIRMED | UNKNOWN | Cancellation execution | Booking cancellation | BR-099-BR-105 | FLOW-037-RULE-001 through FLOW-037-RULE-007 | FLOW-037 | STATE-MODEL-BOOKING; STATE-MODEL-REFUND | TRANSITION-BOOKING-006/007/008 | FLOW-037-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| POLICY-016 | Member confirmation cutoff policy | Membership | TEMPORAL | Confirmation is rejected at or after cutoff time; canConfirm is true only before cutoff with active subscription and no booking. | Source rule evidence | UNKNOWN | Member confirmation | Today view and confirmation | BR-121, BR-124 | FLOW-043-RULE-004, FLOW-044-RULE-003 | FLOW-043, FLOW-044 | STATE-MODEL-ATTENDANCE-DERIVED; STATE-MODEL-BOOKING | TRANSITION-BOOKING-010/011 | FLOW-043-UNCERTAINTY-*, FLOW-044-UNCERTAINTY-* | CONSISTENT |
| POLICY-017 | Member active subscription policy | Membership | ELIGIBILITY | Active subscription is required to confirm attendance. | Subscription status | active | Member confirmation | Member attendance confirmation | BR-123 | FLOW-044-RULE-002 | FLOW-044 | STATE-MODEL-SUBSCRIPTION; STATE-MODEL-BOOKING | TRANSITION-BOOKING-010/011 | FLOW-044-UNCERTAINTY-* | CONSISTENT |
| POLICY-018 | Payment order amount/currency policy | Payment | PAYMENT | Provider amount is stored PaymentIntent.amount; amount must be finite and at least 100 paise; currency defaults to INR. | Stored PaymentIntent / request currency | INR | Payment order creation | Razorpay order creation | BR-145-BR-147 | FLOW-051-RULE-005/006/007 | FLOW-051 | STATE-MODEL-PAYMENT-INTENT | TRANSITION-PAYMENT-INTENT-003 | FLOW-051-UNCERTAINTY-* | CONSISTENT |
| POLICY-019 | Payment verification signature policy | Payment | PAYMENT | Direct verification requires Razorpay fields, HMAC payload, expected signature, and rejects mismatch. | Razorpay key secret or hardcoded fallback | UNKNOWN | Direct verification | Payment verification | BR-152-BR-155 | FLOW-052-RULE-001/002/003/004 | FLOW-052 | STATE-MODEL-PAYMENT-INTENT | TRANSITION-PAYMENT-INTENT-001 | FLOW-052-UNCERTAINTY-* | CONSISTENT |
| POLICY-020 | Webhook signature/event policy | Payment | PAYMENT | One-time payment webhooks require valid raw-body signature and event id before idempotency/business processing. | Razorpay webhook signature | UNKNOWN | Payment webhook | Razorpay payment webhook | BR-170-BR-172 | FLOW-054-RULE-001/002/003 | FLOW-054 | STATE-MODEL-PAYMENT-INTENT | TRANSITION-PAYMENT-INTENT-002 | FLOW-054-UNCERTAINTY-* | CONSISTENT |
| POLICY-021 | Simulated capture policy | Payment | PAYMENT | Simulated capture is unavailable in production and delegates mutation to the signed webhook endpoint. | Environment | Not production | Simulation only | Payment simulation | BR-195, BR-196 | FLOW-058-RULE-001/002 | FLOW-058 | STATE-MODEL-PAYMENT-INTENT | TRANSITION-PAYMENT-INTENT-002 | FLOW-058-UNCERTAINTY-001 | CONSISTENT |
| POLICY-022 | Refund creation policy | Cancellation / Refund | REFUND | Refund creation requires cancelled booking, positive refund amount, captured PaymentIntent, and returns existing Refund by PaymentIntent idempotently. | Booking refundAmount / captured PaymentIntent | Skip zero/nonpositive | Refund creation | Refund creation | BR-197-BR-203 | FLOW-059-RULE-001 through FLOW-059-RULE-007 | FLOW-059 | STATE-MODEL-REFUND | TRANSITION-REFUND-001 | FLOW-059-UNCERTAINTY-001/002 | CONTEXT_DEPENDENT |
| POLICY-023 | Refund override policy | Cancellation / Refund | REFUND | Override requires admin JWT, cancelled booking, captured PaymentIntent, required fields, and override amount not exceeding original payment. | Admin request / PaymentIntent amount | UNKNOWN | Admin override | Refund override | BR-204-BR-211 | FLOW-060-RULE-001 through FLOW-060-RULE-008 | FLOW-060 | STATE-MODEL-REFUND | None | FLOW-060-UNCERTAINTY-001/002 | CONTEXT_DEPENDENT |
| POLICY-024 | Notification retry policy | Notification | RETRY | Queue worker processes at most 50 due queued requests; attempts 1-3 retry and attempt 4 failure is terminal dead_letter. | Queue worker constants | 50 / 4 attempts | Queue worker | Notification delivery | BR-220, BR-221 | FLOW-065-RULE-001/002 | FLOW-065 | STATE-MODEL-NOTIFICATION-REQUEST | TRANSITION-NOTIFICATION-002/003 | FLOW-065-UNCERTAINTY-001 | CONTEXT_DEPENDENT |
| POLICY-025 | Scheduled job claim policy | Scheduler | SCHEDULING | Due jobs claim only enabled rows whose nextRunAt <= now and lock is absent/expired; timeout summaries keep the lease until expiry. | ScheduledJob row | UNKNOWN | Scheduler claim | Scheduled jobs | BR-222, BR-223 | FLOW-066-RULE-001/002 | FLOW-066 | STATE-MODEL-SCHEDULED-JOB | TRANSITION-SCHEDULED-JOB-001 | FLOW-066-UNCERTAINTY-001 | CONTEXT_DEPENDENT |
| POLICY-026 | Platform health/deployment policy | Operations | OPERATIONAL | Health endpoints do not check dependencies; deployment verification fails if component version differs from expected SHA. | Runtime version/SHA | UNKNOWN | Platform operations | Health/deploy verification | BR-230, BR-231 | FLOW-070-RULE-001/002 | FLOW-070 | None | None | FLOW-070-UNCERTAINTY-001 | CONSISTENT |

## Consolidated Invariants

| Invariant ID | Title | Domain | Invariant Type | Invariant Statement | Enforcement Boundary | Enforcement Mechanism | Transaction Boundary | Enforcement Strength | Source BR IDs | Source Candidate Rules | Source FLOW IDs | Related State Models | Related Transitions | Related Uncertainties | Consistency Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| INVARIANT-001 | OTP normalized before persistence | Identity | REFERENTIAL | Phone is normalized before OTP persistence. | Application | Normalization before write | Single operation | APPLICATION_ENFORCED | BR-001 | FLOW-001-RULE-001 | FLOW-001 | STATE-MODEL-AUTH-SESSION | None | FLOW-001-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-002 | OTP consumed before session | Identity | STATE | Successful verification deletes OTP before session creation. | Application | Delete before session creation | Single operation | APPLICATION_ENFORCED | BR-004 | FLOW-002-RULE-002 | FLOW-002 | STATE-MODEL-AUTH-SESSION | None | FLOW-002-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-003 | Logout revokes by refresh token | Identity | STATE | Logout is caller-idempotent and revokes by refresh token rather than JWT subject. | Application | Refresh-token revocation/delete | Single operation | APPLICATION_ENFORCED | BR-009, BR-010 | FLOW-005-RULE-001/002 | FLOW-005 | STATE-MODEL-AUTH-SESSION | TRANSITION-AUTH-SESSION-001 | FLOW-005-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-004 | PendingInvite tenant-phone uniqueness | Identity | UNIQUENESS | Pending invite uniqueness is phone plus tenantId; duplicate invite resolves by upsert. | Database/service | Unique key/upsert | Single operation | DB_ENFORCED | BR-013, BR-014 | FLOW-007-RULE-001/002 | FLOW-007 | STATE-MODEL-PENDING-INVITE | None | FLOW-007-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-005 | Role tenant/branch scope | Role | TENANT_BOUNDARY | OWNER is tenant-scoped without branch id; non-owner roles require branch id belonging to tenant. | Application | Role-claim construction and validation | Auth context | APPLICATION_ENFORCED | BR-017-BR-020 | FLOW-009-RULE-001/002, FLOW-010-RULE-001/002 | FLOW-009, FLOW-010 | None | None | FLOW-009/010-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-006 | Tenant subdomain uniqueness | Tenant | UNIQUENESS | Tenant subdomain is unique. | Database/application | Unique lookup/constraint evidenced by flow | Tenant create | DB_ENFORCED | BR-021 | FLOW-011-RULE-001 | FLOW-011 | None | None | FLOW-011-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-007 | Tenant update boundary | Tenant | TENANT_BOUNDARY | Tenant update requires owner for same tenant or internal key. | Application/service | Authorization check | Single operation | SERVICE_BOUNDARY_ENFORCED | BR-023 | FLOW-012-RULE-001 | FLOW-012 | None | None | FLOW-012-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-008 | Branch status values | Branch | STATE | Branch status updates accept only DRAFT, ACTIVE, INACTIVE. | Application | Value validation | Single operation | APPLICATION_ENFORCED | BR-029, BR-031 | FLOW-015-RULE-001, FLOW-016-RULE-001 | FLOW-015, FLOW-016 | STATE-MODEL-BRANCH | TRANSITION-BRANCH-001/002 | FLOW-015/016-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-009 | Branch tenant update boundary | Branch | TENANT_BOUNDARY | Branch update authorizes against stored branch tenant id, not body tenant. | Application | Stored tenant authorization | Single operation | APPLICATION_ENFORCED | BR-032 | FLOW-016-RULE-002 | FLOW-016 | STATE-MODEL-BRANCH | TRANSITION-BRANCH-002 | FLOW-016-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-010 | Blocked windows exclude availability | Availability | TEMPORAL | Blocked windows remove overlapping browse windows and prevent booking creation. | Application | Overlap checks | Browse/create operation | APPLICATION_ENFORCED | BR-042, BR-056 | FLOW-024-RULE-006, FLOW-029-RULE-008 | FLOW-024, FLOW-029 | STATE-MODEL-BLOCKED-WINDOW; STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-024/029-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-011 | Browse capacity calculation | Capacity | CAPACITY | Browse capacity counts HELD and CONFIRMED bookings; pooled slots require window.capacity - activeBookings.length > 0. | Application | Read-time calculation | Browse operation | DERIVED_ONLY | BR-043, BR-045 | FLOW-024-RULE-007/009 | FLOW-024 | STATE-MODEL-AVAILABILITY-WINDOW; STATE-MODEL-BOOKING | None | FLOW-024-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-012 | Fixed-instance browse resource exclusion | Capacity | CAPACITY | Fixed-instance slot is browsable only if window resource is not reserved by active booking. | Application | Read-time exclusion | Browse operation | DERIVED_ONLY | BR-044 | FLOW-024-RULE-008 | FLOW-024 | STATE-MODEL-AVAILABILITY-WINDOW; STATE-MODEL-BOOKING | None | FLOW-024-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-013 | Standard booking identity source | Booking | OWNERSHIP | Booking creator userId and tenantId are taken from JWT, not request body. | Application | JWT-derived persistence | Booking create | APPLICATION_ENFORCED | BR-049 | FLOW-029-RULE-001 | FLOW-029 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-014 | Booking idempotency | Booking | IDEMPOTENCY | Self-service booking requires idempotency key; repeated key returns existing booking. | Application/database | Idempotency lookup | Booking create | APPLICATION_ENFORCED | BR-050, BR-051 | FLOW-029-RULE-002/003 | FLOW-029 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-015 | Window lock before capacity | Booking | CONCURRENCY | Selected availability window is locked before booking capacity decisions. | Transaction | Window lock before checks | Booking transaction | TRANSACTION_ENFORCED | BR-052 | FLOW-029-RULE-004 | FLOW-029 | STATE-MODEL-AVAILABILITY-WINDOW; STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-016 | Standard booking group-size/capacity | Booking | CAPACITY | Group size includes user plus co-player count and must fit min occupancy and capacity; fixed/pooled active held/confirmed capacity guards apply. | Transaction/application | Capacity checks after lock | Booking transaction | TRANSACTION_ENFORCED | BR-053, BR-057, BR-058 | FLOW-029-RULE-005/009/010 | FLOW-029 | STATE-MODEL-BOOKING; STATE-MODEL-AVAILABILITY-WINDOW | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-017 | Self-service guest booking flag | Booking | STATE | Self-service POST /bookings always persists isMemberBooking false. | Application | Server-side value assignment | Booking create | APPLICATION_ENFORCED | BR-055 | FLOW-029-RULE-007 | FLOW-029 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-018 | BookingPlayer phone persistence | Booking | REFERENTIAL | Valid co-player phones are normalized and persisted as BookingPlayer rows without unresolved user identity. | Application | Normalization and row creation | Booking create | APPLICATION_ENFORCED | BR-061, BR-062 | FLOW-029-RULE-013/014 | FLOW-029 | STATE-MODEL-BOOKING; STATE-MODEL-PENDING-INVITE | TRANSITION-BOOKING-001 | FLOW-029-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-019 | Negotiated booking entry state | Booking | STATE | Negotiated bookings are internal-service only and always non-member HELD. | Service | Internal-service operation | Negotiated create | SERVICE_BOUNDARY_ENFORCED | BR-063 | FLOW-030-RULE-001 | FLOW-030 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-002 | FLOW-030-UNCERTAINTY-001 | CONSISTENT |
| INVARIANT-020 | Negotiated booking capacity scope | Booking | CAPACITY | Negotiated booking waives group-size/pricing constraints but not availability, block, or capacity constraints. | Service/application | Negotiated flow checks | Negotiated create | APPLICATION_ENFORCED | BR-064 | FLOW-030-RULE-002 | FLOW-030 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-002 | FLOW-030-UNCERTAINTY-001 | CONTEXT_DEPENDENT |
| INVARIANT-021 | Booking read ownership/tenant boundary | Booking | OWNERSHIP | Non-internal booking reads are tenant-scoped and allow booking owner or scoped admin access. | Application | Tenant/owner/admin checks | Read operation | APPLICATION_ENFORCED | BR-065-BR-077 | FLOW-031-RULE-001/002/003/004, FLOW-032-RULE-001/002/003/004, FLOW-033-RULE-001/002/003/004/005 | FLOW-031, FLOW-032, FLOW-033 | STATE-MODEL-BOOKING | None | FLOW-031/032/033-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-022 | Booking confirmation state guard | Booking | STATE | FLOW-034 identifies booking by path id, returns confirmed booking unchanged, and only HELD is eligible for HELD -> CONFIRMED mutation. | Service | Internal key and state check | Single operation | SERVICE_BOUNDARY_ENFORCED | BR-078-BR-083 | FLOW-034-RULE-001 through FLOW-034-RULE-006 | FLOW-034 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-003/004 | FLOW-034-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-023 | Confirmation lacks expiry/payment proof guard | Booking | PAYMENT | FLOW-034 does not enforce hold-expiry validity and does not verify payment state or payment proof. | Service boundary | Missing validation in observed flow | Single operation | NOT_ENFORCED | BR-084, BR-085 | FLOW-034-RULE-007/008 | FLOW-034 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-003 | FLOW-034-UNCERTAINTY-* | UNRESOLVED |
| INVARIANT-024 | Check-in state guard | Booking | STATE | Check-in returns already checked-in unchanged and only CONFIRMED can transition to CHECKED_IN. | Application | State guard | Single operation | APPLICATION_ENFORCED | BR-086-BR-090 | FLOW-035-RULE-001 through FLOW-035-RULE-005 | FLOW-035 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-005 | FLOW-035-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-025 | Cancellation state/idempotency | Booking | STATE | CANCELLED cancellation is idempotent; only HELD and CONFIRMED are active cancellable states. | Application | State guard | Single operation | APPLICATION_ENFORCED | BR-099-BR-101 | FLOW-037-RULE-001/002/003 | FLOW-037 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-006/007/008 | FLOW-037-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-026 | Cancellation not refund-atomic | Booking/Refund | REFERENTIAL | Cancellation does not invoke refund creation and lacks explicit DB transaction/locking evidence. | Service boundary | Separate operations | Separate operation | PARTIALLY_ENFORCED | BR-104, BR-105 | FLOW-037-RULE-006/007 | FLOW-037 | STATE-MODEL-BOOKING; STATE-MODEL-REFUND | TRANSITION-BOOKING-006/007 | FLOW-037-UNCERTAINTY-* | UNRESOLVED |
| INVARIANT-027 | Member assignment uniqueness | Membership | UNIQUENESS | Duplicate active same-pool assignment is surfaced as 409; updating to ACTIVE can conflict with one-active-assignment uniqueness. | Database/application | Uniqueness conflict | Create/update | DB_ENFORCED | BR-108, BR-109, BR-116 | FLOW-040-RULE-003/004, FLOW-042-RULE-003 | FLOW-040, FLOW-042 | STATE-MODEL-MEMBER-ASSIGNMENT | TRANSITION-MEMBER-ASSIGNMENT-001/002 | FLOW-040/042-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-028 | Member assignment access/scope | Membership | OWNERSHIP | Assignment create/list/update require internal/admin access scoped to resource pool/branch. | Application | Access checks | Single operation | APPLICATION_ENFORCED | BR-106, BR-112-BR-115 | FLOW-040-RULE-001, FLOW-041-RULE-001/002/003/004, FLOW-042-RULE-001/002 | FLOW-040, FLOW-041, FLOW-042 | STATE-MODEL-MEMBER-ASSIGNMENT | TRANSITION-MEMBER-ASSIGNMENT-001/002 | FLOW-040/041/042-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-029 | Member attendance confirmation integrity | Membership | MEMBERSHIP | Confirm requires MEMBER JWT, active subscription, before cutoff, and creates/updates member booking with attendance timestamp. | Transaction/application | JWT, subscription, cutoff, transaction/window lock/double-check | Confirmation transaction | TRANSACTION_ENFORCED | BR-122-BR-126 | FLOW-044-RULE-001 through FLOW-044-RULE-005 | FLOW-044 | STATE-MODEL-BOOKING; STATE-MODEL-ATTENDANCE-DERIVED; STATE-MODEL-SUBSCRIPTION | TRANSITION-BOOKING-010/011 | FLOW-044-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-030 | Derived attendance separation | Membership | MEMBERSHIP | Attendance status derives from assignment, subscription, booking attendance stamp, release status, and cutoff; no persisted Attendance enum is evidenced. | Derived read | Read-time derivation | Read operation | DERIVED_ONLY | BR-121, BR-125, BR-128, BR-129 | FLOW-043-RULE-004, FLOW-044-RULE-004, FLOW-046-RULE-002/003 | FLOW-043, FLOW-044, FLOW-046 | STATE-MODEL-ATTENDANCE-DERIVED | None | FLOW-043/044/046-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-031 | PaymentIntent active idempotency | Payment | IDEMPOTENCY | At most one active intent record is created per booking reference by FLOW-050; retries return existing non-captured intent. | Application/database | Existing intent lookup | Intent creation | APPLICATION_ENFORCED | BR-132 | FLOW-050-RULE-002 | FLOW-050 | STATE-MODEL-PAYMENT-INTENT | None | FLOW-050-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-032 | PaymentIntent ownership | Payment | OWNERSHIP | Caller must own existing intent or fetched booking to create/retrieve intent; order creation caller must own local payment intent. | Application | Owner checks | Intent/order operations | APPLICATION_ENFORCED | BR-133, BR-144 | FLOW-050-RULE-003, FLOW-051-RULE-004 | FLOW-050, FLOW-051 | STATE-MODEL-PAYMENT-INTENT | TRANSITION-PAYMENT-INTENT-003 | FLOW-050/051-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-033 | PaymentIntent HELD booking guard | Payment | STATE | New payment intents can be created only for HELD bookings; payment links can be created only for HELD bookings. | Application | Booking status guard | Intent/link create | APPLICATION_ENFORCED | BR-135, BR-191 | FLOW-050-RULE-005, FLOW-056-RULE-001 | FLOW-050, FLOW-056 | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-BOOKING | TRANSITION-PAYMENT-INTENT-004 | FLOW-050/056-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-034 | Payment amount derivation | Payment | PAYMENT | Intent amount derives from stored booking price; order uses stored intent amount, not client amount. | Application | Server-side amount source | Intent/order create | APPLICATION_ENFORCED | BR-136, BR-137, BR-145-BR-147 | FLOW-050-RULE-006/007, FLOW-051-RULE-005/006/007 | FLOW-050, FLOW-051 | STATE-MODEL-PAYMENT-INTENT | TRANSITION-PAYMENT-INTENT-003 | FLOW-050/051-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-035 | Direct payment capture guard | Payment | STATE | Only matching pending intent transitions to captured; matching capture invokes FLOW-034 with intent.referenceId. | Application/service | Signature + pending intent match + service call | Service boundary | SERVICE_BOUNDARY_ENFORCED | BR-157, BR-158 | FLOW-052-RULE-006/007 | FLOW-052 | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-BOOKING | TRANSITION-PAYMENT-INTENT-001; TRANSITION-BOOKING-003 | FLOW-052-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-036 | Payment webhook idempotency and capture | Payment | IDEMPOTENCY / STATE | WebhookEvent gatewayEventId enforces idempotency; duplicate returns success and skips processing; only matching pending intent is captured and then triggers booking confirmation. | Database/service | Insert before processing, unique violation duplicate, pending intent update | Service boundary | DB_ENFORCED | BR-173-BR-178 | FLOW-054-RULE-004 through FLOW-054-RULE-009 | FLOW-054 | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-BOOKING | TRANSITION-PAYMENT-INTENT-002; TRANSITION-BOOKING-003 | FLOW-054-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-037 | Subscription mandate uniqueness | Subscription | UNIQUENESS | Duplicate mandate registration is handled by upsert on unique mandateId with no update fields. | Database | Unique mandateId upsert | Subscription create | DB_ENFORCED | BR-167 | FLOW-053-RULE-006 | FLOW-053 | STATE-MODEL-SUBSCRIPTION | None | FLOW-053-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-038 | Subscription/autopay state mutation | Subscription | STATE | Charged sets found subscription active and creates captured billing PaymentIntent; charge_failed sets found subscription suspended and attempts notification. | Service/application | Webhook event handling | Service boundary | APPLICATION_ENFORCED | BR-183-BR-186 | FLOW-055-RULE-004/005/006/007 | FLOW-055 | STATE-MODEL-SUBSCRIPTION; STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-NOTIFICATION-REQUEST | TRANSITION-SUBSCRIPTION-001/002 | FLOW-055-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-039 | Autopay webhook idempotency | Subscription | IDEMPOTENCY | Autopay webhook inserts WebhookEvent gatewayEventId before processing; duplicate returns success. | Database/service | Insert before processing | Service boundary | DB_ENFORCED | BR-181, BR-182 | FLOW-055-RULE-002/003 | FLOW-055 | STATE-MODEL-SUBSCRIPTION | TRANSITION-SUBSCRIPTION-001/002 | FLOW-055-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-040 | Refund local idempotency | Refund | IDEMPOTENCY | Existing Refund by PaymentIntent is returned idempotently for refund creation and override. | Application/database | Existing refund lookup | Refund operation | APPLICATION_ENFORCED | BR-202, BR-209 | FLOW-059-RULE-006, FLOW-060-RULE-006 | FLOW-059, FLOW-060 | STATE-MODEL-REFUND | TRANSITION-REFUND-001 | FLOW-059/060-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-041 | Refund eligibility | Refund | PAYMENT | Refund requires cancelled booking and captured PaymentIntent; zero/nonpositive refund skips creation; override amount cannot exceed original payment. | Application | Booking/payment/amount guards | Refund operation | APPLICATION_ENFORCED | BR-199-BR-201, BR-207, BR-208, BR-210 | FLOW-059-RULE-003/004/005, FLOW-060-RULE-004/005/007 | FLOW-059, FLOW-060 | STATE-MODEL-REFUND; STATE-MODEL-BOOKING; STATE-MODEL-PAYMENT-INTENT | TRANSITION-REFUND-001 | FLOW-059/060-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-042 | Notification queue lifecycle | Notification | STATE | Send queues before delivery; worker moves queued requests to sent or dead_letter based on delivery/retry outcome. | Application/best effort | Queue write and worker update | Separate operations | BEST_EFFORT | BR-212, BR-220, BR-221 | FLOW-061-RULE-001, FLOW-065-RULE-001/002 | FLOW-061, FLOW-065 | STATE-MODEL-NOTIFICATION-REQUEST | TRANSITION-NOTIFICATION-001/002/003 | FLOW-061/065-UNCERTAINTY-* | CONTEXT_DEPENDENT |
| INVARIANT-043 | Notification template/device uniqueness | Notification | UNIQUENESS | One template per tenant/channel/event tuple; device token is globally unique and re-registration updates association. | Database/application | Upsert/unique token | Template/device operations | DB_ENFORCED | BR-214, BR-216, BR-217 | FLOW-062-RULE-001, FLOW-063-RULE-001/002 | FLOW-062, FLOW-063 | STATE-MODEL-NOTIFICATION-REQUEST | None | FLOW-062/063-UNCERTAINTY-* | CONSISTENT |
| INVARIANT-044 | Scheduler job claim lease | Scheduler | OPERATIONAL / CONCURRENCY | Claimable job must be enabled, due, and unlocked/expired; timeout summaries keep lease until expiry. | Application/database | Due query and lock update | Scheduler claim | PARTIALLY_ENFORCED | BR-222, BR-223 | FLOW-066-RULE-001/002 | FLOW-066 | STATE-MODEL-SCHEDULED-JOB | TRANSITION-SCHEDULED-JOB-001 | FLOW-066-UNCERTAINTY-001 | CONTEXT_DEPENDENT |
| INVARIANT-045 | Dispatch dedupe and outcome | Scheduler | IDEMPOTENCY / STATE | Dispatch dedupe key is jobName plus dedupKey; live PENDING duplicates are denied; SENT/FAILED outcome mutations are separate. | Application/database | Dedupe lookup and status update | Dispatch operation | APPLICATION_ENFORCED | BR-226-BR-229 | FLOW-068-RULE-001/002, FLOW-069-RULE-001/002 | FLOW-068, FLOW-069 | STATE-MODEL-SCHEDULED-JOB-DISPATCH | TRANSITION-SCHEDULED-JOB-DISPATCH-001/002/003 | FLOW-068/069-UNCERTAINTY-* | CONTEXT_DEPENDENT |

## Booking Invariants

RE-006 Booking transitions are referenced, not recreated:

| Topic | Executable Constraint | Policy/Invariant | BR IDs | Candidate Rules | Flows | State/Transition |
|---|---|---|---|---|---|---|
| Idempotency | Self-service booking requires idempotency key and returns existing booking on repeat key. | INVARIANT-014 | BR-050, BR-051 | FLOW-029-RULE-002/003 | FLOW-029 | TRANSITION-BOOKING-001 |
| Booking horizon | Self-service horizon uses guestOpenWindowDays. | POLICY-009 | BR-054 | FLOW-029-RULE-006 | FLOW-029 | TRANSITION-BOOKING-001 |
| Blocked-window exclusion | Overlap prevents browse slot and booking creation. | INVARIANT-010 | BR-042, BR-056 | FLOW-024-RULE-006, FLOW-029-RULE-008 | FLOW-024, FLOW-029 | TRANSITION-BOOKING-001 |
| Capacity | Window lock and active booking capacity guards constrain creation. | INVARIANT-015, INVARIANT-016 | BR-052, BR-053, BR-057, BR-058 | FLOW-029-RULE-004/005/009/010 | FLOW-029 | TRANSITION-BOOKING-001 |
| BookingPlayer creation | Co-player phones are normalized and persisted without unresolved user identity. | INVARIANT-018 | BR-061, BR-062 | FLOW-029-RULE-013/014 | FLOW-029 | TRANSITION-BOOKING-001 |
| Ownership | Booking creation uses JWT userId/tenantId; reads enforce owner/admin scope. | INVARIANT-013, INVARIANT-021 | BR-049, BR-065-BR-077 | FLOW-029-RULE-001, FLOW-031/032/033-RULE-* | FLOW-029, FLOW-031, FLOW-032, FLOW-033 | STATE-MODEL-BOOKING |
| Confirmation | HELD -> CONFIRMED is owned by FLOW-034; already-confirmed return is idempotent. | INVARIANT-022 | BR-078-BR-083 | FLOW-034-RULE-001 through FLOW-034-RULE-006 | FLOW-034 | TRANSITION-BOOKING-003/004 |
| Confirmation weak guard | Hold expiry and payment proof/state are not verified by FLOW-034. | INVARIANT-023 | BR-084, BR-085 | FLOW-034-RULE-007/008 | FLOW-034 | TRANSITION-BOOKING-003 |
| Cancellation eligibility | Only HELD and CONFIRMED are active cancellable states; CANCELLED is idempotent. | INVARIANT-025 | BR-099-BR-101 | FLOW-037-RULE-001/002/003 | FLOW-037 | TRANSITION-BOOKING-006/007/008 |
| Member booking uniqueness/confirmation | Member confirmation uses active subscription, cutoff, transaction/window lock/double-check, and creates/updates attendance timestamp. | INVARIANT-029 | BR-122-BR-126 | FLOW-044-RULE-001 through FLOW-044-RULE-005 | FLOW-044 | TRANSITION-BOOKING-010/011 |
| Stale HELD release | Stale HELD release is a distinct FLOW-049 transition. | INVARIANT-FINDING-003 | FLOW-049 lineage | FLOW-049 lineage | FLOW-049 | TRANSITION-BOOKING-009 |
| Member no-show creation | No existing non-cancelled booking can create RELEASED_NO_SHOW booking. | INVARIANT-FINDING-003 | FLOW-049 lineage | FLOW-049 lineage | FLOW-049 | TRANSITION-BOOKING-012 |

## Capacity Invariants

STATE-CONFLICT-001 preserved: capacity consumers use different active-state sets.

| Consumer | Capacity Inputs | Booking States Counted | Member Treatment | Locking | Source |
|---|---|---|---|---|---|
| Availability browsing | AvailabilityWindow capacity, resource binding, blocked windows, active booking count | HELD, CONFIRMED | Not canonicalized; browse counts active booking rows by state | Read-time calculation, no lock evidenced | BR-042-BR-045; FLOW-024 |
| Standard booking | AvailabilityWindow, block overlap, group size, fixed/pooled allocation, active booking count | HELD, CONFIRMED | Self-service persists isMemberBooking false | Selected window locked before capacity decisions | BR-052-BR-058; FLOW-029 |
| Negotiated booking | Availability/block/capacity constraints retained | HELD/CONFIRMED capacity semantics inherited from negotiated evidence | Always non-member HELD | Capacity constraints preserved; lock evidence inherited from flow/journey evidence | BR-063, BR-064; FLOW-030 |
| Member booking | Assignment/subscription/cutoff, booking existence, transaction/window lock/double-check | Existing non-cancelled booking affects create/update path | Creates/updates member booking with attendance timestamp | Transaction/window lock/double-check | BR-122-BR-126; FLOW-044 |
| Resource occupancy | Resource journey guest occupancy | Non-member CONFIRMED/CHECKED_IN | Member treatment separate from guest occupancy | Not normalized to browse formula | STATE-CONFLICT-001; resource journey rule 17 |
| Release/no-show sweep | Stale HELD bookings and member assignment attendance inputs | HELD for stale release; no existing non-cancelled booking for no-show creation | Member no-show creation is separate from stale guest hold release | Sweep-level locking not canonicalized | FLOW-049 lineage; RE-006 transitions |

Consolidated capacity invariant classification: CONFLICTING / UNRESOLVED. RE-007 does not invent a canonical capacity formula.

## Payment Invariants

PaymentIntent ownership, gatewayRef identity, pending -> captured guards, purpose/reference linkage, amount consistency, webhook signature/idempotency, direct verification, and subscription billing are consolidated in INVARIANT-031 through INVARIANT-039.

RE-006 distinction preserved:

```text
FLOW-052/FLOW-054 mutate PaymentIntent.
FLOW-034 owns Booking HELD -> CONFIRMED.
```

No distributed atomicity invariant is evidenced between PaymentIntent capture and Booking confirmation.

## Payment / Booking Consistency Boundary

RE-006 established:

```text
PaymentIntent capture
  service boundary
FLOW-034
  Booking HELD -> CONFIRMED
```

Evidence preserved:

| Evidence | Meaning |
|---|---|
| BR-083 | FLOW-034 HELD -> CONFIRMED mutation |
| BR-084 | FLOW-034 has no hold-expiry validation |
| BR-085 | FLOW-034 has no payment proof/state validation |
| BR-158 | FLOW-052 capture invokes booking-confirm boundary |
| BR-177 | FLOW-054 pending intent becomes captured |
| BR-178 | FLOW-054 triggers booking confirmation only after capture |
| STATE-CONFLICT-002 | Internal confirm can bypass payment/expiry assumptions |

Condition evaluated: `CONFIRMED booking implies valid captured payment`

Executable classification: CONTEXT_DEPENDENT / PARTIALLY_ENFORCED.

Reason: FLOW-052 and FLOW-054 capture PaymentIntent before invoking FLOW-034, but FLOW-034 itself can confirm HELD booking without hold-expiry validation and without payment proof/state validation. RE-007 does not turn the intended-looking condition into a desired invariant.

## Membership Invariants

| Concern | Executable Behaviour | Policy/Invariant | Source |
|---|---|---|---|
| Assignment uniqueness | Duplicate active same-pool assignment returns/conflicts as 409; ACTIVE update can conflict. | INVARIANT-027 | BR-108, BR-109, BR-116; FLOW-040, FLOW-042 |
| Assignment state | New assignments ACTIVE; updates accept ACTIVE/SUSPENDED. | INVARIANT-027, INVARIANT-028 | BR-108, BR-114; FLOW-040, FLOW-042 |
| Active subscription | Required to confirm attendance. | POLICY-017, INVARIANT-029 | BR-123; FLOW-044 |
| Member booking creation | No existing booking plus eligible member context creates Booking(CONFIRMED) with attendance timestamp. | INVARIANT-029 | BR-122-BR-126; FLOW-044; TRANSITION-BOOKING-010 |
| Existing booking attendance confirmation | Existing non-cancelled booking updates memberAttendanceConfirmedAt; status unchanged. | INVARIANT-029 | BR-122-BR-126; FLOW-044; TRANSITION-BOOKING-011 |
| Confirmation cutoff | Confirmation rejected at or after cutoff; canConfirm false at/after cutoff. | POLICY-016 | BR-121, BR-124; FLOW-043, FLOW-044 |
| No-show creation | FLOW-049 can create RELEASED_NO_SHOW member no-show booking when no existing non-cancelled booking exists. | INVARIANT-FINDING-003 | FLOW-049 lineage; TRANSITION-BOOKING-012 |
| Assignment/subscription relationship | Attendance derives from assignment, subscription, booking, attendance stamp, release state, cutoff. | INVARIANT-030 | BR-121, BR-125, BR-128, BR-129; FLOW-043/FLOW-044/FLOW-046 |

MemberAssignment state, Subscription state, Booking state, and derived Attendance state remain separate.

## Availability Policies

| Policy | Behaviour | Source |
|---|---|---|
| Browse horizon | First booking rule guestOpenWindowDays, default 7 days. | POLICY-005; BR-037; FLOW-024 |
| Closed override | Closed date override can suppress generated slots. | POLICY-006; BR-039; FLOW-024 |
| Modified override | Modified override takes precedence over normal pattern. | POLICY-006; BR-040; FLOW-024 |
| Active pattern contribution | Only ACTIVE matching ISO weekday patterns contribute. | POLICY-007; BR-041; FLOW-024 |
| Block exclusion | Blocked windows remove/deny overlapping availability. | INVARIANT-010; BR-042, BR-056; FLOW-024/FLOW-029 |
| Query time values | Invalid from/to ignored unless computed range invalid. | BR-046; FLOW-024 |
| Public browse | No JWT/admin auth required. | POLICY-008; BR-047, BR-048; FLOW-024 |
| Timezone/date context | Branch-local and generated-date behaviours remain context-dependent. | FLOW-024-UNCERTAINTY-001/002/003; RE-005 cross-flow comparison |
| Manual release/pricing markers | AvailabilityWindow release/pricing marker state is separate from sweep release/no-show. | RE-006 STATE-MODEL-AVAILABILITY-WINDOW; FLOW-048/FLOW-049 context variant |

## Cancellation & Refund Policies

| Area | Behaviour | Source |
|---|---|---|
| Cancellation preview | Computes refund without persisted write; supports HELD/CONFIRMED/CANCELLED preview paths. | POLICY-014; BR-093-BR-098; FLOW-036 |
| Cancellation execution | HELD/CONFIRMED are active cancellable; CANCELLED is idempotent; cancellation does not call refund creation. | POLICY-015; INVARIANT-025/026; BR-099-BR-105; FLOW-037 |
| Refund creation | Requires bookingId, cancelled booking, positive refund amount, captured PaymentIntent; existing Refund by PaymentIntent returned. | POLICY-022; INVARIANT-040/041; BR-197-BR-203; FLOW-059 |
| Refund override | Requires admin JWT, audit fields, cancelled booking, captured PaymentIntent, override cap; local processed Refund only. | POLICY-023; INVARIANT-040/041; BR-204-BR-211; FLOW-060 |
| Provider refund | No Razorpay refund provider call occurs in FLOW-059/FLOW-060. | BR-203, BR-211; FLOW-059/FLOW-060 |
| Atomicity | Cancellation and refund are separate operations. | INVARIANT-026; STATE-MODEL-REFUND |

## Notification Policies & Invariants

NotificationRequest, ScheduledJob, and ScheduledJobDispatch remain separate.

| Topic | Behaviour | Source |
|---|---|---|
| Queue creation | Send returns 202 after queueing before delivery. | INVARIANT-042; BR-212; FLOW-061 |
| Channel fallback | Unknown event types use push_or_sms. | BR-213; FLOW-061 |
| Template uniqueness | One template per tenant/channel/event tuple. | INVARIANT-043; BR-214; FLOW-062 |
| Device token uniqueness | Device token globally unique; re-register updates user association. | INVARIANT-043; BR-216, BR-217; FLOW-063 |
| History | Filtered by exact recipient; max 50 newest. | BR-218, BR-219; FLOW-064 |
| Worker eligibility | Processes at most 50 due queued rows. | POLICY-024; BR-220; FLOW-065 |
| Retry/dead_letter | Attempts 1-3 retry; attempt 4 failure is terminal dead_letter. | POLICY-024; INVARIANT-042; BR-221; FLOW-065 |
| Upstream best effort | Autopay notification fetch exceptions do not fail webhook processing. | BR-187; FLOW-055 |

## Scheduler Invariants

| Concern | Behaviour | Policy/Invariant | Enforcement Strength | Source |
|---|---|---|---|---|
| ScheduledJob claim invariant | Enabled, due, and unlocked/expired rows are claimable; timeout summaries keep lease. | POLICY-025; INVARIANT-044 | PARTIALLY_ENFORCED | BR-222, BR-223; FLOW-066 |
| Manual job execution | Unknown job throws; manual execution does not release claimed due-job lease. | POLICY-025; INVARIANT-044 | APPLICATION_ENFORCED | BR-224, BR-225; FLOW-067 |
| ScheduledJobDispatch dedupe/outcome | Dedupe key jobName + dedupKey; live PENDING duplicate denied; SENT/FAILED outcome mutations. | INVARIANT-045 | APPLICATION_ENFORCED | BR-226-BR-229; FLOW-068/FLOW-069 |

## Authentication / Session Invariants

| Concern | Behaviour | Source |
|---|---|---|
| OTP expiry/cooldown | TTL 5 minutes, cooldown 60 seconds. | POLICY-001; BR-002; FLOW-001 |
| OTP normalization | Phone normalized before persistence. | INVARIANT-001; BR-001; FLOW-001 |
| OTP consumption | Successful verification deletes OTP before session creation. | INVARIANT-002; BR-004; FLOW-002 |
| Public signup role | Public OTP signup creates UserType.GUEST; client cannot choose type. | BR-003; FLOW-002 |
| Login eligibility | Google login does not create user; GUEST users cannot use Google login. | BR-005, BR-006; FLOW-003 |
| Refresh renewal | Access token 15 minutes; refresh session/cookie renewed to 30 days. | POLICY-002; BR-007; FLOW-004 |
| Refresh roles | Refresh recalculates roles through Tenant Management. | BR-008; FLOW-004 |
| Logout | Idempotent from caller perspective; revokes by refresh token. | INVARIANT-003; BR-009, BR-010; FLOW-005 |

No single AuthSession enum is invented.

## Tenant / Ownership Boundaries

| Invariant | Entity | Operation | Tenant Check | Ownership Check | Enforcement | Source |
|---|---|---|---|---|---|---|
| INVARIANT-005 | Role claim | Role construction | OWNER tenant-scoped; non-owner branch belongs to tenant | Role-dependent | APPLICATION_ENFORCED | BR-017-BR-020; FLOW-009/FLOW-010 |
| INVARIANT-006 | Tenant | Create | Subdomain uniqueness | Internal/platform gated separately | DB_ENFORCED | BR-021, BR-022; FLOW-011 |
| INVARIANT-007 | Tenant | Update | Same tenant owner or internal key | Owner/internal | SERVICE_BOUNDARY_ENFORCED | BR-023; FLOW-012 |
| INVARIANT-009 | Branch | Update | Stored branch tenant id | Admin/owner context | APPLICATION_ENFORCED | BR-032; FLOW-016 |
| INVARIANT-013 | Booking | Create | JWT tenant persisted | JWT user persisted | APPLICATION_ENFORCED | BR-049; FLOW-029 |
| INVARIANT-021 | Booking | Read/list | Tenant-scoped non-internal reads | Owner or scoped admin | APPLICATION_ENFORCED | BR-065-BR-077; FLOW-031/FLOW-032/FLOW-033 |
| INVARIANT-028 | MemberAssignment | Create/list/update | Resource-pool/branch scoped | Internal/admin role | APPLICATION_ENFORCED | BR-106, BR-112-BR-115; FLOW-040/FLOW-041/FLOW-042 |
| INVARIANT-032 | PaymentIntent | Create/order | Booking/intent linkage | Caller must own booking/intent | APPLICATION_ENFORCED | BR-133, BR-144; FLOW-050/FLOW-051 |
| INVARIANT-035 | PaymentIntent | Verify | No explicit ownership after signature | Auth present but ownership not checked | PARTIALLY_ENFORCED | BR-157-BR-161; FLOW-052 |
| INVARIANT-038 | Subscription | Create/webhook | Body-sourced create lacks verified binding; webhook matches subscription | Body identity not bound in FLOW-053 | PARTIALLY_ENFORCED | BR-164-BR-190; FLOW-053/FLOW-054/FLOW-055 |
| INVARIANT-042 | NotificationRequest | Queue/send/history | History filters recipient, not tenant plus user id | Recipient string | APPLICATION_ENFORCED | BR-212-BR-221; FLOW-061/FLOW-062/FLOW-063/FLOW-064/FLOW-065 |

This is not the final authorization model.

## Uniqueness & Idempotency Catalogue

| Invariant ID | Scope | Key | Enforcement | Collision Behaviour | Source |
|---|---|---|---|---|---|
| INVARIANT-003 | Logout | Refresh token | Application revocation | Repeated logout is caller-idempotent | BR-009, BR-010; FLOW-005 |
| INVARIANT-004 | PendingInvite | phone + tenantId | DB/upsert | Duplicate invite resolves by upsert | BR-013, BR-014; FLOW-007 |
| INVARIANT-014 | Booking | Idempotency key | Application lookup/check | Existing booking returned | BR-050, BR-051; FLOW-029 |
| INVARIANT-027 | MemberAssignment | Active same-pool assignment scope | DB/application conflict | 409 or update conflict | BR-109, BR-116; FLOW-040/FLOW-042 |
| INVARIANT-031 | PaymentIntent | Active intent by booking reference | Application lookup/check | Existing non-captured intent returned | BR-133; FLOW-050 |
| INVARIANT-036 | Payment webhook | WebhookEvent.gatewayEventId | DB insert before processing | Duplicate returns success duplicated=true, no processing | BR-173, BR-174; FLOW-054 |
| INVARIANT-037 | Subscription mandate | mandateId | DB upsert | Duplicate upsert with no update fields | BR-169; FLOW-053 |
| INVARIANT-039 | Autopay webhook | WebhookEvent.gatewayEventId | DB insert before processing | Duplicate returns success duplicated=true | BR-181, BR-182; FLOW-055 |
| INVARIANT-040 | Refund | PaymentIntent | Application lookup/check | Existing Refund returned | BR-202, BR-209; FLOW-059/FLOW-060 |
| INVARIANT-043 | Notification device/template | tenant/channel/event; device token | DB/application upsert | Existing token updates association | BR-214, BR-216, BR-217; FLOW-062/FLOW-063 |
| INVARIANT-045 | Dispatch | jobName + dedupKey | Application lookup/check | Live PENDING duplicate denied without throwing | BR-226, BR-227; FLOW-068 |

Uniqueness/idempotency invariants: 11

## Temporal Policy Catalogue

| Policy ID | Operation | Time Rule | Timezone Basis | Configuration | Enforcement Boundary | Source |
|---|---|---|---|---|---|---|
| POLICY-001 | OTP request/verification | TTL 5 minutes; cooldown 60 seconds | Not normalized by RE-007 | Source rule evidence | Application | BR-002; FLOW-001 |
| POLICY-002 | Refresh session | Access token 15 minutes; refresh cookie/session 30 days | Not normalized by RE-007 | Source rule evidence | Application | BR-007; FLOW-004 |
| POLICY-005 | Browse availability | guestOpenWindowDays; default 7 days | FLOW-024 generated date context | Booking rule or default | Application | BR-037; FLOW-024 |
| POLICY-009 | Standard booking | guestOpenWindowDays horizon | Booking/create context | Booking rule | Application | BR-054; FLOW-029 |
| POLICY-011 | Held booking | heldUntil five-minute expiry at creation | Booking creation time | Source rule evidence | Application at creation; not checked by FLOW-034 | BR-060, BR-084; FLOW-029/FLOW-034 |
| POLICY-013 | Check-in | Timing is client-side display condition, not server precondition | Client/PWA context | UNKNOWN | Client only | BR-092; FLOW-035 |
| POLICY-014 | Cancellation preview | Confirmed preview uses current hours before slot | Slot time/current time | Booking rule tiers | Application read | BR-096; FLOW-036 |
| POLICY-015 | Cancellation execution | Confirmed cancellation recomputes tiered refund using hours before slot | Slot time/current time | Booking rule tiers | Application write | BR-102; FLOW-037 |
| POLICY-016 | Member confirmation | Rejected at or after cutoff; canConfirm before cutoff | Branch/member attendance context | UNKNOWN | Application | BR-121, BR-124; FLOW-043/FLOW-044 |
| POLICY-024 | Notification delivery | retryAfter/due queued requests; attempts 1-3 retry, 4 dead_letter | Queue worker now | Worker constants | Application/best effort | BR-220, BR-221; FLOW-065 |
| POLICY-025 | Scheduled job claim | nextRunAt <= now; lockedUntil absent/expired | Scheduler now | ScheduledJob row | Application/database | BR-222, BR-223; FLOW-066 |
| POLICY-025 | Manual scheduled execution | Manual execution does not release claimed due-job lease | Scheduler lease context | ScheduledJob row | Application | BR-225; FLOW-067 |

Temporal policies: 12

## Cross-Entity Invariants

| Invariant ID | Entity A | Entity B | Required Relationship | Enforcement | Atomicity | Evidence |
|---|---|---|---|---|---|---|
| INVARIANT-010 | BlockedWindow | AvailabilityWindow/Booking | Overlap suppresses browse and prevents booking creation. | APPLICATION_ENFORCED | Per operation, not global | BR-042, BR-056; FLOW-024/FLOW-029 |
| INVARIANT-015/016 | Booking | AvailabilityWindow | Window lock precedes capacity checks during booking creation. | TRANSACTION_ENFORCED | Booking transaction | BR-052-BR-058; FLOW-029 |
| INVARIANT-018 | Booking | BookingPlayer/PendingInvite | Co-player phones normalize to BookingPlayer rows; user identity unresolved at creation. | APPLICATION_ENFORCED | Booking create | BR-061, BR-062; FLOW-029 |
| INVARIANT-029 | MemberAssignment/Subscription | Booking | Active subscription and member context allow booking creation/update with attendance timestamp. | TRANSACTION_ENFORCED | Confirmation transaction | BR-122-BR-126; FLOW-044 |
| INVARIANT-030 | Assignment/Subscription/Booking | Attendance derived state | Attendance is derived, not persisted. | DERIVED_ONLY | Read operation | BR-121, BR-125, BR-128, BR-129; FLOW-043/FLOW-044/FLOW-046 |
| INVARIANT-035/036 | PaymentIntent | Booking | Capture invokes FLOW-034; Booking transition owned by FLOW-034. | SERVICE_BOUNDARY_ENFORCED | Not distributed atomic | BR-083, BR-158, BR-177, BR-178; FLOW-052/FLOW-054/FLOW-034 |
| INVARIANT-041 | Refund | Booking/PaymentIntent | Refund requires cancelled booking and captured PaymentIntent. | APPLICATION_ENFORCED | Refund operation separate from cancellation | BR-199-BR-201, BR-207, BR-208; FLOW-059/FLOW-060 |
| INVARIANT-038 | Subscription | PaymentIntent/NotificationRequest | Charged creates billing PaymentIntent; failed attempts notification. | APPLICATION_ENFORCED / BEST_EFFORT | Webhook operation; notification best effort | BR-183-BR-187; FLOW-055 |
| INVARIANT-045 | ScheduledJob | ScheduledJobDispatch | Dispatch dedupe/outcome separate from scheduled job claim. | APPLICATION_ENFORCED | Separate state model | BR-222-BR-229; FLOW-066/FLOW-067/FLOW-068/FLOW-069 |
| INVARIANT-042 | Upstream operation | NotificationRequest | Send queues row before delivery; upstream calls may be best effort. | BEST_EFFORT | Separate operation | BR-212, BR-187; FLOW-061/FLOW-055 |

Cross-entity invariants: 10

## Broken / Weak Invariants

| Finding ID | Expected-Looking Condition | Actual Enforcement | Source Evidence | Impact | Validation Needed |
|---|---|---|---|---|---|
| INVARIANT-FINDING-001 | Confirmed booking implies unexpired hold and valid captured payment. | PARTIAL / CONTEXT_DEPENDENT: FLOW-052/FLOW-054 capture before invoking FLOW-034, but FLOW-034 itself does not check hold expiry or payment proof/state. | STATE-CONFLICT-002; BR-083, BR-084, BR-085, BR-158, BR-177, BR-178 | Internal confirmation can bypass payment/expiry assumptions. | Should internal confirmation enforce expiry/payment validation or remain trusted-boundary only? |
| INVARIANT-FINDING-002 | Check-in requires server-side caller auth/ownership and timing eligibility. | WEAK: FLOW-035 does not enforce caller authentication/ownership and timing is client-side display only. | STATE-CONFLICT-003; BR-091, BR-092 | Server transition broader than UI workflow. | Should check-in auth/timing be server-enforced? |
| INVARIANT-FINDING-003 | All capacity consumers share one active-state formula. | CONFLICTING: browse counts HELD/CONFIRMED; guest occupancy counts non-member CONFIRMED/CHECKED_IN; member no-show/release paths differ. | STATE-CONFLICT-001; BR-043; FLOW-024; resource journey rule 17; FLOW-049 lineage | Availability and occupancy can disagree. | Which formula is intended per context? |
| INVARIANT-FINDING-004 | Cancellation and refund are atomic. | PARTIAL: cancellation does not invoke refund creation; refund is a separate operation. | BR-104, BR-105, BR-197-BR-203; FLOW-037/FLOW-059 | Cancelled booking may exist before or without Refund row. | Should refund creation be orchestrated with cancellation? |
| INVARIANT-FINDING-005 | Payment capture and booking confirmation are atomic. | PARTIAL: PaymentIntent capture invokes FLOW-034 across service boundary; no distributed atomicity evidenced. | BR-158, BR-177, BR-178; FLOW-052/FLOW-054; RE-006 cross-entity dependency | Captured intent and booking confirmation can diverge if boundary call fails. | Is compensating recovery expected? |
| INVARIANT-FINDING-006 | Refund means provider refund executed. | WEAK: local Refund rows are created/processed without Razorpay refund provider call. | BR-203, BR-211; FLOW-059/FLOW-060 | Local refund state may not match provider money movement. | Should provider refund be introduced or local-only semantics accepted? |
| INVARIANT-FINDING-007 | Subscription creation is identity-bound to authenticated caller. | WEAK: FLOW-053 stores body tenantId/userId and does not authenticate or bind body identity. | BR-164-BR-169; FLOW-053 | Subscription bookkeeping can be body-driven. | Should subscription creation require verified identity/internal boundary? |
| INVARIANT-FINDING-008 | Notifications are guaranteed after upstream state changes. | WEAK / BEST_EFFORT: notification fetch exceptions do not fail autopay webhook processing. | BR-186, BR-187; FLOW-055 | Suspended subscription may not notify. | Is notification best effort acceptable? |
| INVARIANT-FINDING-009 | Scheduler manual execution clears existing leases. | UNRESOLVED: manual execution does not release claimed due-job lease. | BR-225; FLOW-067 | Manual execution and scheduled lease semantics can diverge. | Should manual execution affect lease state? |

Broken/weak invariant findings: 9

## Policy Context Variants

| Variant ID | Policy/Invariant | Context A | Context B | Source Flows | Status |
|---|---|---|---|---|---|
| PI-VARIANT-001 | INVARIANT-016 / INVARIANT-020 | Standard booking enforces group-size/pricing/capacity. | Negotiated booking waives group-size/pricing but keeps availability/block/capacity. | FLOW-029 vs FLOW-030/FLOW-056/FLOW-057 | CONTEXT_DEPENDENT |
| PI-VARIANT-002 | INVARIANT-013 / INVARIANT-029 | Guest booking creates HELD non-member booking. | Member confirmation creates CONFIRMED or updates attendance timestamp. | FLOW-029 vs FLOW-044 | CONTEXT_DEPENDENT |
| PI-VARIANT-003 | POLICY-014 / POLICY-015 | Preview computes without write. | Cancellation persists status/refundAmount. | FLOW-036 vs FLOW-037 | CONTEXT_DEPENDENT |
| PI-VARIANT-004 | INVARIANT-035 / INVARIANT-036 | Direct verify uses signature and gatewayRef order id. | Webhook uses raw-body signature, event id, idempotency insert, gatewayRef/payment link match. | FLOW-052 vs FLOW-054 | CONTEXT_DEPENDENT |
| PI-VARIANT-005 | Availability/release policy | Manual release/pricing marker state. | Sweep release/no-show booking state. | FLOW-048 vs FLOW-049 | CONTEXT_DEPENDENT |
| PI-VARIANT-006 | Tenant/access policies | Public browse allows unauthenticated availability/ACTIVE branch visibility. | Admin/internal operations enforce owner/admin/internal scope. | FLOW-017/FLOW-024 vs admin flows | CONTEXT_DEPENDENT |
| PI-VARIANT-007 | Temporal policies | Branch-local date/weekday contexts. | Generated/query date contexts. | FLOW-023/FLOW-024/FLOW-028/FLOW-043/FLOW-046 | UNRESOLVED |
| PI-VARIANT-008 | Notification/scheduler invariants | NotificationRequest queue delivery/retry. | ScheduledJob/ScheduledJobDispatch claim/dedupe/outcome. | FLOW-061/FLOW-065 vs FLOW-066/FLOW-068/FLOW-069 | CONTEXT_DEPENDENT |
| PI-VARIANT-009 | Payment/refund provider state | Payment capture stores local captured state. | Refund creates local Refund without provider refund call. | FLOW-052/FLOW-054 vs FLOW-059/FLOW-060 | UNRESOLVED |

Context variants: 9

## Configuration Dependency Index

| Policy/Invariant | Configuration | Default | Override Scope | Consumers | Source |
|---|---|---|---|---|---|
| POLICY-001 | OTP TTL/cooldown | 5 minutes / 60 seconds | None evidenced | Auth | BR-002; FLOW-001 |
| POLICY-002 | Access/refresh TTL | 15 minutes / 30 days | None evidenced | Auth | BR-007; FLOW-004 |
| POLICY-005 | guestOpenWindowDays | 7 days if no booking rule | First booking rule | Availability browse | BR-037; FLOW-024 |
| POLICY-009 | guestOpenWindowDays | UNKNOWN | Booking rule | Booking creation | BR-054; FLOW-029 |
| POLICY-010 | Window override or pool default price | UNKNOWN | AvailabilityWindow/pool | Booking creation | BR-059; FLOW-029 |
| POLICY-014/POLICY-015 | Tiered cancellation policy | UNKNOWN | Oldest booking rule / booking rule | Preview/cancellation | BR-096, BR-102; FLOW-036/FLOW-037 |
| POLICY-016 | Member confirmation cutoff | UNKNOWN | Member attendance context | Member canConfirm/confirmation | BR-121, BR-124; FLOW-043/FLOW-044 |
| POLICY-018 | Currency | INR | Request can supply currency, default INR | Payment order | BR-147; FLOW-051 |
| POLICY-019/POLICY-020 | Razorpay signature secret | UNKNOWN / hardcoded fallback for direct verify | Payment verification/webhook | Payment capture | BR-152-BR-155, BR-170; FLOW-052/FLOW-054 |
| POLICY-024 | Queue batch/retry attempts | 50 rows; attempt 4 dead_letter | Worker | Notification delivery | BR-220, BR-221; FLOW-065 |
| POLICY-025 | nextRunAt/lockedUntil | UNKNOWN | ScheduledJob row | Scheduler claim | BR-222, BR-223; FLOW-066 |
| POLICY-026 | Expected SHA | UNKNOWN | Deployment verification request/config | Deployment verification | BR-231; FLOW-070 |

## Enforcement Boundary Matrix

| Policy/Invariant | DB | Transaction | Application | Service | External Provider | Best Effort |
|---|---|---|---|---|---|---|
| INVARIANT-004 PendingInvite uniqueness | Yes | No | Yes | No | No | No |
| INVARIANT-006 Tenant subdomain uniqueness | Yes | No | Yes | No | No | No |
| INVARIANT-014 Booking idempotency | Partial | No | Yes | No | No | No |
| INVARIANT-015 Booking window lock | No | Yes | Yes | No | No | No |
| INVARIANT-016 Booking capacity | No | Yes | Yes | No | No | No |
| INVARIANT-022 Booking confirmation | No | No | Yes | Yes | No | No |
| INVARIANT-023 Missing expiry/payment validation | No | No | No | No | No | No |
| INVARIANT-027 Assignment uniqueness | Yes | No | Yes | No | No | No |
| INVARIANT-029 Member confirmation | No | Yes | Yes | No | No | No |
| INVARIANT-031 PaymentIntent idempotency | Partial | No | Yes | No | No | No |
| INVARIANT-035 Direct payment capture | No | No | Yes | Yes | Razorpay signature input | No |
| INVARIANT-036 Webhook idempotency/capture | Yes | No | Yes | Yes | Razorpay webhook | No |
| INVARIANT-038 Autopay state mutation | Yes for webhook event | No | Yes | Yes | Razorpay webhook | Notification best effort |
| INVARIANT-040 Refund idempotency | Partial | No | Yes | No | Provider call absent | No |
| INVARIANT-042 Notification queue | No | No | Yes | No | Delivery provider | Yes |
| INVARIANT-044 ScheduledJob claim | Partial | No | Yes | No | No | No |
| INVARIANT-045 Dispatch dedupe/outcome | Partial | No | Yes | No | No | No |

## Policy-To-State Traceability

| Policy/Invariant ID | State Model | Transition IDs | BR IDs | FLOW IDs |
|---|---|---|---|---|
| POLICY-004 / INVARIANT-008 | STATE-MODEL-BRANCH | TRANSITION-BRANCH-001/002 | BR-029, BR-031, BR-033, BR-034 | FLOW-015, FLOW-016, FLOW-017 |
| POLICY-005-POLICY-008 / INVARIANT-010-INVARIANT-012 | STATE-MODEL-AVAILABILITY-PATTERN; STATE-MODEL-AVAILABILITY-OVERRIDE; STATE-MODEL-AVAILABILITY-WINDOW; STATE-MODEL-BLOCKED-WINDOW | None | BR-037-BR-048, BR-056 | FLOW-024, FLOW-029 |
| POLICY-009-POLICY-015 / INVARIANT-013-INVARIANT-026 | STATE-MODEL-BOOKING | TRANSITION-BOOKING-001 through TRANSITION-BOOKING-012 | BR-049-BR-105, BR-122-BR-126, BR-158, BR-178, BR-191, BR-199 | FLOW-029-FLOW-037, FLOW-044, FLOW-049, FLOW-052, FLOW-054, FLOW-056, FLOW-059 |
| POLICY-016-POLICY-017 / INVARIANT-027-INVARIANT-030 | STATE-MODEL-MEMBER-ASSIGNMENT; STATE-MODEL-ATTENDANCE-DERIVED; STATE-MODEL-SUBSCRIPTION | TRANSITION-MEMBER-ASSIGNMENT-001/002; TRANSITION-BOOKING-010/011; TRANSITION-SUBSCRIPTION-001/002 | BR-106-BR-129, BR-183-BR-185 | FLOW-040-FLOW-046, FLOW-053, FLOW-055 |
| POLICY-018-POLICY-021 / INVARIANT-031-INVARIANT-039 | STATE-MODEL-PAYMENT-INTENT; STATE-MODEL-SUBSCRIPTION; STATE-MODEL-BOOKING | TRANSITION-PAYMENT-INTENT-001 through 004; TRANSITION-BOOKING-003; TRANSITION-SUBSCRIPTION-001/002 | BR-132-BR-159, BR-164-BR-196 | FLOW-050-FLOW-058 |
| POLICY-022-POLICY-023 / INVARIANT-040-INVARIANT-041 | STATE-MODEL-REFUND; STATE-MODEL-BOOKING; STATE-MODEL-PAYMENT-INTENT | TRANSITION-REFUND-001 | BR-197-BR-211 | FLOW-059, FLOW-060 |
| POLICY-024 / INVARIANT-042-INVARIANT-043 | STATE-MODEL-NOTIFICATION-REQUEST | TRANSITION-NOTIFICATION-001/002/003 | BR-212-BR-221 | FLOW-061-FLOW-065 |
| POLICY-025 / INVARIANT-044-INVARIANT-045 | STATE-MODEL-SCHEDULED-JOB; STATE-MODEL-SCHEDULED-JOB-DISPATCH | TRANSITION-SCHEDULED-JOB-001; TRANSITION-SCHEDULED-JOB-DISPATCH-001/002/003 | BR-222-BR-229 | FLOW-066-FLOW-069 |
| POLICY-001-POLICY-002 / INVARIANT-001-INVARIANT-003 | STATE-MODEL-AUTH-SESSION | TRANSITION-AUTH-SESSION-001 | BR-001-BR-010 | FLOW-001-FLOW-005 |
| INVARIANT-004 | STATE-MODEL-PENDING-INVITE | None | BR-013, BR-014 | FLOW-007 |

## Candidate Rule Traceability

| Policy/Invariant | BR IDs | Candidate Rule IDs | Flow IDs | Uncertainty IDs |
|---|---|---|---|---|
| POLICY-001-POLICY-004 | BR-002, BR-007, BR-025, BR-026, BR-033, BR-034 | FLOW-001-RULE-002, FLOW-004-RULE-001, FLOW-013-RULE-001/002, FLOW-017-RULE-001/002 | FLOW-001, FLOW-004, FLOW-013, FLOW-017 | FLOW-001/004/013/017-UNCERTAINTY-* |
| POLICY-005-POLICY-008 | BR-037-BR-048 | FLOW-024-RULE-001 through FLOW-024-RULE-012 | FLOW-024 | FLOW-024-UNCERTAINTY-001/002/003 |
| POLICY-009-POLICY-015 | BR-054, BR-059, BR-060, BR-078, BR-091-BR-105 | FLOW-029-RULE-006/011/012, FLOW-034-RULE-001, FLOW-035-RULE-006/007, FLOW-036-RULE-*, FLOW-037-RULE-* | FLOW-029, FLOW-034, FLOW-035, FLOW-036, FLOW-037 | FLOW-029/034/035/036/037-UNCERTAINTY-* |
| POLICY-016-POLICY-017 | BR-121, BR-123, BR-124 | FLOW-043-RULE-004, FLOW-044-RULE-002/003 | FLOW-043, FLOW-044 | FLOW-043/044-UNCERTAINTY-* |
| POLICY-018-POLICY-021 | BR-145-BR-147, BR-152-BR-155, BR-170-BR-172, BR-195, BR-196 | FLOW-051-RULE-005/006/007, FLOW-052-RULE-001/002/003/004, FLOW-054-RULE-001/002/003, FLOW-058-RULE-001/002 | FLOW-051, FLOW-052, FLOW-054, FLOW-058 | FLOW-051/052/054/058-UNCERTAINTY-* |
| POLICY-022-POLICY-023 | BR-197-BR-211 | FLOW-059-RULE-001 through FLOW-059-RULE-007, FLOW-060-RULE-001 through FLOW-060-RULE-008 | FLOW-059, FLOW-060 | FLOW-059/060-UNCERTAINTY-* |
| POLICY-024-POLICY-026 | BR-220, BR-221, BR-222, BR-223, BR-230, BR-231 | FLOW-065-RULE-001/002, FLOW-066-RULE-001/002, FLOW-070-RULE-001/002 | FLOW-065, FLOW-066, FLOW-070 | FLOW-065/066/070-UNCERTAINTY-* |
| INVARIANT-001-INVARIANT-009 | BR-001, BR-004, BR-009, BR-010, BR-013, BR-014, BR-017-BR-023, BR-029, BR-031, BR-032 | FLOW-001-RULE-001, FLOW-002-RULE-002, FLOW-005-RULE-001/002, FLOW-007-RULE-001/002, FLOW-009/010/011/012/015/016-RULE-* | FLOW-001, FLOW-002, FLOW-005, FLOW-007, FLOW-009, FLOW-010, FLOW-011, FLOW-012, FLOW-015, FLOW-016 | FLOW-001/002/005/007/009/010/011/012/015/016-UNCERTAINTY-* |
| INVARIANT-010-INVARIANT-026 | BR-042-BR-045, BR-049-BR-064, BR-065-BR-105 | FLOW-024-RULE-006/007/008/009, FLOW-029-RULE-001 through FLOW-029-RULE-014, FLOW-030-RULE-001/002, FLOW-031/032/033/034/035/036/037-RULE-* | FLOW-024, FLOW-029, FLOW-030, FLOW-031, FLOW-032, FLOW-033, FLOW-034, FLOW-035, FLOW-036, FLOW-037 | FLOW-024/029/030/031/032/033/034/035/036/037-UNCERTAINTY-* |
| INVARIANT-027-INVARIANT-030 | BR-106-BR-117, BR-120-BR-129 | FLOW-040-RULE-*, FLOW-041-RULE-*, FLOW-042-RULE-*, FLOW-043-RULE-003/004, FLOW-044-RULE-*, FLOW-046-RULE-* | FLOW-040, FLOW-041, FLOW-042, FLOW-043, FLOW-044, FLOW-046 | FLOW-040/041/042/043/044/046-UNCERTAINTY-* |
| INVARIANT-031-INVARIANT-039 | BR-132-BR-138, BR-149-BR-159, BR-164-BR-190, BR-191-BR-196 | FLOW-050-RULE-*, FLOW-051-RULE-*, FLOW-052-RULE-*, FLOW-053-RULE-*, FLOW-054-RULE-*, FLOW-055-RULE-*, FLOW-056-RULE-*, FLOW-057-RULE-*, FLOW-058-RULE-* | FLOW-050-FLOW-058 | FLOW-050/051/052/053/054/055/056/057/058-UNCERTAINTY-* |
| INVARIANT-040-INVARIANT-045 | BR-197-BR-229 | FLOW-059-RULE-*, FLOW-060-RULE-*, FLOW-061-RULE-*, FLOW-062-RULE-*, FLOW-063-RULE-*, FLOW-064-RULE-*, FLOW-065-RULE-*, FLOW-066-RULE-*, FLOW-067-RULE-*, FLOW-068-RULE-*, FLOW-069-RULE-* | FLOW-059-FLOW-069 | FLOW-059/060/061/062/063/064/065/066/067/068/069-UNCERTAINTY-* |

## Existing Uncertainty Preservation

Existing uncertainties referenced: 47

Existing uncertainty families referenced include FLOW-001 through FLOW-005, FLOW-007, FLOW-009 through FLOW-017, FLOW-024, FLOW-029 through FLOW-037, FLOW-040 through FLOW-046, FLOW-049 through FLOW-060, FLOW-061 through FLOW-070 where applicable to the policy/invariant sources above.

New RE-007 uncertainties: 0

No existing uncertainty is resolved by RE-007.

## Policy & Invariant Questions Requiring Business Validation

Capacity: Should POLICY-005, INVARIANT-011, INVARIANT-012, INVARIANT-016, and STATE-CONFLICT-001 remain context-dependent, or should a canonical capacity formula be defined later?

Booking Eligibility: Should POLICY-009, POLICY-011, INVARIANT-022, INVARIANT-023, and BR-084/BR-085 be changed so internal confirmation enforces hold expiry and payment state?

Payment/Confirmation: Should INVARIANT-035/036 and INVARIANT-FINDING-005 gain recovery or distributed consistency around FLOW-052/FLOW-054 -> FLOW-034?

Membership: Should POLICY-016, POLICY-017, INVARIANT-027, INVARIANT-029, and INVARIANT-030 keep MemberAssignment, Subscription, Booking, and derived Attendance separated exactly as observed?

Cancellation/Refund: Should POLICY-015, POLICY-022, POLICY-023, INVARIANT-026, INVARIANT-040, and INVARIANT-041 remain separate operations, or should refund orchestration be introduced later?

Temporal Behaviour: Should timezone contexts in POLICY-005, POLICY-009, POLICY-016, POLICY-024, and POLICY-025 be normalized in a later requirements phase?

Notification: Should INVARIANT-042 and INVARIANT-FINDING-008 remain best effort for upstream-triggered notifications?

Scheduler: Should INVARIANT-044 and INVARIANT-045 have stronger DB/transaction enforcement for lease and dispatch dedupe semantics?

Tenant/Ownership: Should INVARIANT-035 and INVARIANT-FINDING-007 be tightened around payment verification and subscription creation identity binding?

Weak Enforcement: Should STATE-CONFLICT-001, STATE-CONFLICT-002, and STATE-CONFLICT-003 be treated as accepted context variants or remediation candidates later?

Context Variant: Which PI-VARIANT rows represent intended product differences versus implementation drift?

## Source Recheck

No SOURCE RECHECK REQUIRED. RE-005 and RE-006 were sufficient for policy/invariant consolidation.

## Mechanical Integrity Checks

Policies: 26

Invariants: 45

Policy/invariant relevant BRs: 152

Relevant BRs mapped: 152

Unmapped relevant BRs: 0

Policy IDs duplicated: 0

Invariant IDs duplicated: 0

Policies without source FLOW: 0

Invariants without source FLOW: 0

Policies without BR lineage: 0

Invariants without BR lineage: 0

BR-to-FLOW attribution mismatches: 0

BR-to-candidate-rule attribution mismatches: 0

Broken/weak invariant findings: 9

Context variants: 9

Existing uncertainties referenced: 47

New RE-007 uncertainties: 0

STATE-CONFLICT-001 preserved: YES

STATE-CONFLICT-002 preserved: YES

STATE-CONFLICT-003 preserved: YES

## Completion Status

RE-007 - POLICY & INVARIANT CATALOGUE

STATUS:
COMPLETE

POLICIES:
26

INVARIANTS:
45

POLICY/INVARIANT RELEVANT BRS:
152

MAPPED RELEVANT BRS:
152

UNMAPPED RELEVANT BRS:
0

WEAK/BROKEN INVARIANT FINDINGS:
9

CONTEXT VARIANTS:
9

NEW RE-007 UNCERTAINTIES:
0

FLOW LINEAGE:
PRESERVED

RULE LINEAGE:
PRESERVED

BR LINEAGE:
PRESERVED

STATE LINEAGE:
PRESERVED

UNCERTAINTY LINEAGE:
PRESERVED

BUSINESS VALIDATION:
REQUIRED
