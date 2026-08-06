# Conversation Handoff — Badminton Platform Project (31 Jul 2026)

**Why this exists:** the previous conversation hit Claude.ai's 100-image limit (80/100) after an image-heavy Admin Web review. Paste this into a new chat to continue seamlessly.

## Reference docs (all in `Platform/docs/`) — read these first in the new chat
- `coding_assistant_handover_plan.md` — working agreement: comments, plan-before-code, **sign-off required before any commit** (rule 6), **Technical Design section required in every plan** (rule 7, with standing edge-case categories), **walkthroughs must show real evidence not summaries** (rule 8)
- `findings_register.md` — the running log of every gap/bug found and resolved, with real evidence for each
- `mvp_retrofit_plan.md` — overall MVP sequencing
- `admin_web_phase_plan.md` — the Admin Web phase's full approved plan

## Overall project status
All of Basic-tier MVP is built and functionally verified: 5 backend services (Slot Engine, Identity, Tenant, Payment, Notification), guest-member PWA (booking flow, Razorpay real payment confirmed end-to-end), and Admin Web (all 6 screens: Overview, Resources, Assignments, Low Occupancy, Negotiated, Refunds) — all through Steps 1-4 of the Admin Web phase, fully committed.

## Active thread right now: Admin Web polish round, based on real manual testing (post Step 4)

This is a lightweight, screen-by-screen fix cycle from the user actually clicking through the app — not a new formal phase. Status:

**Resolved (confirmed with real screenshots):**
- Refunds: phone input `maxLength` added; empty-state now hides Override amount/Reason/Issue-override entirely when no refundable booking is found (was previously showing active but contextless controls)
- Assignments: heading renamed "Create Assignment" → "Assign Member to Recurring Slot" (was ambiguous vs. guest booking); native `<input type="time">` clock replaced with a tappable time-slot grid (same component pattern as Negotiated's availability-window selector), populated only with valid boundary-aligned times — closes a real UI gap in F-010 (backend correctly rejected unaligned times, but nothing stopped an admin from picking one)

**In progress / just requested, not yet confirmed:**
- Collapse the Branch/Resource-pool dropdowns into a compact summary line once both are selected (e.g. "Peelamedu Shuttle Hub → Peelamedu Evening Courts, change") on the Assignments screen, to reduce page scroll length — requested, not yet implemented or verified. Open question: should this same treatment also apply to Negotiated's branch/pool/date selection for consistency? Not yet decided.

**Not yet addressed at all:**
- "The Resource tags are not still proper" — flagged by the user early in this polish round (4th of 4 original screenshots), never actually gotten to. Needs the actual screenshot re-shared and diagnosed fresh in the new chat.

## Findings register — current open items (not blocking, just tracked)
- F-002: PWA install-prompt 7-day dismissal — deferred to Playwright, may already be covered, worth a quick check
- F-003: iOS install banner never confirmed on a real iPhone (only Chrome emulation) — still deferred, no iPhone available yet
- F-004: production routing (Firebase Hosting rewrites, Cloud Run ingress) — parked, never formally decided
- F-005: low-occupancy alert default threshold percentage — mechanism built, but the actual default value (e.g. 50%) still needs a business decision
- F-017: all Admin Web screens live in one large `apps/admin-web/src/main.tsx` file (unlike guest PWA's one-file-per-screen convention) — not urgent, but worth splitting before the file grows further

## Standing practices to carry forward in the new chat
1. Never let the agent edit `docs/findings_register.md` or other shared reference docs directly — only report findings back for the user/reviewer to log
2. Every commit needs an explicit "commit it" from the user first — a passing test or completed walkthrough is not sign-off
3. Every walkthrough needs real evidence (actual code, actual request/response data, real screenshots, explicit before/after for fixes) — not a summary of intent
4. Real device/browser checks (not just automated screenshots) are done by the user personally for anything UI-facing, following the same pattern used throughout this whole project

## Immediate next step in the new chat
Continue the Admin Web polish round: (1) get confirmation/screenshot of the collapsible branch/pool fix on Assignments, decide whether to extend it to Negotiated, (2) get the Resource-tags screenshot re-shared and diagnose that issue, which was never actually looked at.
