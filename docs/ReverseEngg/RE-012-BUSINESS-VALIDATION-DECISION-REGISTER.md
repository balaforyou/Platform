# RE-012 - Business Validation & Decision Register

This register is the SME-facing decision surface for the reconstructed AS-IS baseline. It routes to RE-011 and RE-010 evidence without restating the full reconstruction analysis. No business question is answered here.

## Reconciliation From RE-011
| Item | Count | Explanation |
|---|---:|---|
| RE-011 validation questions | 20 | Source set from RE-011 Cross-Flow Questions Requiring Business Validation |
| Merged | 4 | Overlapping recovery, tenant/ownership, and payment-confirmation questions were consolidated where one SME decision resolves multiple technical issues |
| Split | 0 | No RE-011 question required separate independent decisions beyond its stated topic |
| Additional uncovered questions | 0 | Upstream finding coverage did not expose an additional business question absent from RE-011 |
| Final VALIDATION identities | 16 | VALIDATION-001 through VALIDATION-016 |

## Validation Register
| Validation | Category | Priority | Question Summary | Status | Decision |
|---|---|---|---|---|---|
| VALIDATION-001 | Availability / Capacity | P0 | Should capacity use one canonical formula or context-specific formulas? | PENDING | PENDING |
| VALIDATION-002 | Booking | P0 | Should booking confirmation enforce hold expiry and payment proof/state? | PENDING | PENDING |
| VALIDATION-003 | Booking | P1 | What should happen when stale-hold release and confirmation race? | PENDING | PENDING |
| VALIDATION-004 | Payment | P0 | What recovery is required when payment capture succeeds but booking confirmation fails? | PENDING | PENDING |
| VALIDATION-005 | Payment | P1 | Should FLOW-052 enforce ownership after Razorpay signature verification? | PENDING | PENDING |
| VALIDATION-006 | Payment | P1 | Should direct verify and webhook capture remain distinct variants or converge? | PENDING | PENDING |
| VALIDATION-007 | Availability / Capacity | P2 | Should negotiated booking keep its distinct group-size/pricing treatment? | PENDING | PENDING |
| VALIDATION-008 | Membership / Attendance | P1 | Should canConfirm and executable member confirmation use the same existing-booking semantics? | PENDING | PENDING |
| VALIDATION-009 | Membership / Attendance | P1 | Should member no-show remain a none -> RELEASED_NO_SHOW booking creation path? | PENDING | PENDING |
| VALIDATION-010 | Membership / Attendance | P0 | Should subscription creation require authenticated identity binding before eligibility use? | PENDING | PENDING |
| VALIDATION-011 | Cancellation / Refund | P1 | Should refund remain separate from cancellation or be business-required continuation? | PENDING | PENDING |
| VALIDATION-012 | Cancellation / Refund | P1 | What does local Refund mean without evidenced provider refund execution? | PENDING | PENDING |
| VALIDATION-013 | Notification | P1 | Should upstream producer success guarantee NotificationRequest persistence and delivery tracking? | PENDING | PENDING |
| VALIDATION-014 | Scheduler / Dispatch | P2 | Should manual execution share the same lease semantics as due-job execution? | PENDING | PENDING |
| VALIDATION-015 | Authorization / Tenant / Ownership | P0 | Which tenant/ownership authority is authoritative across JWT, body, stored entity, provider, and internal-key boundaries? | PENDING | PENDING |
| VALIDATION-016 | Temporal Behaviour | P2 | Which timezone/time basis is canonical across scheduling, booking, cancellation, retry, and lease rules? | PENDING | PENDING |

## Booking
## VALIDATION-002 - Confirmation expiry and payment proof
### Business Question
Should booking confirmation remain an internal trusted operation, or must it enforce hold expiry and captured payment proof/state itself?
### Why This Needs Validation
FLOW-034 owns HELD -> CONFIRMED but does not enforce hold expiry or payment proof/state. Payment-triggered flows treat capture as an upstream precondition before invoking FLOW-034, so the AS-IS baseline needs business confirmation of that trust boundary.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-034, FLOW-052, FLOW-054 |
| Business Rules | BR-083, BR-084, BR-085, BR-158, BR-177, BR-178 |
| State Conflicts | STATE-CONFLICT-002 |
| Invariant Findings | INVARIANT-FINDING-001, INVARIANT-FINDING-005 |
| Authorization Findings | AUTHZ-FINDING-005, AUTHZ-FINDING-006 |
| Integration Findings | INTEGRATION-FINDING-001, INTEGRATION-FINDING-002 |
| Cross-Flow Findings | XFLOW-FINDING-001, XFLOW-FINDING-005 |
| Journey Gaps | XFLOW-GAP-001 |
| Variants | XFLOW-VARIANT-002, XFLOW-VARIANT-007 |
| Uncertainties | FLOW-034-UNCERTAINTY-001, FLOW-034-UNCERTAINTY-002, FLOW-034-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 |
### Observed Current Behaviour
FLOW-034 can confirm HELD bookings through an internal boundary without independently checking hold expiry or payment proof/state.
### Decision Options
A. Keep current trusted internal confirmation behaviour
B. Require hold-expiry and payment proof/state validation at confirmation
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, STATE_MODEL, POLICY_INVARIANT, AUTHORIZATION, INTEGRATION, SERVICE_BOUNDARY, API_CONTRACT, TEST_EXPECTATION

