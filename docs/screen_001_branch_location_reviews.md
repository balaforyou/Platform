# SCREEN-001 — Branch Location & Reviews

**App:** guest-member-pwa
**Component:** `apps/guest-member-pwa/src/components/BranchAbout.tsx`
**Route:** `/branches/:branchId/about`
**Linked Flow:** `FLOW-018` — View Branch About
**Linked Capability:** `CAP-003` — Branch Management
**Status:** Frozen (retroactively — see process note)
**Version:** v3 — 15 Aug 2026 (v2 corrected at freeze against the real implementation)

**Process note.** This screen was implemented before this entry was formally frozen, because of the
demo deadline. This version documents what was actually built and verified end to end, rather than
a design that preceded the build. The deviation is real and recorded deliberately rather than
presented as if the process ran in its intended order.

**Corrections applied at freeze (v2 → v3).** The v2 draft was checked line by line against the
shipped component and the RE catalogue. Three claims did not survive that check and were corrected
rather than frozen as written — the point of an honest record being that it is accurate, not that
it is unedited:

1. **v2 stated this was new functionality outside the RE-003 catalogue, needing a new `FLOW-` ID,
   and had no clean `CAP-` fit.** Neither holds. `FLOW-018` already exists and names this exact
   component *and* `GET /branches/:id/about` as its executable entry evidence, under `CAP-003`. This
   work **extended** an existing flow — new fields on its endpoint, new actions on its component —
   rather than creating a new one. No new identity is required.
2. **v2 listed Branch Name as a displayed field.** The component never reads `aboutData.name`; the
   hero heading is the static string "About the Venue". The `name` field does exist on this endpoint,
   but it was added for **F-102** and is consumed by `BookingConfirmation`, not shown here. The row
   was removed.
3. **v2 marked Address as required.** `Branch.address` is nullable and the component renders it
   conditionally, and v2's own copy-freeze note treated "branch with no address" as a real-but-
   untested scenario — the two statements contradicted each other. Address is optional and
   conditionally rendered, exactly like the two links.

**Related findings closed via this screen's implementation:** **F-099** — the pre-existing dead
address block on this exact component, which had rendered nothing since the component was built
because the endpoint never returned an `address` key. Fixed as a byproduct of adding the new fields.

---

## Purpose

Let a guest see a branch's real-world address, get directions to it, and leave a Google review —
without leaving the app's context entirely. Deep-links out; deliberately does not try to replicate
Maps in-app.

## Field inventory — as actually implemented and verified

| Field | Source | Editable? | Type | Validation | When absent | Required? |
|---|---|---|---|---|---|---|
| Address | `Branch.address` | No (guest-facing) | Text | — | Block not rendered | No |
| Directions link | `Branch.latitude` / `Branch.longitude` | No | URL, generated | Finite-number check on **both** coordinates — deliberately not a truthiness check, since `0` is a valid coordinate (lat 0 / lng 0 is a real point in the Gulf of Guinea) | **Button hidden entirely** | No |
| Review link | `Branch.googlePlaceId` | No | URL, generated | Presence check | **Button hidden entirely** | No |

Nothing on this screen is guest-editable. All three values are set through the tenant-management
API — there is no admin UI for them, consistent with **F-098**.

**Confirmed by real negative-case testing:** a branch with no coordinates and no Place ID
(`Coimbatore Main Arena`) renders its address normally with both buttons **genuinely absent from the
DOM** — not disabled, not greyed out, not rendering a broken link. No `undefined` or `null` appeared
in any href on the page.

## Screen-level states

| State | Trigger | What's shown |
|---|---|---|
| Loading | Branch data fetching | Standard spinner, consistent with the app's other screens |
| Populated — full | Address, both coordinates and Place ID all present | Address text, both buttons active |
| Populated — partial | Any of address / coordinates / Place ID missing | Whatever is present renders; each missing element simply does not render — not disabled-and-greyed |
| Error | Branch fetch failed | Standard error state, consistent with the app's other screens |

The partial state is broader than "coordinates or Place ID missing": **address itself can be
absent**, since it is nullable and conditionally rendered. Each of the three elements is gated
independently on its own data.

## Actions

| Action | Trigger | Target | Success | Failure |
|---|---|---|---|---|
| Get Directions | Tap | `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` | Google Maps opens with directions | N/A — external link, no app-side failure state |
| Leave a Review | Tap | `https://search.google.com/local/writereview?placeid={id}` | Google review form opens for that business | N/A — external link |

Both open in a new tab with `target="_blank" rel="noopener noreferrer"`.

## Copy freeze — as shipped

1. **"Get Directions"** — final.
2. **"Leave a Review"** — final.
3. **Branch with no address at all** — not a real scenario today (both JBC branches and every seeded
   branch carry an address). The code path exists and simply omits the block, but it has **not been
   exercised in a real browser**. Recorded as an untested edge case rather than assumed handled.

## Decisions — resolved through implementation, recorded for the trail

1. **Placement.** `BranchAbout.tsx` only, reached from `BranchDashboard`'s "View About" button.
   Deliberately not added to `BranchDashboard` or `BranchSelect` for v1 — narrowest viable surface,
   expandable later. `BranchSelect` already shows each branch's address independently via
   `GET /tenants/:id/branches`, which returns whole rows.
2. **Partial data.** Each button renders independently on its own field's presence, not gated on both
   being present. A branch with coordinates but no Place ID shows Directions only, and vice versa.
3. **Coordinates stored, not derived from the Place ID.** Deriving would require a Google Places
   lookup — an API key, billing, and a network failure mode sitting on the guest path — to recover
   two values already held.

## Verification evidence

Real browser, real OTP login, real tenant resolution under JBC branding:

- **Two distinct real branches**, hrefs asserted on **exact and different** coordinates and Place IDs
  per branch — the wrong-branch-wiring check, which a "both buttons render" assertion would miss.
- **Negative case**: branch with no location data renders cleanly, both buttons absent, no broken or
  `undefined` hrefs anywhere on the page.
- **F-099 before/after**: the address block on this screen previously rendered nothing; it now shows
  the branch address.
- `target="_blank" rel="noopener noreferrer"` confirmed on both links.
- Reached as part of a full end-to-end walkthrough — login → branch picker → this screen → booking →
  payment → confirmation — rather than in isolation.

## Known gaps

- **No admin UI** for address, coordinates or Place ID (**F-098**). These are set by internal-key API
  call via `scripts/provision-tenant.mjs`.
- **Branch-with-no-address path untested** in a real browser (copy freeze item 3).
- **`FLOW-018`'s RE-003 entry now under-describes the flow** — its endpoint gained `address`,
  `latitude`, `longitude`, `googlePlaceId` and `name`, and its component gained two outbound actions.
  RE-003 is deliberately left unedited: the RE documents are a read-only reconstruction baseline, and
  this screen doc is the record of the divergence.

## Sign-off

- Reviewed by: real end-to-end walkthrough, 15 Aug 2026
- Frozen: 15 Aug 2026 (retroactive)
- Corrected at freeze: 15 Aug 2026 (v2 → v3, three corrections above)
