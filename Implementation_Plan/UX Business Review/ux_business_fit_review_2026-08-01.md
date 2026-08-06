# UX / Business-Fit Review - Admin, Guest, Member PWA

**Date:** 1 Aug 2026  
**Review type:** Heuristic UX and business-fit review, not correctness/bug-hunt review.  
**Evidence rule:** Fresh Playwright screenshots and rendered text captures only; no earlier walkthrough screenshots reused.  
**Evidence folder:** `Implementation_Plan/UX Business Review/Evidence/`

## Method

Fresh browser pass through Caddy at `http://localhost:8080`, using Playwright Chromium with a mobile viewport for Guest/Member and desktop viewport for Admin.

Seeded data used:

- Existing rich tenant: `courtowner1` / `Elite Courts`.
- Fresh empty tenant: `emptyowner1` / `Blank Slate Courts`.
- Guest journey actor: phone `9666666666`, seeded user `ux-guest-review`.
- Member state actors:
  - `9611111111` - `HAS_SESSION`
  - `9622222222` - `NO_SESSION_TODAY`
  - `9633333333` - `NO_ACTIVE_ASSIGNMENT`
  - `9644444444` - `SUBSCRIPTION_INACTIVE`
  - `9655555555` - `WINDOW_NOT_FOUND`
- Empty owner actor: phone `9677777777`.

Concrete rendered-text leak scan:

- Every captured page text was scanned for `ALL_CAPS_WITH_UNDERSCORES`.
- Every captured page text was scanned for UUID-shaped strings.
- No UUID-shaped full strings or all-caps error-code tokens appeared in the rendered page text in this pass.
- Non-UUID internal IDs did appear in some UI text and are called out below.

API evidence:

- `Implementation_Plan/UX Business Review/Evidence/api-responses.json`

## Guest Journey

### Genuinely Good - End-to-end booking path is understandable once the group-size requirement is satisfied

**Evidence:**  
`guest-07-after-adding-coplayer.png`, `guest-08-pay.png`, `guest-09-confirmation.png`  
Rendered text:

```text
Group Size:
2 Players
Total Estimate:
₹360
Hold & Proceed to Pay
```

```text
Complete Checkout
Your court slot is held for 5 minutes. Select a payment method below.
```

```text
Booking Confirmed!
Payment captured successfully. Your court slot is reserved and ready.
```

Assessment:

- Clarity is good after the valid group size is reached.
- Feedback confidence is strong: hold leads to checkout, payment leads to a clear confirmation.
- Business fit is reasonable for a first guest booking flow.

### Real Problem - Minimum group size is discovered only after failed submit

**Evidence:**  
`guest-05-slot-selected.png`, `guest-06-after-reserve-click.png`  
Rendered text after failed submit:

```text
Group Size:
1 Players
Total Estimate:
₹180
Minimum group size for this pool is 2
Hold & Proceed to Pay
```

API evidence:

```json
{
  "method": "POST",
  "url": "http://localhost:8080/api/slot-engine/bookings",
  "status": 400,
  "body": "{\"error\":{\"code\":\"INVALID_GROUP_SIZE\",\"message\":\"Minimum group size for this pool is 2\"}}"
}
```

Assessment:

- Clarity gap: the screen knows the pool requires `minOccupancy: 2`, but the guest only learns this after tapping the primary action.
- Cognitive load: the guest is asked to infer group-size validity from a post-submit error.
- Business fit: real guests will often book for one or two people; this should be structurally visible before the button is usable.
- Technical leakage: the rendered UI uses plain language, but the API response contains `INVALID_GROUP_SIZE`; no raw code leaked to the page.

### Minor Polish - Guest sees a member attendance card and role label

**Evidence:**  
`guest-01-login-dashboard.png`  
Rendered text:

```text
member
MEMBER ATTENDANCE
Today's Member Session
No active recurring member assignment is linked to this account.
```

Assessment:

- The OTP login returned the seeded review user as `userType: MEMBER`, so this specific evidence is not proof that every guest sees the member card.
- Still, the role label and fallback wording are confusing: a person booking casually should not have to parse whether they are a "member" or a guest.
- If guest accounts can ever land on this dashboard with no recurring assignment, the member-attendance card should be hidden or reframed.

### Minor Polish - Payment screen exposes a booking ID fragment

**Evidence:**  
`guest-08-pay.png`  
Rendered text:

```text
BOOKING SUMMARY
Booking ID:
48f37cf3...
```

Assessment:

- This is not a full UUID leak, but it is still internal-object language.
- For guest confidence, "Reference" or "Booking reference" is friendlier than "Booking ID".
- The short value may be useful for support, but it should be framed as a human support reference.

### Genuinely Good - Check-in and cancellation are reachable from booking history

**Evidence:**  
`guest-10-history-before-checkin-cancel.png`, `guest-11-checkin-after-click.png`, `guest-12-cancel-modal.png`, `guest-13-cancel-after-confirm.png`  
Rendered text:

```text
I'm Here
Cancel Match
```

```text
Cancel Your Match
Original Price:
₹360
Policy Refund %:
50%
Calculated Refund:
₹180
Confirm Cancel
```

