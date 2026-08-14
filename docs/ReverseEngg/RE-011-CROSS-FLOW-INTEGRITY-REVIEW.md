# RE-011 - Cross-Flow Integrity & Consistency Review

This review composes the validated RE-001 through RE-010 artifacts. RE-010 is the mechanical lineage backbone. No application source, Phase 4 artifact, or RE-001 through RE-010 artifact is modified.

## Scope And Method
Known upstream issues represented by STATE-CONFLICT, INVARIANT-FINDING, AUTHZ-FINDING, and INTEGRATION-FINDING IDs are referenced directly. XFLOW identities are introduced only where multiple flows compose into a broader cross-flow integrity condition or where a missing continuation is visible only at journey level.

## Journey Integrity Matrix
| Journey | Entry Flows | Core Flows | Exit/Outcome Flows | Integrity Status | Findings |
|---|---|---|---|---|---|
| Identity & Session | FLOW-013, FLOW-001 | FLOW-001, FLOW-002, FLOW-003, FLOW-004, FLOW-005, FLOW-006, FLOW-007, FLOW-008, FLOW-009, FLOW-010 | FLOW-004, FLOW-005 | CONSISTENT_WITH_VARIANTS | XFLOW-VARIANT-007 |
| Tenant & Branch Administration | FLOW-011, FLOW-013 | FLOW-011, FLOW-012, FLOW-013, FLOW-014, FLOW-015, FLOW-016, FLOW-017, FLOW-018 | FLOW-017, FLOW-018 | CONSISTENT_WITH_VARIANTS | XFLOW-VARIANT-008 |
| Availability Management | FLOW-019, FLOW-023, FLOW-025 | FLOW-019, FLOW-020, FLOW-021, FLOW-022, FLOW-023, FLOW-024, FLOW-025, FLOW-026, FLOW-027, FLOW-028, FLOW-038, FLOW-039, FLOW-047, FLOW-048 | FLOW-024, FLOW-047, FLOW-048 | CONFLICTING | STATE-CONFLICT-001, XFLOW-FINDING-002 |
| Standard Guest Booking | FLOW-024, FLOW-029 | FLOW-029, FLOW-050, FLOW-051, FLOW-052, FLOW-054, FLOW-034, FLOW-031, FLOW-032, FLOW-033, FLOW-035, FLOW-036, FLOW-037, FLOW-045, FLOW-049 | FLOW-035, FLOW-037, FLOW-045, FLOW-049 | WEAK | XFLOW-FINDING-001, XFLOW-FINDING-002, XFLOW-GAP-001 |
| Negotiated Booking | FLOW-057 | FLOW-030, FLOW-056, FLOW-057, FLOW-054, FLOW-034 | FLOW-034 | CONSISTENT_WITH_VARIANTS | XFLOW-VARIANT-001, XFLOW-GAP-002 |
| Booking Confirmation | FLOW-052, FLOW-054, FLOW-034 | FLOW-052, FLOW-054, FLOW-034 | FLOW-031, FLOW-032 | WEAK | STATE-CONFLICT-002, INVARIANT-FINDING-001, INVARIANT-FINDING-005 |
| Check-In | FLOW-035 | FLOW-035, FLOW-044, FLOW-046 | FLOW-046 | WEAK | STATE-CONFLICT-003, AUTHZ-FINDING-001 |
| Cancellation | FLOW-036 | FLOW-036, FLOW-037 | FLOW-037 | CONSISTENT_WITH_VARIANTS | XFLOW-VARIANT-004 |
| Refund | FLOW-037 | FLOW-059, FLOW-060 | FLOW-059, FLOW-060 | INCOMPLETE | XFLOW-GAP-003, INTEGRATION-FINDING-004 |
| Member Assignment | FLOW-040 | FLOW-040, FLOW-041, FLOW-042 | FLOW-043, FLOW-046 | CONSISTENT_WITH_VARIANTS | XFLOW-VARIANT-003 |
| Member Attendance | FLOW-043 | FLOW-043, FLOW-044, FLOW-046, FLOW-049, FLOW-053, FLOW-055 | FLOW-046, FLOW-049 | WEAK | XFLOW-FINDING-003, XFLOW-FINDING-004 |
| Payment | FLOW-050 | FLOW-050, FLOW-051, FLOW-052, FLOW-054, FLOW-058, FLOW-034 | FLOW-034 | WEAK | XFLOW-FINDING-005, XFLOW-GAP-001 |
| Subscription / Autopay | FLOW-053 | FLOW-053, FLOW-055, FLOW-043, FLOW-044, FLOW-046 | FLOW-055, FLOW-046 | WEAK | XFLOW-FINDING-006 |
| Notification | FLOW-055, FLOW-049, FLOW-061 | FLOW-061, FLOW-062, FLOW-063, FLOW-064, FLOW-065 | FLOW-064, FLOW-065 | WEAK | XFLOW-FINDING-007, XFLOW-GAP-005 |
| Scheduled Operations | FLOW-066 | FLOW-066, FLOW-067 | FLOW-066, FLOW-067 | WEAK | XFLOW-FINDING-008, XFLOW-GAP-006 |
| Dispatch | FLOW-068 | FLOW-068, FLOW-069, FLOW-049 | FLOW-069 | CONSISTENT_WITH_VARIANTS | XFLOW-VARIANT-006 |
| Platform / Health | FLOW-070 | FLOW-070 | FLOW-070 | CONSISTENT | None |