## VALIDATION-003 - Stale hold release versus confirmation
### Business Question
What business outcome is expected if stale-hold release and booking confirmation target the same HELD booking at nearly the same time?
### Why This Needs Validation
FLOW-029 creates HELD bookings with expiry, FLOW-034 confirms HELD bookings, and FLOW-049 releases stale HELD bookings. RE-011 records a race candidate but does not prove a concrete unsafe ordering.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-029, FLOW-034, FLOW-049 |
| Business Rules | BR-061, BR-083, BR-084 |
| State Conflicts | STATE-CONFLICT-002 |
| Invariant Findings | INVARIANT-FINDING-001 |
| Authorization Findings | AUTHZ-FINDING-005 |
| Integration Findings | INTEGRATION-FINDING-002 |
| Cross-Flow Findings | XFLOW-FINDING-001 |
| Journey Gaps | N/A |
| Variants | N/A |
| Uncertainties | FLOW-029-UNCERTAINTY-001, FLOW-029-UNCERTAINTY-002, FLOW-029-UNCERTAINTY-003 |
### Observed Current Behaviour
Release and confirmation are separate operations over HELD booking state.
### Decision Options
A. Confirm current separate-operation semantics
B. Define precedence between stale release and confirmation
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, STATE_MODEL, OPERATIONAL_PROCESS, TEST_EXPECTATION

## Availability / Capacity
## VALIDATION-001 - Capacity formula
### Business Question
Should availability, booking, occupancy, member booking, no-show, and release paths use one canonical capacity formula or remain context-specific?
### Why This Needs Validation
RE-011 preserves capacity divergence across browse, standard booking, negotiated booking, member booking, and sweep/no-show paths. A later requirements baseline cannot treat capacity as business-validated until this is confirmed.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-024, FLOW-029, FLOW-030, FLOW-044, FLOW-049 |
| Business Rules | BR-044, BR-045, BR-058, BR-059, BR-063, BR-064, BR-125 |
| State Conflicts | STATE-CONFLICT-001 |
| Invariant Findings | INVARIANT-FINDING-003 |
| Authorization Findings | N/A |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-002 |
| Journey Gaps | N/A |
| Variants | XFLOW-VARIANT-001, XFLOW-VARIANT-003, XFLOW-VARIANT-006 |
| Uncertainties | FLOW-024-UNCERTAINTY-001, FLOW-024-UNCERTAINTY-002, FLOW-024-UNCERTAINTY-003 |
### Observed Current Behaviour
Different flows count or affect capacity using different booking-state and member-treatment semantics.
### Decision Options
A. Keep context-specific capacity semantics
B. Define one canonical capacity formula
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, STATE_MODEL, POLICY_INVARIANT, DOMAIN_MODEL, TEST_EXPECTATION

## VALIDATION-007 - Negotiated booking differences
### Business Question
Should negotiated booking continue to differ from standard booking in group-size and pricing treatment while preserving availability, block, and capacity checks?
### Why This Needs Validation
FLOW-030/FLOW-056/FLOW-057 are context variants from FLOW-029. The AS-IS evidence shows different booking creation and payment-link orchestration, but business intent is not recorded.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-029, FLOW-030, FLOW-056, FLOW-057, FLOW-054 |
| Business Rules | BR-054, BR-060, BR-063, BR-064, BR-191, BR-192, BR-193, BR-194 |
| State Conflicts | STATE-CONFLICT-001 |
| Invariant Findings | INVARIANT-FINDING-003 |
| Authorization Findings | N/A |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-002 |
| Journey Gaps | XFLOW-GAP-002 |
| Variants | XFLOW-VARIANT-001 |
| Uncertainties | FLOW-030-UNCERTAINTY-001, FLOW-056-UNCERTAINTY-001, FLOW-057-UNCERTAINTY-001 |
### Observed Current Behaviour
Negotiated booking is an internal/admin orchestration path with distinct pricing/group-size treatment.
### Decision Options
A. Confirm current negotiated booking variant
B. Align negotiated booking with standard booking rules
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, POLICY_INVARIANT, AUTHORIZATION, INTEGRATION, API_CONTRACT, TEST_EXPECTATION

## Payment
## VALIDATION-004 - Payment capture recovery
### Business Question
What recovery or compensation is expected when PaymentIntent capture succeeds but booking confirmation fails?
### Why This Needs Validation
FLOW-052 and FLOW-054 capture PaymentIntent and call FLOW-034 across a service boundary. RE-011 preserves the possible AS-IS divergence of captured PaymentIntent with HELD booking.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-050, FLOW-051, FLOW-052, FLOW-054, FLOW-034 |
| Business Rules | BR-157, BR-158, BR-177, BR-178 |
| State Conflicts | STATE-CONFLICT-002 |
| Invariant Findings | INVARIANT-FINDING-005 |
| Authorization Findings | AUTHZ-FINDING-006 |
| Integration Findings | INTEGRATION-FINDING-001 |
| Cross-Flow Findings | XFLOW-FINDING-005 |
| Journey Gaps | XFLOW-GAP-001 |
| Variants | XFLOW-VARIANT-002 |
| Uncertainties | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004, FLOW-054-UNCERTAINTY-001, FLOW-054-UNCERTAINTY-002, FLOW-054-UNCERTAINTY-003 |
### Observed Current Behaviour
Payment capture and booking confirmation are separate effects.
### Decision Options
A. Confirm current non-atomic behaviour
B. Define required recovery/compensation outcome
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
STATE_MODEL, INTEGRATION, SERVICE_BOUNDARY, OPERATIONAL_PROCESS, TEST_EXPECTATION