Assessment:

- Feedback confidence is good: after check-in, status changes to `CHECKED IN`; after cancel, status changes to `CANCELLED`.
- Cancellation preview is understandable and gives the guest a chance to back out.
- Business fit is strong for a mobile self-service flow.

## Member Journey

### Genuinely Good - All five dashboard states render deliberately

**Evidence:**  
`member-01-has-session.png`, `member-02-no-session-today.png`, `member-03-no-active-assignment.png`, `member-04-subscription-inactive.png`, `member-05-window-not-found.png`

Rendered text:

```text
Today's Member Session
Slot
Main Arena Premium Courts
Time
21:30
Confirm before
21:00
I am coming
```

```text
No recurring member session is scheduled for you today.
```

```text
No active recurring member assignment is linked to this account.
```

```text
Your recurring slot is paused because the subscription is not active.
```

```text
Today's recurring slot has not been opened on the court schedule yet.
```

Assessment:

- Clarity is good for the five states.
- The empty/no-session states do not leave an unexplained gap.
- Feedback confidence is good for the happy path.

### Genuinely Good - Attendance confirmation has clear success feedback

**Evidence:**  
`member-01-has-session-confirmed.png`  
Rendered text:

```text
I am coming
```

After click:

```text
Attendance confirmed
```

Assessment:

- The action language is approachable.
- The success state is visible in-place and does not require a page reload.
- Business fit is strong: a daily member can quickly confirm without navigating to a booking-management page.

### Real Problem - Dashboard profile exposes internal user IDs

**Evidence:**  
`member-01-has-session.png`, `member-03-no-active-assignment.png`, `guest-01-login-dashboard.png`  
Rendered text:

```text
Profile Details
User:
ux-member-has-session
Phone:
+919611111111
Role Scope:
member
```

Assessment:

- This is raw technical leakage even though it is not UUID-shaped.
- Real members do not benefit from seeing database/test-style user IDs.
- This also increases support confusion: users may quote `ux-member-has-session` instead of a phone number/name.
- Recommended business framing: show phone/name/membership status; hide raw user ID unless in an explicit diagnostic/admin-only mode.

### Minor Polish - Generic dashboard marketing copy is not member-specific

**Evidence:**  
`member-01-has-session.png`  
Rendered text:

```text
Coimbatore's premium court booking platform. Find slots, book courts, and manage your matches.
```

Assessment:

- Fine for guests, but a recurring member landing to confirm attendance may not care about booking discovery.
- The member session card is present, but it competes with the generic hero.
- Minor, not blocking: consider moving the member session card above the general booking hero for `HAS_SESSION` members.

## Admin Journey

### Genuinely Good - Setup and operations screens now avoid raw ID inputs in the main workflows

**Evidence:**  
`admin-01-resources.png`, `admin-02-assignments.png`, `admin-04-negotiated.png`  
Rendered text:

```text
Branch
Select branch
Resource pool
Select pool
Member phone
Lookup member
```

Assessment:

- This is much closer to how an owner/front-desk user thinks: branch, pool, member phone, time.
- Assignments uses a clear time grid rather than a raw time input.
- Negotiated uses availability windows instead of manual window IDs.

### Real Problem - Assignments table still displays raw user IDs and backend-ish day encoding

**Evidence:**  
`admin-02-assignments.png`  
Rendered text:

```text
Assignments
admin-seed-member-002
Peelamedu Evening Courts | 2,4 19:00
ACTIVE
```

Assessment:

- Raw technical leakage: `admin-seed-member-002` and `2,4` are implementation data, not owner-friendly labels.
- Business fit: a front desk user expects member phone/name and readable days like `Tue, Thu`.
- Status `ACTIVE` is acceptable as a badge if styled, but the raw day encoding is not.

### Minor Polish - Resources screen is dense but mostly understandable

**Evidence:**  
`admin-01-resources.png`  
Rendered text:

```text
Pool Name
Capacity
Min. Occupancy
Min. Booking Duration (minutes)
Default Rate (₹)
Pricing Mode
FLAT
PER_PERSON
Guest Access Cutoff (minutes)
Low-Occupancy Threshold (%)
```

Assessment:

- Label humanization helped.
- Cognitive load is still high because pool configuration and booking-rule configuration are adjacent without explanatory grouping.
- For an owner doing one-time setup this is acceptable; not an urgent customer-blocker.

### Minor Polish - Low Occupancy is operationally useful but needs stronger consequence wording

**Evidence:**  
`admin-03-low-occupancy.png`  
Rendered text:

```text
1 of 8 confirmed
13%
Threshold 40%
Guest cutoff 120 min
Manual Release
Release to guests
```

Assessment:

- Business fit is good: the key operating numbers are visible.
- The action could be clearer about consequence, for example "Release 7 open seats to guests."
- Current wording is usable, not dangerous.

### Minor Polish - Negotiated payment link result area starts empty without next-step guidance

**Evidence:**  
`admin-04-negotiated.png`  
Rendered text:

```text
Payment Link

Create a negotiated booking to generate a shareable link.
```