## Integrity Dimension Summary
| Journey | STATE | POLICY | INVARIANT | AUTHORIZATION | TENANT | OWNERSHIP | TEMPORAL | CAPACITY | IDEMPOTENCY | TRANSACTION | INTEGRATION | PROVIDER | NOTIFICATION | RECOVERY | DERIVED STATE | EXECUTABLE OUTCOME |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Identity & Session | CONSISTENT | CONSISTENT | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONSISTENT | CONSISTENT | NOT_APPLICABLE | CONSISTENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | CONSISTENT |
| Tenant & Branch Administration | CONSISTENT | CONTEXT_DEPENDENT | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | CONTEXT_DEPENDENT | NOT_APPLICABLE | UNKNOWN | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | CONSISTENT | CONSISTENT_WITH_VARIANTS |
| Availability Management | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONFLICTING | CONTEXT_DEPENDENT | CONSISTENT | NOT_APPLICABLE | CONTEXT_DEPENDENT | CONFLICTING | NOT_APPLICABLE | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | UNKNOWN | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT |
| Standard Guest Booking | WEAK | CONTEXT_DEPENDENT | WEAK | CONTEXT_DEPENDENT | CONSISTENT | CONSISTENT | WEAK | CONFLICTING | CONTEXT_DEPENDENT | WEAK | WEAK | CONTEXT_DEPENDENT | NOT_APPLICABLE | GAP | CONTEXT_DEPENDENT | WEAK |
| Negotiated Booking | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | WEAK | CONTEXT_DEPENDENT | NOT_APPLICABLE | GAP | NOT_APPLICABLE | CONSISTENT_WITH_VARIANTS |
| Booking Confirmation | WEAK | CONTEXT_DEPENDENT | WEAK | CONTEXT_DEPENDENT | UNKNOWN | WEAK | WEAK | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | WEAK | PARTIAL | NOT_APPLICABLE | GAP | NOT_APPLICABLE | WEAK |
| Check-In | WEAK | WEAK | WEAK | WEAK | UNKNOWN | WEAK | WEAK | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | UNKNOWN | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | UNKNOWN | CONTEXT_DEPENDENT | WEAK |
| Cancellation | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONSISTENT | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONSISTENT | WEAK | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | GAP | NOT_APPLICABLE | CONSISTENT_WITH_VARIANTS |
| Refund | WEAK | CONTEXT_DEPENDENT | WEAK | CONTEXT_DEPENDENT | CONSISTENT | CONTEXT_DEPENDENT | UNKNOWN | NOT_APPLICABLE | CONTEXT_DEPENDENT | WEAK | WEAK | GAP | NOT_APPLICABLE | GAP | NOT_APPLICABLE | INCOMPLETE |
| Member Assignment | CONSISTENT | CONSISTENT | CONSISTENT | CONTEXT_DEPENDENT | CONSISTENT | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | UNKNOWN | CONTEXT_DEPENDENT | CONSISTENT_WITH_VARIANTS |
| Member Attendance | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | CONTEXT_DEPENDENT | UNKNOWN | WEAK | WEAK |
| Payment | WEAK | CONTEXT_DEPENDENT | WEAK | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | UNKNOWN | NOT_APPLICABLE | CONTEXT_DEPENDENT | WEAK | WEAK | PARTIAL | NOT_APPLICABLE | GAP | NOT_APPLICABLE | WEAK |
| Subscription / Autopay | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | WEAK | WEAK | WEAK | UNKNOWN | NOT_APPLICABLE | CONTEXT_DEPENDENT | WEAK | WEAK | PARTIAL | WEAK | GAP | CONTEXT_DEPENDENT | WEAK |
| Notification | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | WEAK | WEAK | WEAK | CONTEXT_DEPENDENT | NOT_APPLICABLE | CONTEXT_DEPENDENT | WEAK | WEAK | UNKNOWN | WEAK | GAP | NOT_APPLICABLE | WEAK |
| Scheduled Operations | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | WEAK | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | CONTEXT_DEPENDENT | NOT_APPLICABLE | CONTEXT_DEPENDENT | WEAK | WEAK | NOT_APPLICABLE | NOT_APPLICABLE | GAP | NOT_APPLICABLE | WEAK |
| Dispatch | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | CONSISTENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | CONTEXT_DEPENDENT | NOT_APPLICABLE | CONSISTENT | CONTEXT_DEPENDENT | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | UNKNOWN | NOT_APPLICABLE | CONSISTENT_WITH_VARIANTS |
| Platform / Health | CONSISTENT | CONSISTENT | NOT_APPLICABLE | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | UNKNOWN | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | CONTEXT_DEPENDENT | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | CONSISTENT |

## Standard Guest Booking Journey Review
FLOW-024 -> FLOW-029 -> FLOW-050 -> FLOW-051 -> FLOW-052/FLOW-054 -> FLOW-034 -> FLOW-031/FLOW-032/FLOW-033 -> FLOW-035/FLOW-036/FLOW-037/FLOW-049 is executable only as separately guarded flows. Browse eligibility is public and availability-derived (BR-044, BR-045, BR-048). Booking creation is JWT/idempotency/lock guarded (BR-049-BR-053, BR-058, BR-061). Payment capture and booking confirmation compose through FLOW-052/FLOW-054 into FLOW-034, preserving STATE-CONFLICT-002 and INTEGRATION-FINDING-001. Booking status and capacity calculations preserve STATE-CONFLICT-001 because browsing and occupancy/no-show semantics are not normalized.

## Booking Hold Integrity
| Flow | Role | Evidence | Integrity |
|---|---|---|---|
| FLOW-029 | Creates HELD with five-minute hold expiry | BR-061, TRANSITION-BOOKING-001 | CONSISTENT as producer |
| FLOW-034 | Confirms HELD without hold-expiry validation | BR-083, BR-084, TRANSITION-BOOKING-003 | WEAK consumer; STATE-CONFLICT-002 |
| FLOW-049 | Releases stale HELD | TRANSITION-BOOKING-009 | CONTEXT_DEPENDENT sweep |

Cross-flow race assessment: FLOW-049 release vs FLOW-034 confirmation is a cross-flow temporal race candidate because release and confirm are separate operations. Evidence supports XFLOW-FINDING-001, but does not prove an unsafe concrete ordering outcome beyond the known missing hold-expiry guard.

## Availability / Booking Capacity Integrity
| Flow | Active States Counted | Member Treatment | Locking | Capacity Source | Classification |
|---|---|---|---|---|---|
| FLOW-024 | HELD, CONFIRMED | Not normalized with member attendance | Not evidenced in browse | AvailabilityWindow.capacity minus active bookings | CONTEXT_VARIANT |
| FLOW-029 | HELD, CONFIRMED | Persists isMemberBooking false | Window locked before capacity decision | Window capacity and pool rules | CONTEXT_VARIANT |
| FLOW-030 | Held/confirmed capacity/block checks preserved | Negotiated non-member booking | Internal negotiated path; idempotency evidenced | Availability, block, capacity; group/pricing waived | CONTEXT_VARIANT |
| FLOW-044 | Existing non-cancelled booking detection; creates CONFIRMED member booking when none exists | Member attendance-specific | Transaction/window checks per RE-006 | Assignment/resource context | CONTEXT_VARIANT |
| FLOW-049 | Stale HELD release; member no-show creation | none -> RELEASED_NO_SHOW member no-show | Sweep/dispatch semantics separate | Operational sweep | CONFLICTING as global formula; STATE-CONFLICT-001 |
| FLOW-048 | Manual release request for a resource-pool window | Admin/manual capacity-release path | Release acceptance/rejection path; no RE-005 candidate rules extracted | Resource pool window release request | CONTEXT_VARIANT |

## Payment / Booking Integrity
PaymentIntent existence and amount begin in FLOW-050, provider order metadata in FLOW-051, capture in FLOW-052 or FLOW-054, and Booking HELD -> CONFIRMED in FLOW-034. PaymentIntent capture is not Booking confirmation atomicity. Executable outcomes preserved: PaymentIntent = captured with Booking = HELD after downstream confirmation failure; Booking = CONFIRMED without FLOW-034 itself proving captured payment.