## VALIDATION-005 - Direct payment verification ownership
### Business Question
Should direct payment verification enforce PaymentIntent/booking ownership after Razorpay signature verification?
### Why This Needs Validation
FLOW-052 has authenticated caller and payment signature evidence, but RE-008 records ownership not explicitly checked after signature. This affects how the business interprets direct verification trust.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-052 |
| Business Rules | BR-152, BR-153, BR-154, BR-155, BR-160, BR-161 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-005 |
| Authorization Findings | AUTHZ-FINDING-002 |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-009 |
| Journey Gaps | N/A |
| Variants | XFLOW-VARIANT-002, XFLOW-VARIANT-007 |
| Uncertainties | FLOW-052-UNCERTAINTY-001, FLOW-052-UNCERTAINTY-002, FLOW-052-UNCERTAINTY-003, FLOW-052-UNCERTAINTY-004 |
### Observed Current Behaviour
Direct verification is signature-gated but not clearly owner-gated after signature verification.
### Decision Options
A. Confirm current direct verification boundary
B. Require ownership validation after signature
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
AUTHORIZATION, BUSINESS_RULE, API_CONTRACT, TEST_EXPECTATION

## VALIDATION-006 - Direct verify versus webhook
### Business Question
Should direct verification and provider webhook capture remain distinct context variants, or should they converge on one ownership, idempotency, and retry model?
### Why This Needs Validation
FLOW-052 and FLOW-054 both capture PaymentIntent and invoke booking confirmation, but use different trust, ownership, idempotency, and retry assumptions. Business validation is needed to classify the difference as intended or requiring later change.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-052, FLOW-054 |
| Business Rules | BR-152-BR-161, BR-170-BR-179 |
| State Conflicts | STATE-CONFLICT-002 |
| Invariant Findings | INVARIANT-FINDING-001, INVARIANT-FINDING-005 |
| Authorization Findings | AUTHZ-FINDING-002, AUTHZ-FINDING-006 |
| Integration Findings | INTEGRATION-FINDING-001, INTEGRATION-FINDING-008 |
| Cross-Flow Findings | XFLOW-FINDING-005 |
| Journey Gaps | XFLOW-GAP-004 |
| Variants | XFLOW-VARIANT-002 |
| Uncertainties | FLOW-052-UNCERTAINTY-*, FLOW-054-UNCERTAINTY-* |
### Observed Current Behaviour
Direct verify and webhook are separate capture paths with overlapping state effects and different boundary controls.
### Decision Options
A. Confirm distinct capture variants
B. Define one canonical capture/retry/idempotency model
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, AUTHORIZATION, INTEGRATION, SERVICE_BOUNDARY, TEST_EXPECTATION

## Membership / Attendance
## VALIDATION-008 - canConfirm versus confirmation execution
### Business Question
Should the member-facing canConfirm condition and the executable member confirmation endpoint use the same existing-booking semantics?
### Why This Needs Validation
FLOW-043 only exposes canConfirm when no booking exists, but FLOW-044 can update memberAttendanceConfirmedAt on an existing non-cancelled booking without changing status. RE-011 treats this as read/write asymmetry.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-043, FLOW-044, FLOW-046, FLOW-049 |
| Business Rules | BR-121, BR-123, BR-124, BR-125, BR-126, BR-129 |
| State Conflicts | N/A |
| Invariant Findings | N/A |
| Authorization Findings | N/A |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-003 |
| Journey Gaps | N/A |
| Variants | XFLOW-VARIANT-003 |
| Uncertainties | FLOW-043-UNCERTAINTY-001, FLOW-043-UNCERTAINTY-002, FLOW-044-UNCERTAINTY-001, FLOW-044-UNCERTAINTY-002 |
### Observed Current Behaviour
Member confirmation can create a booking or update attendance metadata depending on existing booking state.
### Decision Options
A. Confirm current read/write asymmetry
B. Align canConfirm with executable confirmation semantics
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, STATE_MODEL, DOMAIN_MODEL, API_CONTRACT, TEST_EXPECTATION

## VALIDATION-009 - Member no-show semantics
### Business Question
Should member no-show remain a none -> RELEASED_NO_SHOW booking creation path, and how should attendance reports interpret it?
### Why This Needs Validation
RE-006 and RE-011 preserve member no-show as creation of a RELEASED_NO_SHOW booking where no non-cancelled booking exists. This must not be confused with CONFIRMED -> RELEASED_NO_SHOW.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-043, FLOW-044, FLOW-046, FLOW-049 |
| Business Rules | BR-121, BR-125, BR-129 |
| State Conflicts | STATE-CONFLICT-001 |
| Invariant Findings | INVARIANT-FINDING-003 |
| Authorization Findings | N/A |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-004 |
| Journey Gaps | N/A |
| Variants | XFLOW-VARIANT-003 |
| Uncertainties | FLOW-049 uncertainty lineage |
### Observed Current Behaviour
Member no-show can create a RELEASED_NO_SHOW booking without a prior confirmed booking transition.
### Decision Options
A. Confirm current member no-show creation semantics
B. Define a different attendance/no-show interpretation
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
STATE_MODEL, DOMAIN_MODEL, POLICY_INVARIANT, TEST_EXPECTATION

## VALIDATION-010 - Subscription identity binding
### Business Question
Should subscription creation require authenticated identity binding before subscription status is used for member eligibility?
### Why This Needs Validation
FLOW-053 stores tenantId/userId from the request body, while FLOW-043/FLOW-044/FLOW-046 read subscription status for attendance eligibility. This links a weak creation boundary to downstream member behaviour.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-053, FLOW-055, FLOW-043, FLOW-044, FLOW-046 |
| Business Rules | BR-162, BR-164, BR-169, BR-183, BR-185 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-007 |
| Authorization Findings | AUTHZ-FINDING-003 |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-006 |
| Journey Gaps | N/A |
| Variants | XFLOW-VARIANT-005 |
| Uncertainties | FLOW-053-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-002, FLOW-053-UNCERTAINTY-003, FLOW-055-UNCERTAINTY-* |
### Observed Current Behaviour
Subscription status can influence member attendance eligibility after a body-driven subscription creation boundary.
### Decision Options
A. Confirm current body-driven subscription creation boundary
B. Require authenticated identity binding before eligibility use
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
AUTHORIZATION, DOMAIN_MODEL, BUSINESS_RULE, API_CONTRACT, TEST_EXPECTATION

