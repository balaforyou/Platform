# F-260 — automate VM image retention in promote.sh — implementation plan

**Backfill, not a correction — this doc didn't exist until now, despite the work already having shipped.**
PR #62 ("Fix F-260: automate VM image retention in promote.sh," merged 2026-09-20T13:00:27Z, `95ce36d`)
shipped without a plan file committed to `claude/` alongside it, against this project's own standing
practice of committing one for any finding fix with a real design decision. Written 2026-09-25, from the
real saved plan-mode plan this fix was implemented against and the real merged PR body — not
reconstructed from a diff alone.

**Separately, and out of scope for this doc**: F-260's register row itself was left in the Open section
for 5 days after this real fix shipped — a register-accuracy drift, not a correction to the finding. That
drift is being fixed in its own small PR (register-only, no code), independent of this documentation
backfill. This doc does not touch `docs/findings_register.md` or `docs/plans/batch-log.md`.

**Status:** already implemented, merged, deployed. Nothing here changes code — documentation catching up
to already-shipped work.

---

## 1. Context and what was found

`promote.sh` pulled and retagged a full new 7-image set on every production promotion but never removed
the images it superseded — real, recurring disk pressure, with three separate one-off manual prunes
already done to date (F-206's close-out, Batch 61 post-deploy-#4, the F-088 Batch 64 post-deploy prune).
Bala's decision: stop doing this by hand and automate retention inside `promote.sh` itself, keeping
exactly current + 1 prior generation (14 images: 7 active + 7 `:rollback`).

Before designing anything, the real current script and real current VM state were checked fresh rather
than assumed (this project's standing "VM config/state can drift from the repo" discipline): a real SSH
session confirmed the VM was at exactly 14 images with zero dangling images at the time (a clean baseline
from the last manual prune, not mid-accumulation), 50% disk used with real headroom — matching the
finding's own "not urgent standalone" framing.

## 2. The real accumulation mechanism (traced, not guessed)

`promote.sh`'s existing snapshot step retags the *current* image as `:rollback` **before** pulling the new
one, every promotion:
```bash
for c in "${COMPONENTS[@]}"; do
  if sudo docker image inspect "gcp-vm-$c" >/dev/null 2>&1; then
    sudo docker tag "gcp-vm-$c" "gcp-vm-$c:rollback"
  fi
done
```
`docker tag` *moves* a tag rather than creating a new image, so this overwrites whatever
`gcp-vm-$c:rollback` pointed to immediately before this call. That prior image doesn't disappear — if
nothing else references it, it becomes a dangling, untagged image nothing in the script ever removes.
Three promotions in, the generation-before-last for every component sits on disk permanently orphaned.
This precise mechanism (not a vague "images accumulate") is what tells the fix exactly what to capture,
and when.

## 3. Alternative considered and rejected: prune dangling images after the fact

The obvious-looking alternative is a blanket `docker image prune -a` (or an unfiltered `docker image
prune`) run at the end of the script, rather than deliberately capturing specific IDs during the snapshot
step. Rejected: a blind prune can't distinguish a genuinely dangling image from the still-live
`:rollback` set — neither is attached to a running container, so a tag-blind prune would delete both,
destroying the very rollback safety net this same script depends on. The chosen design instead captures
the *specific* pre-move `:rollback` image ID during the existing snapshot loop — before the tag moves
forward — so only the exact generation being superseded is ever a removal candidate, never the new
`:rollback` or the running image.

## 4. Alternative considered and rejected: forced deletion (`docker rmi -f` or an unfiltered prune)

Plain `docker rmi` by ID, deliberately **without** `-f`, was chosen over a forced or blanket removal.
Reasoning: if a captured "superseded" ID happens to still be referenced by another live tag today (e.g. a
component whose image didn't actually change this round, so its old-rollback ID *is* also the new
current/rollback ID), a non-forced `docker rmi` refuses to delete it rather than silently destroying a
tag still in use. This was verified live, not assumed: on the real VM, using throwaway tags before
merging, a non-forced `docker rmi` by ID was confirmed to refuse deletion while another live tag still
pointed at the same image, and both tags survived intact.

## 5. Alternative considered and rejected: pruning before (or regardless of) verification

The prune step was placed as the *last* step of the script, strictly after `verify-deployment.mjs`
confirms the newly promoted stack healthy — never before, and never on a failed promotion. The existing
`trap 'on_err $LINENO' ERR` already exits the script on any failure before reaching the prune step, so a
bad promotion can never prune the one working generation still on disk. The prune step is also added only
inside the forward-promotion branch (after the `--rollback`-mode early exit), so a rollback invocation
never runs it at all — pruning during or around a rollback would risk removing the exact generation
rollback needs to restore from.

## 6. What was built

- `deploy/gcp-vm/promote.sh`, capture merged into the existing step-2 snapshot loop: before each
  component's tag is moved forward, its current `:rollback` image ID (if any) is captured into a
  `SUPERSEDED_IDS` array. `SUPERSEDED_IDS=()` is declared unconditionally, so the loop is a correct no-op
  on a fresh/first-ever promotion (nothing captured, nothing to prune) without tripping `set -u`.
- A new prune step added as the final step, after `verify-deployment.mjs` passes: iterates
  `SUPERSEDED_IDS`, `docker rmi <id>` (no `-f`) for each, logging removed vs. kept (still referenced, or
  already gone).
- `docs/deploy_via_dockerhub_reference.md`'s existing step table updated with a new row describing the
  prune step — the table is presented as authoritative documentation of the script's real behavior, so
  leaving it stale after this change would itself become a real drift.
- `deploy/gcp-vm/CLAUDE.md` deliberately **not** touched — that file's stated purpose is documented
  gotchas already paid for, not a general changelog, and no new trap surfaced during live-fire testing.

## 7. Blast-radius check (rule 3a)

- The script's existing `ERR` trap and `ERR`-triggered exit path: unaffected — the prune step runs only
  after the trap's own success path is reached.
- `--rollback` mode: confirmed untouched — the new capture/prune logic lives only in the
  forward-promotion branch, after the `--rollback` early-exit block.
- `docs/plans/batch-log.md`'s prior entries describing the *manual* prune process this automates: left
  alone deliberately — they're historical record of what was done by hand before this fix, not
  instructions to update.
- No other script or doc references `promote.sh`'s internals closely enough to need a change (confirmed
  via grep at plan time).

## 8. Verification (real evidence, not reasoning from code alone)

- `bash -n` syntax check clean.
- Live-fire proof on the real VM, before merge, using throwaway tags: confirmed a non-forced `docker rmi`
  by ID correctly refuses to delete an image still referenced by another live tag, and both tags survive
  intact — the exact safety property the design in §4 depends on.
- **One caveat, carried honestly rather than smoothed over**: the PR's own test plan left one item
  unchecked at merge time — "real promotion on the VM, confirm the prune step fires, image count settles
  at 14 with zero new dangling images, and `--rollback` still works correctly immediately after." That
  specific, dedicated confirmation was not captured at merge. `promote.sh` has since run for at least two
  real production promotions without any reported incident (the F-302 and F-269 deploys, 24-25 Sep 2026,
  both confirmed on-SHA across all components per `docs/plans/batch-log.md`), but neither of those runs
  recorded a dedicated "settled at 14 images" observation either — so that specific number remains
  informal rather than a captured, confirmed figure. Worth a five-minute check on the next promotion if a
  fully closed verification loop is wanted; not blocking, since the underlying mechanism's correctness was
  already proven live before merge.

## 9. Sign-off

Already merged (PR #62, `95ce36d`, 20 Sep 2026) and deployed under the review flow this project already
runs (Claude Code investigate-and-implement → Technical Lead spot-check and gatekeep → independent
re-verification before Chief consolidation) — the plan file itself records that Chief's review was still
pending sign-off (rule 6: "no commit without explicit sign-off") before implementation began, matching
this project's standard workflow. This backfill doc requires only doc-level sign-off before merging — no
code change here, and no register change here (that correction is tracked in its own separate PR).
