# Guest flow — open findings, grouped for one test pass per group

**Written 20 Aug 2026.** Grouping exists to answer one question: *what can be fixed together so the
whole group is verified in a single test pass, instead of a full regression after every finding?*

Groups are drawn by **shared surface**, not by severity — items in a group touch the same component,
the same endpoint, or the same screen, so one end-to-end pass exercises all of them. Run the full
regression suite once per group, not once per finding.

> **Check current state before starting any item.** Register entries drift. A pre-work verification
> pass on 20 Aug found five entries that no longer described reality (see below), which is exactly how
> F-146 and F-163 came to sit in Open weeks after shipping. A code read beats the register text.

## Cleared before grouping — no longer work

| ID | Register said | Verified reality |
|---|---|---|
| F-146 | Guest PWA is dark, needs light | Shipped `2212230` — `<body>` is `bg-surface-alt … text-ink` |
| F-163 | Payment flicker | Shipped `cb8365c` — fatal/recoverable error split in `BookingPay.tsx` |
| F-125 | Co-player removal broke JBC booking | Fixed `c14a4fa` — all pools `minOccupancy = 1`, read back from the database |
| F-126 | — | Withdrawn, "NOT A DEFECT" |
| F-038 | Hardcoded key **and** missing build arg | **Half done.** Literal removed in `2318620`; only the `docker-compose.yml` build-arg half is open |

All four resolved and F-038's text corrected on 20 Aug 2026.

---

## Suggested order

**F-047 → G → B → A → D → C → E → F → H**

Two deliberate placements:

- **F-047 first**, ahead of everything. It is what makes the e2e runner trustworthy, so every group
  after it is verified on a properly configured runner rather than inheriting the gap.
- **Group G (timezone) second.** Not because displayed times move — they do not — but because a
  branch flip changes which calendar day a slot belongs to server-side, so availability, member-session
  resolution and generated windows all shift under it. Anything verified before it lands is re-work.

---

## Group A — Payment & confirmation
`BookingPay.tsx`, `BookingConfirmation.tsx` · one payment pass

| ID | What |
|---|---|
| F-166 | Confirmation poll gives up after 30s and dead-ends on a spinner |
| F-165 | Client-side verify failure reported as payment failure, though the webhook may have captured |
| F-154 | Razorpay checkout button off-palette, label reads as internal jargon |
| F-050 | `apiRequest` has no 401-refresh-retry — a reachable happy-path failure |
| F-038 | Remaining half: `VITE_RAZORPAY_KEY_ID` build arg in `docker-compose.yml` |
| F-159 | No receipt download after a successful payment |

**Sequencing inside the group: F-166 before F-165.** F-165's likely fix is routing to the confirmation
screen and letting its poll resolve the true state; that is only safe once the poll no longer dead-ends.

## Group B — Slot list & availability
`CourtBooking.tsx` + `GET /resource-pools/:id/availability` · one booking-screen pass

| ID | What |
|---|---|
| F-114 | Per-pool toggle to disable minimum-occupancy enforcement |
| F-152 | Player count still shown under flat-rate — **blocked behind F-114**, do them together |
| F-147 | "Full" slot state has no data path — full slots are filtered out server-side |
| F-148 | "Member" slot state has no data path — `isMemberBooking` not exposed in the response |
| F-167 | Selected-slot highlight weak in bright/outdoor conditions |
| F-124 | F-009's co-player phone-format validation test is skipped, not deleted |
| F-158 | Multi-slot booking in one transaction — enhancement, much the largest item here |

F-147 and F-148 both change the availability *response*, so they are one server edit plus one client
edit rather than two independent pieces of work.

## Group C — Auth & session
`LoginScreen.tsx`, identity-auth · one auth pass

| ID | What |
|---|---|
| F-161 | WhatsApp OTP as the primary guest/member verification channel |
| F-080 | Rate limiting exists only on OTP, and is hand-rolled rather than infrastructural |
| F-160 | Google sign-in primary for Members and Owners only, never guests |
| F-120 | No admin-reachable path exists to create a member at all |