## Direct Verify vs Webhook Consistency
| Dimension | FLOW-052 | FLOW-054 | Consistency |
|---|---|---|---|
| Authentication/trust | JWT caller plus Razorpay signature | Provider webhook signature/event id | CONTEXT_DEPENDENT |
| PaymentIntent lookup | gateway/order input, pending intent | gatewayRef/payment id or payment link match | CONTEXT_DEPENDENT |
| Pending guard | Only matching pending intent captured | Only matching pending intent captured | CONSISTENT |
| Booking confirmation | Invokes FLOW-034 using intent.referenceId | Invokes FLOW-034 after capture | CONSISTENT_WITH_VARIANTS |
| Idempotency/replay | No webhook event id row | Webhook event id insert | CONTEXT_DEPENDENT |
| Ownership | PaymentIntent/booking ownership not explicit after signature | Provider/entity match substitutes user ownership | WEAK / CONTEXT_DEPENDENT |
| Retry behaviour | Direct caller can retry request | Local webhook event id can suppress replay after partial failure | WEAK |

## Negotiated Booking Integrity
FLOW-030, FLOW-056, FLOW-057, FLOW-054, and FLOW-034 compose a negotiated path that differs from standard booking by entry authorization, pricing/group-size waiver, payment-link metadata, and orchestration. Differences are classified as context variants where directly evidenced and unresolved for distributed rollback/recovery.

## Member Booking / Attendance Integrity
MemberAssignment, Subscription, Booking, and derived Attendance remain distinct. FLOW-043 canConfirm and FLOW-044 executable confirm conditions mostly align on MEMBER JWT, active subscription, and cutoff, but diverge on existing non-cancelled booking handling: FLOW-044 can update memberAttendanceConfirmedAt with Booking.status unchanged. FLOW-049 member no-show remains none -> RELEASED_NO_SHOW and does not imply CONFIRMED -> RELEASED_NO_SHOW.

## Cancellation Integrity
| Dimension | Preview | Execution | Consistency |
|---|---|---|---|
| Eligible states | HELD, CONFIRMED, CANCELLED | HELD, CONFIRMED; CANCELLED idempotent | CONTEXT_VARIANT |
| Refund calculation | Computes without write | Persists cancellation/refundAmount | CONTEXT_VARIANT |
| Policy source | Booking rule tiers/current hours for confirmed | Recomputes tiered refund | CONSISTENT_WITH_VARIANTS |
| Side effects | No persisted write | Booking.status/refundAmount write; no refund creation | WEAK continuation |

## Cancellation / Refund Integrity
Cancellation is not automatic refund. FLOW-037 may persist CANCELLED/refundAmount; FLOW-059 creates local refund rows based on cancelled booking/captured PaymentIntent; FLOW-060 overrides local refund. Refund provider consistency is LOCAL_ONLY/PARTIAL because Razorpay refund execution is not evidenced.

## Notification Integrity
FLOW-055 and FLOW-049 can act as producers, FLOW-061 queues, FLOW-062 stores templates, FLOW-063 registers devices, FLOW-064 reads history, and FLOW-065 processes retry/dead-letter. Producer success does not guarantee provider delivery, and queued recipient identity is not structurally proven to equal authenticated tenant/user history scope. NotificationRequest is separate from ScheduledJobDispatch.

## Scheduler Integrity
| Dimension | Due Job | Manual | Consistency |
|---|---|---|---|
| Claim | enabled/due/lease checks | manual invocation by job id | CONTEXT_DEPENDENT |
| Lease | lockedUntil/timeout retained | no lease clearing evidenced | WEAK |
| Completion | due-job summary | manual execution result | CONTEXT_DEPENDENT |
| Retry/nextRunAt | scheduler-managed | unresolved | UNKNOWN |

## Dispatch Integrity
FLOW-068 and FLOW-069 define generic ScheduledJobDispatch PENDING/SENT/FAILED lifecycle with dedupe/outcome. FLOW-049 uses a direct dedupe marker/SENT behaviour for sweep-related work and must not be treated as evidence that all dispatch records represent delivered notifications.

## Authentication / Session Integrity
FLOW-001 through FLOW-005 preserve OTP, token, refresh, and logout behaviour. FLOW-009/FLOW-010 role assignment and role/branch context feed login/refresh claims through FLOW-002/FLOW-004. Authorization context can become stale between JWT issuance and later role updates until refresh recalculates roles; this is recorded as XFLOW-VARIANT-007 rather than a new defect because RE-010 evidence preserves token refresh as the role recalculation point.

## Tenant Context Integrity
| Flow | Tenant Source | Validation | Cross-Flow Risk/Variant |
|---|---|---|---|
| FLOW-006 | JWT tenant | Admin phone lookup tenant-scoped | CONSISTENT |
| FLOW-009/FLOW-010 | Role tenant/branch rows | OWNER tenant-wide; non-owner branch required | CONTEXT_VARIANT |
| FLOW-011/FLOW-012 | Internal key or OWNER/JWT tenant | Tenant admin boundary | CONTEXT_VARIANT |
| FLOW-013 | hostname/subdomain or query tenant | Query override preserved | CONTEXT_VARIANT |
| FLOW-016 | Stored branch tenant | Body tenant not authoritative | CONSISTENT |
| FLOW-029 | JWT tenant | Creator tenant from JWT | CONSISTENT |
| FLOW-031/FLOW-033 | Booking tenant/branch plus admin/internal | Read/list scoping differs | CONTEXT_VARIANT |
| FLOW-040-FLOW-046 | JWT or resource-pool/branch tenant | Assignment/attendance scoping | CONTEXT_VARIANT |
| FLOW-050-FLOW-052 | Booking/PaymentIntent context plus JWT/signature | Ownership weak after verify | WEAK |
| FLOW-053 | Request body tenantId/userId | No identity binding evidenced | WEAK |
| FLOW-064 | recipient string | Not tenant plus user | WEAK |

## Branch Scope Integrity
Role branch claims, resource-pool branch, booking branch, assignment branch, admin list filtering, negotiated booking, and member operations are CONSISTENT_WITH_VARIANTS overall. Branch-manager scoping is stronger in assignment/listing and negotiated link paths than in internal-key booking/cancellation/refund paths; AUTHZ-FINDING-005 carries the trusted-boundary variant.

