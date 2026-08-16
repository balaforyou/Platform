# SCREEN-002 — Branch Court Onboarding Wizard

**App:** admin-web
**Route:** new — launched from `ResourcesPage`
**Linked Flows:**
`FLOW-019` Create Resource Pool · `FLOW-021` Add Resource to Pool — both authenticated as of F-091 (`aea242f`)
`FLOW-038` Create Booking Rule — pre-existing, no auth gap
`FLOW-025` Manage Availability Patterns — Step 5 *is* this flow; RE-003 already names `SchedulingPage` as its executable entry evidence
**Linked Capabilities:** `CAP-005` Resource Management (steps 1–3) · `CAP-008` Booking Rule Configuration (step 4) · `CAP-006` Availability & Scheduling (step 5)
**Status:** Frozen
**Version:** v4 — 15 Aug 2026 (v3 corrected at freeze against source)

**Process note.** Unlike SCREEN-001, this entry was **frozen before implementation** — the Screen
Catalogue process running in its intended order. Nothing here has been built yet.

---

## Corrections applied at freeze (v3 → v4)

The v3 draft was checked line by line against the handlers, the schema and the findings register.
Every default, validation rule, the `409` idempotency constraint, the F-087 reasoning and the
F-043/F-052 status survived that check. Three claims did not, and two smaller ones were sharpened.

**1. Step 4's copy asserted behaviour F-065 records as untrue.** v3's `gracePeriodMinutes` text read
*"After this, their spot may be released to guests."* Per F-065, verified against source:
`gracePeriodMinutes` (T−30) is only the **displayed** deadline — computed by the member dashboard
and `POST /member/today-assignment/confirm` (`index.ts:677`, enforced `:2317`). The actual release
to `RELEASED_NO_SHOW` happens at `startTime − guestAccessCutoffMinutes` (**T−120**, `:2592-2609`),
after which confirm returns `409 CONFIRMATION_CUTOFF_PASSED`. The release is therefore 90 minutes
earlier than the copy claimed, and driven by the *other* field. Taken together the two v3 blocks told
an admin the opposite of what the code does — and unlike a transient bug, screen copy prints a mental
model into the product and gets quoted back in support conversations. **Resolved by gating: see the
F-065 dependency below.**

**2. Step 5's flow was missing from the header.** `FLOW-025` already exists and names both the
`availability-patterns` endpoints *and* `SchedulingPage`. Since Step 5 is that page, it belongs in
Linked Flows. Same omission class as SCREEN-001's `FLOW-018`. The "adjacent capabilities" phrasing is
now named precisely: `CAP-008` and `CAP-006`.

**3. Court-name uniqueness is a schema migration, not form validation.** `Resource` has no unique
index — confirmed against `schema.prisma`. v3 described it as something the wizard enforces. It is a
migration, scoped separately below.

**Smaller:** the pool create-path fix is larger than "two missing cross-field rules" — the server
endpoint currently validates *none* of those fields, so the server half is the bigger piece. And
Step 3's `POOLED` skip label was reworded: JBC's real `POOLED` pools *do* carry named courts
(Court 1–4, Court A–C), so "no fixed courts needed" would contradict how the actual customer is set up.

---

## Purpose

Let an admin stand up a branch's bookable courts **completely**, in one sitting — pool, resources,
booking rule, availability pattern — matching JBC's real onboarding shape: 2 branches, `POOLED`,
`minOccupancy: 2`, 7-day guest window, 30/120-minute cutoffs, 60-minute slots, 06:00–22:00 daily.
Not "create one pool" but "make a branch genuinely bookable."

Today this is only possible through internal-key API calls via `scripts/provision-tenant.mjs`,
because no admin UI exists (**F-098**).

---

## Constraints from discovery — non-negotiable design inputs

1. **`allocationMode` is a one-way door.** `PATCH /resource-pools/:id` rejects changes to it, and to
   `tenantId`/`branchId`. Chosen in step 1; a wrong choice means delete and recreate.
2. **The pool create path barely validates.** `PATCH` enforces non-empty name, positive integers,
   `capacity >= minOccupancy`, 1440-divisible duration, enum `pricingMode`, non-negative rate.
   `POST` enforces **none** of it, so a form posting to `POST` can create a pool the next `PATCH`
   refuses to save. Fixing this — a shared validator across both, as F-068 already did for booking
   rules — is part of this work, and the server half is the larger piece.
3. **`FIXED_INSTANCE` is silently unbookable with zero resources.** Generation emits one window per
   resource; no resources means no windows, with no error. Resources are part of the journey.
4. **Booking-rule creation is not idempotent.** F-067's unique index makes a second `POST` return
   `409 BOOKING_RULE_EXISTS`. The wizard must detect an existing rule and switch to `PUT`, or a
   failure at step 5 permanently breaks re-entry at step 4.
5. **Use patterns, not raw availability windows.** Patterns carry `HH:mm` plus weekday numbers and
   are never parsed as datetimes, so they sidestep **F-087** entirely. A correctness choice.
