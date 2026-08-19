# F-146 — full guest-PWA re-theme, then deploy to GCP

> **Status: PROPOSED — awaiting approval. Nothing implemented, nothing deployed.**
> Sequenced as you chose: **re-theme → verify locally → deploy**. Nothing untested reaches the VM.

## Context

Path B shipped the light palette as tokens but deliberately repainted nothing, because a
half-converted app looks broken rather than half-finished. F-146 is the conversion itself: the guest
PWA is dark in all 11 files it ships. This plan does that conversion, verifies it screen by screen
locally, and only then deploys the full stack.

**On the domain:** you've confirmed the VM's own `.env` carries `SITE_ADDRESS` and the local copy is
stale, to be reconciled later. I can't read the VM's `.env` while the instance is `TERMINATED`, so
the plan **reads the real value on the VM before deploying** rather than assuming it. Flagging once,
not fixing here: local and remote deploy config having diverged is the same shape as F-036/F-039,
where state living in two places let a fix silently regress.

---

## Phase 1 — the re-theme

### Approach: semantic Tailwind tokens, not 348 inline `var()` calls

This is not a new idea being introduced — `apps/guest-member-pwa/tailwind.config.js:9-13` **already** maps
`brand.primary → var(--brand-primary)`. The proposal extends that existing precedent with the rest of
the palette rather than inventing a second mechanism beside it:

```
surface        → var(--surface-white)        surface-alt  → var(--surface-background)
surface-mint   → var(--mint-surface)         ink          → var(--text-primary)
ink-muted      → var(--text-secondary)       edge         → var(--border-card)
edge-strong    → var(--border-subtle)
```

Components then read `bg-surface` / `text-ink` / `border-edge`. This is what makes a future theme
change a token-value edit rather than another 348-site rewrite — and it's why the slot-state work in
Path B already consumes variables.

### The conversion table — measured, not guessed

Eight classes cover about 90% of the 348 occurrences:

| Dark class | Uses | Becomes |
|---|---|---|
| `text-white` | 74 | `text-ink` |
| `text-gray-400` | 70 | `text-ink-muted` |
| `border-white/5` | 44 | `border-edge` |
| `bg-white/5` | 44 | `bg-surface-mint` |
| `text-gray-300` | 25 | `text-ink-muted` |
| `border-white/10` | 22 | `border-edge-strong` |
| `text-gray-200` | 17 | `text-ink` |
| `bg-white/10` | 17 | `bg-surface-mint` (hover: `edge`) |

Remaining long tail: `text-gray-500`/`600` → `ink-muted`; `bg-gray-950`/`900` page and card surfaces →
`bg-surface-alt` / `bg-surface`.

### The exceptions — these must NOT be converted

**`CancelBookingModal.tsx:61` — `bg-black/80` is the modal backdrop scrim and stays dark.** A blanket
replace turns it white and destroys the modal's separation from the page. Overlays are dark in light
themes too.

Same treatment for any other `inset-0` scrim found during the pass. **This single case is why this is
not a find-and-replace**, and is the concrete form of the risk F-146 records.

### Slot states

Already wired to tokens in Path B. This phase only **flips their values** in `index.css` to the
agreed light treatment — `#FFF7ED` / `#C2410C` for Almost Full, mint for Available — with no
component change. That is the design paying off.

Also apply Inter as the base font (`index.css` currently sets a system stack; Inter is already loaded
in `index.html:13`).

---

## Phase 2 — deploy, only after Phase 1 verifies

Follows the proven workflow in `docs/deploy_via_dockerhub_reference.md` — build locally, push to
Docker Hub, pull on the VM — which that doc records as replacing on-VM builds that hit resource
limits.

1. **Start `badminton-demo-vm`** (`us-central1-a`, currently `TERMINATED`).
2. **Read the VM's real `deploy/gcp-vm/.env`** and record the actual `SITE_ADDRESS`. Everything below
   depends on that value; nothing is assumed.
3. Build the seven images locally with `GIT_SHA` set, tag, push, pull on the VM, bring the stack up.
4. **`pnpm deploy:verify`**, plus the `BUILD_GIT_SHA` check F-077 added — the migrate container
   refuses to run against a stale image, and that guard should be seen passing rather than trusted.

---

## Verification

**Phase 1, locally — this is the bulk of the work, per F-146.** Every screen driven in a real
browser, not just compiled: login, branch select, branch dashboard, court booking (all three slot
states), payment, confirmation, booking history, cancel modal, PWA install prompt. Specifically
checking the things a swap breaks quietly: error banners still readable, disabled buttons still
legibly disabled, `status-pill` variants distinguishable, hover and selected states still distinct,
and **the payment and confirmation screens where money values must never be low-contrast**.

Regression across all five suites; whole-repo typecheck and build; rebuild before testing (F-085).

**Phase 2, deployed:** JBC loaded on the real domain, logo and `#166534` confirmed from the live DOM,
and — the specific risk that prompted this — **a hard refresh on a deep link keeping tenant context**,
which is what the IP-based setup could not do. Then one real booking end to end on the deployed stack.

**`courtowner1` checked afterwards** on the deployed stack: its own colour and logo, unaffected.

## Out of scope

Admin-web's theme — it has its own styling and is not part of F-146's measured surface. Reconciling
the local `deploy/gcp-vm/.env` with the VM's (flagged above). F-147/F-148's server contract changes.
Any tenant theming data-model change.