## Ownership Integrity
| Entity | Create | Read | Mutate | Cross-Service | Integrity |
|---|---|---|---|---|---|
| Booking | FLOW-029 JWT owner; FLOW-030 internal; FLOW-044 member | FLOW-031/FLOW-032/FLOW-033 owner/admin/internal variants | FLOW-034 internal, FLOW-035 weak, FLOW-037 owner/admin/internal | Payment invokes FLOW-034 | WEAK / CONTEXT_DEPENDENT |
| PaymentIntent | FLOW-050 JWT booking owner | FLOW-051 owner | FLOW-052/FLOW-054 capture by signature/provider | Booking confirm boundary | WEAK |
| Refund | FLOW-059 internal | Not fully modeled in RE-011 | FLOW-060 admin override | Provider refund absent | PARTIAL |
| Subscription | FLOW-053 body identity | FLOW-043/FLOW-044/FLOW-046 eligibility readers | FLOW-055 provider webhook | Autopay provider | WEAK |
| NotificationRequest | FLOW-061 producer/recipient | FLOW-064 exact recipient | FLOW-065 worker | Provider delivery | WEAK |

## Idempotency Integrity
| Mechanism | Scope | Protects | Does Not Protect | Evidence |
|---|---|---|---|---|
| Booking idempotency key | REQUEST/ENTITY | Duplicate standard/negotiated booking create | Payment capture or confirmation outcome | BR-051, BR-052, BR-063 |
| PaymentIntent reuse | ENTITY | Duplicate intent for same booking/purpose context | Provider order/capture side effects | BR-132-BR-138 |
| Payment order metadata | ENTITY/SIDE EFFECT | Stored gatewayRef metadata mutation | Provider order cross-service recovery | BR-149, BR-150, TRANSITION-PAYMENT-INTENT-003 |
| Webhook gatewayEventId | EVENT | Duplicate webhook business processing | Failure after event insert | BR-171-BR-174, BR-181-BR-182, INTEGRATION-FINDING-008 |
| Subscription mandate uniqueness | ENTITY | Duplicate mandate/subscription semantics | Body identity binding | BR-162-BR-169, AUTHZ-FINDING-003 |
| Refund idempotency | ENTITY | Existing refund by PaymentIntent | Provider refund execution | BR-202, BR-203, INTEGRATION-FINDING-004 |
| Dispatch dedupe | EVENT/ENTITY | Duplicate dispatch claim | Actual delivery guarantee | BR-226, BR-227 |

## Webhook Replay / Recovery Integrity
FLOW-054 and FLOW-055 insert/observe local webhook event idempotency before/around business processing. If downstream processing fails after idempotency is recorded, RE-009 preserves INTEGRATION-FINDING-008: replay can be suppressed unless separate compensation exists. No replay infrastructure is invented here.

## Transaction Boundary Integrity
| Journey | Operation A | Operation B | Transaction Relationship | Failure State |
|---|---|---|---|---|
| Booking create + capacity | FLOW-029 lock/capacity decision | Booking row creation | SAME_TRANSACTION where evidenced by lock boundary | Capacity reject or HELD booking |
| Payment capture + booking confirm | FLOW-052/FLOW-054 capture | FLOW-034 confirmation | SERVICE_BOUNDARY | Captured PaymentIntent with HELD booking |
| Member booking create + attendance | FLOW-044 booking create/update | memberAttendanceConfirmedAt update | SAME_TRANSACTION per RE-006 boundary | UNKNOWN partial state not evidenced |
| Cancellation + refund | FLOW-037 cancellation | FLOW-059 refund creation | SEPARATE_TRANSACTION | Cancelled booking without Refund |
| Autopay failure + notification | FLOW-055 suspension | FLOW-061 notification request | BEST_EFFORT | Suspended subscription without notification |
| Notification queue + delivery | FLOW-061 queue | FLOW-065 worker send/dead_letter | SEPARATE_TRANSACTION | Queued/dead_letter without provider delivery |
| Scheduler claim + execution | FLOW-066 claim | job handler execution | SAME_PROCESS / lease boundary | Lease timeout/unresolved completion |
| Dispatch claim + outcome | FLOW-068 PENDING | FLOW-069 SENT/FAILED | SEPARATE_TRANSACTION | PENDING without outcome |

## Temporal Consistency
| Rule/Flow | Time Concept | Timezone Basis | Consumers | Consistency |
|---|---|---|---|---|
| FLOW-001 | OTP TTL/cooldown | UTC/server time implied | FLOW-002 | CONSISTENT |
| FLOW-024 | Booking horizon / generated date range | Generated/query date context; branch context unresolved | FLOW-029 | CONTEXT_DEPENDENT |
| FLOW-029/FLOW-034/FLOW-049 | heldUntil / confirmation / stale hold | Server time; exact race semantics unresolved | Booking confirmation and sweep | WEAK |
| FLOW-036/FLOW-037 | Cancellation hours before slot | Current hours before slot | Preview/execution | CONSISTENT_WITH_VARIANTS |
| FLOW-043/FLOW-044 | Member cutoff | Branch-local context | Today view and confirm | CONSISTENT_WITH_VARIANTS |
| FLOW-049 | Member no-show grace/sweep timing | UNKNOWN | Attendance/capacity | UNKNOWN |
| FLOW-061/FLOW-065 | retryAfter and attempts | Server time | Notification worker | CONTEXT_DEPENDENT |
| FLOW-066/FLOW-067 | lockedUntil / nextRunAt | Server time | Scheduler/manual | WEAK |

## Derived-State Integrity
| Derived Value | Input Writers | Consumer Flows | Consistency |
|---|---|---|---|
| Availability remaining capacity | FLOW-023, FLOW-024 materialization, FLOW-029 bookings, FLOW-049 release/no-show | FLOW-024, FLOW-029, FLOW-030 | CONFLICTING via STATE-CONFLICT-001 |
| canConfirm | FLOW-040/FLOW-042 assignment, FLOW-053/FLOW-055 subscription, Booking existence | FLOW-043, FLOW-044 | ASYMMETRIC via XFLOW-FINDING-003 |
| Attendance status | FLOW-044 memberAttendanceConfirmedAt, FLOW-035 checked-in, FLOW-049 no-show | FLOW-046 | CONTEXT_DEPENDENT |
| Refund eligibility | FLOW-037 cancellation/refundAmount, FLOW-052/FLOW-054 captured PaymentIntent | FLOW-059, FLOW-060 | WEAK provider/local boundary |
| Public branch visibility | FLOW-015/FLOW-016 status | FLOW-017 | CONSISTENT_WITH_VARIANTS |