6. **Reuse existing conventions exactly.** `poolSchema` / `ruleSchema` / `patternSchema` zod,
   `MutationFeedback`, `primary-btn`/`secondary-btn` with spinning `RefreshCw`, `form-grid compact`,
   `<label>`-wrapped inputs. No new visual language.
7. **Step 5 reuses `SchedulingPage` directly**, including its live availability preview as the
   closing confirmation.

---

## Field inventory — Steps 1–3 (pool + resources)

| Field | Shown when | Type | Server validation (target: matching PATCH) | Default |
|---|---|---|---|---|
| Allocation Mode | Step 1 | Radio: Fixed Courts / Shared Pool | required; **immutable after this step** | — |
| Pool Name | Step 2 | Text | non-empty | — |
| Capacity | Step 2, `POOLED` only | Number | positive int, `>= minOccupancy` | 1 |
| Min. Occupancy | Step 2 | Number | positive int, `<= capacity` | 1 |
| Min. Booking Duration | Step 2 | Number (min) | positive, must divide 1440 | 60 |
| Pricing Mode | Step 2 | Select: Flat / Per Person | enum | FLAT |
| Default Rate | Step 2 | Number (₹) | `>= 0` | 100.00 |
| Court Names | Step 3 — required for `FIXED_INSTANCE`, optional for `POOLED` | Repeatable text list | non-empty per entry; uniqueness **pending the migration below** | — |

`capacity` is meaningless for `FIXED_INSTANCE` — generation forces `capacity: 1` per resource — so it
is hidden in that mode rather than shown and ignored.

## Field inventory — Step 4 (booking rule)

Pre-filled with real server defaults, which already match JBC's provisioned values.

| Field | Type | Default | Notes |
|---|---|---|---|
| Guest Open Window | Number (days) | 7 | |
| Member Booking Window | Number (days) | 30 | |
| Member Confirmation Window (`gracePeriodMinutes`) | Number (min) | 30 | see F-065 gate |
| Low-Occupancy Alert Lead Time (`guestAccessCutoffMinutes`) | Number (min) | 120 | separate section, staff-alert framing only |
| Low-Occupancy Threshold | Number (%) | 50 | integer 0–100 |
| Prepayment Required | Toggle | On | must be a real boolean; the API rejects coercible values |
| Cancellation Policy | — | tiered 24h/100%, 6h/50%, 0h/0% | **not editable in v1** |

**`cancellationPolicyJson` stays non-editable.** The server accepts *any* JSON without validation, so
free-text editing would let an admin silently corrupt refund calculation. Custom policies are a
separate future concern.

**Idempotency.** Before submitting, check for an existing rule on the pool; if present, switch to
`PUT /resource-pools/:id/booking-rule` transparently rather than surfacing the `409`.

## Field inventory — Step 5 (availability pattern)

Reuses `SchedulingPage`: branch→pool cascade, existing pattern CRUD, existing weekday-toggle UI
(which already maintains the `1,2,3` format), existing `patternSchema`.

| Field | Type | Validation |
|---|---|---|
| Days of Week | Toggle UI (existing) | ≥ 1 day; ISO 1–7, de-duplicated server-side |
| Start / End Time | `HH:mm` | strict `HH:mm`; end after start; range must contain whole slots |
| Slot Duration | Number (min) | positive **and divides 1440** — client check added here, closing a real gap where only the server enforced it |
| Capacity | Number | positive int |
| Pricing Override | Optional | `pricingMode` and `price` both-or-neither, else `400 PARTIAL_PRICING_OVERRIDE` |

**Closing confirmation** is `SchedulingPage`'s live availability preview for the pattern just created
— real generated slots as proof the branch is bookable, not a generic success message.

---

## Screen-level states

| State | Trigger | What's shown |
|---|---|---|
| Step 1 — Court Type | Entry | Two options, one line of consequence each |
| Step 2 — Pool Details | Mode chosen | Mode-specific form |
| Step 3 — Courts | Pool created | Required for `FIXED_INSTANCE`, optional for `POOLED` |
| Step 4 — Booking Rules | Courts step complete | Pre-filled defaults; the two cutoff fields in separate sections |
| Step 5 — Scheduling | Rule saved | Reused `SchedulingPage` flow |
| Success | Pattern created | Live preview of real generated slots |
| Error, any step | Server validation fails | `MutationFeedback` inline-error, as everywhere else in this app |
| Re-entry after partial failure | Wizard reopened | Completed steps detected and shown as done rather than blindly re-attempted; step 4 switches to `PUT` |
| Empty state upstream | `ResourcesPage` pool `<select>` has zero pools | Becomes "Create your first court pool", launching this wizard — closes **F-031**'s Resources half as a byproduct |

---

## Scoped sub-item — court-name uniqueness migration

Separate from the wizard, because it touches the schema rather than the UI.

