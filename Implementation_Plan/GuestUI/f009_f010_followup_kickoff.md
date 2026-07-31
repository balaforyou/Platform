Read docs/findings_register.md (F-009 and F-010) before starting. This is a small, targeted follow-up to Phase 10, not a new phase — two real bugs found during manual testing after Phase 10's approval.

Same working agreement as always — plan first for anything non-trivial, comment non-trivial logic, stop and ask if something's ambiguous, confirm before deviating.

## F-009 — Co-player phone number validation, two layers

**Client-side** (`CourtBooking.tsx`): the co-player phone input currently accepts anything, including a 19-digit string with no validation at all. Add real validation matching Indian mobile format. Reuse the same normalization logic pattern already built and tested in Identity's OTP flow (10 digits, optional `+91` or leading `0` handled the same way) rather than inventing a separate, potentially inconsistent rule.

**Server-side — check this first, it's the one that actually matters.** Look at `POST /bookings` in Slot Engine and confirm whether the `coPlayers` array validates phone format before being written to the database. Given this project's established pattern (price, `userType`, and `adminId` spoofing were all closed specifically because client-side-only validation isn't sufficient), this needs the same treatment: if server-side validation is missing, add it — reject with `400` on a malformed phone number, don't just rely on the frontend behaving.

State in your plan which layer(s) were actually missing before you fix them — I want to know whether this was a client-only gap or a real server-side gap too.

## F-010 — Availability windows not aligned to clean hour boundaries

Slots are currently generating as e.g. `10:16 PM – 11:46 PM` instead of `10:00–11:00`. Find the generation logic (test/seed data, and any real availability-window creation logic if it exists) and fix it to snap to clean boundaries.

**One thing to get right, not assume:** slot duration is configurable (`minBookingDurationMinutes` / the resource type's default duration), not always 60 minutes. The fix should align to whatever the configured duration actually is — e.g. a 30-minute-slot court should generate `:00`/`:30` boundaries, not just always snap to the top of the hour regardless of duration. State your approach in the plan.

**Also confirm the scope**: is this bug only in test/seed data generation (lower stakes, only affects local dev), or in logic that would also generate real tenant availability windows once a real branch goes live (higher stakes, must be fixed before then)? This matters for how urgently it needs fixing beyond just this dev environment.

## Verification

Both fixes need real evidence, not just "looks fixed":
- F-009: a test attempting a malformed phone number against the real (not mocked) `POST /bookings` endpoint, confirming the server rejects it — plus the client-side field visibly rejecting bad input
- F-010: a test confirming generated windows actually land on clean boundaries matching the configured slot duration, for at least two different duration values if the duration is genuinely configurable

Stop and show me the plan before implementing either fix.