## Read/Write Asymmetry
| Field | Writers | Readers | Semantic Agreement | Finding |
|---|---|---|---|---|
| Booking.status | FLOW-029, FLOW-034, FLOW-035, FLOW-037, FLOW-049, FLOW-044 | FLOW-024, FLOW-031, FLOW-032, FLOW-033, FLOW-036, FLOW-046, FLOW-059 | CONTEXT_DEPENDENT | STATE-CONFLICT-001, STATE-CONFLICT-002 |
| PaymentIntent.status | FLOW-050, FLOW-052, FLOW-054, FLOW-055 | FLOW-051, FLOW-059 | WEAK across provider/local states | XFLOW-FINDING-005 |
| Subscription.status | FLOW-053, FLOW-055 | FLOW-043, FLOW-044, FLOW-046 | WEAK identity binding | XFLOW-FINDING-006 |
| memberAttendanceConfirmedAt | FLOW-044 | FLOW-046 | CONTEXT_DEPENDENT with existing booking | XFLOW-FINDING-003 |
| ScheduledJobDispatch.status | FLOW-068, FLOW-069, FLOW-049 marker path | FLOW-069 / operational readers | CONTEXT_VARIANT | XFLOW-VARIANT-006 |
| NotificationRequest.status | FLOW-061, FLOW-065 | FLOW-064 | WEAK delivery guarantee | XFLOW-FINDING-007 |

## Cross-Flow Findings
### XFLOW-FINDING-001
Finding ID: XFLOW-FINDING-001
Title: Held booking validity is distributed across create, confirm, and sweep
Journey: Standard Guest Booking / Booking Confirmation
Flows: FLOW-029, FLOW-034, FLOW-049
Upstream IDs: BR-061, BR-083, BR-084, STATE-CONFLICT-002, INVARIANT-FINDING-001, TRANSITION-BOOKING-001, TRANSITION-BOOKING-003, TRANSITION-BOOKING-009
Observed Behaviour: FLOW-029 creates HELD with heldUntil, FLOW-034 confirms HELD without hold-expiry enforcement, and FLOW-049 releases stale HELD bookings.
Cross-Flow Integrity Concern: The valid-hold rule is not enforced by every mutating flow that consumes HELD.
Possible Executable Outcome: A booking can be confirmed by FLOW-034 after the time basis that FLOW-049 would treat as stale, or FLOW-049 can release before confirmation reaches the booking boundary.
Classification: TEMPORAL_GAP
Business Validation Required: YES

### XFLOW-FINDING-002
Finding ID: XFLOW-FINDING-002
Title: Capacity semantics differ between browse, booking, member, manual release, and sweep paths
Journey: Availability / Capacity
Flows: FLOW-024, FLOW-029, FLOW-030, FLOW-044, FLOW-048, FLOW-049
Upstream IDs: BR-044, BR-045, BR-058, BR-059, BR-063, BR-064, BR-125, RULE-VARIANT-009, STATE-CONFLICT-001, INVARIANT-FINDING-003
Observed Behaviour: FLOW-024 uses browse availability capacity semantics; FLOW-029 uses standard booking capacity semantics; FLOW-030 preserves capacity/block checks while waiving standard group/pricing; FLOW-044 member booking semantics are separate; FLOW-049 releases stale holds and creates member no-show records; FLOW-048 is the manual capacity-release request path.
Cross-Flow Integrity Concern: Composed journeys do not expose a single capacity-consumer definition across availability/browse, standard booking, negotiated booking, member booking, automated no-show/release, and manual capacity-release contexts.
Possible Executable Outcome: Availability may show capacity differently from later occupancy or no-show/release interpretation.
Classification: CONTEXT_DEPENDENT
Business Validation Required: YES

### XFLOW-FINDING-003
Finding ID: XFLOW-FINDING-003
Title: Member canConfirm and confirm execution diverge on existing booking handling
Journey: Member Attendance
Flows: FLOW-043, FLOW-044, FLOW-046, FLOW-049
Upstream IDs: BR-121, BR-123, BR-124, BR-125, BR-126, TRANSITION-BOOKING-010, TRANSITION-BOOKING-011, TRANSITION-BOOKING-012, FLOW-044-UNCERTAINTY-002
Observed Behaviour: FLOW-043 canConfirm is true only with no booking, active subscription, and before cutoff. FLOW-044 can create a confirmed member booking when none exists or update memberAttendanceConfirmedAt on an existing non-cancelled booking without changing Booking.status.
Cross-Flow Integrity Concern: The read-side confirm affordance and write-side metadata update support different existing-booking semantics.
Possible Executable Outcome: A member may not be offered canConfirm by FLOW-043 when a booking exists, while FLOW-044 still has an existing-booking metadata update path if invoked.
Classification: ASYMMETRIC
Business Validation Required: YES

### XFLOW-FINDING-004
Finding ID: XFLOW-FINDING-004
Title: Member no-show creation is a creation path, not a confirmed-booking transition
Journey: Member Attendance / Capacity
Flows: FLOW-043, FLOW-044, FLOW-046, FLOW-049
Upstream IDs: TRANSITION-BOOKING-012, BR-121, BR-125, BR-129, FLOW-049 lineage
Observed Behaviour: FLOW-049 can create Booking(RELEASED_NO_SHOW) when no existing non-cancelled booking exists. RE-006 does not evidence CONFIRMED -> RELEASED_NO_SHOW.
Cross-Flow Integrity Concern: Attendance, capacity, and booking history consumers must treat member no-show as a synthetic booking creation path rather than a status mutation from confirmed booking.
Possible Executable Outcome: Derived attendance can include a no-show booking that was not previously confirmed.
Classification: DERIVED_STATE_GAP
Business Validation Required: YES

### XFLOW-FINDING-005
Finding ID: XFLOW-FINDING-005
Title: Payment capture and booking confirmation compose across separate boundaries
Journey: Payment / Booking Confirmation
Flows: FLOW-050, FLOW-051, FLOW-052, FLOW-054, FLOW-034
Upstream IDs: BR-157, BR-158, BR-177, BR-178, STATE-CONFLICT-002, INVARIANT-FINDING-005, INTEGRATION-FINDING-001, INTEGRATION-013, INTEGRATION-016
Observed Behaviour: FLOW-052 and FLOW-054 can capture PaymentIntent and invoke FLOW-034, while FLOW-034 owns HELD -> CONFIRMED and does not itself verify captured payment proof/state.
Cross-Flow Integrity Concern: Payment state and booking state can diverge across the internal HTTP/service boundary.
Possible Executable Outcome: PaymentIntent = captured with Booking = HELD if confirmation fails; Booking = CONFIRMED without payment proof if FLOW-034 is invoked directly by a trusted caller.
Classification: NON_ATOMIC
Business Validation Required: YES

