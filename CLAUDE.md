# CLAUDE.md — Slotflow (Badminton Court Booking Platform)

Auto-loaded at the start of every Claude Code session in this repo. Read this before starting any task.

## What this is

Multi-tenant sports court booking SaaS. 5 backend services (`services/slot-engine`, `identity-auth`, `tenant-management`, `payment`, `notification`), 2 frontend apps (`apps/admin-web`, `apps/guest-member-pwa`). Real customer: JBC, live at `jbc.elitecourts.duckdns.org` and `courtowner1.elitecourts.duckdns.org`.

## Source of truth

**`docs/findings_register.md` is canonical, not this conversation.** Only the reviewer (Bala, via the review conversation) assigns finding IDs — never self-assign. Verify register integrity before committing (no duplicate IDs, correct column counts) and confirm `pnpm diagram:verify` passes if the change touches a tagged finding.

**If a referenced ID isn't actually in the register, don't invent content and don't silently skip it.** Say so plainly, and log under that number only when the reviewer supplied the content. This has happened for real: an ID was described as "already logged, just merge into it" when nothing existed under it.

## Standing workflow — every task

1. **Plan mode first.** Investigate → write a real plan → wait for explicit approval → implement → real evidence → wait for sign-off. Never skip to implementation.
2. **Real evidence, not reasoning from code alone.** A code read is a hypothesis; running it is evidence. Live-fire proof (real requests, real database read-backs) over inferred correctness.
3. **Investigate real callers before adding auth guards.** Search both frontend apps and all five services — don't assume based on one file.
4. **Reuse proven patterns.** Check for an existing precedent (`requireInternalKey`, `requirePoolScope`, `CourtBooking.tsx`'s error-banner pattern, F-067/F-115's self-defending migration `DO $$` block) before designing something new.
5. **No commit without explicit sign-off.** State this plainly at the end of every plan.
6. **Check current state before trusting a finding's text.** Register entries can go stale even when real fixes land — verify against actual code.
7. **Don't let one fix silently absorb an adjacent finding.** Flag related-but-different issues as their own findings.
8. **Capture the failing "before" state on the deployed stack before deploying the fix.** Once the fix ships the defect cannot be reproduced, and rule 2 becomes unsatisfiable. When "commit only after proof" collides with "proof needs a deployed build", resolve it in the open rather than breaking either rule: deploy an honestly-labelled provisional image (`GIT_SHA=<sha>-<finding>-preproof`), capture the proof, then commit and redeploy with the real SHA and re-verify.

## Known process traps — real, already paid for once

- **Rebuild before testing regression.** Suites run from `dist`. Testing against a stale build is a real, repeated trap (F-085).
- **Never run the regression suite against `badminton_db` or `badminton_db_test` interchangeably without checking.** A database guard exists (F-101) specifically because this destroyed provisioned demo data twice. Use `badminton_db_test` for anything destructive.
- **Port collisions produce misleading failures.** If manually-started dev services hold ports 3001–3005, the regression harness silently tests against them instead of spawning its own — reads as confusing assertion failures, not "port in use." Stop manual instances first.
- **Escape `|` characters in markdown table cells.** Code spans containing `||` (e.g. `` `error || !booking` ``) break table row parsing — this has happened multiple times. Check rendered cell count, not just raw pipe count. **Count pipes _not preceded by a backslash_: Open rows have 6, Resolved rows have 7.** A raw `|` count reports correctly-escaped rows as broken — that produced four false alarms in one session, against rows that were fine.
- **`sudo` strips shell-exported env vars.** Use `sudo -E` when a variable needs to survive into a privileged command (relevant for deploy-time SHA checks).
- **A stale `migrate` Docker image reports success while skipping real migrations.** Always confirm via the build-SHA verification (`verify-build-sha.mjs`), not just "no pending migrations" output.
- **Caddy needs `SITE_ADDRESS` and the real `Caddyfile` — check the VM's actual running config, don't assume it matches the repo.** Config drift between the VM and repo has caused real, hard-to-diagnose deploy failures.
- **A single suite failing is often environmental, not a regression.** Suites interacting can fail one another. Re-run the suite in isolation and then re-run the full set before concluding the failure is real — this has produced a false alarm on `identity-auth` that passed both ways on re-run.

