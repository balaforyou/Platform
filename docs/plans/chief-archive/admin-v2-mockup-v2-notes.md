# admin-v2 combined mockup, v2 (notes)

**File:** `admin-v2-combined-mockup-v2.html` (self-contained; open in a browser). The 12 Oct mockup
`admin-v2-combined-mockup.html` is left untouched. **All names, numbers, phone numbers and revenue are fake and stay in
these two files only.** Nothing is wired to real data. This is the "required step before S2 and S3 sign-off" in the
admin-v2 revamp plan §10.

## What is new in v2 (every item is marked "v2" in the page or its gallery caption)
1. **A batch on several courts.** Batches now hold a fixed set of 1 to N courts (JBC Main: Courts 2 + 3 at 6 AM, Court 1 at
   6 PM, Court 3 at 7 PM; JBC Annex: Courts 2 + 3). On the grid a multi-court batch is drawn as **joined cells** (vertical link on
   laptop, horizontal on the phone layout); the other courts stay open to guests.
2. **Create batch: courts and the displacement preview.** The owner picks the courts (fixed, chosen at creation); a clash with
   another batch's courts at the same hour on a shared day is refused. The preview lists **every affected guest booking** for
   the next 7 days: *stays*, *moves to another court (no loss)*, or *displaced (refund recorded)*, overflow only, latest-booked
   first, computed from the same fake guest data the grid draws, so the two agree. It says plainly: **"refund recorded; the venue
   will return the money"** (never "refunded"), that guests are told by **push** and that a guest without the app gets nothing, with
   **Copy phone list** and **Download CSV**. The owner must tick "I have read this list" before the button enables. A batch holds
   its courts from creation, even with no members.
3. **A member in many batches.** Members list: one row per person ("2 batches"). Member profile: a Batches card, each batch with its
   own dues; payment, pause and cancellation apply to the batch shown; **one deposit**, refunded when the last batch ends (the
   end sheet says it "stays held" while another batch is active). Roster rows read "also in …".
4. **Add member: existing member and overlap guard.** Typing an existing Gmail or phone shows "Already a member"; the deposit is
   already held; a batch at the **same hour on a shared day** (any branch) is disabled with the clashing batch named; a
   different hour is allowed.

## Deviations and things this mockup does not settle
- The grid is drawn for JBC Main with the same fake guest bookings as v1; the 7-day horizon in the preview is the guest booking
  horizon (7 days at JBC).
- The "Move batch" sheet was not changed (the atomic-move rule is in the SB plan, SB-12).
- The refund list is a **recorded** refund only; whether the system should ever move the money is a separate ruling (F-345).
- The overlap guard is shown across branches (the member-wide rule); time-zone arithmetic across branches is an SB open item.
- The Today tab's attendance and low-attendance behaviour is unchanged from v1.

## How it was checked
Opened in real Chromium (no page errors or console errors); default Create batch gave 9 guest bookings, 5 stay, 3 move, 1 displaced,
and the button stayed disabled until the box was ticked; an overlapping join was refused and a non-overlapping one allowed; the
mobile gallery renders 30 screens (26 from v1 plus the v2 screens); screenshots read at 1280 and 390 px.