### XFLOW-FINDING-006
Finding ID: XFLOW-FINDING-006
Title: Body-supplied subscription identity feeds downstream eligibility state
Journey: Subscription / Member Attendance
Flows: FLOW-053, FLOW-055, FLOW-043, FLOW-044, FLOW-046
Upstream IDs: BR-162, BR-164, BR-169, BR-183, BR-185, INVARIANT-FINDING-007, AUTHZ-FINDING-003
Observed Behaviour: FLOW-053 persists subscription identity from body fields without authenticated identity binding; FLOW-055 mutates subscription status; FLOW-043/FLOW-044/FLOW-046 read active subscription for eligibility/attendance.
Cross-Flow Integrity Concern: A weak creation boundary can influence later membership eligibility if downstream flows trust the persisted Subscription row.
Possible Executable Outcome: Subscription active/suspended state may affect canConfirm and attendance display for body-specified tenant/user identity.
Classification: OWNERSHIP_GAP
Business Validation Required: YES

### XFLOW-FINDING-007
Finding ID: XFLOW-FINDING-007
Title: Notification producers do not uniformly guarantee persisted notification outcomes
Journey: Notification
Flows: FLOW-049, FLOW-055, FLOW-061, FLOW-065
Upstream IDs: BR-186, BR-187, BR-212, BR-213, BR-220, BR-221, INVARIANT-FINDING-008, INTEGRATION-FINDING-005, INTEGRATION-FINDING-006
Observed Behaviour: FLOW-055 autopay failure notification is best-effort; FLOW-049 low-occupancy alert is a notification boundary; FLOW-061 queues rows; FLOW-065 later retries or dead-letters.
Cross-Flow Integrity Concern: Producer success does not uniformly imply notification persistence or provider delivery.
Possible Executable Outcome: Upstream subscription/capacity state can change while notification is absent, queued, failed, or dead-lettered.
Classification: RECOVERY_GAP
Business Validation Required: YES

### XFLOW-FINDING-008
Finding ID: XFLOW-FINDING-008
Title: Scheduled and manual job execution have different lease assumptions
Journey: Scheduled Operations
Flows: FLOW-066, FLOW-067
Upstream IDs: BR-222, BR-223, BR-224, BR-225, INVARIANT-FINDING-009, INTEGRATION-FINDING-007
Observed Behaviour: FLOW-066 claims due jobs with lease semantics; FLOW-067 manually executes a job but does not evidence clearing existing leases.
Cross-Flow Integrity Concern: Manual and scheduled execution can compose around the same job without a common lease lifecycle.
Possible Executable Outcome: A manual run and an already leased due run can diverge operationally unless external process discipline exists.
Classification: UNRESOLVED
Business Validation Required: YES

### XFLOW-FINDING-009
Finding ID: XFLOW-FINDING-009
Title: Tenant source varies by journey boundary
Journey: Authorization / Tenant
Flows: FLOW-006, FLOW-009, FLOW-010, FLOW-011, FLOW-012, FLOW-013, FLOW-016, FLOW-029, FLOW-031, FLOW-033, FLOW-040, FLOW-050, FLOW-052, FLOW-053, FLOW-064
Upstream IDs: BR-011, BR-017, BR-018, BR-023, BR-025, BR-026, BR-032, BR-049, BR-066, BR-076, BR-106, BR-131, BR-160, BR-162, BR-218, AUTHZ-FINDING-002, AUTHZ-FINDING-003, AUTHZ-FINDING-004
Observed Behaviour: Tenant comes from JWT, stored entities, request body, hostname/query context, provider entity match, or internal key depending on flow.
Cross-Flow Integrity Concern: Cross-flow journeys depend on different tenant authorities at each boundary.
Possible Executable Outcome: A composed operation may shift from JWT tenant to body tenant or provider/local entity tenant depending on the next flow.
Classification: TENANT_SCOPE_RISK
Business Validation Required: YES

### XFLOW-FINDING-010
Finding ID: XFLOW-FINDING-010
Title: Local refund state is disconnected from provider money movement
Journey: Cancellation / Refund
Flows: FLOW-037, FLOW-059, FLOW-060
Upstream IDs: BR-104, BR-197, BR-199, BR-200, BR-201, BR-203, BR-211, INVARIANT-FINDING-004, INVARIANT-FINDING-006, INTEGRATION-FINDING-003, INTEGRATION-FINDING-004
Observed Behaviour: FLOW-037 cancellation stores status/refundAmount but does not invoke refund creation. FLOW-059/FLOW-060 create or override local Refund rows without evidenced Razorpay refund execution.
Cross-Flow Integrity Concern: The composed refund journey has local persistence without provider synchronization evidence.
Possible Executable Outcome: Booking can be cancelled and local refund state can exist while provider refund execution remains unknown/not evidenced.
Classification: RECOVERY_GAP
Business Validation Required: YES

## Cross-Flow Conflicts
No new XFLOW-CONFLICT IDs are introduced. STATE-CONFLICT-001, STATE-CONFLICT-002, and STATE-CONFLICT-003 fully represent the currently evidenced executable conflicts; RE-011 references them instead of duplicating them.

## Journey Gaps
| Gap ID | Type | Missing Continuation / Recovery | Flows | Evidence |
|---|---|---|---|---|
| XFLOW-GAP-001 | NO_COMPENSATION_EVIDENCED | Captured payment followed by failed FLOW-034 booking confirmation has no evidenced compensating recovery. | FLOW-052, FLOW-054, FLOW-034 | INVARIANT-FINDING-005, INTEGRATION-FINDING-001 |
| XFLOW-GAP-002 | NO_COMPENSATION_EVIDENCED | Negotiated booking/payment-link orchestration has no evidenced distributed rollback if one side succeeds and the other fails. | FLOW-030, FLOW-056, FLOW-057, FLOW-054 | PI-VARIANT-001, INTEGRATION-VARIANT-002 |
| XFLOW-GAP-003 | NO_PROVIDER_ACTION_EVIDENCED | Cancellation does not automatically create provider refund; local refund action is separate. | FLOW-037, FLOW-059, FLOW-060 | INVARIANT-FINDING-004, INTEGRATION-FINDING-003, INTEGRATION-FINDING-004 |
| XFLOW-GAP-004 | NO_RECOVERY_EVIDENCED | Webhook idempotency row insertion before all downstream side effects can suppress later replay after partial failure. | FLOW-054, FLOW-055 | INTEGRATION-FINDING-008 |
| XFLOW-GAP-005 | NO_RECOVERY_EVIDENCED | Dead-letter notification recovery is not evidenced beyond status outcome. | FLOW-061, FLOW-065 | BR-220, BR-221, INTEGRATION-FINDING-006 |
| XFLOW-GAP-006 | UNKNOWN | Scheduler timeout/lease completion recovery is unresolved across due and manual paths. | FLOW-066, FLOW-067 | INVARIANT-FINDING-009, INTEGRATION-FINDING-007 |