## Cancellation / Refund
## VALIDATION-011 - Cancellation to refund continuation
### Business Question
Should refund remain a separate journey after cancellation, or is refund creation a business-required continuation of cancellation?
### Why This Needs Validation
FLOW-037 cancels a booking and stores refundAmount, but does not create a refund. FLOW-059/FLOW-060 are separate refund operations.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-036, FLOW-037, FLOW-059, FLOW-060 |
| Business Rules | BR-098, BR-104, BR-105, BR-197-BR-203 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-004 |
| Authorization Findings | AUTHZ-FINDING-005 |
| Integration Findings | INTEGRATION-FINDING-003 |
| Cross-Flow Findings | XFLOW-FINDING-010 |
| Journey Gaps | XFLOW-GAP-003 |
| Variants | XFLOW-VARIANT-004 |
| Uncertainties | FLOW-036-UNCERTAINTY-*, FLOW-037-UNCERTAINTY-*, FLOW-059-UNCERTAINTY-* |
### Observed Current Behaviour
Cancellation and refund creation are separate executable paths.
### Decision Options
A. Confirm separate cancellation and refund journeys
B. Define refund creation as required continuation
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, STATE_MODEL, INTEGRATION, SERVICE_BOUNDARY, OPERATIONAL_PROCESS, TEST_EXPECTATION

## VALIDATION-012 - Local Refund meaning
### Business Question
What should a local Refund record mean when provider refund execution is not evidenced?
### Why This Needs Validation
RE-009 and RE-011 preserve local Refund persistence without Razorpay refund execution evidence. The AS-IS baseline needs SME confirmation of whether this is local accounting, an incomplete provider process, or another business meaning.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-059, FLOW-060 |
| Business Rules | BR-199, BR-200, BR-201, BR-203, BR-207, BR-208, BR-211 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-006 |
| Authorization Findings | N/A |
| Integration Findings | INTEGRATION-FINDING-004 |
| Cross-Flow Findings | XFLOW-FINDING-010 |
| Journey Gaps | XFLOW-GAP-003 |
| Variants | N/A |
| Uncertainties | FLOW-059-UNCERTAINTY-001, FLOW-059-UNCERTAINTY-002, FLOW-060-UNCERTAINTY-001, FLOW-060-UNCERTAINTY-002 |
### Observed Current Behaviour
Refund rows are local artifacts; provider refund execution is not evidenced.
### Decision Options
A. Confirm local-only refund meaning
B. Define provider-synced refund meaning
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
DOMAIN_MODEL, INTEGRATION, POLICY_INVARIANT, OPERATIONAL_PROCESS, TEST_EXPECTATION

## Notification
## VALIDATION-013 - Notification persistence, delivery, and history binding
### Business Question
Should upstream producer success guarantee notification persistence/delivery tracking, and should notification history be tenant/user-bound rather than exact-recipient-bound?
### Why This Needs Validation
FLOW-049 and FLOW-055 can trigger notifications, FLOW-061 queues, FLOW-065 processes, and FLOW-064 reads by recipient. RE-011 consolidates producer guarantee and recipient/tenant binding as one notification ownership and outcome question.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-049, FLOW-055, FLOW-061, FLOW-062, FLOW-063, FLOW-064, FLOW-065 |
| Business Rules | BR-186, BR-187, BR-212-BR-221 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-008 |
| Authorization Findings | AUTHZ-FINDING-004, AUTHZ-FINDING-007 |
| Integration Findings | INTEGRATION-FINDING-005, INTEGRATION-FINDING-006 |
| Cross-Flow Findings | XFLOW-FINDING-007 |
| Journey Gaps | XFLOW-GAP-005 |
| Variants | XFLOW-VARIANT-006 |
| Uncertainties | FLOW-055-UNCERTAINTY-004, FLOW-061-UNCERTAINTY-001, FLOW-062-UNCERTAINTY-001, FLOW-063-UNCERTAINTY-001, FLOW-064-UNCERTAINTY-001, FLOW-065-UNCERTAINTY-001 |
### Observed Current Behaviour
Notification production, persistence, delivery, retry/dead-letter, and history filtering are separate concerns with weak ownership evidence.
### Decision Options
A. Confirm current best-effort and recipient-based notification semantics
B. Require producer persistence guarantee and tenant/user-bound history
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
AUTHORIZATION, INTEGRATION, DOMAIN_MODEL, OPERATIONAL_PROCESS, TEST_EXPECTATION

## Scheduler / Dispatch
## VALIDATION-014 - Scheduler and dispatch semantics
### Business Question
Should manual scheduled-job execution share due-job lease semantics, and should FLOW-049 markers remain distinct from generic ScheduledJobDispatch records?
### Why This Needs Validation
FLOW-066 has due-job lease semantics, FLOW-067 has manual execution semantics, and FLOW-068/FLOW-069 define dispatch lifecycle. RE-011 also preserves FLOW-049 direct marker behaviour as separate from generic dispatch.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-049, FLOW-066, FLOW-067, FLOW-068, FLOW-069 |
| Business Rules | BR-222-BR-229 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-009 |
| Authorization Findings | N/A |
| Integration Findings | INTEGRATION-FINDING-007 |
| Cross-Flow Findings | XFLOW-FINDING-008 |
| Journey Gaps | XFLOW-GAP-006 |
| Variants | XFLOW-VARIANT-006 |
| Uncertainties | FLOW-066-UNCERTAINTY-001, FLOW-067-UNCERTAINTY-001, FLOW-068-UNCERTAINTY-001, FLOW-069-UNCERTAINTY-001 |
### Observed Current Behaviour
Manual job execution, due-job lease, generic dispatch lifecycle, and FLOW-049 marker usage are separate AS-IS behaviours.
### Decision Options
A. Confirm current scheduler/dispatch variants
B. Define shared lease and dispatch semantics
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
STATE_MODEL, OPERATIONAL_PROCESS, INTEGRATION, TEST_EXPECTATION

