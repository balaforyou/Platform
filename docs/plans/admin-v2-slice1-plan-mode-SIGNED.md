# Admin-v2 Slice 1 — Plan-Mode Document (Chief-Signed, Amended)

**Status: SIGNED OFF. Steps 1–4 implemented and independently verified (each step's
real pushed diff pulled and checked, not taken on report). Step 4a (service-worker
rework, §7) required before step 5 starts — see Build Order below.**

**Provenance:** Written by the Technical Lead thread from real investigation against
repo HEAD `cfe41ce2153158fd67137e1c92eabf4e79f2797a` (full tarball pull, direct file
reads — not inferred). Reviewed and signed off by Chief in the same thread. This file
is a portable transcript of that signed plan, produced after a downstream contradiction
check found the original handover document alone was insufficient to implement from.
The F-204/F-197 gap noted in that original check was resolved by a corrected handover
upload and is folded into this document already (see §8's F-197 citation and the
Gap-resolved note preserved below). **§7 (Service worker) was added after step 4
shipped**, from a corrected handover addendum — it is retroactive against already-
implemented code; see §7 for what that requires before step 5.

**Base handover:** `Admin v2 — Slice 1 Handover: Google Login + Fingerprint + Landing`
(the original Chief → Technical Lead document — F-195/F-196/F-203/F-204 table, the
seven acceptance criteria, the "what's expected from Bala" GCP setup list). That
document's acceptance criteria (7 items) are unchanged and still authoritative for
what "done" means. This plan adds the technical shape on top of it.

---

## Chief rulings incorporated (not to be re-litigated)

1. **Tenant resolution:** assume single-tenant match for Slice 1. If a Google-verified
   identity resolves `RoleAssignment` rows across more than one tenant, **fail closed**
   with an explicit error — never silently pick one. Revisit trigger: a real admin
   genuinely manages more than one tenant.
2. **Stack:** admin-v2 matches admin-web's current versions — **React 19.2.8, Vite
   8.2.2**. Verified live in code (not just claimed in batch-log): `packages/ui-shared/
   package.json` has `"type": "module"` + the `"exports"` field; `apps/admin-web/
   vite.config.ts` has the matching `optimizeDeps.include` (naming `@badminton/ui-shared`
   + React deps) and `resolve.dedupe`. Both halves of the fix are real and reusable as-is.
3. **Role gate:** accept `OWNER` and `BRANCH_MANAGER` only. `FRONT_DESK` and "no
   `RoleAssignment` for the resolved tenant" both get the same clear-rejection treatment
   as `GUEST` does in the existing mock (`identity-auth/src/index.ts:448-454`).

**Post-sign-off addenda (decided directly with Bala, noted for Chief reconciliation —
not architecture/scope changes, flagged per this project's own escalation discipline):**
- OAuth flow confirmed client-side ID-token (not server-side code-exchange) — Client
  Secret obtained but unused; not wired into any code.
- Test admin seed: `balaforyou@gmail.com`, `OWNER` role, **JBC tenant only** (no
  `courtowner1` `RoleAssignment` — keeps this account out of the multi-tenant fail-closed
  path deliberately; that path is untested by this specific seed).

---

## §1 — App scaffold & location

New workspace package: `apps/admin-v2` (fits the existing `apps/*` glob in
`pnpm-workspace.yaml` — no workspace-config change needed). Own `package.json`
(`@badminton/admin-v2`), own `vite.config.ts` cloned from `admin-web`'s (same
`optimizeDeps.include`/`resolve.dedupe` pattern), own `index.html`, own PWA manifest —
no shared build output, no shared route prefix with `admin-web`.

**Reused from `ui-shared`:** `apiRequest`, `TenantProvider`/`useTenant`, and
`AuthProvider`/`useAuth` as a *starting point* — its current shape (`verifyGoogleMock`,
JWT-decode-from-cookie-refresh) needs a new method for the real flow (§2). Reused, not
rebuilt — matches the project's "reuse proven patterns" rule.

**Not reused from `ui-shared`:** no visual components exist there today (confirmed —
only `api.ts`, `colorRamp.ts`, `format.ts`, the two contexts). Component library is
genuinely new — see §5.

