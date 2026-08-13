# GCP VM Deployment Plan

**Date written:** 1 Aug 2026  
**Status:** Plan artifact only. No GCP resources have been created by this plan.  
**Scope:** run the already-built Basic MVP on one persistent Google Compute Engine VM using Docker Compose, Postgres, the five backend services, the Guest-Member PWA, Admin Web, and Caddy.  
**Explicitly deferred:** Cloud Run, Cloud SQL, Firebase Hosting rewrites, Secret Manager, MSG91/Firebase Phone Auth, and real push/SMS delivery. Those are represented in `docs/gcp_deployment_diagram.drawio` as the later architecture, not this free-tier VM phase.

## Source Context

Required docs read before this plan:

- `docs/findings_register.md`
- `docs/coding_assistant_handover_plan.md`
- `docs/gcp_deployment_diagram.drawio`
- Current repo deployment files: `docker-compose.yml`, `Caddyfile`, `start-pwa-dev-tunnel.ps1`

Current open findings that do not block this VM/demo deployment:

- F-004: production routing for the later Firebase/Cloud Run architecture remains undecided.
- F-024: real OTP delivery is not integrated; demo/local fixed OTP remains the current path.
- F-025: real FCM/SMS notification delivery has not been verified.

Current repo mismatch found during plan prep:

- `docker-compose.yml` currently starts only Postgres.
- The local full stack is currently started by `start-pwa-dev-tunnel.ps1`, which starts Postgres externally plus five services, two Vite dev servers, Caddy, and Cloudflare Tunnel.
- Therefore this phase needs a VM-specific full-stack Docker Compose/deployment artifact. This is infrastructure work, not application feature work, but it is required before the VM can faithfully run the app.

## Current Free-Tier Verification

Official Google sources checked on 1 Aug 2026:

- Google Cloud Free Program: Compute Engine free tier includes one non-preemptible `e2-micro` VM per month in `us-west1`, `us-central1`, or `us-east1`, plus 30 GB-months standard persistent disk and 1 GB/month outbound data transfer from North America, with usage combined across supported regions. Source: https://docs.cloud.google.com/free/docs/free-cloud-features
- Google Cloud VPC network pricing: external IPv4 pricing is explicitly metered. Current table values are:
  - Static IP address assigned but unused: `$0.01 / hour`, with only `0 hour to 1 hour` free per month per account.
  - Static and ephemeral IP addresses in use on standard VM instances: `$0.005 / hour`, with the free tier limited to `0 hour to 1 hour` per month per account.
  - Static and ephemeral IP addresses attached to forwarding rules or used as a Cloud VPN public IP: no charge.
  Source: https://cloud.google.com/vpc/network-pricing
- Static IP docs: static addresses remain reserved to the project until released; if unassigned, they can incur charges. Source: https://docs.cloud.google.com/vpc/docs/reserve-static-external-ip-address

Important correction to earlier working assumption:

- Do not rely on "static external IP is free while attached" as a blanket statement. Current Google docs show a month-long in-use external IPv4 on a standard VM is priced at `$0.005/hour` after a one-hour monthly free tier. That is roughly `$3.60` for a 720-hour month before taxes/currency conversion, unless covered by credits or a billing-account-specific exception. This means the VM approach is no longer strictly guaranteed `$0` with IPv4; the plan must verify actual billing-account usage before provisioning and confirm real billing after deployment.

## Technical Design

### Approach

Deploy one Compute Engine VM:

- Machine: `e2-micro`
- Region: choose one of `us-west1`, `us-central1`, or `us-east1`
- Disk: 30 GB standard persistent disk
- External IP: one reserved regional static IPv4 attached to the VM
- Firewall: only TCP `80` and `443` exposed publicly
- Runtime: Docker Engine + Docker Compose plugin
- Reverse proxy: Caddy inside Docker or host-level Caddy, binding publicly on `0.0.0.0:80` and later `0.0.0.0:443`
- Internal service ports: private Docker network only, not exposed to the internet

