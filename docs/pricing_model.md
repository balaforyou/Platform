# Pricing Model — Badminton White-Label Platform (v1)

**Status:** Core structure decided 26 Jul 2026. Exact rupee figures marked as drafts are starting points, not final — refine against real Coimbatore market feedback once the first pipeline customers are being priced.
**Related docs:** `badminton_app_discovery_brief.md`, `tenant_whitelabel_management_api_spec.md`, `tech_stack_architecture.md`

---

## 1. Why subscription, not commission

Charging tenants a per-booking commission would reintroduce the exact complaint that started this whole project — a facility owner resenting a third party taking a cut of every booking. A flat subscription (the standard model across comparable Indian sports/club-facility software) avoids that, and gives predictable revenue instead of revenue that fluctuates with each tenant's booking volume.

## 2. Subscription tiers — by court count

Tiered by court count rather than branch count, since court count is what actually drives system load and support burden.

| Tier | Court range | Draft monthly price |
|---|---|---|
| Starter | 1–4 courts | ₹1,999–2,499 |
| Growth | 5–12 courts | ₹4,499–5,999 |
| Pro | 13+ courts | ₹7,999+ or custom quote |

## 3. Premium add-ons

| Add-on | Model | Draft price |
|---|---|---|
| Student attendance | Flat monthly, on top of base subscription | ₹999–1,499/month |
| Tournament hosting | Per-tournament fee — episodic usage doesn't fit a flat monthly charge | ₹1,499–2,999 per tournament hosted |

## 4. Onboarding fee

One-time, tiered by the same court-count bands (more courts = more setup/configuration/training work):

| Tier | Draft one-time onboarding fee |
|---|---|
| Starter (1–4 courts) | ₹2,000–3,000 |
| Growth (5–12 courts) | ₹4,000–5,000 |
| Pro (13+ courts) | ₹6,000–8,000 |

**Pipeline batch of 20:** discounted (not fully waived) — exact discount percentage still to be set, but this reflects that these customers arrive through the badminton owner's own network/relationship, distinct from a cold-acquired customer.

## 5. Pass-through costs

| Cost | Handling |
|---|---|
| Payment gateway fees (Razorpay, ~2-2.75% of transaction volume) | Always pass-through, clearly itemized — proportional to each tenant's own revenue, not a cost that can be sensibly bundled into a flat subscription |
| SMS (MSG91) | Bundled monthly quota per tier, overage billed separately — keeps the predictable cost simple while the genuinely variable one (payment fees) stays itemized |

SMS quota per tier still needs a concrete number (e.g. Starter: X SMS/month included) — reasonable to set once real usage patterns from the first live tenant are known, rather than guessing now.

## 6. Billing cadence

Monthly billing as the default (lower commitment friction for a first-time SaaS customer), with an **annual option at a ~15-20% discount** as an upsell — not a replacement for monthly.

## 7. Still to finalize

- Exact rupee figures within each drafted range, once validated against the Coimbatore market (the owner's own read on local willingness-to-pay matters more here than the gym-software benchmark this was drafted from)
- Exact pipeline-batch onboarding discount percentage
- SMS quota per tier
- Whether Growth/Pro tier pricing needs further sub-banding once real customers span a wider court-count range than expected

---
*This pricing model applies to the badminton platform only — the driver-rental app (separate business/owner) would need its own pricing discussion once that discovery moves forward.*