### Tooling traps

Each of these cost several failed attempts before the cause was obvious. None are guessable.

- **Bash heredocs mangle Python containing apostrophes.** `<<'PY'` still breaks on text like `F-100's`. Write the script to the scratchpad with the Write tool, then run `python <path>`.
- **`docker exec` needs `-i` to accept stdin.** Without it a heredoc'd SQL block silently runs nothing and reports success.
- **SSH-to-VM commands lose `||` and `$VAR` to the intermediate shells.** `||` is read as the shell OR, and `$VAR` expands in the wrong shell. For anything beyond a trivial one-liner, ship a file: `scp` a `.sql` file → `docker cp` it into the container → `psql -f`.
- **`scp` from Windows carries CRLF, which breaks heredoc terminators on the VM.** Run `sed -i 's/\r$//' <file>` after copying, or the script exits producing zero output and no error.
- **Compose reports `Started` without applying a changed `.env`.** Use `up -d --force-recreate <service>`, then confirm with `docker inspect <container> --format '{{json .Config.Env}}'` rather than trusting `docker compose config`, which resolves values the container may never receive.

### Verification traps — these produce confidently wrong conclusions

- **Frozen CSS transitions.** When the browser pane isn't compositing, transitions stick at `currentTime: 0` and computed styles report the *pre-transition* value. This read as a broken selected-slot state that was actually correct. Inject `* { transition: none !important }` before reading computed styles.
- **Gradients are invisible to contrast checks.** `getComputedStyle().backgroundColor` is transparent on a gradient-painted element, so a background walker climbs to a light ancestor and reports a **false pass**. This hid four dark gradients behind 333 passing measurements — a login screen scored 15.78:1 while rendering dark-on-dark. Check `background-image` and the `from-`/`via-`/`to-` classes separately.
- **Verify against the built artifact, not the source.** A misspelled Tailwind token emits no CSS at all rather than erroring, and `bg-gray-950` on `<body>` in `index.html` beat an element-level `body {}` rule. Both were only caught by grepping the compiled output.

## Environment facts

Stated because assuming otherwise wastes real time.

**Running the regression suite.** `pnpm test:regression` cannot be run as documented (F-151): `.env` points `DATABASE_URL` at the demo database, so F-101's guard correctly refuses every run. Use:

```bash
export DATABASE_URL="$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/badminton_db\?/badminton_db_test?/')" && pnpm test:regression
```

Stop any manually-started dev services first, or the suite silently exercises them against the demo database (see the port-collision trap above — this has written real test rows into demo data).

**The deployed demo runs `NODE_ENV=development`.** Consequences worth knowing before designing or testing anything against it:

- **OTP is always `123456`**, and any phone number self-registers as a `GUEST` on first verify. That means a fixed, guessable code on a public URL — fine for a driven demo, not for leaving unattended.
- **Dev-only UI is compiled out of production builds.** `import.meta.env.DEV` is false, so the "Simulate Payment" control does not exist on the deployed site — real Razorpay checkout (test keys) is the only payment path there.
- **Google sign-in is a mock.** `/auth/google/verify` accepts only `mock-google-token-<email>` and there is no OAuth client anywhere in the repo.

**Tenant resolution is per-hostname.** DuckDNS resolves arbitrary sub-subdomains to the same VM, so **adding a tenant also means adding its hostname to `SITE_ADDRESS`** and recreating caddy — otherwise it will not resolve. Tenant context comes from the first hostname label; there is no persistence, so a URL without a valid tenant subdomain fails (F-149).

## Deployment

Docker Hub workflow (build locally, push, pull on VM) — see `docs/deploy_via_dockerhub_reference.md`. Real verification: `pnpm diagram:verify`, `deploy:verify` script, confirm HTTPS genuinely live (not silently HTTP-only) before treating a deploy as done.

## Before finishing any task

Confirm: typecheck clean, build clean, full regression run (correct database target), register updated if applicable, diagram gate passing if applicable.
