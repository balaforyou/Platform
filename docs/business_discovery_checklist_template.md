# Business Discovery Checklist — Template

Copy this into `docs/discovery/<finding-id>_<slug>.md` for each new business idea, fill it in, and
reference the resulting document from the register entry's **Context** column — the same way
SCREEN-001/SCREEN-002 are cited from F-099/F-098, so a reader can trace a one-line finding back to
the full reasoning.

**Purpose.** A register row records *what* was decided. This records *why*, and what was checked
before deciding. It exists so that the reasoning behind an idea survives the conversation it came
from.

---

## 1. The ask, in the business's own words

State it as it was actually said, before any translation into system terms. Note who asked and what
prompted it.

## 2. Evidence anchor — is this grounded in something real?

What real artefact or observed behaviour does this come from? A screenshot, a WhatsApp group, an
operator's actual workflow, a support complaint. **An idea with no evidence anchor is a preference;
one with an anchor is a requirement.** Say plainly which this is.

## 3. Does it already exist? — checked, not assumed

The question is not "do I think we have this" but "what did I run to find out". Record the actual
search or query and its result, including a negative result. Distinguish:

- **Exists and works** — nothing to build.
- **Exists partially** — name what is there and what is missing.
- **Genuinely new** — confirmed by a search that would have found it.

> For anything about *runtime* behaviour — what fires, what generates, what is reachable — a live
> probe is evidence and a code read is a hypothesis. Two findings were withdrawn (F-126, F-127)
> after being raised on code reading alone.

## 4. Reusability — is there a proven pattern here already?

Before designing anything new, name the closest existing mechanism and say why it does or does not
fit. Reuse beats new infrastructure unless there is a stated reason.

## 5. Genericity — is this vertical-specific or a reusable capability?

Only answer "generic" when there are **multiple known use cases up front**, not a hoped-for one.
`packages/job-scheduler` is the bar and it is measurable: zero runtime dependencies, the database
package only as a devDependency, and no vertical vocabulary anywhere in its source.

If generic: state the concrete second use case, and flag every place vertical concepts would
otherwise leak into the core structure.

## 6. Dependencies and blockers

What must exist first? Name findings by ID. Distinguish a **hard blocker** (cannot start) from a
**soft ordering preference** (better done after).

## 7. Data reality

Does the data this feature needs already exist and get captured today? Separate three things that
are easy to conflate:
- the **schema** supports it,
- something actually **writes** it,
- there is **enough real history** to be useful.

## 8. Real design questions to settle before build

The genuine forks — where different answers produce materially different work. Include the
constraint that makes each one matter.

## 9. Scope verdict

One paragraph: is this a UI addition, a new view over existing data, or new data modelling? This is
what the register's next-step should reflect.