**F-160 is gated on real OAuth.** `/auth/google/verify` currently accepts only
`mock-google-token-<email>` and there is no OAuth client anywhere in the repo. F-161 and F-080 are the
same concern from opposite directions — channel economics and abuse control — and should be scoped
together rather than sequentially.

## Group D — My Bookings & check-in
`BookingHistory.tsx` · one pass

| ID | What |
|---|---|
| F-093 | Product question: should guest self-check-in carry a time-window safeguard |
| F-094 | Check-in's timing rule is enforced only in the browser |
| F-106 | Staff-operated check-in is a decided requirement with no UI |

**F-093 is a decision, not code, and it comes first** — it determines what F-094's server-side gate
should actually enforce.

## Group E — Guest-endpoint hardening
Backend only · one API pass, no UI retest required

| ID | What |
|---|---|
| F-164 | `GET /resource-pools/:id/availability` is unauthenticated |
| F-162 | Admins can no longer see today's already-started slots — F-155's filter reaches them through that same unauthenticated route. **Moved here from Group G**; its own entry says the smaller fix is an opt-in query parameter, not authenticating the endpoint |
| F-092 | `POST /bookings/:id/cancel` returns HTTP 500 instead of 401 on auth failure |
| F-034 | Raw internal/technical error messages reach the user-facing UI unfiltered |
| F-121 | `POST /member-group-assignments` never validates `userType` |

## Group F — Onboarding / PWA
`PwaInstallPrompt.tsx` · one first-login pass

F-128 (dismissible first-login walkthrough) · F-130 (first-time member login confirmation) ·
F-132 (iOS-aware notification-permission prompt)

Worth knowing before designing here: `PwaInstallPrompt` renders on **every** route via `Layout` at
`fixed bottom-6 … z-[100]`, so it already sits over anything anchored to the bottom of a screen.

## Group G — Timezone correctness — **do alone**

> **Corrected 20 Aug 2026 after investigating.** This group was first drafted as F-100 + F-087 + F-162
> on the reasoning that F-100 "shifts every displayed time". Both parts were wrong, and the corrected
> shape is below. See `docs/plans/f047-and-group-g-kickoff.md` for the evidence.

| ID | Role in this group |
|---|---|
| **F-088** | **The actual work** — "F-066 Stage 2, the half that solves the platform's timezone problem". Five required parts, *not started* |
| F-087 | Part (5) of F-088 — naive datetimes parsed on the server clock. Must land **before** any flip |
| F-100 | The application of F-088's part (3) to JBC's two branches specifically |

**F-088 was missing from the original grouping and is the umbrella the other two hang off.** F-100's own
entry names F-087 *and* F-088 as prerequisites; doing F-100 without them is the thing its text
explicitly forbids.

**F-162 has moved to Group E.** It is not a timezone finding at all — it is about F-155's started-slot
filter reaching admins through an unauthenticated endpoint, which makes it a sibling of F-164.

Isolated not because displayed times move — they do not; the guest PWA formats in the *viewer's*
browser timezone and never reads `Branch.timezone` — but because a flip changes **which calendar day a
slot belongs to** server-side, and reinterprets every recurring assignment's local-time string.

## Group H — Other

F-129 (T&C acceptance at booking) · F-157 (SCREEN-001 Get Directions / Leave a Review) ·
F-043 (no admin UI to schedule guest-bookable windows) · F-047 (`test:e2e` does not load `.env`) ·
F-150 (`font-outfit` used 34 times but the token never existed)

**F-047 is pulled out of this group and done first** — see the order above.

---

## Method note

Each group becomes its own kickoff: investigate current state against real code, plan, review, implement,
evidence, sign-off. The grouping changes *batching*, not the standard. Full regression per group, plus
`pnpm register:check` and `pnpm diagram:verify` on any register touch.