## Cross-Flow Variants
| Variant ID | Variant | Behavioural Difference | Upstream IDs |
|---|---|---|---|
| XFLOW-VARIANT-001 | Standard vs negotiated booking | FLOW-029 enforces self-service user/group/pricing constraints; FLOW-030/FLOW-056/FLOW-057 use internal/admin negotiated path with different pricing/group-size semantics. | PI-VARIANT-001, AUTHZ-VARIANT-006, INTEGRATION-VARIANT-002 |
| XFLOW-VARIANT-002 | Direct verify vs webhook | FLOW-052 uses authenticated caller plus direct signature; FLOW-054 uses provider webhook signature/event/idempotency. | PI-VARIANT-004, AUTHZ-VARIANT-005, INTEGRATION-VARIANT-001 |
| XFLOW-VARIANT-003 | Guest booking vs member booking | FLOW-029 creates HELD non-member booking; FLOW-044 creates CONFIRMED member booking or updates metadata. | PI-VARIANT-002, AUTHZ-VARIANT-004, INTEGRATION-VARIANT-004 |
| XFLOW-VARIANT-004 | Cancellation preview vs execution | FLOW-036 computes without write; FLOW-037 persists cancellation/refundAmount. | PI-VARIANT-003 |
| XFLOW-VARIANT-005 | Autopay charged vs failed | FLOW-055 charged activates/captures billing intent; failed suspends and best-effort notifies. | INTEGRATION-VARIANT-005 |
| XFLOW-VARIANT-006 | Notification queue vs scheduled dispatch | NotificationRequest lifecycle differs from ScheduledJobDispatch and FLOW-049 direct marker usage. | PI-VARIANT-008, INTEGRATION-VARIANT-008 |
| XFLOW-VARIANT-007 | JWT user flow vs internal/provider/service flow | User JWT, internal key, provider signature, and public technical flows are distinct authorization contexts. | AUTHZ-VARIANT-001, AUTHZ-VARIANT-003, AUTHZ-VARIANT-005 |
| XFLOW-VARIANT-008 | Public browse vs admin scoped operations | FLOW-017/FLOW-024 public reads differ from stored-tenant/admin/internal branch operations. | PI-VARIANT-006, AUTHZ-VARIANT-001 |

## Finding Deduplication Matrix
| RE-011 Issue | STATE-CONFLICT | INVARIANT-FINDING | AUTHZ-FINDING | INTEGRATION-FINDING | New XFLOW Needed? |
|---|---|---|---|---|---|
| Hold/payment confirmation assumptions | STATE-CONFLICT-002 | INVARIANT-FINDING-001, INVARIANT-FINDING-005 | AUTHZ-FINDING-005 | INTEGRATION-FINDING-001, INTEGRATION-FINDING-002 | Yes: XFLOW-FINDING-001 and XFLOW-FINDING-005 compose timing/payment/recovery |
| Capacity active-state mismatch | STATE-CONFLICT-001 | INVARIANT-FINDING-003 | None | None | Yes: XFLOW-FINDING-002 composes guest/negotiated/member/manual-release/sweep |
| Check-in auth/timing | STATE-CONFLICT-003 | INVARIANT-FINDING-002 | AUTHZ-FINDING-001 | None | No; upstream finding sufficient |
| Cancellation/refund separation | None | INVARIANT-FINDING-004, INVARIANT-FINDING-006 | AUTHZ-FINDING-005 | INTEGRATION-FINDING-003, INTEGRATION-FINDING-004 | Yes: XFLOW-FINDING-010 / XFLOW-GAP-003 |
| Subscription identity binding | None | INVARIANT-FINDING-007 | AUTHZ-FINDING-003 | None | Yes: XFLOW-FINDING-006 composes with attendance eligibility |
| Notification best effort/auth | None | INVARIANT-FINDING-008 | AUTHZ-FINDING-004, AUTHZ-FINDING-007 | INTEGRATION-FINDING-005, INTEGRATION-FINDING-006 | Yes: XFLOW-FINDING-007 |
| Scheduler manual lease | None | INVARIANT-FINDING-009 | None | INTEGRATION-FINDING-007 | Yes: XFLOW-FINDING-008 |
| Webhook replay after idempotency | None | None | AUTHZ-FINDING-006 | INTEGRATION-FINDING-008 | Yes: XFLOW-GAP-004 |

## Business Impact View
| Finding | Potential Effect | Evidence |
|---|---|---|
| XFLOW-FINDING-001 | STATE_DIVERGENCE / RECOVERY_GAP | BR-061, BR-084, STATE-CONFLICT-002 |
| XFLOW-FINDING-002 | CAPACITY_DIVERGENCE | STATE-CONFLICT-001, INVARIANT-FINDING-003 |
| XFLOW-FINDING-003 | ATTENDANCE_DIVERGENCE | BR-121, BR-125, TRANSITION-BOOKING-011 |
| XFLOW-FINDING-004 | ATTENDANCE_DIVERGENCE | TRANSITION-BOOKING-012 |
| XFLOW-FINDING-005 | PAYMENT_DIVERGENCE | INTEGRATION-FINDING-001 |
| XFLOW-FINDING-006 | TENANT_SCOPE_RISK | AUTHZ-FINDING-003 |
| XFLOW-FINDING-007 | NOTIFICATION_LOSS | INTEGRATION-FINDING-005 |
| XFLOW-FINDING-008 | OPERATIONAL_INCONSISTENCY | INTEGRATION-FINDING-007 |
| XFLOW-FINDING-009 | TENANT_SCOPE_RISK | AUTHZ-FINDING-002, AUTHZ-FINDING-003, AUTHZ-FINDING-004 |
| XFLOW-FINDING-010 | REFUND_DIVERGENCE | INTEGRATION-FINDING-004 |

