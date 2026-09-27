# F-302 — stop serving `admin-web` in production — implementation plan

**Backfill, not a correction — this doc didn't exist until now, despite the work already having shipped.**
PR #99 (`54830c1`, merged) shipped without a committed plan file, against this project's own standing
practice of committing one alongside the code fix for any finding with a real design decision. Written
2026-09-25, from the actual investigation and reasoning behind that PR — not reconstructed from the diff
alone, since the diff only carries the "what."

**Status:** already implemented, merged, deployed, and independently re-verified in production. Nothing
here changes code or the register — documentation catching up to already-shipped, already-verified work.

---

## 1. What was found

`admin-web` (the pre-admin-v2 legacy console) had no real users left — admin-v2 replaced it — but was
still live and publicly reachable at `<production-host>/admin`. Its only login path is phone+OTP, and
the deployed demo runs `NODE_ENV=development` (root `CLAUDE.md`'s standing note), so that OTP is always
the fixed, guessable `123456` with no rate limit. That made `/admin` a real, public account-takeover
surface, not a hypothetical one — anyone on the internet could reach the login screen and walk straight
through it.

Surfaced during a founder walkthrough of the legacy app; Chief-assigned as F-302 the same session.

## 2. Alternative considered and rejected: fix the login, not the route

The obvious-looking fix is to harden `admin-web`'s own OTP path — rate-limit it, or gate it behind a
real auth check, the same way admin-v2 is gated. Rejected outright: Bala's explicit instruction was to
stop all further work on `admin-web` — keep it in the repo as code reference only, don't investigate or
fix its UI. Spending real engineering time hardening a login screen nobody is meant to use, when the
cheaper and more complete fix is to stop serving it at all, doesn't hold up once that instruction is on
the table. So the fix had to be an infrastructure change (stop routing to it) rather than a code change
inside `admin-web` itself.

**F-303** (cataloguing `admin-web`'s dependencies for a formal phase-out project) was proposed in the
same session and retracted once this instruction landed: once the route is gone, there's nothing
reachable left to phase out, so a dedicated cataloguing project isn't justified. Recorded in
`docs/plans/pending-findings.md` with no register row — the number is retired, not reused.

## 3. Blast-radius check (rule 3a)

Before touching the Caddy route, every real consumer of `/admin` or of the "7 components" health-check
shape was checked, not just the route itself:

| Consumer | Where | Effect of removing `/admin*` |
|---|---|---|
| Production app code | repo-wide search across admin-v2 and guest-member-pwa | **none** — neither links to `/admin` anywhere |
| `.github/workflows/ci.yml` deploy-wait gate | polled `/admin/version.json` as 1 of 7 "component up" checks | breaks unless updated to 6 |
| `scripts/verify-deployment.mjs` | `FRONTENDS` array separately checked that endpoint's SHA | breaks unless updated |
| `docs/deploy_via_dockerhub_reference.md` | Step 9 verification instructions state "7" | goes stale unless corrected |
| `deploy/gcp-vm/promote.sh` | **its own, separate hardcoded `wait_for_ready()` endpoint list**, independent of the CI/verify-deployment.mjs pair | **found during this investigation, not in the originally drafted patch** — every future production promotion would poll `/admin/version.json` until it timed out |
| 4 Playwright e2e specs (`f023-full-system`, `f041-verification`, `f043-phase-c`, `f061-browser-verification`) | drive real `admin-web` UI | would start failing on a route that 200s with the wrong app's HTML |
| `admin-web`'s own source + its CI image-publish step | — | **deliberately untouched**, per "keep as code reference" — it still builds, still ships in the image, just isn't routed to |

The `promote.sh` gap is the concrete payoff of doing this check up front rather than fixing the route and
finding the second break during the next real deploy.

None of the CI/e2e items are actually wired into a CI job today (`test:regression` only runs the 5
backend services; `test:e2e` isn't invoked anywhere in `ci.yml`), so nothing here was CI-gated — but all
were still updated so a future manual e2e run, or CI wiring, doesn't silently break on a stale count.

## 4. What was built

- `deploy/gcp-vm/Caddyfile`: `/admin*` block removed entirely (was serving static files from
  `/srv/admin-web`). Deliberate side effect, called out rather than hidden: `/admin*` does **not** 404
  afterward — with the block gone, those paths fall through to guest-member-pwa's SPA catch-all and
  return `200` with its `index.html` (same asset hash as `/`). `admin-web` is unreachable, but the URL
  still resolves to something.
- `.github/workflows/ci.yml`, `scripts/verify-deployment.mjs`, `docs/deploy_via_dockerhub_reference.md`:
  7 → 6 verified components.
- `deploy/gcp-vm/promote.sh`: its own `wait_for_ready()` list corrected the same way — the gap found in
  §3, independently verified before folding in, not blindly copied from the unseen original patch.
- 4 Playwright specs marked `test.describe.skip`/`test.skip` (not deleted) with an F-302 comment
  explaining why — preserves them as real coverage if `admin-web` is ever revived behind real auth
  instead of removed. `f061`'s second, guest-only test is unrelated and untouched, still runs.
- Register: F-302 added Resolved; `pending-findings.md` records F-302 and F-303 (retracted, no row);
  batch-log entry in the same close-out pass.

## 5. Verification (real evidence, not reasoning from code alone)

Local build of the shipped stack, built the way CI builds it (`docker-compose.yml` +
`docker-compose.gcp-verify.yml`, `.env.ci`):

- Updated 6-endpoint wait loop: all up.
- `verify-deployment.mjs http://localhost:8080 <sha>`: 6/6 PASS, exit 0.
- `/admin`, `/admin/`, `/admin/login`, `/admin/version.json`,
  `/admin/assets/index-DA7TdIG6.js`: all `200` with guest-member-pwa's `index.html` (same asset hash
  as `/`).
- `admin-web`'s own files ("Admin Web Console") confirmed still present in the image at
  `/srv/admin-web`, just unrouted.
- Full regression: 5/5 suites, 179 sections (this PR touches no backend code; an earlier 23:41 UTC run
  had failed 12 sections on the known F-073 within-today-UTC fixture-window constraint, unrelated,
  clean on re-run after UTC midnight).
- `pnpm register:check`: 270 rows, Open 117 / Resolved 153. `pnpm diagram:verify`: clean.

Deployed, then confirmed on real production that `https://<SITE_ADDRESS>/admin` no longer serves
`admin-web` — the actual close-out evidence for F-302, per rule 7 (pushed and independently verified on
origin, not just committed locally).

## 6. Sign-off

Already merged (PR #99) and deployed under the review flow this project already runs (Claude Code
investigate-and-implement → Technical Lead spot-check and gatekeep → independent re-verification before
Chief consolidation). This backfill doc requires only doc-level sign-off before merging to `main` — no
code, no register change, nothing to re-verify.
