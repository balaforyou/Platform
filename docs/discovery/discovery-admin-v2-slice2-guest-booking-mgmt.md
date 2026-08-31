# Discovery — Admin v2 Slice 2 / Guest Booking Management, Running Log

**Purpose:** a living discovery document, not a locked spec. Captures real decisions, real investigation, and real product ideas as they come up — appended to, not rewritten, as the product-thinking continues. Each entry is dated and self-contained enough to hand to a Technical Lead thread later without re-deriving the reasoning.

**Status: discovery for the core Guest and Member flows (admin-side and PWA-side) is functionally complete as of 30 Aug 2026 — see §12. Real finding ID: F-205 (see the dated correction in §3 — this was mislabeled F-203 earlier in this document, a real collision with an already-confirmed, unrelated finding; corrected here, not silently). No implementation. No register row. Next real step is consolidating this into Chief-assigned findings and plan-mode documents.**

---

## 1. Admin v2 layout shell — reconciled navigation (30 Aug 2026)

**Real, complete, resolved canonical IA — 7 destinations, two presentations, nothing hidden or guessed:**

| Destination | Desktop (sidebar) | Mobile (bottom nav) |
|---|---|---|
| Dashboard/Occupancy hub | Direct item | Direct icon |
| Communications | Direct item | Direct icon |
| Subscription Ledger | Direct item | Direct icon |
| Inventory | Direct item | Direct icon |
| Manage Members | Direct item | Inside "Apps" overflow drawer |
| Manage Court Groups | Direct item | Inside "Apps" overflow drawer |
| Guest Management | Direct item | Inside "Apps" overflow drawer |

Desktop has room for all 7 directly — no overflow concept needed there. Mobile's bottom nav physically fits 5 slots: 4 direct destinations + "Apps" as the 5th, holding the 3 that don't fit. Corrected during this reconciliation: an earlier screenshot was cropped before reaching "Communications" in the desktop sidebar — it is real and present, not a gap to fill.

**Mockup's "SYSTEM PREVIEW / Current Role / FORCE SWITCH" bar is a dev-only role-switcher, excluded from the real build** — confirm if an equivalent real feature is ever wanted; not assumed.

**Rename, confirmed:** mobile's "Occupancy" icon → "Dashboard", matching desktop's naming.

**Reference:** the mockup is real, already-built code with only theming color differences to account for — not a rebuild from scratch.

---

## 2. Onboarding scope — deferred to post-MVP (30 Aug 2026)

**Confirmed decision:** tenant and branch onboarding (creating a new customer) happens via a seeding script, run by Slotflow owners — **no admin-v2 screen for this.** Post-MVP. This keeps admin-v2's real scope to managing an *existing*, already-provisioned tenant, not onboarding new ones.

---

## 3. Guest slot → court mapping — resolved, real new backend work (F-205)

> **Dated correction, 30 Aug 2026:** this finding was originally labeled F-203 in this document, based on a "next available" check run against the register at the time. That check was correct *at that moment*, but F-203 was independently, genuinely confirmed and resolved for a different, unrelated finding (real Google OAuth for admin-v2) during the admin-v2 Slice 1 close-out — a real event in this same conversation that this document's later re-checks failed to account for. **Real, current ID: F-205**, verified directly against the live register (`docs/plans/pending-findings.md`) at the time of this correction. Every other reference to "F-203" below refers to this same finding and should be read as F-205.

**The real question, worked through carefully:** should a guest-bookable slot be mapped to a specific physical court?

**Rejected approaches, with reasons:**
- Guest picks their own court at booking time — already explicitly rejected earlier this session (mismatch against the real pooled/interchangeable-capacity model).
- Switching the pool to `FIXED_INSTANCE` allocation — technically real and already implemented in code, **but its concurrency check hard-fails on a specific court conflict** (`SLOT_ALREADY_BOOKED`, 409), directly contradicting the desired "never fail, gracefully accept whichever court is free" behavior. Confirmed via direct code read, not assumed.

**Confirmed real, resolved direction:** stay on `POOLED` allocation (aggregate capacity check, never fails on a specific court — confirmed via code: `activeCount >= w.capacity`, no resource-specific check at all). **New work: at the moment of a successful booking, automatically assign a real `Resource` (not just `courtSlotIndex`'s cosmetic 1–N number) from whichever of the pool's real named courts are actually free for that window** — same non-blocking philosophy `courtSlotIndex` already uses (never a rejection reason), just pointing at a real, trackable entity instead of a cosmetic label.

**Real, positive finding that shrinks this scope:** JBC's actual provisioning (`scripts/tenants/jbc.json`) already defines `"resources": ["Court 1", "Court 2", "Court 3", "Court 4"]` for the live pool — capacity 4, four real named `Resource` rows already exist in the database. They've simply never been used, because `POOLED` booking creation unconditionally sets `resourceId: null` today, ignoring them entirely. **No "define courts" admin capability needs building for JBC — the data prerequisite is already satisfied.** What's missing is purely the booking-creation logic to use what's already there.

**Real edge case to design for:** if a future pool's `capacity` and real resource count ever diverge (not JBC's case — its 4/4 already align), the assignment should leave `resourceId` null rather than fail — same graceful precedent `courtSlotIndex` already established, not a new invented behavior.

