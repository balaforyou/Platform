# F-193 Batch 4 — GCP promotion script (`deploy/gcp-vm/promote.sh`) — backfilled plan/design doc

**Backfill, not a correction.** Written 2026-09-25, after the fact. F-193 Batch 4 shipped on
2026-08-28 as commit `12c0e32` (script), `6ba68e0` (exec-bit + stale-doc fixup found in review),
and `b1bbd19` (register close-out) — all direct-to-`main`, no PR. The root `CLAUDE.md` rule
requiring a `claude/claude-code-plan-<slug>.md` file alongside any finding fix with a real design
decision was not followed at the time; this document exists only now, to catch the record up. It
is reconstructed from the real saved plan-mode file for this sub-batch
(`imperative-imagining-lynx.md`, headed "F-193 Batch 4 — GCP promotion script. Implementation
plan."), the F-193 register row (Resolved section, `docs/findings_register.md`), and the three
real commits — cross-checked against each other, not invented.

## Status

Already implemented, merged to `main`, and deployed — live-fire verified against the real GCP VM
on 2026-08-28 (see Evidence below). **This doc is documentation-only.** No code changes, no
register changes, no `docs/plans/batch-log.md` changes are made by writing it. F-193's register
row already shows `Resolved` with all four sub-batches accounted for; nothing here reopens or
amends that entry.

## Context — what the script needed to do, and why

F-193 is a Chief-directed deploy-pipeline consolidation, not a bug fix. Sub-batches 1–3 (local
dev compose, CI rewrite, Docker Hub push) were already closed on `main` by the time Batch 4
started. What remained was `docs/deploy_via_dockerhub_reference.md` steps 5–10: a hand-run
sequence of SSH commands to actually promote a built SHA onto the live GCP VM serving JBC and
`courtowner1` — exactly the shape of thing `deploy/gcp-vm/CLAUDE.md`'s traps exist for (`||`/`$VAR`
lost to intermediate shells, CRLF breaking heredocs, `sudo` stripping env or logging secrets).

Before touching anything, the plan verified live state rather than trusting the last report:
`node scripts/verify-deployment.mjs https://elitecourts.duckdns.org 3545900` showed the VM running
a **split deploy** — 5 backend services at `eba3b93cef0e…`, both frontends at `5196a54c0527…` —
the exact F-077 drift scenario the platform's migrate guard exists to prevent. Promoting `3545900`
via the new script was therefore a genuine fix on top of being a process improvement, not just a
demo of automation.

The plan's investigation basis (verified on disk before implementation, at commit `3545900`):
`packages/database/scripts/verify-build-sha.mjs` fail-closes on a missing or mismatched
`EXPECTED_GIT_SHA`/`BUILT_GIT_SHA` pair, bypassable only by `ALLOW_UNVERIFIED_MIGRATE=1` (never
set here); `deploy/gcp-vm/docker-compose.yml`'s `migrate` service reads `EXPECTED_GIT_SHA` from
Compose's `${GIT_SHA:-}` interpolation, so `GIT_SHA` must reach `docker compose` via `.env`
and/or `export` + `sudo -E`; the Caddy HTTP-fallback string (`deploy/gcp-vm/Caddyfile:2`,
"server is listening only on the HTTP port...") is the F-083/F-084 signal that must read as a
`0`-count grep; and `verify-deployment.mjs` is HTTP-only, not baked into any service image, and
runs fine standalone against the live HTTPS URL.

## The real alternative considered and rejected — the load-bearing design decision

**Original plan (per the saved plan-mode file's own framing, and per the register's summary of
"steps 5–10"):** promote a SHA to the VM the way the manual runbook did — SSH in, `git fetch
origin`, `git checkout <sha>`, assert `HEAD == <sha>`, then rebuild/retag/restart from that
checkout.

**What broke it, discovered mid-implementation by actually SSHing in and checking (not assumed):**
`~/badminton-platform` on the VM is **not a git checkout at all** — it is a plain file copy from
13 Aug, dropped there once and never subsequently `git`-managed. `git checkout <sha>` is
categorically impossible against a directory with no `.git`. This also meant no local Node on the
VM host (so `verify-deployment.mjs` has to run inside a throwaway container, which the script
already needed to do anyway) and that `deploy/gcp-vm/Caddyfile`/`docker-compose.yml` on the VM had
already drifted from the repo in small, real ways (CRLF line endings from an old Windows `scp`;
one missing `:ro` on the Caddyfile mount plus a stale F-083 comment) — the kind of manual-sync gap
the whole sub-batch existed to close.

**Alternative designed instead: fetch deploy config from GitHub raw, keyed to the target SHA.**
Rather than requiring the VM tree to be a git checkout, `promote.sh` `curl`s
`deploy/gcp-vm/docker-compose.yml`, `deploy/gcp-vm/Caddyfile`, and `scripts/verify-deployment.mjs`
straight from `raw.githubusercontent.com/balaforyou/Platform/<sha>/…`. This has three properties
that make it safe rather than merely convenient:

1. **It is SHA-pinned by construction, not by trust.** The URL itself embeds `<sha>` — there is no
   separate "verify the fetched content matches the SHA" step because GitHub's raw-content path
   *is* the addressing mechanism; fetching a different SHA's config is fetching a different URL,
   not the same URL with mismatched content. This is a stronger guarantee than a post-hoc checksum
   would have been against a mutable branch ref.
2. **Config is installed only on real, CRLF-insensitive drift, with a dated backup.** The
   compose file and Caddyfile are written to the VM only if they differ from what's already there
   (ignoring line-ending noise), and every actual overwrite keeps a `.bak.promote.<epoch>` audit
   copy — the same reconciliation the 19 Aug F-149 Caddy fix had to do by hand, now automated and
   auditable instead of a one-off manual pass.
3. **`verify-deployment.mjs` is never installed on the VM at all** — it is fetched to `/tmp` and
   run straight out of a throwaway `node:22-bookworm-slim` container. There is nothing on the VM
   host to go stale between promotions.

**What happens on fetch failure:** the script runs under `set -euo pipefail` with an ERR trap that
prints the rollback command; a failed `curl` (network issue, bad SHA, GitHub outage) aborts the
whole run before any mutation, the same as any other step failing. Because the config-fetch step
runs first, before any image pull/retag/`.env` edit, a fetch failure leaves the VM in its
pre-promotion state — nothing to roll back yet. A failure *after* config is installed (steps
completed but images/migrate not yet run) is what the rollback redesign below closes.

**Second-order consequence, folded into the same design:** because the GitHub-raw fetch can
install new config before the rest of a promotion completes, the original `--rollback` design
(images only) had a gap — a run that fails after config lands but before verification passes could
leave new config paired with old images. The shipped script closes this by snapshotting **both**
halves unconditionally on every forward run, before any mutation: `docker-compose.yml`/`Caddyfile`
→ `*.rollback`, and all 7 `gcp-vm-<svc>` images → `gcp-vm-<svc>:rollback`. `--rollback` restores
both together, never just one.

**Honest gap between plan and what shipped:** the saved plan-mode file's own "Files changed"
table lists this as a design already revised mid-document — the file's heading still says
"Implementation plan" but its body is written post-discovery, so there is no separate prior
artifact showing the `git checkout` design as originally drafted before the pivot; the pivot is
documented only as a "VM reality — discovered during implementation, changes the design" section
inside the same file. This backfill doc treats that section as authoritative for what was
considered and rejected, since no earlier draft exists to compare it against.

## Blast-radius check (rule 3a)

- **`deploy/gcp-vm/promote.sh`** — new file. Invoked only by an operator on the VM (directly, or
  via the documented `gcloud compute ssh ... --command "..."` one-liner from a laptop). Nothing in
  CI or in any of the 5 services/2 frontends references or imports it.
- **`deploy/gcp-vm/docker-compose.yml` / `Caddyfile` / `.env`** — not modified in the repo by this
  change. On the VM, the script *reads* the compose file as fetched and *edits only* the `GIT_SHA`
  key of `.env` (append or `sed -i` on that exact line) — it never touches a credential line
  (`deploy/gcp-vm/CLAUDE.md` traps 7–9).
- **`packages/database/scripts/verify-build-sha.mjs` / root `scripts/verify-deployment.mjs`** —
  not modified; driven exactly as they already existed, via the F-077 migrate guard and the final
  verification step respectively.
- **CI (`.github/workflows/ci.yml`)** — unaffected. CI's job is build/test/push (F-193 sub-batches
  1–3); `promote.sh` is the separate, human-triggered promotion step that consumes CI's pushed
  images. No CI job invokes `promote.sh`.
- **The live VM / real customers** — `up -d --force-recreate` briefly recreates the 6 long-running
  app services (not `migrate`, which is one-shot, and not `postgres`, whose image is unchanged and
  whose data volume persists). This is a real deploy to `jbc.elitecourts.duckdns.org` and
  `courtowner1.elitecourts.duckdns.org` — seconds of downtime, the same order of magnitude as any
  other deploy, not a new risk class.
- **Docker Hub** — read-only from the script's perspective (pulls the 7 already-pushed immutable
  `:<svc>-<sha>` tags; nothing is pushed by `promote.sh`).
- **`docs/deploy_via_dockerhub_reference.md`** — steps 5–10 replaced with "run
  `./deploy/gcp-vm/promote.sh <sha>` on the VM"; the manual commands kept as a collapsed fallback.
  A follow-up fixup (`6ba68e0`, same day) caught that the doc's own `--command` one-liner still
  said `git fetch origin && git checkout <sha> && ./promote.sh` — stale text written before the
  "VM isn't a git checkout" discovery — and replaced it with a self-bootstrapping form that
  `curl`s the target-SHA `promote.sh` into place and runs it via `bash` (also fixing that the
  bare `./promote.sh` invocation silently depended on an executable bit that a prior editor
  round-trip had already dropped — the file was committed `100644`, not `100755`).

No change to any Dockerfile, any service, any app, or `.env.ci`.

## What was actually built

