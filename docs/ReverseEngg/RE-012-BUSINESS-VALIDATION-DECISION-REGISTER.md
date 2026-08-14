# RE-012 - Business Validation & Decision Register

This register is the SME-facing decision surface for the reconstructed AS-IS baseline. It routes to RE-011 and RE-010 evidence without restating the full reconstruction analysis. No business question is answered here.

## Reconciliation From RE-011
| Item | Count | Explanation |
|---|---:|---|
| RE-011 validation questions | 20 | Source set from RE-011 Cross-Flow Questions Requiring Business Validation |
| Merged | 4 | Overlapping recovery, tenant/ownership, and payment-confirmation questions were consolidated where one SME decision resolves multiple technical issues |
| Split | 1 | Notification persistence/delivery remains VALIDATION-013; notification history identity binding is split to VALIDATION-018 |
| Additional uncovered questions | 1 | Architect source verification exposed a confirmed executable check-in access-control question absent from RE-011 |
| Final VALIDATION identities | 18 | VALIDATION-001 through VALIDATION-018 |

## Validation Register
| Validation | Category | Priority | Question Summary | Status | Decision |
|---|---|---|---|---|---|
| VALIDATION-001 | Availability / Capacity | P0 | Should browse, booking, member, automated release, and manual release use one capacity formula or context-specific formulas? | PENDING | PENDING |
| VALIDATION-002 | Booking | P0 | Should booking confirmation enforce hold expiry and payment proof/state? | PENDING | PENDING |
| VALIDATION-003 | Booking | P1 | What should happen when stale-hold release and confirmation race? | PENDING | PENDING |
| VALIDATION-004 | Payment | P0 | What recovery is required when payment capture succeeds but booking confirmation fails? | PENDING | PENDING |
| VALIDATION-005 | Payment | P1 | Should authenticated-user ownership be enforced in addition to provider-bound signed order identity? | PENDING | PENDING |
| VALIDATION-006 | Payment | P1 | Should direct verify and webhook capture remain distinct variants or converge? | PENDING | PENDING |
| VALIDATION-007 | Availability / Capacity | P2 | Should negotiated booking keep its distinct group-size/pricing treatment? | PENDING | PENDING |
| VALIDATION-008 | Membership / Attendance | P1 | Should canConfirm and executable member confirmation use the same existing-booking semantics? | PENDING | PENDING |
| VALIDATION-009 | Membership / Attendance | P1 | Should generated no-show records appear in member history as Booking/Expired entries? | PENDING | PENDING |
| VALIDATION-010 | Membership / Attendance | P0 | Should subscription creation require authenticated identity binding before eligibility use? | PENDING | PENDING |
| VALIDATION-011 | Cancellation / Refund | P1 | Should refund remain separate from cancellation or be business-required continuation? | PENDING | PENDING |
| VALIDATION-012 | Cancellation / Refund | P1 | What does local Refund mean without evidenced provider refund execution? | PENDING | PENDING |
| VALIDATION-013 | Notification | P1 | Should upstream producer success guarantee NotificationRequest persistence and delivery tracking? | PENDING | PENDING |
| VALIDATION-014 | Scheduler / Dispatch | P1 | Should manual execution share the same lease semantics as due-job execution? | PENDING | PENDING |
| VALIDATION-015 | Authorization / Tenant / Ownership | P0 | Which tenant/ownership authority is authoritative across JWT, body, stored entity, provider, and internal-key boundaries? | PENDING | PENDING |
| VALIDATION-016 | Temporal Behaviour | P0 | Which business-local time semantics are intended across branch availability, booking cutoff, cancellation, attendance, retry, and leases? | PENDING | PENDING |
| VALIDATION-017 | Authorization / Tenant / Ownership | P0 | Who is permitted to check in a booking, and what tenant/ownership/role/time conditions must govern that mutation? | PENDING | PENDING |
| VALIDATION-018 | Notification | P0 | What stable tenant/user identity should authorize notification-history access, and should exact recipient strings ever be sufficient ownership authority? | PENDING | PENDING |

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

