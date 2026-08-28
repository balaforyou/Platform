# Deploy via Docker Hub — Complete Reference

The proven workflow as of 12-13 Aug 2026: build locally (fast, your own CPU/network), push to Docker Hub, pull on the VM (light — confirmed working even on `e2-micro`, no resize needed). This replaces building directly on the VM, which repeatedly hit resource limits.

**Fixed details:**
- Docker Hub: `balamuralikrishna/badminton-platform` (one private repo, one tag per service)
- VM: `badminton-demo-vm`, zone `us-central1-a`, `HP@` user
- Remote app path: `/home/HP/badminton-platform/deploy/gcp-vm/`

> **Steps 2–4 are now automated (F-193 Batch 3).** Every push to `main` runs
> `.github/workflows/ci.yml`'s `integration` job, which builds all 7 images, runs
> `verify-deployment.mjs` against them, and then — only on `main` — pushes each to Docker
> Hub as both `:<service>` (movable) and `:<service>-<full-sha>` (immutable). The manual
> Steps 2–4 below remain for local builds and emergencies. Steps 0–1 and 5–10 are still
> manual until Batch 4.

---

## Step 0 — Pull the latest commit locally

```powershell
cd D:\apps\Platform
git pull
git log -1 --oneline
```
Confirm this shows the commit you actually intend to deploy.

## Step 1 — Set the SHA for this deploy

```powershell
cd D:\apps\Platform\deploy\gcp-vm
$env:GIT_SHA = git rev-parse HEAD
echo $env:GIT_SHA
```
Copy this value — you'll need it repeatedly below. (Replace `<SHA>` everywhere it appears in the rest of this doc.)

## Step 2 — Build all seven images locally

```powershell
docker compose --env-file .env build slot-engine identity-auth tenant-management payment notification caddy migrate
```

## Step 3 — Tag for Docker Hub

```powershell
docker tag gcp-vm-slot-engine balamuralikrishna/badminton-platform:slot-engine
docker tag gcp-vm-identity-auth balamuralikrishna/badminton-platform:identity-auth
docker tag gcp-vm-tenant-management balamuralikrishna/badminton-platform:tenant-management
docker tag gcp-vm-payment balamuralikrishna/badminton-platform:payment
docker tag gcp-vm-notification balamuralikrishna/badminton-platform:notification
docker tag gcp-vm-caddy balamuralikrishna/badminton-platform:caddy
docker tag gcp-vm-migrate balamuralikrishna/badminton-platform:migrate
```

Quick check all seven landed:
```powershell
docker images | findstr balamuralikrishna
```

## Step 4 — Push to Docker Hub

```powershell
docker login
docker push balamuralikrishna/badminton-platform:slot-engine
docker push balamuralikrishna/badminton-platform:identity-auth
docker push balamuralikrishna/badminton-platform:tenant-management
docker push balamuralikrishna/badminton-platform:payment
docker push balamuralikrishna/badminton-platform:notification
docker push balamuralikrishna/badminton-platform:caddy
docker push balamuralikrishna/badminton-platform:migrate
```
Since the six backend images share most layers, most pushes after the first will show `Layer already exists` — fast, expected, not an error.

---

## Steps 5–10 — promote a SHA to the VM (F-193 Batch 4: `deploy/gcp-vm/promote.sh`)

Since Batch 3, CI pushes `:<svc>-<full-sha>` immutable images for **every** `main` commit, so
Steps 2–4 above are only for local/emergency builds. To promote an already-pushed SHA, run
`deploy/gcp-vm/promote.sh <SHA>` **on the VM** — it needs nothing but Docker.

**The VM's app tree is a plain copy, not a git checkout** (no `.git`), so the script does not
`git pull` and you must not `git checkout` there. `promote.sh` fetches the `docker-compose.yml`,
`Caddyfile`, and `verify-deployment.mjs` it needs for the target SHA directly from
`raw.githubusercontent.com`, SHA-pinned. Drive it from a laptop, bootstrapping the script the
same way (fetch it for `<SHA>`, then run via `bash`):