## Cross-Flow Questions Requiring Business Validation
| Group | Question | References |
|---|---|---|
| Booking | Should FLOW-034 remain a trusted internal override despite BR-084 and BR-085, or should it enforce heldUntil/payment state? | XFLOW-FINDING-001, STATE-CONFLICT-002, INVARIANT-FINDING-001, FLOW-034, BR-084, BR-085 |
| Booking | What outcome is intended if FLOW-049 stale-hold release and FLOW-034 confirmation race on the same HELD booking? | XFLOW-FINDING-001, FLOW-049, FLOW-034, TRANSITION-BOOKING-009, TRANSITION-BOOKING-003 |
| Availability / Capacity | Should browse capacity, standard booking capacity, negotiated booking capacity, member booking capacity, automated no-show/release, and manual capacity-release use one capacity formula or context-specific formulas? | XFLOW-FINDING-002, FLOW-048, STATE-CONFLICT-001, INVARIANT-FINDING-003 |
| Availability / Capacity | Should negotiated bookings continue to waive group-size/pricing while preserving capacity/block checks? | XFLOW-VARIANT-001, FLOW-030, BR-063, BR-064 |
| Payment | What recovery is expected when PaymentIntent is captured but FLOW-034 confirmation fails? | XFLOW-FINDING-005, XFLOW-GAP-001, INTEGRATION-FINDING-001 |
| Payment | Should FLOW-052 direct verify enforce PaymentIntent/booking ownership after signature verification? | AUTHZ-FINDING-002, FLOW-052, BR-160, BR-161 |
| Payment | Should direct verify and webhook capture remain context variants or converge on the same ownership/idempotency/retry model? | XFLOW-VARIANT-002, FLOW-052, FLOW-054 |
| Membership / Attendance | Should FLOW-043 canConfirm expose the same existing-booking semantics implemented by FLOW-044? | XFLOW-FINDING-003, FLOW-043, FLOW-044, BR-121, BR-125 |
| Membership / Attendance | Should member no-show remain none -> RELEASED_NO_SHOW booking creation, and how should attendance reports display it? | XFLOW-FINDING-004, TRANSITION-BOOKING-012, FLOW-049 |
| Membership / Attendance | Should subscription creation require authenticated identity binding before influencing member eligibility? | XFLOW-FINDING-006, INVARIANT-FINDING-007, AUTHZ-FINDING-003 |
| Cancellation / Refund | Should cancellation invoke refund creation automatically or remain a separate journey? | XFLOW-GAP-003, INVARIANT-FINDING-004, INTEGRATION-FINDING-003 |
| Cancellation / Refund | Should local Refund rows imply provider refund execution? | XFLOW-FINDING-010, INVARIANT-FINDING-006, INTEGRATION-FINDING-004 |
| Notification | Should successful upstream producer flows guarantee NotificationRequest persistence? | XFLOW-FINDING-007, FLOW-049, FLOW-055, FLOW-061 |
| Notification | Should notification history recipient filtering be tenant/user-bound instead of exact recipient only? | AUTHZ-FINDING-004, FLOW-064, BR-218 |
| Scheduler / Dispatch | Should manual scheduled execution honor or clear due-job leases? | XFLOW-FINDING-008, INVARIANT-FINDING-009, FLOW-066, FLOW-067 |
| Scheduler / Dispatch | Should FLOW-049 direct dispatch marker be treated separately from generic ScheduledJobDispatch delivery semantics? | XFLOW-VARIANT-006, FLOW-049, FLOW-068, FLOW-069 |
| Authorization / Tenant | Which tenant source is authoritative when journeys cross JWT, request body, stored entity, provider, and internal-key boundaries? | XFLOW-FINDING-009, AUTHZ-FINDING-003, FLOW-013, FLOW-029, FLOW-053 |
| Authorization / Tenant | Should internal-key operations continue bypassing tenant/ownership checks across tenant, booking, cancellation, and refund boundaries? | AUTHZ-FINDING-005, FLOW-012, FLOW-030, FLOW-034, FLOW-036, FLOW-037, FLOW-059 |
| Recovery / Compensation | Should webhook idempotency be recorded before or after all critical downstream effects? | XFLOW-GAP-004, INTEGRATION-FINDING-008, FLOW-054, FLOW-055 |
| Temporal Behaviour | Which timezone basis is canonical across branch availability, booking hold, cancellation hours, member cutoff, retryAfter, and scheduler leases? | PI-VARIANT-007, XFLOW-FINDING-001, FLOW-023, FLOW-024, FLOW-029, FLOW-036, FLOW-043, FLOW-066 |

## Evidence Recheck Discipline
SOURCE RECHECK REQUIRED: NO. RE-005 through RE-010 were sufficient for this consistency review. No upstream lineage defect was discovered.

## RE-010 Lineage Dependency
All direct RE-011 references were validated against identities present in RE-010 and upstream RE-006 through RE-009 analytical catalogues. No direct reference bypasses RE-010 identity validation.

## Required Journey Coverage
| Category | Count | Flows |
|---|---:|---|
| Flows reviewed compositionally | 70 | FLOW-001 through FLOW-070 |
| Flows explicitly N/A | 0 | None |
| Unclassified flows | 0 | None |

## Mechanical Integrity Checks
| Check | Result |
|---|---:|
| Journeys reviewed | 17 |
| Flows participating in reviewed journeys | 70 |
| Distinct flows represented in Journey Integrity Matrix | 70 |
| Flows reviewed compositionally | 70 |
| Flows explicitly N/A | 0 |
| Unclassified flows | 0 |
| FLOW-045 represented | YES |
| FLOW-047 represented | YES |
| FLOW-048 represented | YES |
| XFLOW-FINDING-002 includes FLOW-048 | YES |
| Upstream state conflicts referenced | 3 |
| Upstream invariant findings referenced | 9 |
| Upstream authorization findings referenced | 7 |
| Upstream integration findings referenced | 8 |
| New XFLOW findings | 10 |
| New XFLOW conflicts | 0 |
| Journey gaps | 6 |
| Cross-flow variants | 8 |
| Unresolved validation questions | 20 |
| Broken canonical references | 0 |
| Duplicate XFLOW IDs | 0 |
| Findings without FLOW lineage | 0 |
| Findings without evidence lineage | 0 |
| Undefined uncertainty references | 0 |

## Completion Status
RE-011 - CROSS-FLOW INTEGRITY & CONSISTENCY REVIEW

STATUS:
COMPLETE

JOURNEYS REVIEWED:
17

FLOWS REVIEWED COMPOSITIONALLY:
70

FLOWS EXPLICITLY N/A:
0

UNCLASSIFIED FLOWS:
0

UPSTREAM STATE CONFLICTS REFERENCED:
3

UPSTREAM INVARIANT FINDINGS REFERENCED:
9

UPSTREAM AUTHORIZATION FINDINGS REFERENCED:
7

UPSTREAM INTEGRATION FINDINGS REFERENCED:
8

NEW XFLOW FINDINGS:
10

NEW XFLOW CONFLICTS:
0

JOURNEY GAPS:
6

CROSS-FLOW VARIANTS:
8

VALIDATION QUESTIONS:
20

BROKEN CANONICAL REFERENCES:
0

DUPLICATE XFLOW IDS:
0

UNDEFINED UNCERTAINTY REFERENCES:
0

FLOW LINEAGE:
PRESERVED

BR LINEAGE:
PRESERVED

STATE LINEAGE:
PRESERVED

POLICY/INVARIANT LINEAGE:
PRESERVED

AUTHORIZATION LINEAGE:
PRESERVED

INTEGRATION LINEAGE:
PRESERVED

UNCERTAINTY LINEAGE:
PRESERVED

BUSINESS VALIDATION:
REQUIRED