## §2 — Google OAuth flow: client-side ID-token, not server-side code-exchange

**Decision, with reasoning:** the existing endpoint shape
(`/auth/google/verify` takes a `googleIdToken` string, no client secret involved)
already assumes a client-side ID-token flow — Google Identity Services JS library
issues an ID token directly to the browser, backend verifies the signature via
Google's JWKS. Extending that shape is reuse of an existing pattern; a server-side
authorization-code exchange would need a client secret, a redirect callback route,
and state/CSRF handling that doesn't exist anywhere in this codebase.

**Consequence, confirmed with Bala post-sign-off:** only the Client ID is required.
Client Secret obtained but not used by this flow.

**New verification logic (`identity-auth`):**
- New endpoint: `/auth/admin/google/verify` (kept separate from the existing
  member/staff-scoped mock endpoint — different rejection semantics, keeps the
  additive-only guarantee clean rather than threading two role gates through one
  function).
- Verify JWT signature against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`),
  check `iss`/`aud`/`exp`. `aud` checked against `GOOGLE_OAUTH_CLIENT_ID` env var.
- Extract `email`/`googleId` (Google's `sub` claim) from the **verified token**, not
  trusted from client-supplied fields.
- Query `User` rows matching `googleId` OR `email` **without a tenantId filter** — join
  `RoleAssignment`, filter to `role IN (OWNER, BRANCH_MANAGER)`.
- Zero matches → reject (`ADMIN_ACCOUNT_NOT_FOUND`), same clear-error shape as the
  existing `GOOGLE_LOGIN_ONLY_FOR_MEMBERS` pattern (`index.ts:450-453`).
- Exactly one tenant match → issue session (same `refreshToken`/`accessToken`
  mechanism; cookie is already host-only, no `domain` attribute needed — confirmed,
  `index.ts:494-500` sets no `domain`, so `admin.elitecourts.duckdns.org` gets a
  naturally isolated session with zero auth-service change for that specific point).
- More than one tenant match → `MULTIPLE_TENANT_MATCH`, explicit rejection, never a
  silent pick.

**Dev-only fallback:** same `NODE_ENV !== 'production'` fail-closed gate as the OTP
dev-code path (`index.ts:206-222`). A dev-only path that mints a valid session for the
seeded test admin (`balaforyou@gmail.com`) without a real Google round-trip, so CI/e2e
never depends on live Google infrastructure.

## §3 — WebAuthn / fingerprint (F-196)

Step-up, not a replacement — Google OAuth stays primary, fingerprint is a
device-recognition shortcut only.

**New schema** (nothing WebAuthn-related exists in `schema.prisma` today — confirmed):

```
model WebAuthnCredential {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  credentialId  String   @unique
  publicKey     Bytes
  counter       BigInt   @default(0)
  deviceLabel   String?
  createdAt     DateTime @default(now())
}
```

**RP-ID:** `admin.elitecourts.duckdns.org` — simpler than the original multi-tenant-
subdomain scoping problem, since admin-v2 has exactly one domain.

**Library:** `@simplewebauthn/server` + `@simplewebauthn/browser` — standard pairing,
handles the attestation/assertion ceremony without hand-rolling CBOR/COSE parsing.
Nothing to reuse; added fresh.

**Flow:** after first successful Google login, prompt enrollment (skippable) →
`generateRegistrationOptions` → browser ceremony → `verifyRegistrationResponse` → store
credential. Subsequent logins: offer fingerprint as fast path if a credential exists
for the device → `generateAuthenticationOptions`/`verifyAuthenticationResponse` → same
session issuance as §2. Decline or unavailable → clean fallback to the Google button.

## §4 — Role/reject handling

Single rejection path, reused everywhere a Google-verified identity fails to produce a
valid session: no matching `User`, `FRONT_DESK`-only `RoleAssignment`, no
`RoleAssignment` for the resolved tenant, or multi-tenant ambiguity all return a clear,
non-crashing error (acceptance criterion 6) — distinct error codes per case so the
frontend renders a specific message rather than a generic failure.

## §5 — Component library, starting shape

New, **local to `apps/admin-v2/src/components`** — not added to `ui-shared`.
Reasoning: `ui-shared` is currently logic-only, consumed by two apps with *different*
visual systems already; folding admin-v2's visual components into a package literally
named "shared" would imply a cross-app visual language that isn't being asked for. If a
genuine cross-app need emerges later, promote specific components then.

**Starting set** for Slice 1's actual surface (login screen, landing page, enrollment
prompt): `Button`, `Card`, `TextField` (minimal use now), `Banner`/`InlineError`
(matches the established `CourtBooking.tsx` error-banner precedent), `Spinner`/
`LoadingState`. Token-driven from a local `tokens.css` or equivalent — actual token
values need the mockup/design-system source, not invented here.

## §6 — Test framework

`vitest` — natural Vite-ecosystem fit, confirmed zero conflicts (nothing else uses a
different runner). Scaffold `vitest.config.ts` alongside `vite.config.ts`. Targeted
coverage: JWKS verification logic, WebAuthn credential handling, the multi-tenant-match
branching in §2 specifically. Not the components in §5 — presentational, e2e covers
them.

## §7 — Service worker: real design, not a stub to revisit later

**Added post-step-4, retroactive against already-shipped code — ruled by Bala.**
`apps/admin-v2/public/sw.js` as shipped in step 4 (`b62f073`) is a bare pass-through
stub ported near-verbatim from `guest-member-pwa`'s own stub — `CACHE_NAME` declared
but unused, no real caching, existing purely to satisfy Chrome's installability
criteria. That was a reasonable call against the *original* handover, which said
nothing about caching depth. It is explicitly **not** acceptable against this
addendum, and per Bala's ruling, **step 4's `sw.js` must be reworked before step 5
(Caddy/Docker/deploy-verify) starts** — this is a required follow-up commit on the
existing branch, not deferred to a later slice or batch close-out.

**Concrete requirements** (from the corrected handover, verbatim intent):

- **Cache name tied to build SHA** (matching this project's existing SHA-verification
  discipline elsewhere), with an explicit `activate`-time cleanup step that deletes any
  cache not matching the current SHA. Without this, every deploy adds a new cache and
  old ones accumulate indefinitely.
- **`skipWaiting()` in `install`, `clients.claim()` in `activate`** — already present in
  the current stub; carry forward unchanged. Without both, a newly deployed worker sits
  "waiting" until every open tab of the old version closes, meaning a real deploy might
  not reach a returning admin for an unpredictable amount of time.
- **Cache-first for the app shell, with real fallback mechanics**: check cache → on
  miss, fetch from network → clone the response (streams are single-read: the original
  goes to the browser, the clone goes to cache) → return the original. Network-first-
  with-cache-fallback for live data.
- **Graceful failure when both cache and network fail** — return a real `Response`
  object with a clear status and message, never an unhandled rejection. Matches the
  "never crash, always show something legible" discipline already established
  elsewhere this session (F-198, login rejection handling).
- **A real `push` event listener**, even though no backend trigger exists yet — this is
  the client-side half of the parked notification-reminders discovery document
  (`discovery-notification-reminders-jbc.md`), and building it now means admin-v2 is
  ready to receive real pushes the moment F-044 Phase B unblocks, rather than needing
  its own retrofit later.
- **Root-scope registration** (`/sw.js`) — already correct in the current
  implementation; confirm it stays that way through the rewrite.

**Follow-up work required before step 5 clears:**
1. Rewrite `apps/admin-v2/public/sw.js` to the spec above.
2. The existing e2e test (`criterion 1 — installable PWA`) only asserts manifest
   validity and that *a* service worker is registered — it does not exercise caching
   behavior. This needs either an extended assertion (cache populated after first
   load, cache-name reflects build SHA, stale cache cleared on a simulated
   re-activation) or a clearly-scoped note on what the existing test does and doesn't
   cover, so "PWA installability e2e passes" isn't mistaken for "the real caching
   design is verified."
3. Push as a follow-up commit on `admin-v2-slice-1`, independently reviewable before
   step 5 starts — same stop-and-verify discipline as steps 1–4, not folded silently
   into step 5's own commit.

## §8 — Deploy/infra

Confirmed via direct file reads, not assumed:

- **Caddy:** production `Caddyfile` has one site block keyed to `$SITE_ADDRESS` with a
  catch-all `handle {}` serving `guest-member-pwa` for any unmatched host —
  `admin.elitecourts.duckdns.org` would silently hit that catch-all today. Needs a
  `@adminV2Host { host admin.elitecourts.duckdns.org }` matcher placed *before* the
  catch-all, `$SITE_ADDRESS` extended to include the new hostname (comma-separated,
  same pattern as the existing three: `elitecourts.duckdns.org, jbc.elitecourts.duckdns.org,
  courtowner1.elitecourts.duckdns.org, admin.elitecourts.duckdns.org`), and a new
  `handle` block rooted at `/srv/admin-v2`.
- **Docker build:** `Dockerfile.caddy-static` needs a third `RUN pnpm --filter
  @badminton/admin-v2 run build`, a matching `COPY --from=build .../dist /srv/admin-v2`,
  and the F-077 `version.json` stamp extended to the new bundle (same pattern as the
  existing two).
- **Build-arg wiring for `VITE_GOOGLE_CLIENT_ID`:** follows the exact `RAZORPAY_KEY_ID`
  precedent in `deploy/gcp-vm/docker-compose.yml`'s `caddy` service — add
  `VITE_GOOGLE_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID}` to `build.args`, reusing the single
  `.env` value for both the frontend build-arg and the backend runtime env (added
  separately to `identity-auth`'s `environment:` block as `GOOGLE_OAUTH_CLIENT_ID:
  ${GOOGLE_OAUTH_CLIENT_ID}`).
- **Deploy verification:** `scripts/verify-deployment.mjs` checks frontends against a
  single `baseUrl` (works today since guest-pwa/admin-web share a hostname). admin-v2
  lives on a different hostname — needs either a per-component base-URL parameter or a
  second invocation for the new domain.

---

## DNS — resolved, no action needed

Confirmed via `docs/deploy_via_dockerhub_reference.md` (F-149 section): DuckDNS
resolves arbitrary sub-subdomains to the same A record automatically.
`admin.elitecourts.duckdns.org` already resolves to the VM. The only real step is the
`$SITE_ADDRESS` extension in §8 above, plus recreating `caddy` so it provisions a fresh
Let's Encrypt cert for the new hostname.

---

## GCP-side setup, confirmed complete (Bala)

- OAuth Client ID + Secret obtained
- Authorized JavaScript origins set: `https://admin.elitecourts.duckdns.org`,
  `http://localhost:<dev-port>`, `http://127.0.0.1:<dev-port>` (dev port TBD once
  admin-v2's `vite.config.ts` is scaffolded — admin-web currently uses 5174, admin-v2
  will need its own)