## Authorization / Tenant / Ownership
## VALIDATION-015 - Authoritative tenant and ownership boundary
### Business Question
Which tenant and ownership authority should be considered authoritative across JWT, request body, stored entity, provider webhook, and internal-key boundaries?
### Why This Needs Validation
RE-011 consolidates tenant-source variance and internal-key/provider trust as a cross-flow decision. This single SME decision affects payment verification, subscription creation, notification history, and trusted internal operations.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-006, FLOW-009, FLOW-010, FLOW-011, FLOW-012, FLOW-013, FLOW-016, FLOW-029, FLOW-031, FLOW-033, FLOW-040, FLOW-050, FLOW-052, FLOW-053, FLOW-054, FLOW-055, FLOW-064 |
| Business Rules | BR-011, BR-017, BR-018, BR-023, BR-025, BR-026, BR-032, BR-049, BR-066, BR-076, BR-106, BR-131, BR-160, BR-162, BR-170-BR-190, BR-218 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-007 |
| Authorization Findings | AUTHZ-FINDING-002, AUTHZ-FINDING-003, AUTHZ-FINDING-004, AUTHZ-FINDING-005, AUTHZ-FINDING-006 |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-006, XFLOW-FINDING-009 |
| Journey Gaps | N/A |
| Variants | XFLOW-VARIANT-007, XFLOW-VARIANT-008 |
| Uncertainties | FLOW-013-UNCERTAINTY-001, FLOW-053-UNCERTAINTY-*, FLOW-054-UNCERTAINTY-004, FLOW-064-UNCERTAINTY-001 |
### Observed Current Behaviour
Tenant and ownership authority varies by flow and trust boundary.
### Decision Options
A. Confirm current boundary-specific authority model
B. Define a canonical tenant/ownership authority order
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
AUTHORIZATION, BUSINESS_RULE, DOMAIN_MODEL, SERVICE_BOUNDARY, API_CONTRACT, TEST_EXPECTATION

## Recovery / Compensation
Recovery/compensation decisions are represented by VALIDATION-004, VALIDATION-011, VALIDATION-012, VALIDATION-013, and VALIDATION-014. The dedicated RE-011 webhook replay question maps to VALIDATION-006 because that validation decides the direct verify/webhook idempotency and retry model.

## Temporal Behaviour
## VALIDATION-016 - Canonical time basis
### Business Question
Which timezone and time basis should be canonical across branch availability, booking hold expiry, cancellation calculations, member cutoff, notification retry, and scheduler leases?
### Why This Needs Validation
RE-011 identifies multiple time concepts with branch-local, server-time, generated date, and unknown bases. Business validation is needed before later phases can interpret time-dependent behaviour consistently.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-001, FLOW-023, FLOW-024, FLOW-029, FLOW-034, FLOW-036, FLOW-037, FLOW-043, FLOW-044, FLOW-049, FLOW-061, FLOW-065, FLOW-066, FLOW-067 |
| Business Rules | BR-002, BR-030, BR-038, BR-061, BR-084, BR-096, BR-102, BR-120, BR-124, BR-220, BR-222, BR-223, BR-224, BR-225 |
| State Conflicts | STATE-CONFLICT-002 |
| Invariant Findings | INVARIANT-FINDING-001, INVARIANT-FINDING-009 |
| Authorization Findings | N/A |
| Integration Findings | INTEGRATION-FINDING-007 |
| Cross-Flow Findings | XFLOW-FINDING-001, XFLOW-FINDING-008 |
| Journey Gaps | XFLOW-GAP-006 |
| Variants | N/A |
| Uncertainties | FLOW-024-UNCERTAINTY-*, FLOW-029-UNCERTAINTY-*, FLOW-043-UNCERTAINTY-*, FLOW-066-UNCERTAINTY-001, FLOW-067-UNCERTAINTY-001 |
### Observed Current Behaviour
Time-dependent behaviours use multiple bases that are not normalized by the reconstruction artifacts.
### Decision Options
A. Confirm current context-specific time bases
B. Define a canonical time basis per business operation
C. Business-defined alternative
### SME Decision
PENDING
### Decision Notes
PENDING
### Decision Owner
PENDING
### Decision Date
PENDING
### Resulting Impact
PENDING
### Potential Impact Areas
BUSINESS_RULE, POLICY_INVARIANT, STATE_MODEL, OPERATIONAL_PROCESS, TEST_EXPECTATION

