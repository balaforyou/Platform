# CLAUDE.md — Slotflow (Badminton Court Booking Platform)

Auto-loaded at the start of every Claude Code session in this repo. Read this before starting any task. Directories with their own `CLAUDE.md` (`scripts/`, `deploy/gcp-vm/`, `packages/database/`, `apps/guest-member-pwa/`) load automatically, in addition to this file, only when a session actually touches files in that subtree.

## What this is

Multi-tenant sports court booking SaaS. 5 backend services (`services/slot-engine`, `identity-auth`, `tenant-management`, `payment`, `notification`), 2 frontend apps (`apps/admin-web`, `apps/guest-member-pwa`). Real customer: JBC, live at `jbc.elitecourts.duckdns.org` and `courtowner1.elitecourts.duckdns.org`.

## Core principle

This project is built as generic, reusable services and components across its microservices — not one-off code wired to a single tenant's needs. JBC is the first real customer, not the only one this is designed for: a fix or a new capability in any service should default to the general case, not a JBC-specific shortcut, unless a plan explicitly says otherwise. This should shape design decisions in every service, not just the ones explicitly marked "architecture."

## Source of truth

**`docs/findings_register.md` is canonical, not this conversation.** Only the reviewer (Bala, via the review conversation) assigns finding IDs — never self-assign. Verify register integrity before committing (no duplicate IDs, correct column counts) and confirm `pnpm diagram:verify` passes if the change touches a tagged finding.

**If a referenced ID isn't actually in the register, don't invent content and don't silently skip it.** Say so plainly, and log under that number only when the reviewer supplied the content. This has happened for real: an ID was described as "already logged, just merge into it" when nothing existed under it.

**New findings surfaced during batch work get described, not numbered.** Report them to Chief with evidence and let Chief assign the ID before it is written into the register — **even when the next-in-sequence number seems obvious and nothing else could plausibly be using it**. This is not the same rule as "never self-assign": it also covers a number handed over inside a Technical Lead thread. Established after Batch 5, where F-171 and F-172 were numbered in-thread rather than routed through Chief. No register collision resulted that time — an informally-referenced "F-171" had deliberately never been committed, so the numbers stood — but the near miss is the point.

**This rule has since failed twice despite being written above (F-173 in Batch 5/6, F-174–F-178 in Batch 7).** As of Batch 8, `scripts/check-register.mjs` enforces a mechanical version of it for every new ID from F-179 onward — see `docs/plans/pending-findings.md` and `scripts/CLAUDE.md`. The written rule still applies in full; the check exists because writing it down twice wasn't enough.

## Standing workflow — every task

