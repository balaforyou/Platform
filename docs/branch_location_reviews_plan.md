# Branch Location & Reviews — scoped for the demo

## Context

The real customer (Japan Badminton Court, Coimbatore) needs a guest-facing branch page showing
its address, with links out to Google Maps directions and Google review submission. Real data
now exists for both branches. This is demo-scoped: links out only, no embedded map, no admin
input screen.

Provisioning the customer's tenant/branches/pools is **in scope** and rides on F-098's
workaround — no admin UI exists for pool or resource creation, so this is done with internal-key
API calls. That dependency is now load-bearing for a customer demo, which is worth stating
plainly.

---

## What already exists (verified, not assumed)

This is most of the feature, and it materially shrinks the work:

| Fact | Evidence |
|---|---|
| `Branch.address` already exists (`String?`) | `packages/database/prisma/schema.prisma` — Branch model |
| No `latitude`/`longitude`/`googlePlaceId` anywhere in the schema | grep across `schema.prisma` returns nothing |
| `address` already accepted on branch create + update | `services/tenant-management/src/index.ts:202`, `:219`, `:250`, `:267` |
| `GET /tenants/:id/branches` returns **whole rows** | `:331-336` — `findMany` with no `select`, so new columns appear with **zero API change** |
| A branch detail view already exists | `BranchAbout.tsx`, routed at `apps/guest-member-pwa/src/main.tsx:360`, reached from BranchDashboard's `view-about-branch-btn` (`BranchDashboard.tsx:82-84`) |
| Internal-key path for branch writes is live | `verifyTenantOwnerOrInternal` — `Bearer $INTERNAL_SERVICE_KEY` returns early, no tenant check |

**And one defect found while checking:** `BranchAbout.tsx:81-86` renders `aboutData.address`, but
`GET /branches/:id/about` builds a literal object at `:302-309` that has **no `address` key**. The
address block on the branch detail page has therefore never rendered. Proven live against the real
endpoint — the response contains description/facilities/photos/workingDays/hours and no address.

This is being logged as its own finding (ID to be assigned), explicitly recorded as **resolved as a
byproduct of this feature** rather than fixed separately, since step 2 below adds the missing field.

---

## 1. Schema

Add three nullable columns to `Branch` in `packages/database/prisma/schema.prisma`:

```prisma
latitude      Float?    // decimal degrees, e.g. 11.0375013
longitude     Float?    // decimal degrees, e.g. 76.9330389
googlePlaceId String?   // Google Place ID, e.g. ChIJDeozArlYqDsRUA0SRJPRn1E
```

**Store coordinates rather than deriving them from the Place ID.** Deriving would need a
Google Places API call server-side — an API key, billing, a network dependency and a failure mode
on the demo path — to recover two numbers we already have. Three nullable columns cost nothing.

**`Float`, not `Decimal`.** Prisma serialises `Decimal` as a *string* in JSON (the existing
`price`/`refundAmount` fields already behave this way), which would force client-side parsing before
the value could go into a URL template. `Float` maps to Postgres `DOUBLE PRECISION` and is exact far
beyond the ~1cm precision these coordinates carry.

Migration follows the existing convention — a timestamped directory under
`packages/database/prisma/migrations/`, e.g. `20260815xxxxxx_branch_location_links`, generated with
`pnpm --filter @badminton/database run prisma:migrate`. Additive and nullable, so no backfill and no
risk to existing rows.

## 2. `services/tenant-management/src/index.ts`

- **`GET /branches/:id/about` (`:302-309`)** — add `address`, `latitude`, `longitude`,
  `googlePlaceId` to the returned object. This is the only endpoint change the feature strictly
  needs, and it is also what fixes the dead address block.
- **`PATCH /branches/:id` (`:249-277`)** — accept and conditionally persist the three new fields,
  following the existing `...(x !== undefined ? { x } : {})` pattern already used for
  `workingDays`/`facilities`/`photos`. This is the data-entry path for provisioning.
- **`POST /tenants/:id/branches` (`:202-224`)** — accept the three fields on create too, so the
  location data lands in the same call that creates the branch.

  **Correction, recorded after implementation:** this does *not* reduce provisioning to one call
  per branch, as an earlier draft of this plan claimed. `POST` hardcodes `status: BranchStatus.DRAFT`
  and accepts no status argument, so a second `PATCH /branches/:id` to set `ACTIVE` is always
  required — guest browse is ACTIVE-only, and skipping it leaves the branch invisible. Two calls
  per branch, not one.

`GET /tenants/:id/branches` needs **no change** — it already returns whole rows.

## 3. `apps/guest-member-pwa/src/components/BranchAbout.tsx`

Below the existing address block (`:81-86`), add two link buttons:

- **Get Directions** → `https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}`
  — rendered only when both coordinates are present.
- **Leave a Review** → `https://search.google.com/local/writereview?placeid={googlePlaceId}`
  — rendered only when the Place ID is present.

Both `target="_blank" rel="noopener noreferrer"`. Style with the existing
`bg-[var(--brand-primary)]` / `border-white/10` classes already used in this component so they
inherit tenant branding. `MapPin` is already imported at `:5`; add one more lucide icon for the
review action. Give both stable `id` attributes so the verification step can target them.

