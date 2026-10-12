# S1 plan — role-aware shell + global branch / date context (PLAN ONLY)

**Status:** PLAN ONLY, 12 Oct 2026. Frontend only. Nothing is implemented, committed or pushed. Stops for Chief's review;
nothing is built until Bala signs off.
**Inputs:** `docs/plans/admin-v2-revamp-plan-mode.md` (S1 section, §4 G10 placement), the combined mockup
(`docs/plans/chief-archive/admin-v2-combined-mockup.html`, the acceptance reference with stated deviations), Bala's
addendum of 12 Oct, the Spike (for what S1 must *not* claim).
**Addendum effect on S1:** none of its seven changes touches the shell. The Members destination is unchanged; "a member
in many batches" lives in S3's screens and the updated mockup. Stated so it is a conscious "no", not an omission.
**Parallelism:** S1 can start in parallel with SB design (Chief's order); S1 does not wait for SB code. Nothing here
depends on a backend change.

---

## 1. Goal and non-goals

**Goal:** the shell knows who is signed in (**owner**, **manager of one branch**, **manager of several branches**) and
shows each the right navigation, and every screen reads **one** global branch and date instead of keeping its own.
**Non-goals (stated so they are not absorbed):** no new screens' content (Today = S2, Members = S3); no server-side
enforcement (**S0** — every role-based hide in S1 is **UI-only and is documented as not a security boundary**); no
dues / deposit / pause UI; `FRONT_DESK` stays excluded from admin sign-in by the signed ruling; no new role.

## 2. Requirements (testable)

| # | Requirement |
|---|---|
| **S1-1** | A role kind is derived **once** in `lib/claims.ts` from `AdminUser.roles`: `owner`; `manager` with its scoped branch ids (one or many). Anything else (no admin role) keeps today's behaviour. |
| **S1-2** | `NavDestination` gains `roles?`; `filterByRole` composes with `filterByEntitlement` (F-206). One list stays the single source for the sidebar, the mobile bottom nav and `/apps`. A destination with no `roles` is visible to every admin role. |
| **S1-3** | Destinations per the mockup: Today, Walk-in (action), Ledger (manager sees **today's** collections only — enforced by S0/S2, S1 only hides the owner-only entry), Members, and the owner tools (Communications, Attendance rules, Pricing and rules, Branch settings, Managers). Destinations whose screens do not exist yet are **hidden, not stubbed with fake content** (rule: nothing faked). |
| **S1-4** | Old routes `/dashboard`, `/inventory`, `/guests`, `/members`, `/court-groups` keep working as **redirects** (the service worker caches the shell; bookmarks and the PWA start URL exist). |
| **S1-5** | A `BranchDateContext` in the shell: branch (`all` or one id) and date. Segmented switcher for ≤ 4 options, dropdown beyond (owners may have more than 3 branches); **hidden for a single-branch manager** (their one branch is implied). A multi-branch manager sees only their branches and **no "all"** unless they have two or more (decision Q3). |
| **S1-6** | The last chosen branch is remembered per user in `localStorage`, **every read and write wrapped in try/catch**; the app is correct without it (private window, blocked storage, thumbnail capture). Remembered value is re-validated against the user's allowed branches on load. |
| **S1-7** | The screens that keep their own branch state today move onto the context (see §4). Behaviour per screen is unchanged apart from where the branch comes from. |
| **S1-8** | A direct URL to a role-hidden route redirects to the role's home (same posture as `GuestManagementScreen`'s entitlement refusal). Documented in code and in the PR as UI-only. |
| **S1-9** | Mobile: bottom nav carries the daily tasks; owner tools sit behind "More" (`/apps`). Both shells stay mounted with the existing 767 px CSS breakpoint (the `AppShell` precedent; no JS width check). |
| **S1-10** | F-206 module gating, the passkey prompt, theme toggle and push opt-in in `AppShell` are **preserved unchanged**. |

## 3. Design

- **Role kind (S1-1):** `roleKind(user)` and `managerBranchIds(user)` in `lib/claims.ts` beside `parseAdminClaims`
  (reuses the existing `branchScopes` logic currently duplicated in `guestManagement/helpers.ts:60` and
  `branchSettings/queries.ts:19` — S1 consolidates to one helper and points both at it, a small, covered change).
- **Nav (S1-2 / S1-3):** add `roles?: ('owner' | 'manager')[]` to `NavDestination`; `filterByRole(destinations, kind)`
  next to `filterByEntitlement`. The two filters compose in `AppShell` and `AppsOverflowScreen`.
- **Context (S1-5 / S1-6):** a `BranchDateProvider` mounted inside `AppShell` (under the router, above `<Outlet />`).
  State: `branchId: 'all' | string`, `date: string` (branch-local `YYYY-MM-DD`). The allowed branch list comes from the
  existing `useBranches()` (already scoped: owners get all, managers get their ids). The **date is derived in the
  branch's timezone**, not the browser's (the F-335 / F-336 / F-339 family: a browser-local "today" is wrong for a
  guest or admin whose zone differs from the branch's) — S1 must not add a new instance of that class; the first
  default uses the selected branch's `Branch.timezone`.
- **Screens move onto the context (S1-7):** by grep, `useState('')` branch state lives in `GuestSlotInventory`,
  `GuestOccupancyDashboard`, `LedgerScreen`, `GuestManagementScreen`, `BranchSettingsScreen`, `CreateBatchForm` and
  `RosterPanel`; three more sections call `useBranches()` (`WalkInBookingFlow`, `GuestScheduler`, `PricingRates`).
  **The exact list is re-verified at step 1**, and each screen is moved one at a time. Screens whose data is
  branch-specific by nature (Branch settings) keep a local override but initialise from the context.
- **Routes (S1-4 / S1-8):** `App.tsx` gains the new paths and keeps the old ones as `<Navigate replace>`; a
  `RoleRoute` wrapper redirects a role-hidden path to home.
- **Nothing in S1 calls a new endpoint.**

## 4. Blast radius (every consumer of what S1 touches; root rule 3a)

- `src/screens/shell/nav.ts` → `shell/AppShell.tsx`, `AppsOverflowScreen.tsx` (the three consumers of the one list);
  `components/SidebarNavItem`, `BottomNavItem`.
- `src/App.tsx` (routes and redirects); `auth/AdminAuthContext.tsx`; `lib/claims.ts` and `claims.test.ts`.
- The **seven** screens with their own `branchId` state and the **three** `useBranches()` sections in §3;
  `guestManagement/queries.ts` (`useBranches`, `usePools`, `useGroups`, …) and `guestManagement/helpers.ts`
  (`branchScopes`); `branchSettings/queries.ts` (own `branchScopes`, own fetch).
- The five `isOwner` checks (`BranchSettingsScreen`, `GuestScheduler`, `AuthorizedCourts`, `CancellationPolicy`,
  `PricingRates`): **unchanged**, but they now sit under a shell that also hides entries — a risk of two sources of
  truth for "is owner" (see §7).
- `styles.css` (`.av2-shell`, `.av2-sidebar`, `.av2-bottom-nav`, the 767 px blocks at `:297` and `:500`).
- Tests / harness: `e2e/auth-ceremony.spec.ts` (landing assertions will change: owner home is Today), `e2e/global-setup.ts`,
  `tests/seed-admin-v2-data.mjs` (owner only today — needs a **scoped-manager seed and a second branch**, generic by
  subdomain as it is now).
- **Not touched:** every backend service; `guest-member-pwa`; `packages/ui-shared` (rebuild it first only if a shared
  component is edited); the retired `apps/admin-web`.
- **Routes called by the moved screens are unchanged**, so no service has a new caller.

## 5. Steps (small, each independently shippable behind green checks)

1. **Inventory and consolidation:** re-grep branch state; one `branchScopes` helper; `roleKind` + vitest.
2. **Nav:** `roles?`, `filterByRole`, vitest (owner / one-branch manager / two-branch manager × every destination),
   composed with entitlement.
3. **Context:** provider + switcher + storage (try/catch) + tz-correct date; vitest for the reducer / validation and the
   storage-throws path.
4. **Move screens** onto the context, one per commit; each screen's existing behaviour proven unchanged.
5. **Routes:** new paths, redirects, role guard.
6. **Mobile pass** and the e2e additions.

## 6. Evidence

- `pnpm --filter @badminton/admin-v2 typecheck`, `tsc && vite build`, `vitest run` clean; lint 0 errors.
- vitest: `roleKind`, `filterByRole × filterByEntitlement`, storage-throws, remembered-branch revalidation (a stored
  branch the user can no longer see falls back), date-in-branch-timezone under a non-UTC branch (the F-066 / F-335
  lesson, A2-style test).
- Playwright (real Chromium, dev-token sign-in): owner vs one-branch manager vs two-branch manager nav at **1280 and 390
  px**; the old URLs redirect; a role-hidden URL lands home; switcher hidden for the one-branch manager. Needs the new
  seed. Reads the **built** artifact (grep the compiled CSS for the new classes — a misspelled Tailwind token emits
  nothing).
- Real-device pass on a phone before sign-off (frozen-transition and compositing traps do not apply on a real device).
- No Spike-style backend probing is needed; S1 changes no route. If Chief wants, a live look at the owner and manager
  views on the deployed demo is a post-merge check, not a pre-merge one.

## 7. Risks and traps

- **UI-only hiding is not security.** A hidden entry's route still answers a manager's request (slot-engine, payment
  admit a scoped manager on most routes — F-341). S1 says so in the PR text and must not be described as "manager
  restricted" until S0. The mockup's restricted manager view is therefore **cosmetic until S0**.
- **Two sources of truth** for "owner" (the shell's role kind and five screens' `isOwner`): S1 leaves the screens alone
  and adds a vitest that both read the same claim; consolidation is a later cleanup, not S1.
- **Browser-local dates** (F-335 / F-336 / F-339): the context must use the branch zone; tested.
- **Radix `Presence` exit-animation trap** on any new switcher dropdown or sheet: keep exit animations enter-only or add
  the hard-timeout fallback (the `Modal` and account-menu precedent).
- **Frozen CSS transitions and gradient contrast false passes:** inject `* { transition: none !important }` before
  reading computed styles; check `background-image`, not only `background-color`.
- **Service-worker cache:** the shell is cached; a changed route table must not strand an installed PWA — redirects
  kept (S1-4); verify with an installed instance, and `scripts/stamp-sw.mjs` runs in the build.
- **Hiding a destination whose screen does not exist yet** (Today, Managers, …): they are hidden, not stubbed with
  invented data (Chief's "nothing faked" rule).

## 8. Rollout / rollback

Frontend only, behind the normal CI → promote path. Rollback = `./deploy/gcp-vm/promote.sh <previous-sha>`; no data or
backend state to unwind. The remembered-branch key in `localStorage` is inert to old code. First look: owner and a seeded
manager on the deployed demo over HTTPS.

## 9. Questions for Chief / Bala (S1 is not final until ruled)

1. **Owner home:** is Today the owner's landing route even before S2 exists (until then `/dashboard` redirect target), or
   does S1 keep `/dashboard` as home and rename later?
2. **Walk-in as a destination or an action:** the mockup treats it as an action button on Today; S1 needs a nav entry on
   mobile in the meantime — confirm.
3. **Multi-branch manager and "All":** confirm "All" is offered to a manager with two or more branches (read-only
   roll-ups are fine; writes are always branch-specific).
4. **Owner with many branches:** segmented switcher for ≤ 4, dropdown beyond — confirm the threshold.
5. **Hiding destinations that have no screen yet:** confirm "hidden until built" over a labelled "coming soon" tile.
6. **Seed:** OK to extend `tests/seed-admin-v2-data.mjs` with a scoped manager and a second branch (generic, by subdomain,
   never hardcoded ids)?

**Nothing is built until Bala signs off.**