## RE-011 -> RE-012 Validation Mapping
| RE-011 Question # | RE-011 Topic | VALIDATION ID | Action |
|---|---|---|---|
| 1 | FLOW-034 hold expiry/payment enforcement | VALIDATION-002 | DIRECT |
| 2 | FLOW-049 stale-hold vs FLOW-034 confirmation race | VALIDATION-003 | DIRECT |
| 3 | canonical vs context-specific capacity formula | VALIDATION-001 | DIRECT |
| 4 | negotiated booking group/pricing differences | VALIDATION-007 | DIRECT |
| 5 | captured PaymentIntent + failed booking confirmation recovery | VALIDATION-004 | DIRECT |
| 6 | FLOW-052 ownership after signature | VALIDATION-005 | DIRECT |
| 7 | direct verify vs webhook convergence/variant | VALIDATION-006 | DIRECT |
| 8 | FLOW-043 canConfirm vs FLOW-044 execution | VALIDATION-008 | DIRECT |
| 9 | member no-show creation semantics | VALIDATION-009 | DIRECT |
| 10 | subscription identity binding | VALIDATION-010 | DIRECT |
| 11 | automatic vs separate refund journey | VALIDATION-011 | DIRECT |
| 12 | local Refund vs provider refund meaning | VALIDATION-012 | DIRECT |
| 13 | producer success vs NotificationRequest persistence | VALIDATION-013 | MERGED |
| 14 | notification history recipient/tenant binding | VALIDATION-013 | MERGED |
| 15 | manual execution vs lease | VALIDATION-014 | MERGED |
| 16 | FLOW-049 marker vs generic ScheduledJobDispatch | VALIDATION-014 | MERGED |
| 17 | authoritative tenant source across boundaries | VALIDATION-015 | MERGED |
| 18 | internal-key ownership/tenant bypass | VALIDATION-015 | MERGED |
| 19 | webhook idempotency timing/replay recovery | VALIDATION-006 | MERGED |
| 20 | canonical timezone basis | VALIDATION-016 | DIRECT |

## Finding Coverage Matrix
| Upstream Finding | VALIDATION ID(s) | Validation Required? | Reason |
|---|---|---|---|
| STATE-CONFLICT-001 | VALIDATION-001 | YES | Capacity formula decision required |
| STATE-CONFLICT-002 | VALIDATION-002, VALIDATION-003, VALIDATION-004 | YES | Confirmation/payment/hold semantics require SME decision |
| STATE-CONFLICT-003 | N/A | NO | ALREADY_COVERED by upstream check-in finding; no additional RE-011 question |
| INVARIANT-FINDING-001 | VALIDATION-002, VALIDATION-003 | YES | Hold/payment confirmation invariant needs business validation |
| INVARIANT-FINDING-002 | N/A | NO | ALREADY_COVERED by upstream check-in validation surface |
| INVARIANT-FINDING-003 | VALIDATION-001, VALIDATION-009 | YES | Capacity and no-show semantics require validation |
| INVARIANT-FINDING-004 | VALIDATION-011 | YES | Cancellation/refund continuation decision required |
| INVARIANT-FINDING-005 | VALIDATION-004, VALIDATION-006 | YES | Payment-confirmation atomicity/retry decision required |
| INVARIANT-FINDING-006 | VALIDATION-012 | YES | Local/provider refund meaning requires validation |
| INVARIANT-FINDING-007 | VALIDATION-010, VALIDATION-015 | YES | Subscription identity and tenant authority require validation |
| INVARIANT-FINDING-008 | VALIDATION-013 | YES | Notification guarantee decision required |
| INVARIANT-FINDING-009 | VALIDATION-014, VALIDATION-016 | YES | Scheduler lease/time semantics require validation |
| AUTHZ-FINDING-001 | N/A | NO | ALREADY_COVERED by upstream check-in finding; no separate RE-011 question |
| AUTHZ-FINDING-002 | VALIDATION-005, VALIDATION-015 | YES | Direct verify ownership and tenant/ownership authority require validation |
| AUTHZ-FINDING-003 | VALIDATION-010, VALIDATION-015 | YES | Subscription identity binding requires validation |
| AUTHZ-FINDING-004 | VALIDATION-013, VALIDATION-015 | YES | Notification history ownership requires validation |
| AUTHZ-FINDING-005 | VALIDATION-002, VALIDATION-015 | YES | Internal-key bypass decision required |
| AUTHZ-FINDING-006 | VALIDATION-006, VALIDATION-015 | YES | Provider webhook trust requires validation |
| AUTHZ-FINDING-007 | VALIDATION-013 | YES | Notification auth/worker boundary requires validation |
| INTEGRATION-FINDING-001 | VALIDATION-004 | YES | Payment/booking non-atomicity recovery decision required |
| INTEGRATION-FINDING-002 | VALIDATION-002 | YES | FLOW-034 confirmation boundary decision required |
| INTEGRATION-FINDING-003 | VALIDATION-011 | YES | Cancellation/refund continuation decision required |
| INTEGRATION-FINDING-004 | VALIDATION-012 | YES | Provider refund meaning decision required |
| INTEGRATION-FINDING-005 | VALIDATION-013 | YES | Notification best-effort decision required |
| INTEGRATION-FINDING-006 | VALIDATION-013 | YES | Notification worker/provider uncertainty decision required |
| INTEGRATION-FINDING-007 | VALIDATION-014, VALIDATION-016 | YES | Scheduler lease/time decision required |
| INTEGRATION-FINDING-008 | VALIDATION-006 | YES | Webhook replay/idempotency decision required |
| XFLOW-FINDING-001 | VALIDATION-002, VALIDATION-003, VALIDATION-016 | YES | Hold expiry and timing decision required |
| XFLOW-FINDING-002 | VALIDATION-001, VALIDATION-007 | YES | Capacity and negotiated variant decision required |
| XFLOW-FINDING-003 | VALIDATION-008 | YES | Member confirmation read/write decision required |
| XFLOW-FINDING-004 | VALIDATION-009 | YES | Member no-show semantics decision required |
| XFLOW-FINDING-005 | VALIDATION-004, VALIDATION-006 | YES | Payment/booking recovery and variant decision required |
| XFLOW-FINDING-006 | VALIDATION-010, VALIDATION-015 | YES | Subscription identity and tenant authority decision required |
| XFLOW-FINDING-007 | VALIDATION-013 | YES | Notification outcome decision required |
| XFLOW-FINDING-008 | VALIDATION-014, VALIDATION-016 | YES | Scheduler/temporal decision required |
| XFLOW-FINDING-009 | VALIDATION-015 | YES | Tenant authority decision required |
| XFLOW-FINDING-010 | VALIDATION-011, VALIDATION-012 | YES | Refund continuation/provider meaning decision required |
| XFLOW-GAP-001 | VALIDATION-004 | YES | Payment-confirmation recovery gap |
| XFLOW-GAP-002 | VALIDATION-007 | YES | Negotiated orchestration recovery gap |
| XFLOW-GAP-003 | VALIDATION-011, VALIDATION-012 | YES | Refund continuation/provider action gap |
| XFLOW-GAP-004 | VALIDATION-006 | YES | Webhook replay recovery gap |
| XFLOW-GAP-005 | VALIDATION-013 | YES | Notification recovery gap |
| XFLOW-GAP-006 | VALIDATION-014, VALIDATION-016 | YES | Scheduler recovery/time gap |

