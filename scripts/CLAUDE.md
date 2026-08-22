# CLAUDE.md — scripts/

Loaded automatically alongside root `CLAUDE.md` whenever a session touches files in this directory. Register-tooling mechanics specific to the scripts that read/write `docs/findings_register.md` and `docs/plans/pending-findings.md` — see root `CLAUDE.md` for the register's actual column semantics and the standing workflow rules that govern when/how you touch it.

## Mutator naming convention

`check_*` / `verify_*` scripts read and never write — and a mutating script must not print a check-style report. A register-editing script that ended by printing an integrity summary was re-run as a "verification" step and silently duplicated a row. Mutators take a verb prefix (`log_`, `move_`, `resolve_`, `update_`) and guard against re-application by asserting the **target does not already exist**, not merely that the anchor row does — asserting the anchor is what let that duplicate through.

## Tooling debt, deferred deliberately

`check-register.mjs` and `generate-flow-diagram.mjs` each parse the register's rows and sections separately. Importing the latter to share its parser would execute its module-scope CLI and write the `.drawio` as a side effect, so extracting a shared `scripts/lib/register.mjs` is the clean fix — deferred until the duplication actually causes a problem.

## ID-assignment enforcement (added Batch 8)

`check-register.mjs` checks that every register ID at or above `F-179` (the first ID this mechanism governs — the existing 174 findings predate it and are not retroactively checked) has a matching `Confirmed-ID:` entry in `docs/plans/pending-findings.md`. This follows the same "assert target absent/present, don't write one in" discipline as the mutator convention above: the check only flags a missing confirmation, it never creates one. See `docs/plans/pending-findings.md`'s own header for the workflow this enforces, and root `CLAUDE.md`'s "Source of truth" section for the underlying rule.