## VALIDATION-017 - Booking check-in access control
### Business Question
Who is permitted to check in a booking, and what tenant/ownership/role/time conditions must govern that mutation?
### Why This Needs Validation
Architect source verification confirmed executable FLOW-035 behaviour: POST /bookings/:id/check-in has no authentication, tenant validation, ownership validation, role validation, or timing validation. It only checks that Booking.status is CONFIRMED before mutating the booking to CHECKED_IN. An unauthenticated caller who knows a booking id can invoke the state mutation.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-035 |
| Business Rules | BR-086, BR-087, BR-088, BR-089, BR-090, BR-091, BR-092 |
| State Conflicts | STATE-CONFLICT-003 |
| Invariant Findings | INVARIANT-FINDING-002 |
| Authorization Findings | AUTHZ-FINDING-001 |
| Integration Findings | N/A |
| Cross-Flow Findings | N/A |
| Journey Gaps | N/A |
| Variants | N/A |
| Uncertainties | FLOW-035-UNCERTAINTY-001, FLOW-035-UNCERTAINTY-002, FLOW-035-UNCERTAINTY-003 |
### Observed Current Behaviour
CONFIRMED EXECUTABLE ACCESS-CONTROL GAP: unauthenticated callers can invoke CONFIRMED -> CHECKED_IN for a known booking id. The only executable guard is current Booking.status == CONFIRMED; repeated CHECKED_IN calls are idempotent.
### Decision Options
A. Confirm current unauthenticated check-in mutation boundary
B. Require business-defined authentication, tenant, ownership, role, and timing guards
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
AUTHORIZATION, STATE_MODEL, POLICY_INVARIANT, BUSINESS_RULE, API_CONTRACT, TEST_EXPECTATION