## Variant Treatment
| Variant | Classification | Validation |
|---|---|---|
| XFLOW-VARIANT-001 | BUSINESS_CONFIRMATION_REQUIRED | VALIDATION-007 |
| XFLOW-VARIANT-002 | BUSINESS_CONFIRMATION_REQUIRED | VALIDATION-006 |
| XFLOW-VARIANT-003 | BUSINESS_CONFIRMATION_REQUIRED | VALIDATION-008, VALIDATION-009 |
| XFLOW-VARIANT-004 | ALREADY_COVERED_BY_VALIDATION | VALIDATION-011 |
| XFLOW-VARIANT-005 | ALREADY_COVERED_BY_VALIDATION | VALIDATION-010 |
| XFLOW-VARIANT-006 | BUSINESS_CONFIRMATION_REQUIRED | VALIDATION-014 |
| XFLOW-VARIANT-007 | ALREADY_COVERED_BY_VALIDATION | VALIDATION-015 |
| XFLOW-VARIANT-008 | ALREADY_COVERED_BY_VALIDATION | VALIDATION-015 |

## Uncertainty Disposition
| Uncertainty | Validation ID | Disposition |
|---|---|---|
| FLOW-001-UNCERTAINTY-* through FLOW-018-UNCERTAINTY-* | VALIDATION-015, VALIDATION-016 where tenant/time related; otherwise N/A | BUSINESS_VALIDATION for tenant/time families; NO_DECISION_REQUIRED otherwise |
| FLOW-019-UNCERTAINTY-* through FLOW-028-UNCERTAINTY-* | VALIDATION-001, VALIDATION-016 | BUSINESS_VALIDATION for capacity/time families |
| FLOW-029-UNCERTAINTY-* through FLOW-037-UNCERTAINTY-* | VALIDATION-002, VALIDATION-003, VALIDATION-011, VALIDATION-016 | BUSINESS_VALIDATION for booking, cancellation, and timing families |
| FLOW-038-UNCERTAINTY-* through FLOW-039-UNCERTAINTY-* | VALIDATION-001 | BUSINESS_VALIDATION for capacity/policy families |
| FLOW-040-UNCERTAINTY-* through FLOW-049-UNCERTAINTY-* | VALIDATION-008, VALIDATION-009, VALIDATION-013, VALIDATION-016 | BUSINESS_VALIDATION for member/no-show/notification/time families |
| FLOW-050-UNCERTAINTY-* through FLOW-058-UNCERTAINTY-* | VALIDATION-004, VALIDATION-005, VALIDATION-006, VALIDATION-007, VALIDATION-010, VALIDATION-015 | BUSINESS_VALIDATION for payment, subscription, tenant, and webhook families |
| FLOW-059-UNCERTAINTY-* through FLOW-060-UNCERTAINTY-* | VALIDATION-011, VALIDATION-012 | BUSINESS_VALIDATION for refund families |
| FLOW-061-UNCERTAINTY-* through FLOW-065-UNCERTAINTY-* | VALIDATION-013 | BUSINESS_VALIDATION for notification families |
| FLOW-066-UNCERTAINTY-* through FLOW-070-UNCERTAINTY-* | VALIDATION-014, VALIDATION-016; N/A for pure health checks | BUSINESS_VALIDATION for scheduler/time families; NO_DECISION_REQUIRED for pure health lineage |
| All 86 canonical uncertainty identities from RE-010 | See family mappings above | ACCOUNTED; unresolved by design |

## SME Review Sequence
| Order | Group | Reason |
|---:|---|---|
| 1 | Availability / Capacity | Capacity interpretation affects booking, attendance, and release semantics. |
| 2 | Booking | Confirmation and hold semantics affect payment and cancellation interpretation. |
| 3 | Payment | Payment decisions depend on booking confirmation ownership. |
| 4 | Membership / Attendance | Attendance depends on booking, capacity, and subscription semantics. |
| 5 | Cancellation / Refund | Refund meaning depends on booking cancellation and payment capture. |
| 6 | Authorization / Tenant / Ownership | Tenant authority impacts several remaining trust decisions. |
| 7 | Recovery / Compensation | Recovery decisions depend on accepted boundary semantics. |
| 8 | Notification | Notification guarantees depend on accepted producer/recovery expectations. |
| 9 | Scheduler / Dispatch | Operational semantics can be validated after domain journeys. |
| 10 | Temporal Behaviour | Finalize time basis across accepted journey semantics. |