The VM deployment will add these infra artifacts:

- `deploy/gcp-vm/docker-compose.yml`
- `deploy/gcp-vm/Dockerfile.node-service`
- `deploy/gcp-vm/Dockerfile.caddy-static`
- `deploy/gcp-vm/Caddyfile`
- `deploy/gcp-vm/.env.example` without secrets

No secrets are committed.

### Docker Build Strategy

Decision: use one shared multi-stage Dockerfile for all Node backend services, parameterized by package path/name, plus one Caddy/static image for both frontends.

Why this approach:

- The monorepo has five similar TypeScript/Fastify backend services and shared workspace packages.
- There are no existing service-specific Dockerfiles.
- A shared Dockerfile avoids five nearly identical Dockerfiles and keeps Prisma/client generation behavior consistent.
- Per-service `SERVICE_PATH` and `SERVICE_PACKAGE` build args keep runtime commands explicit.

Backend image shape:

```dockerfile
# deploy/gcp-vm/Dockerfile.node-service
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @badminton/database run prisma:generate
ARG SERVICE_PACKAGE
RUN pnpm --filter ${SERVICE_PACKAGE} run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=96
RUN corepack enable
COPY --from=build /app /app
ARG SERVICE_PATH
WORKDIR /app/${SERVICE_PATH}
CMD ["node", "dist/index.js"]
```

Compose will build the five services from that same Dockerfile:

```yaml
slot-engine:
  build:
    context: ../..
    dockerfile: deploy/gcp-vm/Dockerfile.node-service
    args:
      SERVICE_PACKAGE: "@badminton/slot-engine"
      SERVICE_PATH: "services/slot-engine"
  command: ["node", "dist/index.js"]
```

Frontend/static image shape:

- Build `@badminton/guest-member-pwa`.
- Build `@badminton/admin-web`.
- Copy their `dist` outputs into a Caddy image:
  - `/srv/guest-member-pwa`
  - `/srv/admin-web`
- Use `deploy/gcp-vm/Caddyfile`.

Decision: no Vite dev servers on the VM. Caddy serves production static builds.

### Migration Mechanism

Decision: use a one-off Compose migration service/job, not a manual command inside one long-running backend container.

The migration job uses the same built workspace image strategy and runs:

```bash
pnpm --filter @badminton/database run prisma:deploy
```

Compose shape:

```yaml
migrate:
  build:
    context: ../..
    dockerfile: deploy/gcp-vm/Dockerfile.node-service
    args:
      SERVICE_PACKAGE: "@badminton/database"
      SERVICE_PATH: "packages/database"
  env_file: .env
  depends_on:
    postgres:
      condition: service_healthy
  command: ["pnpm", "--filter", "@badminton/database", "run", "prisma:deploy"]
  restart: "no"
```

Packaging — run on the development machine before copying to the VM:

```bash
git rev-parse HEAD > BUILD_SHA
tar --exclude=node_modules --exclude=.git --exclude=.env --exclude=dist \
    --exclude=deploy-package.tar -cf tier1-deploy.tar \
    BUILD_SHA apps packages services deploy docs scripts \
    package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json Caddyfile
```

`BUILD_SHA` gives the tarball its own provenance. Before this, there was no way to tell which commit an archive represented without extracting it and grepping source — which is literally how F-077's stale frontend was identified. Use a dated or named archive rather than reusing `deploy-package.tar`, so a stale copy can never be mistaken for a fresh one.

Deployment order — **canonical sequence, revised after F-077 (9 Aug 2026)**:

```bash
export GIT_SHA=$(cat ~/badminton-platform/BUILD_SHA)

docker compose --env-file .env up -d postgres
docker compose --env-file .env build                 # every image, GIT_SHA baked in
docker compose --env-file .env run --rm migrate      # refuses to run from a stale image
docker compose --env-file .env up -d

pnpm run deploy:verify https://elitecourts.duckdns.org "$GIT_SHA"
```