## Availability / Capacity
## VALIDATION-001 - Capacity formula
### Business Question
Should availability/browse, standard booking, negotiated booking, member booking, automated no-show/release, manual capacity-release, and occupancy read paths use one canonical capacity formula or remain context-specific?
### Why This Needs Validation
RE-011 preserves capacity divergence across browse, standard booking, negotiated booking, member booking, manual capacity-release, occupancy read, and sweep/no-show paths. A later requirements baseline cannot treat capacity as business-validated until this is confirmed.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-024, FLOW-029, FLOW-030, FLOW-044, FLOW-045, FLOW-047, FLOW-048, FLOW-049 |
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
Different flows count, read, or affect capacity using different booking-state, member-treatment, manual-release, and automated-release semantics.
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
Should authenticated-user ownership be enforced in addition to the provider-bound signed order identity?
### Why This Needs Validation
FLOW-052 requires JWT authentication and Razorpay signature evidence. The caller supplies Razorpay payment/order/signature fields; the HMAC covers orderId|paymentId; PaymentIntent is resolved by signed orderId -> gatewayRef; booking identity comes from PaymentIntent.referenceId. The verify handler does not check PaymentIntent or Booking ownership against the JWT caller, and it does not revalidate amount.
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
Direct verification is JWT-gated and provider-signature-gated. The caller does not directly supply or select PaymentIntent/booking identity; local PaymentIntent selection follows the signed provider order identity, then booking confirmation follows PaymentIntent.referenceId. Ownership is not additionally enforced against the authenticated caller.
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
Should an automatically generated no-show record appear in the member's booking history as a Booking/Expired entry, or should no-show attendance be represented/displayed differently?
### Why This Needs Validation
FLOW-049 creates an actual member Booking row when no non-cancelled booking exists after the member confirmation cutoff. The row uses status = RELEASED_NO_SHOW and isMemberBooking = true. The member history endpoint returns it because /bookings/my filters by userId without excluding RELEASED_NO_SHOW, and the PWA renders RELEASED_NO_SHOW as "Expired".
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
Member no-show is confirmed executable user-visible behaviour: none -> RELEASED_NO_SHOW creates a Booking row, the row is returned by member history, and the PWA displays it as an Expired booking.
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
FLOW-053 exposes POST /subscriptions as a publicly reachable application route. It accepts tenantId and userId from the request body and uses them directly, with no JWT/internal-key identity binding before FLOW-043/FLOW-044/FLOW-046 read subscription status for attendance eligibility.
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
POST /subscriptions is publicly reachable at application-route level; tenantId and userId are request-body supplied and used directly; no JWT/internal-key identity binding is performed.
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
## VALIDATION-013 - Notification persistence and delivery
### Business Question
Should upstream producer success guarantee notification persistence and delivery tracking?
### Why This Needs Validation
FLOW-049 and FLOW-055 can trigger notifications, FLOW-061 queues, and FLOW-065 processes delivery/retry/dead-letter outcomes. Producer success and durable notification outcome tracking are operational/reliability questions distinct from notification-history identity binding, which is split to VALIDATION-018.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-049, FLOW-055, FLOW-061, FLOW-062, FLOW-063, FLOW-065 |
| Business Rules | BR-186, BR-187, BR-212-BR-217, BR-220-BR-221 |
| State Conflicts | N/A |
| Invariant Findings | INVARIANT-FINDING-008 |
| Authorization Findings | AUTHZ-FINDING-007 |
| Integration Findings | INTEGRATION-FINDING-005, INTEGRATION-FINDING-006 |
| Cross-Flow Findings | XFLOW-FINDING-007 |
| Journey Gaps | XFLOW-GAP-005 |
| Variants | XFLOW-VARIANT-006 |
| Uncertainties | FLOW-055-UNCERTAINTY-004, FLOW-061-UNCERTAINTY-001, FLOW-062-UNCERTAINTY-001, FLOW-063-UNCERTAINTY-001, FLOW-065-UNCERTAINTY-001 |
### Observed Current Behaviour
Notification production, persistence, delivery, retry, and dead-letter behaviours are separate concerns with weak producer outcome evidence.
### Decision Options
A. Confirm current best-effort notification persistence/delivery semantics
B. Require producer persistence and delivery tracking guarantees
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

## VALIDATION-018 - Notification history identity binding
### Business Question
What stable tenant/user identity should authorize notification-history access, and should exact recipient strings ever be sufficient ownership authority?
### Why This Needs Validation
FLOW-064 reads notification history by exact recipient string. Source verification shows `GET /notifications/:userId/history` uses the route parameter directly as `NotificationRequest.recipient`, with no tenant or stable user binding in that query. Because recipient strings may be phone numbers, the privacy decision is independent of delivery reliability and can be resolved separately.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-064 |
| Business Rules | BR-218, BR-219 |
| State Conflicts | N/A |
| Invariant Findings | N/A |
| Authorization Findings | AUTHZ-FINDING-004 |
| Integration Findings | N/A |
| Cross-Flow Findings | XFLOW-FINDING-009 |
| Journey Gaps | N/A |
| Variants | N/A |
| Uncertainties | FLOW-064-UNCERTAINTY-001 |
### Observed Current Behaviour
Notification history is filtered by exact `recipient` string and limited to 50 newest rows. There is no evidenced tenant/user ownership check in the history query; this is a concrete privacy concern if exact recipient strings are reused or reassigned.
### Decision Options
A. Confirm exact-recipient history binding
B. Require stable tenant/user identity authorization for notification history
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
AUTHORIZATION, DOMAIN_MODEL, API_CONTRACT, POLICY_INVARIANT, TEST_EXPECTATION