## Decision Propagation Register
| VALIDATION | Potentially Affected Artifacts |
|---|---|
| VALIDATION-001 | RE-005, RE-006, RE-007, RE-010, RE-011 |
| VALIDATION-002 | RE-005, RE-006, RE-007, RE-008, RE-009, RE-010, RE-011 |
| VALIDATION-003 | RE-006, RE-007, RE-010, RE-011 |
| VALIDATION-004 | RE-006, RE-007, RE-009, RE-010, RE-011 |
| VALIDATION-005 | RE-008, RE-010, RE-011 |
| VALIDATION-006 | RE-007, RE-008, RE-009, RE-010, RE-011 |
| VALIDATION-007 | RE-005, RE-007, RE-008, RE-009, RE-010, RE-011 |
| VALIDATION-008 | RE-006, RE-007, RE-010, RE-011 |
| VALIDATION-009 | RE-006, RE-007, RE-010, RE-011 |
| VALIDATION-010 | RE-005, RE-007, RE-008, RE-010, RE-011 |
| VALIDATION-011 | RE-006, RE-007, RE-009, RE-010, RE-011 |
| VALIDATION-012 | RE-006, RE-007, RE-009, RE-010, RE-011 |
| VALIDATION-013 | RE-006, RE-007, RE-008, RE-009, RE-010, RE-011 |
| VALIDATION-014 | RE-006, RE-007, RE-009, RE-010, RE-011 |
| VALIDATION-015 | RE-005, RE-007, RE-008, RE-009, RE-010, RE-011 |
| VALIDATION-016 | RE-005, RE-006, RE-007, RE-010, RE-011 |

## Decision Processing Protocol
When SME answers a VALIDATION:
1. record exact answer;
2. assign DECISION-xxx;
3. preserve original VALIDATION;
4. mark VALIDATION RESOLVED;
5. identify affected upstream artifacts;
6. perform targeted delta only;
7. rerun RE-010 mechanical integrity;
8. rerun affected RE-011 journey checks;
9. update RE-012 resulting impact;
10. do not silently rewrite historical evidence.

## Agent Decision Lookup
| Concern | Validation | Status | Evidence Entry Point |
|---|---|---|---|
| Capacity formula | VALIDATION-001 | PENDING | STATE-CONFLICT-001, XFLOW-FINDING-002 |
| Booking confirmation trust | VALIDATION-002 | PENDING | STATE-CONFLICT-002, BR-083-BR-085 |
| Stale hold race | VALIDATION-003 | PENDING | XFLOW-FINDING-001 |
| Captured payment with unconfirmed booking | VALIDATION-004 | PENDING | INTEGRATION-FINDING-001, XFLOW-GAP-001 |
| Direct verify ownership | VALIDATION-005 | PENDING | AUTHZ-FINDING-002 |
| Direct verify/webhook variant | VALIDATION-006 | PENDING | XFLOW-VARIANT-002, INTEGRATION-FINDING-008 |
| Negotiated booking variant | VALIDATION-007 | PENDING | XFLOW-VARIANT-001 |
| Member canConfirm mismatch | VALIDATION-008 | PENDING | XFLOW-FINDING-003 |
| Member no-show creation | VALIDATION-009 | PENDING | XFLOW-FINDING-004 |
| Subscription identity | VALIDATION-010 | PENDING | INVARIANT-FINDING-007, AUTHZ-FINDING-003 |
| Cancellation to refund | VALIDATION-011 | PENDING | INVARIANT-FINDING-004 |
| Local refund meaning | VALIDATION-012 | PENDING | INTEGRATION-FINDING-004 |
| Notification guarantee/history | VALIDATION-013 | PENDING | XFLOW-FINDING-007 |
| Scheduler/manual/dispatch | VALIDATION-014 | PENDING | XFLOW-FINDING-008, XFLOW-VARIANT-006 |
| Tenant/ownership authority | VALIDATION-015 | PENDING | XFLOW-FINDING-009 |
| Time basis | VALIDATION-016 | PENDING | XFLOW-FINDING-001, XFLOW-FINDING-008 |

## Mechanical Validation
| Check | Result |
|---|---:|
| RE-011 questions inspected | 20 |
| RE-011 questions mapped | 20 |
| Final VALIDATION IDs | 16 |
| Pending validations | 16 |
| Resolved validations | 0 |
| Deferred validations | 0 |
| Decision IDs | 0 |
| STATE-CONFLICT coverage | 3/3 |
| INVARIANT-FINDING coverage | 9/9 |
| AUTHZ-FINDING coverage | 7/7 |
| INTEGRATION-FINDING coverage | 8/8 |
| XFLOW-FINDING coverage | 10/10 |
| XFLOW-GAP coverage | 6/6 |
| XFLOW-VARIANT coverage | 8/8 |
| Canonical uncertainties accounted | 86/86 |
| Broken canonical references | 0 |
| Duplicate VALIDATION IDs | 0 |
| Validation entries without evidence | 0 |
| RE-011 questions without validation mapping | 0 |

## Completion Status
RE-012 - BUSINESS VALIDATION & DECISION REGISTER

DOCUMENT STATUS:
COMPLETE

BUSINESS VALIDATION STATUS:
PENDING

RE-011 QUESTIONS:
20

RE-011 QUESTIONS MAPPED:
20

VALIDATIONS:
16

PENDING:
16

RESOLVED:
0

DEFERRED:
0

DECISIONS:
0

STATE-CONFLICT COVERAGE:
3/3

INVARIANT-FINDING COVERAGE:
9/9

AUTHORIZATION-FINDING COVERAGE:
7/7

INTEGRATION-FINDING COVERAGE:
8/8

XFLOW-FINDING COVERAGE:
10/10

XFLOW-GAP COVERAGE:
6/6

XFLOW-VARIANT COVERAGE:
8/8

UNCERTAINTY COVERAGE:
86/86

BROKEN CANONICAL REFERENCES:
0

DUPLICATE VALIDATION IDS:
0

VALIDATIONS WITHOUT EVIDENCE:
0

LINEAGE:
PRESERVED