**BranchAbout only** — BranchSelect and BranchDashboard are deliberately untouched.

---

## 4. Provisioning runbook (internal-key API, per F-098)

Run against the target environment with `Authorization: Bearer $INTERNAL_SERVICE_KEY`.

1. **Tenant** — `POST /tenants` with `subdomain: "jbc"`, plus name/appName/themeColor/logo for
   white-label. Capture the returned tenant id.
2. **Branch 1** — `POST /tenants/:tenantId/branches`:
   `name: "Japan Badminton Court, Coimbatore"`, `address`, `latitude: 11.0375013`,
   `longitude: 76.9330389`, `googlePlaceId: "ChIJDeozArlYqDsRUA0SRJPRn1E"`.
3. **Branch 2** — same call: `name: "JBC – New Japan Badminton Court"`, `address`,
   `latitude: 11.0394243`, `longitude: 76.9322431`,
   `googlePlaceId: "ChIJkUmLcoxZqDsRyCfPwg5PQrM"`.
4. **Activate both** — `PATCH /branches/:id` with `status: "ACTIVE"`. **Required**:
   `POST /tenants/:id/branches` hardcodes `status: BranchStatus.DRAFT` (`:221`) and accepts no
   status argument, while guest browse returns ACTIVE branches only. Skip this and the branches are
   invisible to guests.
5. **Resource pools** — `POST /resource-pools` per branch (slot-engine `:904`), then
   `POST /resource-pools/:id/resources` (`:1013`) for named courts if using FIXED_INSTANCE.
6. **Booking rule** — `POST /booking-rules` per pool (`:1622`) to set cancellation policy,
   `guestOpenWindowDays`, cutoffs.
7. **Availability** — recurring patterns via `POST /resource-pools/:id/availability-patterns`
   (preferred — admin UI exists for these), or one-off windows via
   `POST /resource-pools/:id/availability-windows`.

Steps 5–7 exist only as raw API calls because **F-098** (no admin UI for pool/resource creation) and
**F-043 Phase 1** are unresolved. Steps 5 and 7's window endpoint are also **F-091** routes — currently
unauthenticated, so the internal key is convention here, not enforcement.

### Two hazards to decide before provisioning

**Branch timezone — recommend leaving `UTC`.** These are Coimbatore venues, so `Asia/Kolkata` is the
truthful value. But `POST /resource-pools/:id/availability-windows` parses `new Date(startTime)`
against the **server** clock while judging boundaries against the **branch** clock
(`getBranchTimeZone` is fetched immediately above) — that is **F-087**, and it is harmless today only
because every branch is UTC and the server is UTC, so all three agree by coincidence. Setting these
branches to `Asia/Kolkata` would make F-087 live on the demo path: a window entered as `07:00` would
be stored as 07:00 UTC and displayed as 12:30 IST. Note F-088's dry-run concern does *not* apply here
— these are new branches with no existing data to reinterpret — so the blocker is F-087 alone. Keep
UTC for the demo and treat the real flip as F-087/F-088 work.

**F-098 dependency is now customer-facing.** Provisioning a paying customer entirely through
internal-key calls is workable once, by a developer. It is not repeatable by the customer or by
anyone onboarding tenant three.

---

## 5. Verification

- **Migration** — `prisma migrate` applies cleanly; existing branch rows keep their data with three
  nulls added.
- **API, live** — `GET /branches/:id/about` for each new branch returns `address`, `latitude`,
  `longitude`, `googlePlaceId`. Same call against the existing `Coimbatore Main Arena` branch returns
  the address it always had plus three nulls, and does not error — proving the change is additive.
- **UI, real browser** — load `/branches/:branchId/about?tenant=jbc` for both branches: address
  renders (it never has before), both buttons appear, and each `href` is asserted to contain the
  exact coordinates and Place ID for that branch — not just that a link exists. Confirm the two
  branches produce *different* hrefs, which is what catches a wrong-branch data wiring bug.
- **Negative case** — load a branch with no coordinates (e.g. `Coimbatore Main Arena`) and confirm
  both buttons are absent rather than rendering broken links.
- **Regression** — `pnpm --filter @badminton/tenant-management run test:regression`, and the
  guest-booking Playwright spec run individually per F-046. Stop any manually started services on
  3001–3005 first, or the harness's own spawns collide and report as confusing assertion failures.
- **Diagram** — `pnpm diagram:verify` still exits 0 after the register entry is added.

## 6. Effort

Roughly **one working day** of implementation and verification:

| | |
|---|---|
| Schema + migration | 0.5h |
| tenant-management (3 endpoints) | 1h |
| BranchAbout UI | 1.5h |
| Provisioning runbook + execution | 2h |
| Live verification, both branches, both links | 1.5h |
| Register entry + commit | 0.5h |

Comfortable inside a two-week window. The risk is not the feature — it is provisioning depending on
F-098's workaround, where a mistake is a manual re-run rather than an edit in a UI.

## 7. Out of scope

No admin UI for address/coordinates/Place ID; no embedded map; no Places API lookup or geocoding; no
address/coordinate validation beyond what the endpoints already do; no change to BranchSelect or
BranchDashboard; no timezone flip (F-087/F-088).