## Scheduler / Dispatch
## VALIDATION-014 - Scheduler and dispatch semantics
### Business Question
Should manual scheduled-job execution share due-job lease semantics, and should FLOW-049 markers remain distinct from generic ScheduledJobDispatch records?
### Why This Needs Validation
FLOW-066 has due-job lease semantics, FLOW-067 has manual execution semantics, and FLOW-068/FLOW-069 define dispatch lifecycle. RE-011 also preserves FLOW-049 direct marker behaviour as separate from generic dispatch. Findings register evidence shows the scheduler infrastructure is newly introduced from F-044 Phase A and still has open Phase B operational semantics, making this a lower-cost point to settle lease/manual execution semantics before more dependents are added.
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
Which business-local time semantics are intended across branch availability, booking hold expiry, cancellation calculations, member cutoff/attendance, notification retry, and scheduler leases?
### Why This Needs Validation
Inconsistent/noncanonical time handling is already an active engineering concern, not only a future clarification. Findings register entries F-066, F-073, F-086, F-087, and F-088 document mixed clocks, branch timezone reachability, fixture/date failures, member-attendance time defects, and timezone-naive datetime parsing. SME validation is needed for intended business-local semantics; low-level UTC storage mechanics remain an engineering implementation detail unless the business requires a specific representation.
### Current AS-IS Evidence
| Evidence Type | IDs |
|---|---|
| Flows | FLOW-001, FLOW-023, FLOW-024, FLOW-029, FLOW-034, FLOW-036, FLOW-037, FLOW-043, FLOW-044, FLOW-046, FLOW-049, FLOW-061, FLOW-065, FLOW-066, FLOW-067 |
| Business Rules | BR-002, BR-030, BR-038, BR-061, BR-084, BR-096, BR-102, BR-120, BR-124, BR-220, BR-222, BR-223, BR-224, BR-225 |
| State Conflicts | STATE-CONFLICT-002 |
| Invariant Findings | INVARIANT-FINDING-001, INVARIANT-FINDING-009 |
| Authorization Findings | N/A |
| Integration Findings | INTEGRATION-FINDING-007 |
| Cross-Flow Findings | XFLOW-FINDING-001, XFLOW-FINDING-008 |
| Findings Register | F-066, F-073, F-086, F-087, F-088 |
| Journey Gaps | XFLOW-GAP-006 |
| Variants | N/A |
| Uncertainties | FLOW-024-UNCERTAINTY-*, FLOW-029-UNCERTAINTY-*, FLOW-043-UNCERTAINTY-*, FLOW-066-UNCERTAINTY-001, FLOW-067-UNCERTAINTY-001 |
### Observed Current Behaviour
Engineering fact: the repository already records active mixed-clock and branch-time defects/remediation work. SME decision: define the intended business-local time semantics for branch availability, booking cutoff, cancellation, attendance, retry, and scheduler behaviour.
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
| 13 | producer success vs NotificationRequest persistence | VALIDATION-013 | DIRECT |
| 14 | notification history recipient/tenant binding | VALIDATION-018 | SPLIT |
| 15 | manual execution vs lease | VALIDATION-014 | MERGED |
| 16 | FLOW-049 marker vs generic ScheduledJobDispatch | VALIDATION-014 | MERGED |
| 17 | authoritative tenant source across boundaries | VALIDATION-015 | MERGED |
| 18 | internal-key ownership/tenant bypass | VALIDATION-015 | MERGED |
| 19 | webhook idempotency timing/replay recovery | VALIDATION-006 | MERGED |
| 20 | canonical timezone basis | VALIDATION-016 | DIRECT |

## Additional Source Verification Mapping
| Source Verification Item | Topic | VALIDATION ID | Action |
|---|---|---|---|
| Architect CHECK-001 | FLOW-035 unauthenticated check-in mutation | VALIDATION-017 | ADDED |