Assessment:

- The workflow fields are sensible.
- Before creation, the right-side panel could better tell the admin what will happen after submission: booking created, payment link generated, share with member.
- Not urgent, but would reduce hesitation.

### Minor Polish - Refunds screen starts too sparse

**Evidence:**  
`admin-05-refunds.png`  
Rendered text:

```text
Manual Refund Override
Member phone
Lookup member
```

Assessment:

- The empty state is clean and no longer exposes inactive override fields.
- It may be too sparse for a high-stakes exception action: a one-line hint like "Find a member, select a cancelled booking, then override the calculated refund" would reduce uncertainty.

### Minor Polish - Overview is technically clean but product-thin

**Evidence:**  
`admin-06-overview.png`  
Rendered text:

```text
Branches
6
Active
6
Workflows
5
```

Assessment:

- The page is not broken.
- It does not yet answer what an owner asks first: "What needs my attention today?"
- For day-to-day use, low-occupancy alerts, pending refunds, upcoming member confirmations, and today's bookings would be more valuable than only counts.

## Fresh Empty Tenant Walkthrough

### Real Problem - Day-one owner has no setup path guidance

**Evidence:**  
`empty-01-overview.png`, `empty-02-resources.png`, `empty-03-assignments.png`, `empty-04-low-occupancy.png`, `empty-05-negotiated.png`, `empty-06-refunds.png`

Rendered text:

```text
Branches
0
Active
0
Workflows
5
```

```text
Branch Schedule
Select branch
Opens
Closes
Save hours
Resource Pools
```

```text
Assign Member to Recurring Slot
Branch
Select branch
Resource pool
Select pool
Member phone
Lookup member
...
Assign member
Assignments
```

Assessment:

- This is the biggest previously untested UX gap.
- The app does not look broken, but it gives a new owner no day-one path: no "Create your first branch", no "Add resource pools next", no disabled explanations for dependent screens.
- Several screens show active controls even though there is no branch/pool data to act on.
- Business fit: a real first-time owner would likely get stuck or assume setup is missing.

### Real Problem - Empty-tenant dependent workflows do not explain prerequisites

**Evidence:**  
`empty-04-low-occupancy.png`, `empty-05-negotiated.png`, `empty-06-refunds.png`

Rendered text:

```text
Low Occupancy
Branch
Select branch
Resource pool
Select pool
Date
Manual Release
Availability window
Select window
Release to guests
```

```text
Negotiated Booking
Branch
Select branch
Resource pool
Select pool
Date
Availability window
Select window
Member phone
Lookup member
Negotiated price
Co-player phones
Description
Create payment link
```

Assessment:

- Clarity gap: these actions require branches, pools, windows, and members, but the screen does not say so.
- Feedback confidence risk: a user may try to click disabled/useless workflows without knowing the prerequisite.
- Recommended pattern: explicit empty state per screen, e.g. "Create a branch and resource pool before releasing low-occupancy slots."

## Cross-Journey Observations

### Real Problem - Internal identities still appear in user-facing UI

Evidence across:

- `member-01-has-session.png`
- `guest-01-login-dashboard.png`
- `admin-02-assignments.png`

Captured examples:

```text
User:
ux-member-has-session
```

```text
Assignments
admin-seed-member-002
```

Assessment:

- No UUID-shaped values appeared in rendered text, but implementation-style IDs still leak.
- This is a UX/business problem rather than a security finding in this context.
- Replace with phone, name, or "Member profile" display values.

### Genuinely Good - Technical error codes are not visibly leaking in the reviewed states

Evidence:

- Every `.json` text capture in `Implementation_Plan/UX Business Review/Evidence/` has:

```json
{
  "leaks": {
    "allCaps": [],
    "uuids": []
  }
}
```

Assessment:

- The UI is mostly translating backend error codes into plain messages.
- The remaining leakage problem is internal IDs and enum-like values in normal tables, not raw exception codes.

### Genuinely Good - Brand and navigation consistency are coherent across Admin and PWA

Evidence:

- `guest-01-login-dashboard.png`
- `admin-01-resources.png`
- `empty-01-overview.png`

Assessment:

- Tenant name/mark appear consistently.
- Primary actions use consistent brand coloring.
- The mobile PWA and desktop Admin are visually distinct enough for their audiences without feeling unrelated.

## Couldn't Assess

None of the requested journeys were completely unreachable. The guest booking flow initially failed because of the hidden minimum group-size rule, but that failure was captured as evidence and the journey continued after adding a co-player.

## Highest-Priority UX Fixes Suggested

1. Add day-one empty-tenant setup guidance and disable/explain dependent screens until branch/pool data exists.
2. Remove internal user IDs from member dashboard and admin assignment list; show phone/name/readable days instead.
3. Make minimum occupancy visible before guest submit and disable "Hold & Proceed to Pay" until group size is valid.
4. Strengthen Overview into an operational dashboard: today's bookings, low-occupancy alerts, pending refund exceptions, and member confirmation status.
5. Add short workflow hints to sparse exception screens, especially Refunds and Negotiated.