- `VITE_GOOGLE_CLIENT_ID` — local dev `.env`
- `GOOGLE_OAUTH_CLIENT_ID` — local dev `.env` **and** VM `deploy/gcp-vm/.env`
  (staged; inert until §8's docker-compose wiring lands)
- DNS — no action needed (see above)
- Test admin: `balaforyou@gmail.com`, `OWNER`, JBC tenant only

---

## Gap resolved — corrected handover received

The corrected handover (`admin-v2-slice-1-handover.md`, uploaded) confirms both fixes
Chief's sign-off referenced:

1. **F-204** now has its real, final shape: two fields only — payment mode (`cash` |
   `upi`) and a free-text reference number, required only when mode is `upi`. No QR
   handling anywhere in the app (venue's own QR, shown outside the system). Booking
   created at standard listed price, no custom pricing. **Still out of scope for Slice
   1**, sequenced later, independent of it — this doesn't change anything in §1–§6, §8
   above, just closes the dangling reference.
2. **F-197** is now explicitly cross-referenced against **acceptance criterion 1**
   (PWA installability) rather than floating unowned. Confirmed scoped content to
   reuse for §5/build-step-4's frontend work: `guest-member-pwa`'s real `sw.js` and
   `PwaInstallPrompt.tsx` as precedent (confirm what's app-shell-generic vs.
   guest-specific before porting, not assumed), and the already-real
   `POST /devices/register` endpoint for the notification-permission flow — held out
   of Slice 1 itself (per the acceptance criteria's "explicitly not in this slice"
   list) but confirmed working, not speculative, for whenever that follow-on story
   lands.

**Practical effect on this plan:** none of §1–§6, §8 needed revision (§7 is new, added post-step-4) — the corrected
handover's technical requirements section is otherwise identical to what this plan was
already built against. The one addition worth carrying into build step 4: the PWA
manifest/service-worker work should explicitly cite **F-197** (not F-195/F-203) in its
commit message and any register update, and should start from `guest-member-pwa`'s
real `sw.js`/`PwaInstallPrompt.tsx` rather than writing a fresh service worker from
scratch — per rule 3 (reuse proven patterns), now that real precedent is confirmed to
exist and is named explicitly.

**Both files read directly, confirming the actual reuse shape:**
- `apps/guest-member-pwa/public/sw.js` is genuinely generic — a minimal pass-through
  worker (`install`/`activate`/`fetch`), nothing guest-specific except the
  `CACHE_NAME` string constant. Near-verbatim port for admin-v2, rename the cache key
  only.
- `apps/guest-member-pwa/src/components/PwaInstallPrompt.tsx` (219 lines) is real and
  well-built — `beforeinstallprompt` capture + `deferredPrompt.prompt()` for
  Chrome/Android, manual Share-button instructions for iOS Safari (no automated
  prompt API there), 7-day localStorage dismissal. **Not a pure copy-paste**: it calls
  `useTenant()` for white-labeled branding text (tenant name/logo in the prompt copy).
  Admin-v2 uses a *fixed* emerald/slate palette with only tenant name/logo swapped
  dynamically (per the earlier F-195 palette decision), not full per-tenant branding —
  so this component needs its branding source adapted to admin-v2's actual tenant
  model, not copied verbatim and not rewritten from scratch. The install-detection,
  platform-branching, and dismissal logic all port as-is.

---

## Build order for Claude Code (from Chief-approved kickoff)

1. ✅ **Done, verified** — Scaffold `apps/admin-v2`, off `main` (`cfe41ce`) after an
   initial branch-base mishap was caught and corrected. `61feda8`.
2. ✅ **Done, verified** — Backend `/auth/admin/google/verify` (§2), seed script for
   the test admin (JBC OWNER, `balaforyou@gmail.com`). `8979467`.
3. ✅ **Done, verified** — WebAuthn schema + backend (§3), step-up design, role
   re-checked on every login. `7638695`.
4. ✅ **Done, verified** — Frontend flows: login screen, landing page, enrollment
   prompt, fingerprint fast-path/fallback, real Playwright + CDP virtual-authenticator
   e2e proving criteria 1–6 end to end. Component set from §5, local to
   `apps/admin-v2/src/components`. `b62f073`.
4a. ⬜ **Required follow-up, blocks step 5** — Rework `apps/admin-v2/public/sw.js` to
   the real spec in §7 (added post-step-4; the shipped stub is not acceptable against
   it). Push as its own reviewable commit on `admin-v2-slice-1` before step 5 starts.
5. ⬜ **Next** — Caddy + Docker + deploy-verify, exactly per §8.
6. ⬜ Tests — `vitest` scaffold, coverage per §6 (admin-v2's own logic; `identity-auth`
   already has its own from steps 2–3).

**Stop points, as actually applied:** after scaffold + clean install (before backend),
after OAuth endpoint has real unit test coverage (before WebAuthn), after WebAuthn has
real unit test coverage (before frontend), after frontend flows are wired and the
WebAuthn ceremony proven end-to-end via e2e (before Caddy/Docker/deploy work) — each
step independently pulled and verified against the real pushed diff before clearing
the next, not taken on report. Step 4a is a new stop point inserted after sign-off,
same discipline applies.

**Evidence required, mapped to the seven acceptance criteria in the original
handover** — real screenshots/terminal output, not descriptions of expected behavior.
