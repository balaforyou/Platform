# Deploy via Docker Hub — Complete Reference

The proven workflow as of 12-13 Aug 2026: build locally (fast, your own CPU/network), push to Docker Hub, pull on the VM (light — confirmed working even on `e2-micro`, no resize needed). This replaces building directly on the VM, which repeatedly hit resource limits.

**Fixed details:**
- Docker Hub: `balamuralikrishna/badminton-platform` (one private repo, one tag per service)
- VM: `badminton-demo-vm`, zone `us-central1-a`, `HP@` user
- Remote app path: `/home/HP/badminton-platform/deploy/gcp-vm/`

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

## Step 5 — On the VM: connect and pull

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