**Consequence for `courtSlotIndex`:** becomes the fallback display, not the primary mechanism, once a real resource is reliably assigned.

**Consequence for F-189** (still genuinely unimplemented, confirmed): its job upgrades from "show the cosmetic `courtSlotIndex` number" to "show the real `Resource.name`, falling back to the cosmetic number only if no real resource could be assigned." Still needs building — this doesn't happen automatically just because the backend can now assign a real resource.

**Consequence for the admin "consolidated dashboard" need** (the original reason this whole question got raised): now achievable without `FIXED_INSTANCE`'s hard-fail tradeoff — real per-court data becomes available through the same graceful `POOLED` booking flow.

**Finding ID: F-205** (corrected from an initial mislabeling as F-203, see the dated correction above). Tracked separately from "Guest Booking Management"'s UI scope — this is booking-core logic in `slot-engine`, not an admin screen, and it touches live JBC pool behavior directly.

---

## 4. How the guest actually learns their court — resolved (30 Aug 2026)

**Question raised:** does the guest need a notification to find out which court they're on?

**Answer: no — display, not notification.** Under the resolved `POOLED` + real-resource-auto-assignment model (§3), the court is known **immediately at booking time**, not resolved later. The natural fix is showing it on the booking confirmation screen and booking history the moment it's known — F-189's job (§3), not a new notification requirement.

**A reminder notification remains a real, separate, complementary idea** — useful for a guest who booked days in advance and might not remember. Already has a home: F-044's own original use case #2 ("guest reminder that their booked slot is approaching") in the parked notification-reminders discovery document, itself gated behind the F-044 Phase B / F-088 blocker chain already documented there. Worth including the real court name in that reminder's content once built — not a prerequisite for the core need.

---

## 5. Branch Timing — real gap, partially already solved (30 Aug 2026)