```bash
gcloud compute ssh badminton-demo-vm --zone=us-central1-a --tunnel-through-iap \
  --command "curl -fsSL https://raw.githubusercontent.com/balaforyou/Platform/<SHA>/deploy/gcp-vm/promote.sh -o ~/badminton-platform/deploy/gcp-vm/promote.sh && bash ~/badminton-platform/deploy/gcp-vm/promote.sh <SHA>"
```

`&&` inside the quoted `--command` is safe (the local shell does not interpret it), and there
is no `$VAR` for an intermediate shell to eat — `<SHA>` is a literal you substitute.
`promote.sh` must land at `~/badminton-platform/deploy/gcp-vm/` so it sits beside `.env` and
`docker-compose.yml`. One-time prerequisite on the VM: `sudo docker login`.

`promote.sh <SHA>` runs entirely on the VM and does, in order:

| # | doc step | what the script does |
|---|---|---|
| 1 | — | `curl` the target SHA's `docker-compose.yml` / `Caddyfile` / `verify-deployment.mjs` from GitHub raw; install the compose file + Caddyfile on the VM only if they differ (CRLF-insensitive), with a dated `.bak.promote.<epoch>` audit copy |
| 2 | — | snapshot **both** halves before any mutation: `gcp-vm-<svc>:rollback` image tags (all 7) and `docker-compose.yml.rollback` / `Caddyfile.rollback` |
| 5 | Step 5 | `docker pull balamuralikrishna/badminton-platform:<svc>-<SHA>` ×7 |
| 6 | Step 6 | retag each → `gcp-vm-<svc>` |
| 7 | Step 7 | write `GIT_SHA=<SHA>` into `.env` (the key Compose interpolation actually reads for the migrate guard — **not** `EXPECTED_GIT_SHA`; see the comment in the script); assert `SITE_ADDRESS=` present |
| 8 | Step 8 | `export GIT_SHA` + `sudo -E docker compose --env-file .env run --rm migrate` (F-077 guard — aborts on `FAIL: stale image`), then `up -d --force-recreate` the **6** long-running services (`migrate` is one-shot, `postgres`'s image is unchanged — neither is bounced) |
| — | — | `wait_for_ready` — poll all 7 endpoints `verify-deployment.mjs` checks until each returns `200` (`up -d` returns on container-start, not app-ready) |
| 10 | Step 10 | `docker compose logs caddy \| grep -c "listening only on the HTTP port"` must be `0` |
| 9 | Step 9 | `verify-deployment.mjs https://elitecourts.duckdns.org <SHA>` in a throwaway `node:22` container — all 7 must PASS |

Any failure prints `<script> <SHA> --rollback`, which restores **both** the
`gcp-vm-<svc>:rollback` image tags and the `*.rollback` config, then recreates.

The manual Steps 5–10 below remain valid if you ever need to run them by hand.

---

## Step 5 (manual) — On the VM: connect and pull

```powershell
gcloud compute ssh badminton-demo-vm --zone=us-central1-a --tunnel-through-iap
```

```bash
sudo docker login
sudo docker pull balamuralikrishna/badminton-platform:slot-engine
sudo docker pull balamuralikrishna/badminton-platform:identity-auth
sudo docker pull balamuralikrishna/badminton-platform:tenant-management
sudo docker pull balamuralikrishna/badminton-platform:payment
sudo docker pull balamuralikrishna/badminton-platform:notification
sudo docker pull balamuralikrishna/badminton-platform:caddy
sudo docker pull balamuralikrishna/badminton-platform:migrate
```

**Confirmed working directly on `e2-micro`** — no resize needed for pull + deploy, only for building directly on the VM (which this workflow avoids entirely).

## Step 6 — Retag to match `docker-compose.yml`'s expected names

```bash
sudo docker tag balamuralikrishna/badminton-platform:slot-engine gcp-vm-slot-engine
sudo docker tag balamuralikrishna/badminton-platform:identity-auth gcp-vm-identity-auth
sudo docker tag balamuralikrishna/badminton-platform:tenant-management gcp-vm-tenant-management
sudo docker tag balamuralikrishna/badminton-platform:payment gcp-vm-payment
sudo docker tag balamuralikrishna/badminton-platform:notification gcp-vm-notification
sudo docker tag balamuralikrishna/badminton-platform:caddy gcp-vm-caddy
sudo docker tag balamuralikrishna/badminton-platform:migrate gcp-vm-migrate
```

## Step 7 — Confirm `.env` has both required values

```bash
grep -E "EXPECTED_GIT_SHA|SITE_ADDRESS" ~/badminton-platform/deploy/gcp-vm/.env
```

If either is missing or stale, set them (replace `<SHA>`):
```bash
sed -i "s/EXPECTED_GIT_SHA=.*/EXPECTED_GIT_SHA=<SHA>/" ~/badminton-platform/deploy/gcp-vm/.env
grep -q '^SITE_ADDRESS=' ~/badminton-platform/deploy/gcp-vm/.env || echo 'SITE_ADDRESS=elitecourts.duckdns.org' >> ~/badminton-platform/deploy/gcp-vm/.env
```

## Step 8 — Migrate (with the SHA guard) and bring up the stack

**Critical: `sudo -E`, not plain `sudo`** — plain `sudo` strips shell-exported variables, which will make the guard fail even with everything else correct.

```bash
export GIT_SHA=<SHA>
cd ~/badminton-platform/deploy/gcp-vm
sudo -E docker compose --env-file .env run --rm migrate
```

Expected output: `[verify-build-sha] ok — image matches the deploy target (<SHA>)`. If it instead says `FAIL: stale image`, the pull/tag steps above didn't actually get the new images — go back and confirm the push from Step 4 genuinely completed with new layers (not all `Layer already exists`).

```bash
sudo docker compose --env-file .env up -d
sudo docker compose ps
```

---

## Step 9 — Verify, from your local machine

```powershell
node scripts/verify-deployment.mjs https://elitecourts.duckdns.org <SHA>
```
Should show all 7 components `PASS`, ending in `deploy is complete.`

**Known limitation (F-084)**: this script only checks the reported SHA, not the URL scheme — it cannot by itself detect HTTPS being silently down while HTTP still works. Always pair it with the next check.

## Step 10 — Confirm HTTPS is genuinely live, not silently degraded

```bash
docker compose --env-file .env logs caddy | grep -c "listening only on the HTTP port"
```
**Must read `0`.** Any non-zero count means Caddy fell back to HTTP-only — check that the `Caddyfile` volume mount and `SITE_ADDRESS` are both correctly in place (Step 7).

---

## Troubleshooting quick-reference

| Symptom | Cause | Fix |
|---|---|---|
| `FAIL: stale image` on migrate | Pulled/tagged images don't actually match the new push | Re-verify Step 4 actually pushed new layers, redo Steps 5-6 |
| `FAIL: EXPECTED_GIT_SHA is not set` despite `.env` having it | Plain `sudo` stripped the exported variable | Use `sudo -E`, not `sudo` |
| `fetch failed` on every component in the verify script | Site unreachable — check firewall/DNS first | `curl -i https://elitecourts.duckdns.org/...` directly; confirm `gcloud compute firewall-rules list` still has `allow-https` |
| Verify script passes, but site "feels wrong" / HTTPS suspect | Script can't detect scheme-level failure (F-084) | Always run the Caddy log grep (Step 10) as a second, independent check |
| `docker push`/`pull` for one image fails with a manifest error others didn't hit | Often transient registry-side | Simple retry of just that one command usually resolves it |

---

## Multi-tenant hostnames (added 19 Aug 2026, F-149)

`SITE_ADDRESS` now carries **every** tenant hostname, comma-separated — Caddy provisions a separate
Let's Encrypt certificate for each:

```
SITE_ADDRESS=elitecourts.duckdns.org, jbc.elitecourts.duckdns.org, courtowner1.elitecourts.duckdns.org
```

DuckDNS resolves arbitrary sub-subdomains to the same A record, so **adding a tenant needs no DNS
work** — append its hostname here and recreate caddy. Tenant resolution then works from the hostname
alone, with no `?tenant=` parameter, and survives refreshes and deep links.

**Config drift found and corrected the same day — check this before assuming a `.env` change works.**
The VM's `docker-compose.yml` had no `environment:` block for caddy at all, and its `Caddyfile`
hardcoded `elitecourts.duckdns.org {` instead of using the `{$SITE_ADDRESS::80}` placeholder. Both
predated the F-083 work in the repo. The symptom was silent and misleading: `docker compose config`
resolved `SITE_ADDRESS` correctly, so everything looked right, while the container never received the
variable and Caddy kept serving the single hardcoded name. Confirmed with
`docker exec <caddy> printenv`, which showed the variable simply absent.

Both files on the VM were replaced with the repo versions (backed up as `*.bak.<epoch>` alongside
them). **The VM's copies of `docker-compose.yml` and `Caddyfile` are not automatically in sync with
the repo — verify them, rather than trusting that a repo change reached the VM.**

Recreating caddy after an `.env` change needs `--force-recreate`; a plain `up -d` will report
`Started` without applying the new environment.

---

## Local development stacks (F-193 Batch 1)

Two compose overlays, for two different purposes. Neither touches the VM.

### Fast loop — `docker-compose.dev.yml`

Hot-reload every service and both frontends, in `node:22-bookworm` containers with the
repo bind-mounted, so a source edit takes effect with **no image rebuild**. The five
backend services run their existing `dev` script (`tsx watch src/index.ts`); the two
frontends run `pnpm exec vite --host 0.0.0.0` directly, because their `dev` scripts
hardcode `--host 127.0.0.1` which an appended flag cannot override.

```bash
pnpm dev:up      # docker compose -f docker-compose.yml -f docker-compose.dev.yml up
pnpm dev:down
```

- Reuses the base `docker-compose.yml` Postgres (`badminton_db`, service DNS `postgres:5432`).
- First `up` runs a one-shot `install` service: `pnpm install`, `prisma:generate`, and the
  shared-package builds. Every dev service waits for it. Subsequent `up`s reuse the deps —
  they live in **named volumes** (one per `node_modules` / generated-client / `dist` path),
  shared between `install` and the runtime services, so the Linux tree never collides with
  the Windows host and only `install` ever installs.
- App reachable at `http://localhost:8080` (guest PWA at `/`, admin at `/admin`), routed by
  `Caddyfile.dev`.
- Env values are fixed dev strings baked into the compose file — **not secrets**.

`pnpm db:reset:dev` drops and re-migrates `badminton_db` inside the dev container
(`prisma migrate reset --force --skip-seed`). On-demand only — Postgres data otherwise
persists.

- **Precondition:** the dev stack must have come up at least once (`pnpm dev:up`) so the
  named dep volumes are populated. It runs `--no-deps` (to avoid re-triggering the whole
  `install` chain), so on a cold machine with empty volumes it fails with `pnpm: not found`.
- **No F-101 guard on this path.** `prisma migrate reset` runs directly, *not* through the
  regression suites' `cleanDatabase()` where F-101's guard lives — so the guard does **not**
  protect this command. It is safe as written only because the dev container's
  `DATABASE_URL` is compose-internal (`postgres:5432`) and cannot reach the VM. A future
  port of this pattern to any context where `DATABASE_URL` could point elsewhere must add
  its own guard — do not assume protection that isn't there.

### Verification gate — `docker-compose.gcp-verify.yml`

Runs the **real shipped stack** (the production Dockerfiles/images) locally, for
`verify-deployment.mjs` and the Playwright e2e suite. The only delta from the shipped file is
Caddy published on host `8080` to match `playwright.config.ts`.

```bash
GIT_SHA=$(git rev-parse HEAD) \
  docker compose -f deploy/gcp-vm/docker-compose.yml \
                 -f docker-compose.gcp-verify.yml \
                 --env-file deploy/gcp-vm/.env up -d --build

node scripts/verify-deployment.mjs http://localhost:8080 $(git rev-parse HEAD)
```

Lives at the repo root, invoked explicitly — a `docker-compose.override.yml` under
`deploy/gcp-vm/` would auto-apply to VM deploys. See `deploy/gcp-vm/CLAUDE.md`.