**A deploy is not complete until the last command exits zero.** This is not a closing suggestion — it is the step that determines whether the deploy succeeded, and its exit code is the answer.

The reason is F-077. On 9 Aug a deploy rebuilt the application services while Docker served `migrate` from a cached image and `caddy` was skipped entirely under memory pressure. Production ran for nine days with three components at three different vintages. Every check available at the time passed: the containers were healthy, the smoke tests returned the expected `401`s, and `migrate` reported `"No pending migrations to apply."` before exiting `0`. Nothing distinguished that state from a good one until a user-facing screen returned a `42P10`.

Two guards now make that state impossible to reach quietly:

- **`migrate` refuses to run from a stale image.** Each image bakes the SHA it was built from; the deploy supplies the SHA it intends to run. A mismatch aborts before the database is touched. Note a migration *count* check cannot do this — a stale image and the database it already migrated agree with each other.
- **`deploy:verify` checks every component independently** — five services via `/health`, both frontends via `version.json` — and names whichever is behind. Partial staleness is the common failure, and knowing *which* component is stale is the difference between a one-line fix and a day of diagnosis.
- **The live `Caddyfile` is mounted, not baked (F-083).** `SITE_ADDRESS` must be set in `.env` to the real domain. Without a hostname Caddy serves plain HTTP and never requests a certificate — one `warn` line and no other symptom. Run `deploy:verify` against the `https://` URL specifically: if TLS is down every component fails to connect, which is a blunt signal but a real one.

**If a deploy was ever bypassed**, check before trusting anything about the running state:

```sql
SELECT * FROM "_deploy_audit" ORDER BY "at" DESC LIMIT 5;
```

`ALLOW_UNVERIFIED_MIGRATE=1` skips the stale-image guard. It exists deliberately — an invisible escape hatch is worse than a visible one — but every use writes a `MIGRATE_VERIFICATION_BYPASSED` row recording the image's SHA, the intended SHA and the time. The migrate container runs with `--rm`, so its console output belongs only to whoever was watching that terminal; this row is what makes a bypassed deploy visible to whoever looks next. An empty or absent table means no bypass has occurred.

Build memory: `caddy` compiles both Vite apps and exhausts an e2-small. The proven route is resizing the VM to e2-medium for the build and back down afterwards. **Do not skip `caddy` to avoid the resize** — that is precisely how the frontend fell a whole feature behind and stayed there, silently, because a stale bundle produces no symptom at all.

This makes database schema application explicit and repeatable after a VM rebuild without turning migrations into a side effect of every service start.

### Container Layout

Proposed compose services:

- `postgres`
  - image: `postgres:16-alpine`
  - persistent named volume mounted at `/var/lib/postgresql/data`
  - no public port mapping
  - tuned for 1 GB RAM
- `slot-engine`
  - internal port `3001`
  - connects to `postgres:5432`
- `identity-auth`
  - internal port `3002`
- `tenant-management`
  - internal port `3003`
- `payment`
  - internal port `3004`
- `notification`
  - internal port `3005`
- `caddy`
  - public `80:80`
  - public `443:443` when a real domain is attached
  - proxies `/api/*` to backend services on the Docker network
  - serves Guest-Member PWA and Admin Web static builds

The app should not expose `3001-3005`, `5432`, `5173`, or `5174` publicly.

### Health Endpoint Confirmation

All five backend health endpoints exist in current code:

| Service | Endpoint | Code reference |
| --- | --- | --- |
| Slot Engine | `GET /health` | `services/slot-engine/src/index.ts:369` |
| Identity Auth | `GET /health` | `services/identity-auth/src/index.ts:40` |
| Tenant Management | `GET /health` | `services/tenant-management/src/index.ts:68` |
| Payment | `GET /health` | `services/payment/src/index.ts:53` |
| Notification | `GET /health` | `services/notification/src/index.ts:126` |

Through Caddy on the VM, expected health URLs are:

```text
http://STATIC_IP/api/slot-engine/health
http://STATIC_IP/api/identity/health
http://STATIC_IP/api/tenant/health
http://STATIC_IP/api/payment/health
http://STATIC_IP/api/notification/health
```

### Caddy Binding

Local Caddy currently listens on `http://:8080` and proxies to `127.0.0.1` service ports. That is correct for local development but not sufficient as-is for a public VM.

VM Caddy should:

- bind to `:80` and optionally `:443`
- use Docker service names, not `127.0.0.1`, for backends:
  - `slot-engine:3001`
  - `identity-auth:3002`
  - `tenant-management:3003`
  - `payment:3004`
  - `notification:3005`
- preserve the `/admin` to `/admin/` rewrite that fixed the Admin Web bare-path bug.

Example route shape:

```caddyfile
:80 {
  @adminRoot {
    path /admin
  }
  rewrite @adminRoot /admin/

  handle /admin* {
    root * /srv/admin-web
    try_files {path} /admin/index.html
    file_server
  }

  route /api/slot-engine/* {
    uri strip_prefix /api/slot-engine
    reverse_proxy slot-engine:3001
  }

  route /api/identity/* {
    uri strip_prefix /api/identity
    reverse_proxy identity-auth:3002
  }

  route /api/tenant/* {
    uri strip_prefix /api/tenant
    reverse_proxy tenant-management:3003
  }

  route /api/payment/* {
    uri strip_prefix /api/payment
    reverse_proxy payment:3004
  }

  route /api/notification/* {
    uri strip_prefix /api/notification
    reverse_proxy notification:3005
  }

  root * /srv/guest-member-pwa
  try_files {path} /index.html
  file_server
}
```

If no domain is ready, HTTP on the static IP is acceptable for demo verification. HTTPS should wait for a domain DNS record pointed at the static IP; Caddy's automatic TLS needs a hostname, not just a raw IP.

**F-083 — this paragraph was already correct and the config still did not carry it.** The site address lives in `SITE_ADDRESS` (compose passes it to the `caddy` container, the `Caddyfile` reads it as `{$SITE_ADDRESS::80}`, defaulting to `:80` for local stacks). Set it to the bare domain — no scheme, no port. Getting this wrong is silent in both directions: a bare `:80` yields plain HTTP with one `warn` line, and the `Caddyfile` is mounted from disk rather than baked into the image, so an edit that is never mounted also does nothing. Verified red/green: with the mount absent the same image ignores `SITE_ADDRESS` entirely, `docker compose ps` reports `running`, HTTP serves `200` and HTTPS refuses the connection outright.

### Secrets Handling

Secrets must never enter git.

The VM `.env` should be created directly on the VM:

Option A, interactive SSH editor:

```bash
ssh USER@STATIC_IP
mkdir -p ~/badminton-platform/deploy/gcp-vm
nano ~/badminton-platform/deploy/gcp-vm/.env
chmod 600 ~/badminton-platform/deploy/gcp-vm/.env
```

Option B, direct local-to-VM `scp` from a local file that is outside git and deleted/secured afterward:

```powershell
scp C:\Users\HP\secure\badminton-prod.env USER@STATIC_IP:~/badminton-platform/deploy/gcp-vm/.env
ssh USER@STATIC_IP "chmod 600 ~/badminton-platform/deploy/gcp-vm/.env"
```

Do not:

- commit `.env`
- paste secrets into chat
- upload secrets through GitHub
- bake secrets into Docker images
- copy secrets via shared screenshots

Minimum VM `.env` values:

```dotenv
SITE_ADDRESS=elitecourts.duckdns.org
POSTGRES_USER=postgres
POSTGRES_PASSWORD=REPLACE_WITH_LONG_RANDOM_VALUE
POSTGRES_DB=badminton_db
DATABASE_URL=postgresql://postgres:REPLACE_WITH_LONG_RANDOM_VALUE@postgres:5432/badminton_db?schema=public
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_VALUE
INTERNAL_SERVICE_KEY=REPLACE_WITH_LONG_RANDOM_VALUE
RAZORPAY_KEY_ID=REPLACE_WITH_TEST_OR_REAL_VALUE
RAZORPAY_KEY_SECRET=REPLACE_WITH_TEST_OR_REAL_VALUE
RAZORPAY_WEBHOOK_SECRET=REPLACE_WITH_TEST_OR_REAL_VALUE
SLOT_ENGINE_URL=http://slot-engine:3001
IDENTITY_SERVICE_URL=http://identity-auth:3002
TENANT_SERVICE_URL=http://tenant-management:3003
PAYMENT_SERVICE_URL=http://payment:3004
NOTIFICATION_SERVICE_URL=http://notification:3005
```

For demo-only OTP, keep using the existing fixed test-code path until F-024 is addressed. Do not represent this as production-ready real SMS.

### RAM Headroom

An `e2-micro` has about 1 GB RAM, shared by OS, Docker, Postgres, Node services, and Caddy. The VM stack must be intentionally small.

Postgres tuning to add to the compose command or config:

```yaml
postgres:
  image: postgres:16-alpine
  command:
    - "postgres"
    - "-c"
    - "shared_buffers=64MB"
    - "-c"
    - "work_mem=2MB"
    - "-c"
    - "maintenance_work_mem=32MB"
    - "-c"
    - "max_connections=30"
    - "-c"
    - "effective_cache_size=256MB"
```

Node service container memory should be capped if Compose implementation supports it:

```yaml
environment:
  NODE_OPTIONS: "--max-old-space-size=96"
```

Operational expectation:

- This is a correctness/demo VM, not a performance deployment.
- The F-023 flow is the maximum realistic verification path.
- If memory pressure causes restarts, the fallback is either a larger paid VM or moving to the later Cloud Run/Cloud SQL architecture, not hiding instability.

### Reboot Behavior

Use Compose restart policies:

```yaml
restart: unless-stopped
```

or:

```yaml
restart: always
```

`docker compose up -d` should make containers return after VM reboot as long as Docker starts on boot.

System service check:

```bash
sudo systemctl enable docker
sudo systemctl is-enabled docker
```

## Edge Cases

### Trust Boundaries

- Only Caddy is public.
- Backends and Postgres are on the internal Docker network.
- Service-to-service auth still uses `INTERNAL_SERVICE_KEY`.
- Browser auth still uses JWT from Identity.
- Refund override/admin identity behavior remains server-derived from JWT.
- VM SSH access must be restricted to project/user SSH keys, not password login.

### Concurrency

- The deployed stack must run the same database migrations and Slot Engine code that passed F-022/F-023.
- Verification should include a real booking or F-023-like flow, not just service health checks.
- Container restarts must not corrupt Postgres volume state.

### Real Browser vs Script

Required done evidence must include:

- Guest PWA screenshot at public VM URL.
- Admin Web screenshot at public VM URL.
- Real login through the VM URL.
- Real booking flow through the VM URL.

`curl` health checks are necessary but insufficient.

### Production Build vs Dev Runtime

Do not ship `tsx watch` or Vite dev servers as the long-running public demo stack unless explicitly accepted as a temporary diagnostic. Preferred VM runtime:

- `pnpm build` during image build
- Node services run compiled `dist/index.js`
- Caddy serves built frontend static assets

This avoids dev-runtime blind spots already logged in the project.

### Multi-Instance / Restart

- Static IP must survive VM stop/start, not only reboot.
- Docker containers must restart after VM reboot.
- If the VM is stopped, ephemeral external IPs can change; this is why static IP is used.
- If the static IP is reserved but detached, billing risk increases.

### Billing/Free Tier

- Check current free-tier terms immediately before provisioning.
- Check whether the billing account already used the monthly `e2-micro` free-tier allowance.
- Check external IP usage and charges explicitly because current Google docs meter IPv4 with limited free-tier allowance.
- Capture billing screenshot a few days after deployment.

## User-Run Steps 1-4

