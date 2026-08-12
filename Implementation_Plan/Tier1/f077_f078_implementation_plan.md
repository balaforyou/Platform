# F-077 / F-078 — Deployment integrity: build-SHA verification and Corepack determinism

**Status:** Approved 12 Aug 2026. Committed for review before implementation lands.

---

## Context

On 9 Aug a deploy left production with **three components at three different vintages** and nothing detected it:

| Component | State | How it was found |
|---|---|---|
| Backend services | Current | `401` smoke checks |
| `migrate` image | Stale by 3 migrations | A runtime `42P10` during F-061 verification |
| Frontend bundle | Stale by ≥ F-043 Phase C | Noticing an absent nav item **by eye** |

Each failure was invisible to the checks used for the others. The `migrate` container reported `"No pending migrations to apply."` and exited **0** while running a cached image — output indistinguishable from success. The frontend being stale produced no symptom at all; the guest app looked entirely normal while shipping a known race condition (F-052).

Separately, **Corepack prompts interactively** during the migrate build, which would hang any scripted deploy indefinitely with no error. It only ever proceeded because a human was watching.

**Intended outcome:** a deploy that cannot silently half-apply, verified by construction rather than by anyone remembering to look.

---

## The load-bearing design decision

**Counting migrations inside the migrate container cannot detect a stale image.** A stale image carries 9 migrations, the database has 9, they agree, and it passes. The count check that seems obvious would not have caught the incident it was written for.

The comparison must be **build-time SHA versus deploy-time expected SHA**:

- Each image bakes the SHA it was *built from* (`ARG GIT_SHA` → `ENV BUILD_GIT_SHA`)
- The deploy passes the SHA it *intends* to run (`EXPECTED_GIT_SHA`, at run time, not build time)
- Any component whose baked SHA differs from the expected one is stale, and says so

This is the generalised form of the ad-hoc check that closed F-077's frontend half — grepping the live bundle for UI strings from a known commit. That worked once and doesn't generalise; a SHA is correct by construction, every build, with nothing to maintain.

---

## F-078 — Corepack determinism (do first; it unblocks scripted deploys)

**Pin the package manager.** Root `package.json` gains `"packageManager": "pnpm@11.17.0"` — the version local development and the lockfile (`lockfileVersion: 9.0`) actually use. Unpinned, Corepack resolves a version at build time and asks before fetching; the VM was about to pull `11.21.0`, a version nothing has been tested against.

**Suppress the prompt at all three sites**, not just the one that happened to trigger:

| File | Line | Stage |
|---|---|---|
| `deploy/gcp-vm/Dockerfile.node-service` | 7 | build |
| `deploy/gcp-vm/Dockerfile.node-service` | 31 | runtime |
| `deploy/gcp-vm/Dockerfile.caddy-static` | 7 | build |

Each gets `ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0` immediately before `RUN corepack enable`. The pin removes the reason the prompt appears; the env var guarantees it can never block. Both, not either.

---

## F-077 — Build-SHA verification

### Carrying the SHA to a tarball deploy

The VM has no git checkout, so the SHA must travel with the artifact. Packaging writes `BUILD_SHA` (from `git rev-parse HEAD`) into the tarball root; the VM's deploy sequence exports it:

```bash
export GIT_SHA=$(cat ~/badminton-platform/BUILD_SHA)
```

This also gives the tarball its own provenance, which is independently useful — today there was no way to tell which commit a tar represented without extracting and grepping source.

### Injection points

**`Dockerfile.node-service`** — `ARG GIT_SHA` in the runtime stage, `ENV BUILD_GIT_SHA=$GIT_SHA`.

**`Dockerfile.caddy-static`** — `ARG GIT_SHA` in the build stage, following the existing `VITE_RAZORPAY_KEY_ID` ARG/ENV precedent at lines 9-10. After the two Vite builds, write a version file into each dist directory:

```dockerfile
RUN printf '{"sha":"%s"}' "$GIT_SHA" > apps/guest-member-pwa/dist/version.json \
 && printf '{"sha":"%s"}' "$GIT_SHA" > apps/admin-web/dist/version.json
```

Writing it in the Dockerfile rather than via a Vite plugin means **no application source changes** for the frontend, and Caddy already serves those directories statically, so no `Caddyfile` change either.

**`docker-compose.yml`** — `GIT_SHA: ${GIT_SHA}` added to the `build.args` of `migrate`, the five services, and `caddy`.

**The five health endpoints** — all identical in shape today (`{ status, service }`), each gains one field:

```ts
server.get('/health', async () => ({
  status: 'ok', service: 'slot-engine', version: process.env.BUILD_GIT_SHA ?? 'unknown',
}));
```

### The migrate hard-fail

`migrate`'s compose `command` becomes a check-then-migrate sequence: compare `BUILD_GIT_SHA` against `EXPECTED_GIT_SHA` (passed at run time via `environment:`) and **exit non-zero on mismatch, before touching the database**. Implemented as `packages/database/scripts/verify-build-sha.mjs`, kept tiny and dependency-free.

This is precisely what would have caught the incident: the stale image's baked SHA would not have matched the SHA being deployed, and it would have refused rather than reporting success.