**The mockup has no "Save Branch Timing" capability anywhere.** Confirmed against real code: `workingDays`/`workingHoursStart`/`workingHoursEnd` **already exist on the branch data** (surfaced earlier this session during `BranchAbout`'s investigation). **The gap is specifically the missing admin UI to edit/save them — not a missing data model.** Smaller task than it first looks; needs including in Guest Booking Management's scope (or wherever branch-level configuration ends up living), not a from-scratch feature.

---

## 6. Slot exhaustion UX — investigated, partially already real (30 Aug 2026)

**Question raised:** what happens when all slots are exhausted at booking time — does the app prompt the next available timing, or gracefully say no more slots?

**Real current state, confirmed by direct code read, not assumed:**
- **Within a day, across time periods** (Morning/Afternoon/Evening tabs): **already real and working** (F-187). If the guest's active tab is empty, they're automatically landed on the first non-empty period — genuine "prompt the next available timing" behavior, already shipped.
- **Across an entire exhausted day**: only a generic message exists today — *"No slots available on this date. Try another date."* **Real gap: no suggestion of which date actually has availability.** The guest has to manually flip through dates themselves. Not a severe gap (a graceful message exists, unlike some of this project's past "silent failure" patterns), but genuinely missing the "prompt the next available timing" behavior at the date level that already exists at the period level.

**Not yet scoped as a finding — flagging the real shape of the gap for whenever this gets picked up:** the fix would need a real "find the next date with availability" query (server-side, likely — scanning forward from the selected date until a non-empty day is found, with some reasonable search-window limit rather than scanning indefinitely), then either auto-navigating the guest there (matching F-187's period-level precedent) or suggesting it as a clickable option in the empty-state message rather than a bare "try another date" instruction.

---

## 7. Slot patterns are not validated against branch operating hours — real gap, not addressed (30 Aug 2026)

**Question raised:** does the system already ensure guest slot patterns stay within the branch's stored operating hours?

**Answer: no, confirmed by direct code read — this is not addressed today.** `patternDataFromBody` (the shared validator for both creating and updating an `AvailabilityPattern`) checks the pattern's own internal consistency — `daysOfWeek` is valid ISO weekday syntax, `startTime`/`endTime`/`slotDurationMinutes` form a whole, valid range via `validateWholeSlotRange`, `capacity` is a positive integer — but has **no `branchId` parameter and no reference anywhere to `Branch.workingHoursStart`/`workingHoursEnd`/`workingDays`.** Confirmed at the endpoint level too: neither `POST` nor `PATCH /resource-pools/:id/availability-patterns` looks up the branch's operating hours at all.

**Real, compounding consequence:** this connects directly to §5's Branch Timing gap. Even once an admin UI exists to *set* a branch's operating hours, nothing today would *enforce* that a slot pattern actually respects them — the two systems are completely independent, in both directions, right now.

**Real shape of the fix, for whenever this is scoped:** `patternDataFromBody` (or the calling endpoints) would need to accept/look up the branch's real operating hours and validate the pattern's `startTime`/`endTime`/`daysOfWeek` fall within them — likely a new, explicit error code (e.g. `PATTERN_OUTSIDE_OPERATING_HOURS`) rather than silently clamping or ignoring the mismatch, matching this project's established "fail closed and explicitly, don't silently guess" discipline elsewhere. Real open question worth deciding when this is picked up: should this validation live in `slot-engine` (which owns pattern creation) calling out to `tenant-management` (which owns `Branch`) for the real hours, or should `tenant-management` pass them down some other way — a real service-boundary design question, not just a validation-logic question.

**Not yet scoped as a finding.**

---

## 8. Module entitlement system — per-tenant, independent, time-bound (30 Aug 2026)

**The product idea:** Guest Booking, Member Management, Student Management, and Tournament are separately-priced, individually-toggleable modules. A customer buys whichever combination they want. For MVP, enabling/disabling is done by the product owner via seeding — no self-service UI. This is genuinely foundational, worked through in full before any implementation, since it affects how every future module (including the slot-configuration screen being built next) gets designed.

**Confirmed: no existing infrastructure to build on.** `Tenant.plan` exists but has zero real enforcement anywhere (checked directly — decorative field only). No module/feature-flag concept exists at all today. This is genuine greenfield design.

### Resolved decisions

**Independence — confirmed, no cross-module dependencies.** Modules are fully independent flags. A tenant can have Tournament alone with no Member Management, and vice versa — deliberately, since e.g. Tournament entry shouldn't require membership. No dependency graph needed in the data model; a flat set of per-module flags is sufficient.

**Scope — per-tenant (whole account), not per-branch.** Confirmed: "which branches does this tournament use" is an operational choice made *inside* the Tournament module once it's enabled (the tenant's own admin picks branches when setting one up), not something the entitlement system itself needs to track. Entitlement flags belong on `Tenant`, not `Branch`.

**Guest Booking is not special-cased.** Confirmed: it's exactly as toggleable as the other three, no "always-on baseline" exception in the entitlement model itself. **Practical note, not a rule-break**: since Guest Booking is the only real, sellable product today, new tenants get seeded with it on in practice — but that's an operational default, not a hardcoded exception in the system's logic. **Known future edge case, explicitly deferred, not designed for now**: a tenant with Guest Booking *off* has no real UI/UX anywhere today, since the whole guest-facing app currently assumes court booking is the point of the product. Not realistic near-term (Tournament/Student aren't real sellable products yet), logged here so it isn't silently assumed to "just work" later.

**Expired/disabled module data — hide, never delete.** Confirmed, with the real business reason stated directly: a customer has to resubscribe to see their own historical data again. Data stays fully intact in the database, completely inaccessible (UI and API both) while disabled, fully restored the instant it's re-enabled. This resolves what could have been a three-state design (hidden/frozen/deleted) down to two: enabled or invisible, nothing in between — genuinely simpler to build.

**Modules are time-bound subscriptions, not simple booleans.** Real expansion during this discussion: a customer can "rent" a module for an agreed period (e.g., Tournament for one month), with a real start and end date — not just an on/off flag. The product owner can also disable early on an edge-case basis. Either path results in the same hide-and-keep state.

**Expiration check: lazy, not a background job.** Confirmed: checked at the moment someone actually tries to use the module (tenant admin login, or a member trying to access something gated) — not proactively swept by a timer. Deliberately avoids depending on the already-blocked scheduler (F-044, waiting on F-088). **Real, load-bearing distinction surfaced during this discussion, worth restating precisely**: lazy-checking is safe for *gating access* (nobody's harmed if the check just sits unevaluated until someone logs in), but is **not** sufficient on its own for *one-time actions that must eventually happen regardless of login activity* (sending an expiry notice, running a purge) — a tenant who never logs in again after lapsing would mean those never fire under pure lazy-checking. This is exactly why the two were split apart in the decisions below rather than both being handled the same way.

**Purge/archival — real deadline defined now, mechanism explicitly deferred post-MVP.** The 90-day retention window is a **fixed system constant** (not negotiated per customer — confirmed, chosen to free up database space), anchored to the **real, actual subscription end date** — a predictable, fixed deadline, not something that drifts based on when someone happens to log back in. **But the actual CSV-export/email/truncation mechanism that acts on that deadline is deferred entirely, post-MVP** — explicitly, since MVP already has notification infrastructure in scope (the parked `discovery-notification-reminders-jbc.md` document, itself gated behind F-044/F-088), and this purge-trigger mechanism can be addressed as part of that same real scheduler work when it eventually gets built, rather than needing its own bespoke solution now. **Nothing about purging needs designing or building for MVP** — only the real end-date being stored and known.

**Payment/ledger records are explicitly excluded from any future purge, regardless of module state.** Confirmed directly: financial records (e.g., `PaymentIntent` rows with `purpose: tournament_entry`) must never be swept up in a data purge tied to module expiration — these need to persist as durable, standalone financial snapshots with no dependency on the module's operational data still existing, not deleted alongside brackets/schedules/registrations just because a subscription lapsed. Real design implication for whenever Tournament/Student modules are actually built: payment records need to be structured so they don't reference module-specific data in a way that would break or dangle if that data were ever purged later.

**Applies uniformly to every module** — Guest Booking, Member Management, Student Management, and Tournament all follow the identical entitlement/expiration/hide-and-keep lifecycle. No module gets bespoke treatment.

### Early disable — a real safeguard, not a silent flip (30 Aug 2026)

**The business/ethical reasoning, stated directly:** once a customer has paid for a module for a period, the product owner disabling it early is a real breach of what was sold — not something that should happen with a casual click.

**Confirmed design:**
- Attempting to disable a module while its subscription is still within its paid period shows an explicit warning — *"an active subscription is in force, are you sure?"* — before proceeding.
- **This warning, and the disable action itself, is Owner-only.** Never surfaced to or actionable by Branch Manager/Admin. Same category of restriction already established for Ledger access — a financial/business decision, not an operational one.
- **Confirming early disable does not jump to hidden.** It moves the module into **read-only** until the *original, already-paid-for* end date is reached — the customer keeps viewing what they paid for; only new commitments (new registrations, new brackets, new writes generally) stop immediately. This deliberately avoids needing to define "when is a tournament truly finished" as its own concept — the paid-through date is already a clean, unambiguous boundary.
- Once the original end date passes, it transitions to hidden-and-kept, same as natural expiry (§8 above).

**Two further real requirements, both about the subscription's date range being editable, not fixed at creation:**
- **Postponement**: the owner can adjust a module's validity period after the fact (e.g., a real-world tournament date moves) — the subscription window is a real, editable value, not locked in at purchase time.
- **Future activation**: a customer can buy a module today for a start date in the future — the entitlement needs its own real `startDate` that can be later than the purchase moment, not just an end date.

**Resulting state machine, derived entirely from comparing `now` against `startDate`/`endDate` plus whether early-disable was triggered — one consistent rule, not a tangle of separate flags:**

| State | Condition | Access |
|---|---|---|
| Not yet started | `now < startDate` | No access |
| Active | `startDate ≤ now ≤ endDate`, no early disable triggered | Full read/write |
| Read-only wind-down | Early disable confirmed by Owner, `now ≤` the original `endDate` | Read-only |
| Hidden | `now > endDate` (reached naturally, or wind-down's original end date arrives) | No access, data intact per the hide-and-keep rule above |

**Confirmed: restoring access after an early disable is just moving `endDate` forward again** — no separate "undo early-disable" action needed. The whole system stays driven by one rule (compare `now` against the real date fields, check whether wind-down was triggered) rather than multiple independent flags that could drift out of sync with each other.

### What's actually in scope for MVP, given all of the above

Real, bounded scope, now that purging/email/CSV are deferred:
1. A per-tenant, per-module entitlement record with a real start date and end date (not just a boolean).
2. **Backend enforcement as the real boundary** — every endpoint belonging to a gated module checks entitlement (module enabled AND within its date range) before proceeding. Never UI-only, same principle already established for the Admin/Manager role tier.
3. **Frontend as a courtesy, not the boundary** — admin-v2's nav conditionally shows/hides module-specific destinations (e.g., "Manage Court Groups" only appears if Member Management is entitled) based on the same real entitlement data, so nobody sees a nav item that just 403s.
4. **Lazy expiration check** at natural access points (tenant admin login, member accessing something gated) — no background job, no scheduler dependency.
5. Hide-and-keep behavior on expiry — data stays, access doesn't, until re-entitled.

**Explicitly deferred, not designed now**: CSV export, automated expiry emails, 90-day purge execution, per-branch module scoping (ruled out entirely, not deferred), any billing/payment integration for module subscriptions themselves (confirmed: this is a flag-and-gate system for now, not a real billing system — actual invoicing happens outside it).

**Real open item still worth deciding whenever this is actually built** (not resolved in this discussion): does the *slot-configuration* screen (the very next piece of work) need to already account for "this admin UI element belongs to a not-yet-entitled module" — i.e., should Guest Booking Management's screen be built with this gating pattern in mind from day one, even though Guest Booking itself is (in practice) always on? I'd lean toward: yes, build the pattern once, correctly, using whichever module gets gated *first* in practice as the real proof — but this hasn't been explicitly confirmed as a requirement for the very next slice, only agreed as the general system-wide principle.

---

## 9. Guest/Member unification — the "Contract" concept (30 Aug 2026)

**Origin:** surfaced as an edge case (a member assignment tied to a specific court colliding with an already-existing guest booking on that court), then deliberately elevated to a root-level design rather than patched around as a one-off. Real, foundational rework of how both Guest availability and Member assignments are modeled — worked through in full before any implementation.

### The core unification

**Guest availability and Member assignments become the same underlying concept — a "Contract" — a period-bound reservation of pool/court capacity for a recurring time pattern, distinguished only by type.** This replaces treating them as two structurally separate systems that happen to occasionally collide. Confirmed: nothing about either is live in production today, so this reframing carries no real operational-disruption risk — it can be built clean from the start rather than retrofitted around an existing live guest pattern.

**Confirmed real schema gap driving this:** `MemberGroupAssignment` today has zero date-bounding fields — only `id, userId, resourcePoolId, daysOfWeek, startTime, status` (`ACTIVE`/`SUSPENDED`), no start or end date at all (verified directly against `schema.prisma:333-348`). This whole discussion is real, new schema work, not a validation tweak on something that already exists.

### Term length — type-specific, not one universal rule

- **Guest contracts**: capped to one month, renewable. Reflects genuinely variable, short-term demand.
- **Member contracts**: **fixed presets — monthly, quarterly, or yearly.** Not a free-form date-range picker. A member wanting a non-standard duration is accommodated by *composing* from these presets — the admin either creates a second, separate allocation, or extends an existing allocation's end date — rather than the system needing to support arbitrary custom lengths as a first-class option.

**Real, important clarification, confirmed precisely:** the guest month-cap applies to the **admin's availability definition** (the recurring pattern itself — "this pool is open to the general guest market for the next month") — **not** to how many individual bookings a single guest can make within that window. An individual guest can still book as many times as they want against open availability, governed entirely by the existing, separate rule (F-184's daily booking cap) — this Contract concept doesn't touch that at all. "Contract" is purely an admin-side allocation concept; guest booking *behavior* keeps working exactly as it already does today.

### Priority — hierarchical, not symmetric

**Member contracts always take precedence over Guest contracts. No warning is needed in the guest-overriding-member direction, because it should never be possible in the first place** — guest-facing availability should simply never show a slot a Member contract already legitimately holds as open. This is a real, deliberate business decision, not a technical default: membership is fixed, committed income the business already has ("selected on his convenience"), and displacing it would cause real disruption to someone who made a longer-term commitment — guest demand, being fully variable, is the side that flexes.

**Consequence for the relocate/cancel mechanics already agreed:** when a new Member contract is created and it collides with existing guest bookings, the system attempts to relocate each displaced guest to a different available court at the same time first; only guests who genuinely can't be relocated (every court full at that time) get cancelled with a full, unconditional refund (via the existing `POST /refunds/override` audit path, reason code distinct from a guest's own cancellation, always 100% regardless of the tenant's normal tiered cancellation policy — the guest did nothing wrong here).

**Confirmation still shown to the admin before this happens, even though it's policy rather than an exception** — not framed as "are you sure you want to override," but as real, concrete specifics: *"creating this will relocate 2 guest bookings and cancel-and-refund 1 that couldn't be relocated."* Real money and real people are affected either way; visibility before it happens is worth keeping regardless of whether the action itself needs permission or not.

### What's explicitly parked, not lost

**All notification/reminder mechanics for this system — contract-expiry reminders (a week before month-end, "renew or let it lapse"), the renewal action mechanics, what happens on admin silence — are deliberately parked.** These are proactive, scheduled checks, the same class of thing already blocked on F-044 Phase B / F-088 in the existing parked notifications document. **Explicit decision: notifications get picked up once Guest and Member flows are real and built, not before.** The specific sub-questions raised during this discussion (single-tap renew vs. manual, does silence mean lapse, per-group vs. blanket decisions) remain genuinely open and should be re-raised when that work is picked back up — not assumed resolved just because the broader topic got parked.

**One real timeline consideration flagged during this discussion, not yet committed to:** given a 6-week goal to show the upgraded PWAs and given nothing is live in production yet, F-088's original risk profile (built around protecting real, live customer booking data) may be genuinely lighter than originally scoped — UAT data can be reset as part of testing the fix itself. This is a real, honest de-risking worth a fresh investigation pass before committing F-088/F-044 Phase B into the near-term plan, not something to assume resolved by this observation alone.

### Real open item for whenever this is actually built

**Whether "Contract" becomes a literal, single shared database table that both Guest and Member scheduling funnel through, or whether `AvailabilityPattern` and `MemberGroupAssignment` each simply gain their own type-appropriate start/end date fields and shared validation rules without a literal unified table** is a real implementation-level design question, not resolved in this discussion — the *conceptual* unification (same lifecycle rules, same priority model, same relocate/cancel mechanics) doesn't necessarily mandate one physical table. Worth a real investigation pass, not assumed either way.

---

## 10. Court maintenance blocking — resolved (30 Aug 2026)

**Origin:** the owner currently handles court maintenance (planned or ad-hoc/emergency) by manually sending WhatsApp messages to affected guests. Real admin capability needed: block a court, relocate or refund whoever's affected, notify them — replacing the manual process.

**No new schema needed.** `BlockedWindow` already exists and fits precisely — `resourcePoolId`, `resourceId` (nullable — can target one specific court or the whole pool), real `startTime`/`endTime` as a specific one-off window (not a recurring pattern), and a `reason` field. Confirmed directly against `schema.prisma:313-324`. The real work is entirely the admin UI and the workflow around bookings that already exist in the blocked window — not the block mechanism itself.

**Resolved flow, in order:**
1. Admin sets up a block (court, time range, reason).
2. **Before it's confirmed, a real, computed impact preview is shown** — e.g., *"this will relocate 3 bookings automatically; 10 cannot be relocated and will need cancellation."* Admin can back out and reconsider (fewer hours, a different court, a different day) if the impact is larger than expected, rather than discovering it after the fact.
3. On confirmation, the block takes effect immediately and relocatable bookings are moved automatically — same relocate-first mechanic already established in §9, reused here rather than invented fresh.
4. Bookings that couldn't be relocated land in a **"Needs Attention"** filtered view, inside the booking-management tab (§ scope split, not a new screen).
5. **Refund is a separate, manual, admin-initiated action** — the admin reviews the Needs Attention list and triggers each refund (or in bulk) when ready, never automatically just because the block was confirmed. Deliberate: maintenance and emergencies are often things the admin wants to handle personally — e.g., offering a guest a reschedule by phone before defaulting to a refund — and automatic refunding would remove that judgment call.

**Notifications — immediate, action-triggered, already buildable now, no new blocker.** Notifying a guest the moment they're relocated, or the moment a refund is triggered, reuses the same synchronous `POST /notifications/send` pattern already confirmed real and in use elsewhere in `slot-engine`/`payment` — unlike the scheduled-reminder work (parked, blocked on F-044/F-088), this doesn't wait on anything.

**Dated correction, made mid-discussion, logged rather than silently smoothed over:** the flow was initially proposed as "block takes effect immediately, no gate, impact only surfaces afterward via Needs Attention" — reasoning that an emergency (e.g., flooding) shouldn't wait on a review step. **This was wrong for the case that matters most**: a large-impact block (e.g., cancelling 10 real bookings) should be visible *before* the admin commits, not discovered after it's already done. Corrected to the impact-preview-gate shape above. The preview computation itself is fast (a real-time query against existing bookings, not a manual review process), so this correction doesn't actually reintroduce the urgency problem the original (wrong) proposal was trying to avoid — an admin dealing with a real emergency can still act in seconds, just with the real cost visible first.

---

## 11. Guest vs. Member pricing — two genuinely separate cost models (30 Aug 2026)

**Real decision, resolving an ambiguity from earlier discussion:** member and guest pricing are not the same axis with different numbers — they're structurally different. Guests pay per-session, resolved fresh each booking (already fully supported — `AvailabilityPattern`/`AvailabilityWindow`/`AvailabilityOverride` all already carry their own `pricingMode`/`price` overrides, confirmed directly against schema; peak-vs-normal time-based tiering needs no new backend work at all, purely an admin UI gap). **Members pay a real subscription fee for the whole Contract term** (monthly/quarterly/yearly, per §9) — not resolved per individual daily session.

**This finally resolves F-109's gap**, flagged much earlier this session as *"`Subscription` has no due date, no billing-period anchor... needs a real billing-model decision before this becomes a screen."* That decision is now made: real, term-based subscription billing, reusing `Subscription` + `PaymentIntent` (`purpose: subscription_billing`, already a real, defined value in schema) rather than inventing new payment infrastructure.

**Real consequence for `ensureTodayMemberBooking`**: it currently stamps `resolvePrice()`'s output onto every daily booking a member generates. Once membership is a term-level fee, the daily `Booking` row still needs to exist (attendance, occupancy, court assignment all still need it) — but it shouldn't carry its own per-session price anymore. The money already moved once, at the Contract level.

### Registration flow, resolved

**Admin registers a member with a real, itemized breakdown, not one flat total** — registration fee, a **refundable deposit** (its own distinct field, not folded into a combined number), and the monthly/term fee. **Real reason for splitting the deposit out specifically**: it's the only one of the three with an obligation attached — it has to be given back when a member terminates. A single combined total would lose that distinction permanently, leaving no real number to refund against later, only memory.

**Payment collection reuses two already-established patterns, nothing new invented:**
- **Online**: the same Razorpay checkout guests already use, tagged with `purpose: subscription_billing` instead of `guest_booking`.
- **Cash or static QR, in person**: exactly **F-204's already-specified pattern** — mode (`cash`/`upi`) + reference number, admin manually marks it paid after collecting. Confirms F-204's design as a genuinely reusable mechanism, not a one-off built only for walk-in guest bookings.

**Where the member actually sees and pays their amount due is a real, new screen — but it lives in `guest-member-pwa` (or its eventual v2), not admin-v2.** Explicitly out of scope for the admin-side work being designed in this document.

**Real, forward-looking payoff of splitting out the deposit**: it directly enables **automated refund calculation on member termination** — since the deposit is now a distinct, known number rather than buried in a combined total, ending a membership can surface a real, pre-calculated refund amount for the admin to review and trigger (same admin-initiated pattern already established throughout this document — the system calculates and shows the real number, a human confirms the actual money movement, never fully automatic).

### Real open items, not yet resolved

- Does term length carry its own pricing logic (e.g., yearly costs less than 12× the monthly rate as a loyalty incentive), or is it always a flat multiple of the base rate?
- Is the membership fee ever time-tiered the way guest pricing is (a "peak hours" membership costing more than an "off-peak only" one), or one flat rate per member regardless of which hours their Contract actually uses?
- The real mechanics of "member termination" itself — what triggers it (admin action, non-renewal per §9's expiry flow, something else), and how the deposit-refund calculation and trigger actually surface to the admin — not yet designed.

---

## 12. Final closure — Guest and Member flows, admin-side and PWA-side (30 Aug 2026)

**All six previously-blocking items resolved.** This closes out the core design ambiguity for both admin-v2's Guest/Member management and the guest/member-facing PWA — genuinely more resolved than the original V1 build ever was, per direct comparison.

1. **§9 Contract renewal**: confirmed — extend the same `MemberGroupAssignment` row, push `endDate` forward. No new row per term, no change needed to the existing `@@unique([userId, resourcePoolId])` constraint. Real renewal history lives in `Subscription`/`PaymentIntent`, not duplicated in the Contract row itself.

2. **§11 term-length pricing**: the flat-multiple calculation (12× monthly for yearly, etc.) is a **starting default the admin can override** — not a rigid formula. Matches the same override pattern already established for guest peak/normal pricing. Real-world discounting for longer commitments is normal business practice; the system suggests, the admin decides.

3. **Member termination**: **simplified from the original proposal — termination does not automatically touch court availability at all.** No auto-release logic. Admin sees real usage via a weekly dashboard view and manually decides whether to reopen that time to guests. Termination itself: admin marks the member terminated, reviews the pre-calculated refundable deposit (from §11's split-out field), and triggers the refund manually via the existing refund-override path. Smaller, simpler scope than originally drafted — deliberately not building automatic logic nobody has asked for yet.

4. **F-189 (real court on confirmation/history)**: confirmed as scoped in the detailed drill-down above — small backend change (`resource: true` added to two existing `include` blocks), the real work is front-end display, with `courtSlotIndex` as fallback only when no real resource was assigned.

5. **§6 slot-exhaustion date fix**: confirmed — 14-day forward search window, auto-navigate to the next available date (matching F-187's existing low-friction period-auto-advance pattern), falling back to the current generic message only if nothing is found within that window.

6. **F-205 (POOLED + automatic real-court assignment)**: confirmed as scoped in the detailed drill-down above — the booking-creation transaction gains a non-blocking lookup of the pool's real, already-existing `Resource` rows, replacing the hardcoded `resourceId: null`. This is the foundation both item 4 and the admin's real per-court dashboard visibility depend on.

**Status: discovery for the core Guest and Member flows — admin-side (entitlement, Contract, pricing, court-blocking, termination) and PWA-side (court display, slot-exhaustion UX) — is functionally complete.** Ready to move from discovery into real, Chief-assigned findings and plan-mode documents for implementation.

### What remains deliberately parked, not unresolved

- All notification/reminder mechanics (§8, §9) — tied to F-044/F-088, picked up once Guest and Member flows are actually built and real usage exists to inform them.
- F-088/F-044's real current risk profile given nothing is live in production — flagged as worth a fresh investigation pass before committing to a near-term timeline.
- §7 branch-operating-hours validation on slot patterns — real gap, but no admin has hit it yet in practice.
- §8 Q7 (invisible vs. locked UI for a not-yet-entitled module) and the "does Guest Booking Management need the gating pattern built in now" question — no second module exists yet to make this concrete against.
- The mockup's "SYSTEM PREVIEW" dev-tool bar (§1) — trivial, excluded by default, resolve whenever convenient.

---

## 13. Tenant-specific payment routing — Razorpay Route (30 Aug 2026)

**Real business requirement:** tenants should receive their guest/member payments directly, not into Slotflow's single shared account. **Confirmed: no Slotflow commission** — the split is 100% to the tenant, 0% retained. Slotflow's entire revenue is the module subscription fees (§8), a completely separate payment relationship from guest/member money.

**Confirmed current state, no tenant-awareness at all:** `services/payment/src/index.ts` initializes exactly one global `razorpayClient` at module load, from a single `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` pair — every tenant's payments flow through the same account today.

**Real, purpose-built solution exists and fits precisely: Razorpay Route.** Confirmed against Razorpay's current documentation, not assumed. Each tenant becomes a **Linked Account** under Slotflow's own Razorpay account — genuinely simpler than each tenant needing their own fully independent merchant account. Razorpay handles the compliance/regulatory complexity; Slotflow just creates and manages the linked accounts.

**Real technical shape:**
- `Tenant` gains a new field — `razorpayAccountId` (the Linked Account ID Razorpay assigns), nullable until a tenant completes onboarding.
- **The Razorpay client itself stays single and global** — confirmed from Razorpay's own docs, one Route-enabled account routes to all tenants' linked accounts via account IDs. No per-tenant credential storage or switching needed.
- Order/payment creation gains a `transfers` array specifying the split — confirmed this can be set at order-creation time, attaching cleanly to the existing payment-creation flow rather than needing a separate reconciliation step. Given no commission, the transfer is simply 100% to the tenant's linked account.
- Webhooks for the original payment capture stay unchanged. A settlement/transfer webhook could be added later for visibility into whether a tenant's split actually landed — not blocking for MVP.

**Two real things worth being explicit about, not assumed:**
- **Razorpay's own gateway processing fee is separate from "no commission."** Whatever Razorpay itself charges per transaction still applies regardless — it comes out of what settles to the tenant, not something Slotflow is choosing to take. "No commission" means Slotflow takes nothing extra, not that the tenant receives the booking amount with zero deductions from any source.
- **Real transition gap for tenants that predate this feature.** JBC's payments today land in Slotflow's single shared account (the only one that exists). Once Route is live, JBC (and any other existing tenant) needs to actually complete Linked Account onboarding before their bookings correctly route to them — otherwise money keeps landing in Slotflow's account by default, silently. Needs a real, deliberate one-time step for JBC specifically, not just handled going forward for new customers.

**Onboarding scope, matching §2's existing decision:** given tenant onboarding is already seeding-only for MVP (no self-service UI), Linked Account creation follows the same pattern — done manually (via Razorpay's own dashboard or API, collecting real business/bank details directly), with the resulting `razorpayAccountId` stored against the `Tenant` row. No admin-v2 UI needed for this at MVP.

**Member subscription fees (§11) and guest booking fees both route through this same mechanism** — both are the tenant's own revenue. Slotflow's own module-entitlement fees (§8) are the opposite direction (tenant paying Slotflow) and are not a Route concern at all — a normal, direct payment into Slotflow's own account, no splitting involved.

---

## 14. Technical debt — VM image retention (30 Aug 2026)

**Real, concrete gap, connects directly to a real incident already logged during admin-v2 Slice 1's production deploy** (`promote.sh` failed mid-pull with the disk full — 14.38GB of accumulated build cache, cleared via `docker builder prune -af`, confirmed not to touch the `gcp-vm-*:rollback` safety-net images).

**The broader version of the same problem, not yet addressed:** F-193's tagging strategy pushes both a movable `:service` tag and an immutable `:service-<sha>` tag on every build, specifically so a rollback can pull an exact prior version. `promote.sh` pulls whatever tag it's given to the VM — but **nothing currently removes older, no-longer-needed images from the VM after a successful deploy**, so every historical release's image plausibly accumulates indefinitely, the same disk-pressure problem that already caused a real deploy failure, just from a different source (pulled release images rather than local build cache).

**Real design question, not yet resolved:** how many past images should the VM actually keep? Keeping only the current release risks losing the ability to `--rollback` quickly if a problem surfaces right after a deploy (the explicit reason immutable per-SHA tags exist at all). Keeping every release ever pushed guarantees the same disk-full failure recurs. A reasonable middle ground — current + N most recent (e.g., current + 1 or 2 prior, enough for a real rollback window without unbounded growth) — needs a real decision, not an assumption.

**Not yet scoped as a finding or investigated further** — flagged here so it isn't lost, given it already caused one real deploy failure and will recur.

---

## Log of open items, not yet resolved

**Resolved by §12's closure (30 Aug 2026)**: §9's renewal mechanics, §11's term-pricing and time-tiering questions, member termination mechanics, F-189's scope, §6's slot-exhaustion fix, and F-205's implementation shape are all now settled — see §12 for the final decisions. Struck from this list; no longer open.

**Genuinely still open, all deliberately parked (see §12 for why each is safe to leave parked for now):**
- All notification/reminder mechanics — tied to F-044/F-088.
- F-088/F-044's real risk profile given nothing is live in production — worth a fresh investigation pass before committing to a timeline.
- §7 branch-operating-hours validation on slot patterns.
- §8 Q7 (invisible vs. locked UI for a not-yet-entitled module) and whether Guest Booking Management needs the entitlement-gating pattern built in now.
- §1's "SYSTEM PREVIEW" dev-tool bar — trivial, resolve whenever.
- §13's Linked Account onboarding mechanics for JBC specifically — real, one-time transition step, not yet scheduled.
- §14's VM image-retention policy — real technical debt, already caused one deploy failure, real "how many past releases to keep" decision not yet made.

**Not yet started, real next step**: consolidating everything in this document into real, Chief-assigned finding IDs and plan-mode documents for Technical Lead handover — this document has been discovery only throughout; nothing here has a finding ID, a register row, or implementation authorization yet.

*(Further product-thinking ideas append below this line as they come up — do not renumber or rewrite existing sections above.)*