These steps affect a real billing account. The agent must not run them unless the user gives explicit per-step approval.

### Step 1: Confirm Project and Billing Account

Console path:

1. Google Cloud Console
2. Project selector
3. Select or create project
4. Billing > My projects
5. Confirm the project is linked to the intended billing account
6. Billing > Budgets & alerts
7. Create a small alert, for example INR equivalent of USD `$1`

Command equivalent for the user:

```bash
gcloud auth login
gcloud projects list
gcloud config set project PROJECT_ID
gcloud beta billing projects describe PROJECT_ID
gcloud billing accounts list
```

Pre-free-tier check:

```bash
gcloud compute instances list --filter='machineType:e2-micro'
gcloud compute addresses list
```

Billing usage check must also be done in Console:

1. Billing > Reports
2. Group by SKU
3. Filter service: Compute Engine
4. Look for existing `e2-micro`, persistent disk, and external IP usage this month

Decision required from user:

- `PROJECT_ID`
- billing account
- target region: `us-west1`, `us-central1`, or `us-east1`

Recommended default if free-tier usage is unused: `us-central1`.

### Step 2: Reserve Static External IP

Replace `REGION` with the chosen free-tier region.

```bash
gcloud compute addresses create badminton-demo-ip \
  --region=REGION \
  --network-tier=STANDARD
```

Confirm:

```bash
gcloud compute addresses describe badminton-demo-ip \
  --region=REGION \
  --format='get(address,status,region)'
```

Expected status before VM attachment: `RESERVED`.

Billing caution:

- Do not leave this IP reserved and unattached.
- If VM creation is delayed, release it:

```bash
gcloud compute addresses delete badminton-demo-ip --region=REGION
```

Console path:

1. VPC network > IP addresses
2. Reserve external static IP address
3. Type: Regional
4. Region: chosen free-tier region
5. Network tier: Standard
6. Name: `badminton-demo-ip`

### Step 3: Create VM

Recommended command:

```bash
STATIC_IP=$(gcloud compute addresses describe badminton-demo-ip --region=REGION --format='get(address)')

gcloud compute instances create badminton-demo-vm \
  --zone=ZONE \
  --machine-type=e2-micro \
  --network-interface=network-tier=STANDARD,subnet=default,address=$STATIC_IP \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=http-server,https-server \
  --metadata=enable-oslogin=TRUE
```

Choose `ZONE` inside the selected region, for example:

- `us-central1-a`
- `us-west1-a`
- `us-east1-b`

Console path:

1. Compute Engine > VM instances > Create instance
2. Name: `badminton-demo-vm`
3. Region/zone: one of the free-tier regions/zones
4. Machine configuration: `e2-micro`
5. Boot disk: Debian 12, standard persistent disk, 30 GB
6. Networking > Network interface:
   - External IPv4 address: choose `badminton-demo-ip`
   - Network tier: Standard
7. Firewall checkboxes:
   - Allow HTTP
   - Allow HTTPS
8. Advanced > Security:
   - Prefer OS Login if available in the project

Confirm after creation:

```bash
gcloud compute instances describe badminton-demo-vm \
  --zone=ZONE \
  --format='get(name,status,machineType,networkInterfaces[0].accessConfigs[0].natIP,disks[0].diskSizeGb)'
```

### Step 4: Firewall Rules

If using the VM tags `http-server,https-server`, default network projects often already have matching firewall rules. Verify:

```bash
gcloud compute firewall-rules list \
  --filter='allowed.tcp:(80 443)' \
  --format='table(name,direction,allowed,targetTags,sourceRanges)'
```

If rules are missing, create only HTTP/HTTPS:

```bash
gcloud compute firewall-rules create allow-http-badminton-demo \
  --allow=tcp:80 \
  --direction=INGRESS \
  --target-tags=http-server \
  --source-ranges=0.0.0.0/0

gcloud compute firewall-rules create allow-https-badminton-demo \
  --allow=tcp:443 \
  --direction=INGRESS \
  --target-tags=https-server \
  --source-ranges=0.0.0.0/0
```