## Finding Coverage Matrix
| Upstream Finding | VALIDATION ID(s) | Validation Required? | Reason |
|---|---|---|---|
| STATE-CONFLICT-001 | VALIDATION-001 | YES | Capacity formula decision required |
| STATE-CONFLICT-002 | VALIDATION-002, VALIDATION-003, VALIDATION-004 | YES | Confirmation/payment/hold semantics require SME decision |
| STATE-CONFLICT-003 | VALIDATION-017 | YES | Confirmed executable check-in access-control gap requires business validation |
| INVARIANT-FINDING-001 | VALIDATION-002, VALIDATION-003 | YES | Hold/payment confirmation invariant needs business validation |
| INVARIANT-FINDING-002 | VALIDATION-017 | YES | Confirmed executable check-in access-control gap requires business validation |
| INVARIANT-FINDING-003 | VALIDATION-001, VALIDATION-009 | YES | Capacity and no-show semantics require validation |
| INVARIANT-FINDING-004 | VALIDATION-011 | YES | Cancellation/refund continuation decision required |
| INVARIANT-FINDING-005 | VALIDATION-004, VALIDATION-006 | YES | Payment-confirmation atomicity/retry decision required |
| INVARIANT-FINDING-006 | VALIDATION-012 | YES | Local/provider refund meaning requires validation |
| INVARIANT-FINDING-007 | VALIDATION-010, VALIDATION-015 | YES | Subscription identity and tenant authority require validation |
| INVARIANT-FINDING-008 | VALIDATION-013 | YES | Notification guarantee decision required |
| INVARIANT-FINDING-009 | VALIDATION-014, VALIDATION-016 | YES | Scheduler lease/time semantics require validation |
| AUTHZ-FINDING-001 | VALIDATION-017 | YES | Confirmed executable check-in access-control gap requires business validation |
| AUTHZ-FINDING-002 | VALIDATION-005, VALIDATION-015 | YES | Direct verify ownership and tenant/ownership authority require validation |
| AUTHZ-FINDING-003 | VALIDATION-010, VALIDATION-015 | YES | Subscription identity binding requires validation |
| AUTHZ-FINDING-004 | VALIDATION-018, VALIDATION-015 | YES | Notification history ownership requires validation |
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
| XFLOW-FINDING-009 | VALIDATION-015, VALIDATION-018 | YES | Tenant authority and notification-history recipient binding require validation |
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
| FLOW-029-UNCERTAINTY-* through FLOW-037-UNCERTAINTY-* | VALIDATION-002, VALIDATION-003, VALIDATION-011, VALIDATION-016, VALIDATION-017 | BUSINESS_VALIDATION for booking, cancellation, check-in access control, and timing families |
| FLOW-038-UNCERTAINTY-* through FLOW-039-UNCERTAINTY-* | VALIDATION-001 | BUSINESS_VALIDATION for capacity/policy families |
| FLOW-040-UNCERTAINTY-* through FLOW-049-UNCERTAINTY-* | VALIDATION-008, VALIDATION-009, VALIDATION-013, VALIDATION-016 | BUSINESS_VALIDATION for member/no-show/notification/time families |
| FLOW-050-UNCERTAINTY-* through FLOW-058-UNCERTAINTY-* | VALIDATION-004, VALIDATION-005, VALIDATION-006, VALIDATION-007, VALIDATION-010, VALIDATION-015 | BUSINESS_VALIDATION for payment, subscription, tenant, and webhook families |
| FLOW-059-UNCERTAINTY-* through FLOW-060-UNCERTAINTY-* | VALIDATION-011, VALIDATION-012 | BUSINESS_VALIDATION for refund families |
| FLOW-061-UNCERTAINTY-* through FLOW-065-UNCERTAINTY-* | VALIDATION-013, VALIDATION-018 | BUSINESS_VALIDATION for notification persistence and notification-history identity families |
| FLOW-066-UNCERTAINTY-* through FLOW-070-UNCERTAINTY-* | VALIDATION-014, VALIDATION-016; N/A for pure health checks | BUSINESS_VALIDATION for scheduler/time families; NO_DECISION_REQUIRED for pure health lineage |
| All 86 canonical uncertainty identities from RE-010 | See family mappings above | ACCOUNTED; unresolved by design |