### The post-deploy verification script

`scripts/verify-deployment.mjs`, following the existing `scripts/test-regression.mjs` convention. **HTTP-only — no database credentials needed**, so it runs from anywhere:

- `GET /api/{slot-engine,identity,tenant,payment,notification}/health` → `version` must equal expected SHA
- `GET /version.json` and `GET /admin/version.json` → `sha` must equal expected SHA
- Prints a per-component PASS/FAIL table and exits non-zero if **any** component mismatches

Exposed as `pnpm run deploy:verify`, taking base URL and expected SHA.

### Making it mandatory, not available

Per your instruction, this must run every time rather than existing as a tool someone might invoke. The deployment runbook (`Implementation_Plan/GCP VM/gcp_vm_deployment_plan.md`) gains a **single canonical deploy sequence** ending in the verify step, with the sequence written so the verify command is not a separable trailing suggestion but the step that determines whether the deploy succeeded:

```bash
export GIT_SHA=$(cat BUILD_SHA)
docker compose --env-file .env build          # all images, GIT_SHA baked in
docker compose --env-file .env run --rm migrate   # hard-fails on stale image
docker compose --env-file .env up -d
pnpm run deploy:verify https://elitecourts.duckdns.org $GIT_SHA   # non-zero = deploy failed
```

The runbook states plainly that a deploy is **not complete** until the verify step exits zero — the migrate hard-fail covers schema, the verify script covers services and frontend, and neither substitutes for the other.

---

## Edge cases — against the standing categories

| Category | Assessment |
|---|---|
| **Information disclosure** | Per your second condition: the response must carry the SHA **and nothing else new**. `/health` gains exactly one field; `version.json` contains exactly `{"sha": "..."}`. No build paths, no env dump, no image or hostname. Verified by reading the actual live responses, not by inspecting the source that produces them. A git SHA for a private repo is not itself sensitive. |
| **Backward compatibility** | `/health` is consumed by Docker healthchecks and `waitForServer` in the test harness, both of which check status only — an added field is additive. To be confirmed, not assumed. |
| **Failure mode of the guard** | If `BUILD_GIT_SHA` is unset (local dev, `tsx` runs), `/health` reports `unknown`. Local development must not be broken by a deployment guard, so the migrate check applies **only when `EXPECTED_GIT_SHA` is set** — absent, it skips rather than fails. |
| **Production build vs dev runtime** | Full `pnpm -r run build` and whole-repo `typecheck`. |
| **Real browser** | No UI change. `version.json` is a static asset, verified by fetch rather than by rendering. |

---

## Files

**Modified:** `package.json` (packageManager pin, `deploy:verify` script) · `deploy/gcp-vm/Dockerfile.node-service` · `deploy/gcp-vm/Dockerfile.caddy-static` · `deploy/gcp-vm/docker-compose.yml` · `services/{slot-engine,identity-auth,tenant-management,payment,notification}/src/index.ts` (one field each) · `Implementation_Plan/GCP VM/gcp_vm_deployment_plan.md` (canonical sequence)

**New:** `packages/database/scripts/verify-build-sha.mjs` · `scripts/verify-deployment.mjs`

---

## Verification

**1. Corepack (F-078) — the failure mode is a hang, so prove absence of the prompt.** Build `migrate` non-interactively with stdin closed (`< /dev/null`); it must complete rather than block. Before the fix that hangs; after, it does not.

**2. Migrate hard-fail — red/green, per rule 9 Section F.** With images built at SHA *A*, run migrate with `EXPECTED_GIT_SHA=B`: it must **exit non-zero and refuse before touching the database**. Then run with `EXPECTED_GIT_SHA=A`: it proceeds. This is the direct simulation of the stale-image incident — the red state is exactly what happened on 9 Aug.

**3. Verify script — red/green per component.** Against the local stack, run with a deliberately wrong expected SHA: every component must report FAIL and the script exit non-zero. With the correct SHA: all PASS, exit zero. Then a **partial-staleness** case, which is the one that actually matters — rebuild only some images at a new SHA and confirm the script pinpoints *which* component is behind rather than failing generically.

**4. Disclosure check.** Fetch every `/health` and both `version.json` responses and show the **complete bodies**, confirming the SHA is the only addition.

**5. Regression + build.** Full `pnpm test:regression` (health endpoints are used by the harness's `waitForServer`), whole-repo `typecheck`, `pnpm -r run build`.

**6. Production, after the next real deploy.** The verify script passing against `elitecourts.duckdns.org` with all seven components reporting the same SHA — the first deploy where completeness is proven rather than assumed.

**Explicitly not verified:** whether the e2-medium resize is needed for every future `caddy` build. That was today's workaround for a memory ceiling and is orthogonal to this fix, though the runbook should record it as the known route.

---

## Out of scope

- **F-073's f023 chain** — still the last item blocking Tier 1's register closure.
- **F-072, F-075, F-076** — unrelated, still open.
- Migrating away from tarball deploys to a git checkout on the VM. `BUILD_SHA` gives the tarball provenance, which addresses the immediate gap; changing the deploy transport is a larger decision.
