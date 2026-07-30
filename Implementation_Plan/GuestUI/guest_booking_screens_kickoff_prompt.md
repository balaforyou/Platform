Read docs/coding_assistant_handover_plan.md, docs/guest_booking_crosscheck.md, docs/badminton_booking_flow.drawio, docs/badminton_app_discovery_brief.md (Sections 6.4, 6.6, 6.7, 6.10, 6.11, 6.13), docs/frontend_stack_architecture.md, docs/api_standards_cross_cutting.md, and docs/findings_register.md before planning anything. Check the findings register specifically for anything currently open that this phase might touch — there's at least one item (F-002) that should be picked up as part of this phase's scope, not treated as separate.

All backend services (including Phase 9's batch additions — pricing modes, occupancy, branch listing, working hours) are complete and approved. The PWA shell, shared package extraction, and installability are complete and approved. This phase builds the actual guest booking flow — the single biggest remaining gap in the whole platform — plus sets up Playwright as the project's real automated E2E testing tool, not just unit-level checks.

Same working agreement as every previous phase — comments on non-trivial logic, flag trade-offs explicitly, stop and ask on anything the docs don't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

## Scope — the guest journey (Basic tier, predefined-slot self-service path only)

This is the "Path A" flow from the flow diagram — not negotiated bookings (admin-initiated) or ad-hoc guest release (also admin-initiated), which stay out of scope here.

1. **Branch selection screen** — was Finding A in the cross-check, still not built
2. **Browse courts at a branch** — now backed by `GET /branches/:id/resource-pools` (Finding B, closed in Phase 9)
3. **View availability & select a slot** — existing endpoint from Phase 1
4. **Add co-players by phone number** (group booking) — existing `BookingPlayer` model from Phase 2
5. **Price display — this needs to be correct, not just present.** Since pricing mode (flat vs. per-person) is chosen per release and resolved server-side (Phase 9), the UI must show the right price *before* payment: flat shows one number regardless of group size; per-person must recompute visibly as players are added or removed. The server remains authoritative at booking-creation time regardless of what the UI displays — but a UI that shows the wrong number before charging the right one is still a bad, confusing experience worth avoiding.
6. **Create the hold** (`POST /bookings`) — existing endpoint, includes group size validation against the pool's min/max
7. **Payment — Razorpay Standard Checkout SDK.** Per the earlier resolved findings: use the SDK to trigger UPI Intent, use its client-side success callback for immediate optimistic UI feedback, but the booking's actual `confirmed` status only ever changes via the signed webhook — the callback never directly flips booking state client-side.
8. **Booking confirmation screen**
9. **Self-serve check-in** ("I'm here" button) — reuses the pattern already built for the member/guest attendance flow
10. **Guest cancellation flow** — show the actual computed tiered refund amount *before* the guest confirms cancellation (a preview-then-confirm step), not a surprise after the fact. Uses the existing tiered calculation from Payment/Slot Engine.
11. **Branch "About" page** — dedicated page, not a persistent banner, per Section 6.13 — now backed by `GET /branches/:id/about` (Phase 9)

## Playwright setup — new, first-class part of this phase's scope

Given this project's specific history — API-level scripts have repeatedly failed to catch real frontend bugs (the blank-screen incident, the stale-JWT incident, the extraction-regression risk) — Playwright tests for this phase must render real pages and interact with the real DOM (`page.click`, `page.fill`, `expect(page).toHaveURL`, etc.), not just call APIs directly dressed up as browser tests. That would just recreate the exact blind spot that's caused problems before.

- Set up Playwright in the monorepo, scoped to `apps/guest-member-pwa`
- Write E2E coverage for the full flow above: branch select → browse → slot select → add players → pay (mock Razorpay in test mode, this is fine for CI) → confirmed → cancel with refund preview
- **Also add here:** the dismissal-expiry test for the PWA install prompt (findings register F-002) — this was specifically deferred to "when Playwright exists," and that's now. Don't let it get forgotten a second time.

## Real-device checkpoint — Playwright doesn't replace this, it complements it

Given the actual UPI Intent redirect-and-return behavior (leaving the browser, opening a real UPI app, returning) is inherently hard to fully automate and is exactly the category of thing that's broken silently before on this project, this phase's sign-off requires **both**:
1. Full Playwright suite passing (mocked payment, CI-friendly)
2. At least one real manual device pass through the entire flow, using Razorpay's actual test-mode keys — genuinely leaving the browser for a UPI app and returning, not simulated

I will do the real-device pass myself, same as every prior frontend phase — provide the tunnel URL and real test-mode payment credentials/instructions in your walkthrough.

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
