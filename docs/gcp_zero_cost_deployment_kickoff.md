Before anything else: read docs/findings_register.md, docs/coding_assistant_handover_plan.md, and docs/gcp_deployment_diagram.drawio (or its description) for context on what was already decided and what's still open (F-004, F-024, F-025 — none of them block this).

Standing rules, restated inline, apply here too even though this is infrastructure work, not application code:
- Plan artifact first, approved before any resource gets created or any command runs against the real GCP account.
- Full Technical Design section, adapted for infra: approach, edge cases, verification plan.
- **No GCP resource creation, no billing-account action, until an explicit "go ahead" is given** — same weight as the commit sign-off rule, just applied to cloud provisioning instead of git.
- Real evidence for verification — actual URLs reached, actual screenshots of the deployed app working, not just "the VM is up."

## Scope — replicate the exact local Docker Compose setup, just on a persistent cloud VM

Nothing about the application changes. The same Postgres + 5 backend services + Caddy stack that's been proven correct through every review round in this project gets relocated from the local machine to one small, always-on cloud VM. No Cloud Run, no Cloud SQL, no Firebase Hosting split — that's the deliberately deferred next-stage architecture (see the GCP deployment diagram), not this phase.

**Target, as already researched and confirmed:**
- GCP Compute Engine, `e2-micro` machine type
- One of the three Always-Free-eligible regions: `us-west1`, `us-central1`, or `us-east1` — **not** the originally-planned `asia-south1`, since the free tier doesn't apply there
- A reserved **static external IP**, attached to the VM (confirmed free while attached, only costs money if reserved-but-unused)
- 30GB persistent disk (within the free allowance)

## Division of responsibility — this is the important part, given this touches a real billing account

**Steps that must be done by the user directly, or by the agent only with explicit per-step confirmation** (not autonomously, given real financial/account stakes):
1. Confirming the GCP project/billing account to use
2. Creating the VM itself (region, machine type, disk)
3. Reserving and attaching the static IP
4. Configuring firewall rules (only 80/443 need to be open)

**Steps reasonable for the agent to handle once the VM exists and is SSH-accessible:**
5. Installing Docker + Docker Compose on the VM
6. Transferring the repo/compose file/`.env` onto the VM
7. Starting the stack and verifying it responds

Propose the plan covering all 7 steps, but steps 1-4 should be presented as **exact commands or console click-paths for the user to run themselves**, not executed by the agent directly against a live billing account without explicit per-action confirmation.

## Technical Design — things to get right, not just "make it work"

**Secrets handling**: the `.env` file with real values (JWT secrets, Razorpay keys, database password) must be created directly on the VM, never committed to the repo or transferred through any path that could leak it — same discipline as the two secret-exposure incidents already logged in this project's history. State explicitly in the plan how this file gets onto the VM securely (e.g., `scp` directly, not via git).

**Caddy binding**: locally, Caddy binds to `127.0.0.1`/`localhost`. On the VM, it needs to bind to the VM's actual network interface (`0.0.0.0` or the VM's internal IP) to be reachable externally at all — confirm this is addressed, it's an easy thing to miss.

**RAM headroom**: 1GB total, shared across Postgres + 5 Node services + Caddy + the OS. Propose specific Postgres tuning (lower `shared_buffers`/`work_mem` — this doesn't need production-grade performance, just correctness) rather than leaving defaults that assume more memory than this VM has.

**Firewall**: only 80 and 443 need to be open externally — nothing else should be exposed to the internet (not 3001-3005 directly, not 5432/Postgres's port).

## Edge cases to check explicitly

- **Re-verify the free-tier terms right before provisioning, not from memory** — pricing/eligibility pages can change, and the earlier research in this conversation is now some time old.
- **What if this GCP account has already used its Always Free e2-micro allowance** (e.g., from unrelated prior use)? The plan should state how to check this before assuming $0.
- **Cold-start/reboot behavior**: does the Docker Compose stack correctly restart automatically if the VM itself reboots (e.g., due to GCP maintenance), or does someone need to manually run `docker-compose up` again? Worth using `restart: always` (or `unless-stopped`) in the compose file if not already set.

## Verification required before calling this done

- The static IP is confirmed genuinely static (survives a VM stop/start cycle, not just a reboot)
- Both apps (Guest PWA and Admin Web) load correctly at the real public URL, not just `curl` returning `200`
- A real login + a real booking flow completed through the deployed instance, not just the local one
- Actual GCP Billing console screenshot, a few days after deployment, confirming genuine $0 spend — this is the real proof, not just "should be free"

Stop after the plan artifact — specifically the exact steps 1-4 commands/console-paths for the user to review and run themselves. Do not create any GCP resource until that's explicitly approved.