## SME Review Sequence
| Order | Group | Reason |
|---:|---|---|
| 1 | Temporal Behaviour | Canonical business-local time semantics are an active engineering dependency for scheduling, availability, booking, cancellation, and attendance. |
| 2 | Availability / Capacity | Capacity interpretation affects booking, attendance, and release semantics. |
| 3 | Booking | Confirmation and hold semantics affect payment and cancellation interpretation. |
| 4 | Payment | Payment decisions depend on booking confirmation ownership. |
| 5 | Membership / Attendance | Attendance depends on booking, capacity, and subscription semantics. |
| 6 | Cancellation / Refund | Refund meaning depends on booking cancellation and payment capture. |
| 7 | Authorization / Tenant / Ownership | Tenant authority impacts several remaining trust decisions. |
| 8 | Recovery / Compensation | Recovery decisions depend on accepted boundary semantics. |
| 9 | Notification | Notification guarantees and notification-history privacy need separate validation before SME decisions are recorded. |
| 10 | Scheduler / Dispatch | Scheduler semantics are cheaper to settle while the scheduler has few established dependents. |

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
| VALIDATION-017 | RE-006, RE-007, RE-008, RE-010, RE-011 |
| VALIDATION-018 | RE-007, RE-008, RE-010, RE-011 |

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
| Notification guarantee | VALIDATION-013 | PENDING | XFLOW-FINDING-007 |
| Notification history identity binding | VALIDATION-018 | PENDING | AUTHZ-FINDING-004, FLOW-064, BR-218 |
| Scheduler/manual/dispatch | VALIDATION-014 | PENDING | XFLOW-FINDING-008, XFLOW-VARIANT-006 |
| Tenant/ownership authority | VALIDATION-015 | PENDING | XFLOW-FINDING-009 |
| Time basis | VALIDATION-016 | PENDING | XFLOW-FINDING-001, XFLOW-FINDING-008 |
| Booking check-in access control | VALIDATION-017 | PENDING | STATE-CONFLICT-003, INVARIANT-FINDING-002, AUTHZ-FINDING-001 |

## Mechanical Validation
| Check | Result |
|---|---:|
| RE-011 questions inspected | 20 |
| RE-011 questions mapped | 20 |
| Final VALIDATION IDs | 18 |
| Pending validations | 18 |
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
| VALIDATION-001 includes FLOW-048 | YES |
| VALIDATION-014 priority | P1 |
| VALIDATION-016 priority | P0 |
| Notification privacy validation | VALIDATION-018 |
| Notification privacy priority | P0 |
| VALIDATION-017 priority | P0 |

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
18

PENDING:
18

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

## Architect Review Delta Closure
| Item | Result |
|---|---|
| RE-010 coverage caveats repaired | YES |
| RE-011 70-flow coverage repaired | YES |
| FLOW-048 added to capacity divergence where supported | YES |
| VALIDATION-001 scope propagated | YES |
| VALIDATION-014 recalibrated | YES - P1 |
| VALIDATION-016 recalibrated/reframed | YES - P0 |
| Notification privacy disposition | SPLIT to VALIDATION-018, P0 |
| FLOW-035 equivalent register finding | NOT FOUND |
| Mechanical validation result | PASS |
| Lineage result | PRESERVED |

REGISTER ACTION REQUIRED:
Create a first-class security finding for confirmed unauthenticated FLOW-035 check-in mutation.

Evidence:
- POST /bookings/:id/check-in
- authentication: none
- tenant check: none
- ownership check: none
- role check: none
- timing check: none
- state check: CONFIRMED
- mutation: CONFIRMED -> CHECKED_IN

Outstanding:
- findings_register.md still requires the FLOW-035 first-class security finding; it was intentionally not modified in this scoped delta.