Do not create public firewall rules for:

- `3001`
- `3002`
- `3003`
- `3004`
- `3005`
- `5432`
- `65432`
- `5173`
- `5174`

Confirm:

```bash
gcloud compute firewall-rules list \
  --format='table(name,allowed,targetTags,sourceRanges)'
```

## Agent-Handled Steps 5-7 After VM Exists

These can be handled by the agent only after the user confirms the VM exists and SSH access works.

### Step 5: Install Docker and Compose

Commands for Debian 12 VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

### Step 6: Transfer Repo and Secure `.env`

Option A, Git clone without secrets:

```bash
git clone REPO_URL ~/badminton-platform
cd ~/badminton-platform
```

Option B, local copy:

```powershell
scp -r D:\apps\Platform USER@STATIC_IP:~/badminton-platform
```

Preferred for secrets:

```powershell
scp C:\Users\HP\secure\badminton-vm.env USER@STATIC_IP:~/badminton-platform/deploy/gcp-vm/.env
ssh USER@STATIC_IP "chmod 600 ~/badminton-platform/deploy/gcp-vm/.env"
```

Do not transfer `.env` through git.

### Step 7: Start Stack and Verify

On VM:

```bash
cd ~/badminton-platform/deploy/gcp-vm
docker compose --env-file .env up -d postgres
docker compose --env-file .env run --rm migrate
docker compose --env-file .env up -d --build
docker compose ps
docker compose logs --tail=100
```

Health checks:

```bash
curl -i http://STATIC_IP/api/tenant/health
curl -i http://STATIC_IP/api/identity/health
curl -i http://STATIC_IP/api/slot-engine/health
curl -i http://STATIC_IP/
curl -i http://STATIC_IP/admin/
```

Browser checks:

- `http://STATIC_IP/?tenant=courtowner1`
- `http://STATIC_IP/admin/?tenant=courtowner1`

## Verification Plan

### Cost and Static IP

Before deployment:

- screenshot Billing > Reports filtered to Compute Engine for current month
- screenshot/create budget alert
- `gcloud compute addresses list`
- `gcloud compute instances list`

After deployment:

- `gcloud compute addresses list` shows `badminton-demo-ip` as `IN_USE`
- stop/start VM:

```bash
gcloud compute instances stop badminton-demo-vm --zone=ZONE
gcloud compute instances start badminton-demo-vm --zone=ZONE
gcloud compute instances describe badminton-demo-vm --zone=ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

- Confirm same static IP after stop/start.

Several days later:

- Billing console screenshot proving actual spend, expected target `$0` only if free-tier and external IP allowance remain unused/covered.

### Runtime

- `docker compose ps` all services healthy/running.
- VM reboot test:

```bash
sudo reboot
```

After reconnecting:

```bash
docker compose ps
```

Expected: stack restarted without manual `docker compose up`.

### Browser Evidence

Required screenshots:

- Guest PWA home at `http://STATIC_IP/?tenant=courtowner1`
- Login screen at VM URL
- Member dashboard card after login
- Guest booking slot selection
- Payment/mock capture or test Razorpay path, depending on credentials
- Booking confirmation
- Admin Web overview at `http://STATIC_IP/admin/?tenant=courtowner1`

Required request/response evidence:

- tenant resolve
- OTP request/verify
- availability fetch
- booking create
- payment capture or payment intent path

### Security

Confirm from local machine:

```bash
curl -I http://STATIC_IP:3001
curl -I http://STATIC_IP:3002
curl -I http://STATIC_IP:3003
curl -I http://STATIC_IP:3004
curl -I http://STATIC_IP:3005
curl -I http://STATIC_IP:5432
```

Expected: unreachable/blocked. Only `80` and `443` should respond.

## Stop Point

This document is the plan artifact only.

Do not create GCP resources, reserve IPs, attach billing, or run project commands against a real GCP account until the user explicitly approves the specific next action.