`Resource` has no unique constraint, so duplicate court names within one pool are accepted silently.
Adding `@@unique([resourcePoolId, name])` must follow **F-067's exact self-defending pattern**, not a
bare `CREATE UNIQUE INDEX`: a `DO $$` block that first aggregates offending rows and `RAISE EXCEPTION`s
naming them, so a deployment against dirty data fails with an actionable message rather than a bare
Postgres error naming nothing. F-067's own migration exists as the template.

**Current data is clean** — a live check of the demo database found zero duplicate `(resourcePoolId, name)`
pairs, so the index would apply without reconciliation today. That is a fact about now, not a
guarantee for whenever this ships; the guard is what makes it safe either way.

---

## Dependency — Step 4 copy is gated on F-065

**Step 4 must not ship its confirmation-window copy until F-065 is resolved.**

The copy below is written for the behaviour that will be true *after* F-065 lands — a single member
deadline governed by `gracePeriodMinutes`, with `guestAccessCutoffMinutes` reduced to pure staff-alert
timing carrying no release semantics. That is deliberately **not** what the code does today: right now
the sweep releases at T−120 via `guestAccessCutoffMinutes` while the member is shown T−30.

Shipping this copy before F-065 resolves would tell admins something false. Shipping the *current*
behaviour's copy would print a known-wrong mental model into the product and then need rewriting.
Gating is the honest third option.

F-065 has not manifested in production because the sweep has never run on a real timer — its only
callers are regression tests. **F-044 Phase B is what changes that**, and F-044's own entry already
names F-065 as a hard blocker on scheduling the sweep.

---

## F-043 Phase C — confirmed resolved

Step 5 depends on `SchedulingPage` being trustworthy. It is.

F-043 Phase C's independent review passed in full. The confirmation is recorded under **F-052**
(Resolved, 2 Aug 2026), not under F-043 — which is why it can look unresolved. F-052 closes:
*"This closes out F-043 Phase C's independent review — full pass."* Its resolution addresses all three
original failures: the closed-override race (`CourtBooking.tsx` now discards stale out-of-order
responses, re-verified with a genuine empty state), the lazy-generation claim (a cross-check linking a
real booking's `windowId` to a specific lazily-generated window), and the missing `HELD`-booking
evidence (the same chain).

Independently corroborated by today's F-091 run rather than resting on a 2 Aug entry: slot-engine
regression **28/28**, including nine sections covering exactly those behaviours — CLOSED override
precedence (both direct and via live API), MODIFIED override precedence, lazy generation from guest
and admin reads, pattern-based generation with provenance, booking stability across pattern edits,
generation-lock concurrency, and range-override expansion.

**F-043 itself remains Open**, but for its own reasons — its next step reads "Phase 1 kickoff in
progress", with Phase 2 split out as F-044. Open is not the same as Phase C failing.

---

## Copy freeze

**Step titles:** Court Type → Pool Details → Courts → Booking Rules → Scheduling
(the last deliberately matches `SchedulingPage`'s real nav name, because Step 5 *is* that page)

**Step 4 cutoff sections** — written for post-F-065 behaviour, gated per the dependency above:

> **Member Confirmation Window**
> *"How many minutes before the session starts must a member confirm attendance?"*
> (`gracePeriodMinutes`)

*(separate, visually distinct section)*

> **Staff Alerts**
> *Low-Occupancy Alert Lead Time*
> *"How many minutes before the session should staff be notified if it looks under-booked, so there's time to fill it?"*
> (`guestAccessCutoffMinutes`)

Neither block carries release language. The release rule belongs to whichever field owns it once F-065
settles that question, and stating it before then is what v3 got wrong.

**Buttons:**
- Step 2 — "Create Pool" (pending: "Creating…")
- Step 3 — "Add Courts & Continue" (`FIXED_INSTANCE`) · "Add courts (optional for shared pools)" (`POOLED`)
- Step 4 — "Set Booking Rules"
- Step 5 — `SchedulingPage`'s existing buttons, unchanged

---

## Known gaps

- **F-098** — the gap this screen closes; until then, onboarding runs through
  `scripts/provision-tenant.mjs` with the internal key.
- **F-065** — blocks Step 4's copy (above).
- **F-031** — this screen closes its Resources half only; Low Occupancy and Negotiated still render a
  clickable primary action with nothing selected.
- **Pool create-path validation** is a prerequisite, not a nicety: without it the wizard can create
  pools that the edit screen refuses to save.
- **No per-field error display exists anywhere in admin-web.** Every form surfaces a single
  `MutationFeedback` banner. A five-step wizard is where that limitation will be felt first; this
  entry does not introduce per-field errors, and that is a deliberate consistency choice rather than
  an oversight.

## Sign-off

- Designed and reviewed: 15 Aug 2026
- Frozen: 15 Aug 2026 — **before build**, unlike SCREEN-001
- Corrected at freeze: 15 Aug 2026 (v3 → v4, three corrections plus two refinements above)