1. **Plan mode first.** Investigate → write a real plan → wait for explicit approval → implement → real evidence → wait for sign-off. Never skip to implementation.
2. **Real evidence, not reasoning from code alone.** A code read is a hypothesis; running it is evidence. Live-fire proof (real requests, real database read-backs) over inferred correctness.
3. **Investigate real callers before adding auth guards.** Search both frontend apps and all five services — don't assume based on one file.
3a. **Blast-radius check before implementation begins.** List every other caller/consumer of the files/functions the plan touches — not just what the current finding needs. State this list in the plan explicitly; a kickoff isn't complete without it, same weight as "rebuild before testing" or "real evidence." This is not a judgment call to apply when it seems relevant — it is a required, explicitly-confirmed step every time.
4. **Reuse proven patterns.** Check for an existing precedent before designing something new. Cross-service example: `requireInternalKey`/`requirePoolScope` (used across `slot-engine`, `tenant-management`, `identity-auth`). See `packages/database/CLAUDE.md` and `apps/guest-member-pwa/CLAUDE.md` for their own named precedents.
5. **No commit without explicit sign-off.** State this plainly at the end of every plan.
6. **Register status must match reality when a batch closes — and `docs/plans/batch-log.md` gets its entry in the same close-out pass, not after.** A finding that's actually fixed, verified, and pushed but still shows `Open` is drift that reads to every later thread as unfinished work. This happened for real: F-047 and F-087 were fully fixed and pushed, each carrying a dated evidence note, and both sat `Open` for days until a routine count caught it. Don't let a fix "land" without flipping its register row to `Resolved` in the same pass — verify with `pnpm register:check` and a section count, not from memory of having committed. **The same discipline applies to the batch-log line, and it has failed three separate times** (Batch 8's commit-hash placeholder, F-179's fix, F-178's fix — all caught later, not in the moment). Writing the register update and forgetting the batch-log line is the same class of drift as forgetting the register update itself: treat "register updated" and "batch-log entry written" as one inseparable close-out step, not two, and check both before calling a batch done.
7. **A batch isn't Done until it's pushed to origin and independently verified there** — via a SHA-pinned fetch or a real `git fetch`/`git log` against the actual remote, not just a local commit and not just a relayed claim. This has been the practice since a batch was once reported closed while sitting entirely unpushed; it needed re-verifying from scratch as a result.
8. **Check current state before trusting a finding's text.** Register entries can go stale even when real fixes land — verify against actual code.
9. **Don't let one fix silently absorb an adjacent finding.** Flag related-but-different issues as their own findings.
10. **Capture the failing "before" state on the deployed stack before deploying the fix.** Once the fix ships the defect cannot be reproduced, and rule 2 becomes unsatisfiable. When "commit only after proof" collides with "proof needs a deployed build", resolve it in the open rather than breaking either rule: deploy an honestly-labelled provisional image (`GIT_SHA=<sha>-<finding>-preproof`), capture the proof, then commit and redeploy with the real SHA and re-verify.

**The review flow below is standard practice, not an experiment — future handoff briefs don't need to re-explain it.** Claude Code investigates and drafts the plan using real execution access (live-fire proof, database read-backs, real callers, not reasoning from code alone) → the Technical Lead thread reviews, spot-checks, and gatekeeps before implementation begins → Claude Code implements and reports back in full depth, raw evidence rather than a summary of it → the Technical Lead thread does a final independent-verification pass (a real SHA-pinned or remote check, not a relayed claim) before consolidating for Chief.

## Known process traps — real, already paid for once

- **Investigating one finding in a shared file surfaces the next one, one layer at a time, across separate batches, unless the blast radius is checked up front.** F-171, F-172, and F-173 all came from the same three files F-169/F-170 already had open — `main.tsx`'s `AssignmentsPage`, and `slot-engine/src/index.ts`'s three assignment-resolution consumers — discovered one investigation layer at a time across two separate batches instead of surfaced together in one pass. None of this was scope creep (each was correctly logged as its own finding, not silently folded in) — it was a genuine gap in how early the investigation looked at neighboring code. The blast-radius check above is the fix: list every caller/consumer of the touched files up front, before implementation, not as it's incidentally discovered.
- **A self-detected contradiction between new content and an already-landed register note is a case to raise explicitly and get confirmation on** — never one to resolve by silently treating a more recent instruction as automatically authoritative over your own prior correct detection. This happened for real during Batch 5's closure: a thread correctly flagged that a proposed edit contradicted an already-landed register note, then overrode its own correct flag and applied the contradictory text anyway, discarding a check that had already run and passed.
- **Rebuild before testing regression.** Suites run from `dist`. Testing against a stale build is a real, repeated trap (F-085).
- **Never run the regression suite against `badminton_db` or `badminton_db_test` interchangeably without checking.** A database guard exists (F-101) specifically because this destroyed provisioned demo data twice. Use `badminton_db_test` for anything destructive.
- **Port collisions produce misleading failures.** If manually-started dev services hold ports 3001–3005, the regression harness silently tests against them instead of spawning its own — reads as confusing assertion failures, not "port in use." Stop manual instances first.
- **Escape `|` characters in markdown table cells.** Code spans containing `||` (e.g. `` `error || !booking` ``) break table row parsing — this has happened multiple times. Check rendered cell count, not just raw pipe count. **Count pipes _not preceded by a backslash_: Open rows have 6, Resolved rows have 7.** A raw `|` count reports correctly-escaped rows as broken. **Don't hand-roll this check any more — run `pnpm register:check`**, which enforces it, the rule below, and the pending-findings gate above, exiting non-zero on violation. See `scripts/CLAUDE.md` for the tooling's own internal conventions.
- **Anything that must survive a finding being resolved goes in the Description column, never Impact/Action.** The two shapes are `ID | Found | Context | Description | Impact/Action` (Open) and `ID | Found | Resolved | Context | Description | Resolution` (Resolved). **Resolution replaces Impact/Action by design** — all 30 historical conversions write it fresh rather than carrying the old text over — so a dated correction, update, or evidence note appended to Impact/Action is silently deleted the moment the finding is resolved. This is exactly how F-156's correction note was lost. Description survives; the F-033 precedent ("Update 4 Aug 2026") puts such notes there. `pnpm register:check` fails on a dated note left in Impact/Action.
- **A single suite failing is often environmental, not a regression.** Suites interacting can fail one another. Re-run the suite in isolation and then re-run the full set before concluding the failure is real — this has produced a false alarm on `identity-auth` that passed both ways on re-run.

### Tooling traps

Each of these cost several failed attempts before the cause was obvious. None are guessable.

- **Bash heredocs mangle Python containing apostrophes.** `<<'PY'` still breaks on text like `F-100's`. Write the script to the scratchpad with the Write tool, then run `python <path>`.
- **`docker exec` needs `-i` to accept stdin.** Without it a heredoc'd SQL block silently runs nothing and reports success.

### Verification traps — these produce confidently wrong conclusions

- **Frozen CSS transitions.** When the browser pane isn't compositing, transitions stick at `currentTime: 0` and computed styles report the *pre-transition* value. This read as a broken selected-slot state that was actually correct. Inject `* { transition: none !important }` before reading computed styles.
- **Gradients are invisible to contrast checks.** `getComputedStyle().backgroundColor` is transparent on a gradient-painted element, so a background walker climbs to a light ancestor and reports a **false pass**. This hid four dark gradients behind 333 passing measurements — a login screen scored 15.78:1 while rendering dark-on-dark. Check `background-image` and the `from-`/`via-`/`to-` classes separately.
- **Verify against the built artifact, not the source.** A misspelled Tailwind token emits no CSS at all rather than erroring, and `bg-gray-950` on `<body>` in `index.html` beat an element-level `body {}` rule. Both were only caught by grepping the compiled output.
- **A DOM-destroying error catcher produces a confidently wrong diagnosis.** The first on-screen error catcher used while diagnosing F-215 wrote `#root.innerHTML = …` on catch — destroying React's own DOM and *causing* a `removeChild` cascade that masked the real error; a React error boundary that swapped the tree on catch had the identical masking effect. Only a non-destructive, `<body>`-appended overlay capturing React's own `console.error` surfaced the true cause. Same root cause as the frozen-transition and invisible-gradient traps above — a debugging tool that itself perturbs the thing it's diagnosing produces confidently wrong output, not just noisy output. Use an appended overlay that reads `console.error`, never one that replaces the DOM tree or unmounts the app on catch.
- **Radix `Presence`-gated exit animations depend on a browser event that isn't guaranteed to fire.** `Presence` gates DOM unmount on `animationend`; a non-compositing/backgrounded tab can freeze a CSS animation before that event fires, stranding the component (and its focus trap) mounted after a visual "close." Hit twice — `Modal` (sub-slice 0.2) and the account-menu dropdown (0.3 addendum), both fixed the same way: keep exit animations enter-only, or add a hard-timeout fallback that forces the unmount if `animationend` never arrives. Check any new Radix `Presence`-based component for this before assuming an exit animation "just works."

## Deferred technical debt

Day/time validation logic now exists in two places (`slot-engine`'s `branchTime.ts` and tenant-management's F-175/F-177 fix) rather than one shared location. Deliberate short-term call to avoid introducing the platform's first direct service-to-service dependency — but it sits against this file's own generic-framework/reusable-component principle. A `packages/` extraction (alongside `packages/database`, `packages/test-harness`) is the likely right answer if this logic needs a third consumer, or as part of the same post-demo technical-debt pass as the other deferred items. Not urgent now.

## Environment facts

Stated because assuming otherwise wastes real time.

**Running the regression suite.** `pnpm test:regression` cannot be run as documented (F-151): `.env` points `DATABASE_URL` at the demo database, so F-101's guard correctly refuses every run. Use:

```bash
export DATABASE_URL="$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/badminton_db\?/badminton_db_test?/')" && pnpm test:regression
```

Stop any manually-started dev services first, or the suite silently exercises them against the demo database (see the port-collision trap above — this has written real test rows into demo data).

**The three databases.** All in the same `badminton_postgres` container on port 65432:

| Database | Used by | Notes |
|---|---|---|
| `badminton_db` | the demo / dev stack | Holds JBC and `courtowner1`. **Never a test target.** |
| `badminton_db_test` | the five regression suites | Wiped unscoped by `cleanDatabase()`. Not created by any script — has never been documented, presumably created the same way as `badminton_db_e2e` (see `apps/guest-member-pwa/CLAUDE.md`). |
| `badminton_db_e2e` | Playwright (`test:e2e`) | Separate from `_test` because the regression suites and the specs collide over shared fixture rows (F-046). See `apps/guest-member-pwa/CLAUDE.md` for provisioning, e2e-specific behavior, and the current pass/fail profile. |

**The deployed demo runs `NODE_ENV=development`.** Consequences worth knowing before designing or testing anything against it:

- **OTP is always `123456`**, and any phone number self-registers as a `GUEST` on first verify. That means a fixed, guessable code on a public URL — fine for a driven demo, not for leaving unattended.
- **Dev-only UI is compiled out of production builds.** `import.meta.env.DEV` is false, so the "Simulate Payment" control does not exist on the deployed site — real Razorpay checkout (test keys) is the only payment path there.
- **Real Razorpay checkout requires a static IP and HTTPS domain — it cannot be tested from a local or sandboxed dev environment; only from the deployed VM.** This is why dev-mock exists at all: it's the only payment path available anywhere except production.
- **Google sign-in is a mock.** `/auth/google/verify` accepts only `mock-google-token-<email>` and there is no OAuth client anywhere in the repo.

**Tenant resolution is per-hostname.** DuckDNS resolves arbitrary sub-subdomains to the same VM, so **adding a tenant also means adding its hostname to `SITE_ADDRESS`** and recreating caddy — otherwise it will not resolve. Tenant context comes from the first hostname label; there is no persistence, so a URL without a valid tenant subdomain fails (F-149). See `deploy/gcp-vm/CLAUDE.md` for the Caddy/VM mechanics.

## Deployment

Docker Hub workflow — see `docs/deploy_via_dockerhub_reference.md` and `deploy/gcp-vm/CLAUDE.md` for VM-specific mechanics (Caddy, compose, SSH quirks). As of F-193: CI (`.github/workflows/ci.yml`) builds all 7 images, runs `verify-deployment.mjs` against them, and pushes `:<svc>` + `:<svc>-<full-sha>` to Docker Hub on every `main` push; `./deploy/gcp-vm/promote.sh <sha>` (run on the VM) pulls that immutable set, drives the F-077 migrate guard, brings the stack up, and self-verifies (Steps 5–10 of the reference doc). Local dev stacks: `docker-compose.dev.yml` (hot reload) and `docker-compose.gcp-verify.yml` (the shipped stack, for `verify-deployment.mjs` / e2e). Real verification: `pnpm diagram:verify`, `deploy:verify` script, confirm HTTPS genuinely live (not silently HTTP-only) before treating a deploy as done.

## Before finishing any task

Confirm: typecheck clean, build clean, full regression run (correct database target), register updated if applicable, `pnpm register:check` green if the register was touched, diagram gate passing if applicable.
