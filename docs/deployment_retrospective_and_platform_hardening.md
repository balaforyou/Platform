# Deployment Retrospective & Platform Hardening — 4 Aug 2026

**Purpose:** Today's GCP VM deployment surfaced ~10 real bugs (F-032 through F-040), all fixed. This document extracts the *generalizable* lesson from each — not just what happened, but what should be true from day one of any future vertical built on this platform (starting with the rental driver app), so none of today's pain repeats.

**How to use this:** Section 1 is genuine engineering practice worth adopting now. Section 2 is what should become literal, reusable starting artifacts — not rebuilt from scratch — for the next vertical.

---

## Section 1 — Practices worth adopting now, generalizable beyond this vertical

### Build dependency order needs one source of truth, not per-Dockerfile rediscovery
Today's bugs (`@badminton/shared-types` → `shared-middleware` → `database`, then separately `@badminton/ui-shared`) happened because each Dockerfile had to independently work out the correct internal package build order, and got it wrong twice. **Fix going forward**: a single root-level script (`pnpm run build:shared`) that every Dockerfile calls identically, rather than each one hardcoding its own `RUN pnpm --filter ... run build` sequence. One place to get right, not N places to get wrong the same way.

### Frontend build-time secrets need a documented three-place checklist
`VITE_RAZORPAY_KEY_ID` needed changes in three separate places to actually reach the compiled bundle — the Dockerfile's `ARG`/`ENV` pair, Compose's `build.args` mapping, and the frontend code reading `import.meta.env`. Missing any one produces a silent, hard-to-diagnose failure (exactly what happened). **Standardize**: any new frontend build-time variable gets a one-line checklist — all three places, together, every time — documented once, not rediscovered per-variable.

### Credentials must fail loudly, never silently fall back
`BookingPay.tsx`'s hardcoded fallback key (`|| 'rzp_test_...'`) is the single most dangerous pattern found today — a missing real credential silently substituted a stale one with zero visible error, for an unknown length of time. **Standing rule**: no credential, key, or secret anywhere in the codebase may have a literal fallback value. Missing means fail visibly (a clear error state), never silently substitute.

### Infrastructure config is code — treat it with the same discipline as application code
F-039 (a live VM fix silently reverted by a later local-repo-based edit) happened because `docker-compose.yml`/`Caddyfile` changes made directly on the VM never flowed back to source control. **Standing rule**: any live infrastructure fix gets synced back to the repo immediately, same session — no config file exists correctly in only one place.

### New reverse-proxy paths need `handle` blocks and `strip_prefix`, as a template, not derived fresh each time
The bare-`route`-vs-`handle` priority bug and the missing `strip_prefix` (both real, separate bugs today) stem from the same root cause: no documented, copy-pasteable Caddy pattern for "adding a new path-scoped app." **Standardize**: one proven template block, reused verbatim for every new route, not re-derived.

### Let's Encrypt has real, easily-exhausted rate limits during iterative debugging
Five certificates per exact domain per 7 days sounds generous until a debugging session involves 5+ container restarts in a few hours. **Two standing practices**: (1) Caddy's `/data` directory must always be a persistent volume from the very first setup, not added reactively — this alone would have prevented today's limit from being hit at all. (2) During any future initial HTTPS setup with expected iteration, consider deliberately pointing Caddy at Let's Encrypt's *staging* CA first, only switching to production once the config is believed stable.

### VM sizing needs to account for build load, not just runtime load
`e2-micro` (1GB) could not survive parallel multi-service Docker builds — real, repeated freezes — while `e2-small` (2GB) handled the identical build cleanly. **Standardize**: any future VM-based deployment of this monorepo shape starts on `e2-small` (or larger) for the initial build phase, downsizing to the free tier only after all images are built and cached.

---

## Section 2 — What becomes a literal reusable template for the rental driver app (and any future vertical)

This is the concrete payoff of today's pain: these artifacts, now correct, should be **copied and adapted**, not rebuilt from scratch.

1. **`Dockerfile.node-service`** — the corrected Node 22 base image, `openssl` install, and the full internal-package build order (`shared-types` → `shared-middleware` → `database`) is directly reusable for any new backend service in any vertical.
2. **`Dockerfile.caddy-static`** — same, for any new frontend app, including the now-correct `ARG`/`ENV` pattern for build-time secrets.
3. **`docker-compose.yml`** — once F-040's persistent-volume fix lands, this becomes a genuinely correct starting template: right port mappings, right build-arg wiring, right volume persistence, all pre-solved.
4. **The Caddyfile's routing pattern** — the `handle` + `strip_prefix` structure for each app/API path, proven correct, copy-paste-adaptable for a rental app's own routes.
5. **`razorpay_and_gcp_vm_runbook.md`** — almost nothing in it is badminton-specific; it's already a generic GCP VM deployment runbook. Reuse directly, only the seed-script reference needs swapping.
6. **The credential-generation convention** (uniform `-hex` encoding for every `.env` secret) — adopt as a standing default for any new deployment, not just this one.

### One piece of shared *application* code worth building now, given it's recurred three times
F-029, F-034, and F-037 are the same underlying pattern — raw internal data (IDs, error messages) reaching the user — found in three separate, unrelated screens. This strongly suggests the fix shouldn't be per-screen patches anymore, but a small set of shared helpers in `packages/ui-shared` (a `formatUserFacingError()` wrapper, extending the existing phone-display pattern to cover any raw-ID case) that every screen — in this app and the rental app alike — is expected to use rather than rendering raw fields directly. Worth scoping as its own small phase, given the pattern is now proven to recur rather than being three unrelated one-offs.

---

## Cross-reference
Full detail on each individual bug remains in `docs/findings_register.md` (F-032 through F-040) — this document is the *extracted, generalized* lesson, not a replacement for that record.