- `deploy/gcp-vm/promote.sh <target-git-sha> [--rollback]`, committed executable (`100755` after
  the `6ba68e0` fixup), `set -euo pipefail`, ERR trap prints the rollback command, `bash -n` +
  `shellcheck` clean. `.gitattributes` forces `*.sh` to LF so a Windows checkout stays scp-safe.
- **Forward promotion**, in order: (1) fetch `docker-compose.yml`/`Caddyfile`/
  `verify-deployment.mjs` for `<sha>` from GitHub raw, install the first two only on real
  (CRLF-insensitive) drift with a `.bak.promote.<epoch>` backup; (0) snapshot all 7
  `gcp-vm-<svc>` images to `:rollback` tags plus both config files to `*.rollback`, unconditionally,
  before any mutation; (5) pull the 7 `balamuralikrishna/badminton-platform:<svc>-<sha>` immutable
  images; (6) retag each to `gcp-vm-<svc>`; (7) write `GIT_SHA=<sha>` into `.env` (not
  `EXPECTED_GIT_SHA` — Compose interpolation reads `${GIT_SHA}`; the old manual runbook's
  `EXPECTED_GIT_SHA=` edit was dead weight), asserting `SITE_ADDRESS=` is present, never touching a
  credential line; (8) `export GIT_SHA=<sha>`, `sudo -E docker compose --env-file .env run --rm
  migrate` — must print `[verify-build-sha] ok — image matches the deploy target (<sha>).` — then
  `sudo docker compose --env-file .env up -d --force-recreate` the 6 long-running app services
  (never `postgres`, never unscoped); (10) Caddy HTTP-fallback grep, must read `0`; (9)
  `verify-deployment.mjs`, fetched into the throwaway container, run against the live HTTPS URL,
  all 7 must PASS. Step 10 deliberately runs before step 9 — the Caddy grep is VM-local and can't
  be defeated by a scheme-level failure `verify-deployment` is blind to (F-084).
- **`--rollback`** restores both halves together — the `*.rollback` config files and the
  `gcp-vm-<svc>:rollback` image tags — then re-runs `up -d --force-recreate` and the Caddy grep.
- `docs/deploy_via_dockerhub_reference.md` steps 5–10 replaced by the script invocation, with the
  manual sequence kept as a collapsed fallback and a corrected table (6 services recreated, not 7;
  config snapshot + GitHub-raw fetch + `wait_for_ready` now listed).
- Root `CLAUDE.md` gained one line in "Deployment" noting CI pushes on `main` and `promote.sh`
  promotes a SHA to the VM.
- A **readiness race** was found and fixed during the first live run, not anticipated in the
  original plan: `up -d` returns as soon as containers start, not once the app is actually
  answering, and Caddy 502s in the gap. `wait_for_ready` was added to poll all 7 endpoints until
  200, the same class of fix CI's own `0d93c17` had already made for its "wait for Caddy" step.
- A **separate finding was raised, not folded in**: the base images `node:22-bookworm-slim` and
  `caddy:2-alpine` are moving tags, not digest-pinned. Logged to Chief as its own candidate rather
  than fixed here (register confirms: "raised as a separate finding for Chief, not folded in").

## Verification — real evidence (from the register Resolution and the plan's own Evidence section)

- `bash -n` and `shellcheck` both clean before the live run.
- **First live run** (`b86k…`): deployed correctly — F-077 guard PASS, Postgres never touched,
  Caddy grep `0`, the VM's config `:ro`-mount drift reconciled — but the verify step raced the
  boot and hit a transient 502, exit 1. This is what surfaced the readiness race; `wait_for_ready`
  was added in response.
- **Clean re-run** (`blye2hn73`, exit 0): idempotent (configs reported "already current", images
  "up to date"), `wait_for_ready` rode out `Connection refused → 502 → all 7 answering after
  ~12s`, `verify-deployment.mjs` reported **all 7 PASS at `354590012bdf`**, script printed
  `== PROMOTION COMPLETE ==`.
- **Independent cross-check**, not just the script's own report: local
  `node scripts/verify-deployment.mjs https://elitecourts.duckdns.org 3545900` also all 7 PASS
  (previously 7/7 FAIL against the split deploy, proving the promotion actually landed); all three
  customer domains returned HTTP 200 with valid certificates; the live API's `version` field
  returned `354590012bdf…`.
- Rollback was armed (7 image `:rollback` tags plus 2 config `.rollback` files confirmed present)
  but deliberately **not executed** — exercising it would mean deliberately disrupting the live
  customer stack for a test; the path was verified as available instead.
- The two-commit fixup (`6ba68e0`) was itself caught in review, not in a second live-fire pass —
  the exec-bit and stale-doc-text gaps did not affect the already-verified promotion, since that
  run used `bash promote.sh` explicitly rather than relying on the exec bit.

## Sign-off note

F-193 Batch 4 is already merged (`12c0e32`, `6ba68e0`) and deployed; the register row (`b1bbd19`)
already shows Resolved. This document makes no code or register change — it only backfills the
`claude/claude-code-plan-<slug>.md` the standing workflow calls for, after the fact. No commit is
made by writing it; only doc-level sign-off (confirming this record accurately reflects what
shipped) is needed here, not implementation sign-off.
