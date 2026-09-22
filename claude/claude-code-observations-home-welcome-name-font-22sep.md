# Observations — guest-member-pwa home screen: welcome message, heading font

From: Claude Code
Context: Bala's real screenshot of the home screen. Verified against
`apps/guest-member-pwa/src/main.tsx`, `services/identity-auth/src/index.ts`,
`apps/guest-member-pwa/src/index.css`, `index.html`. Described only, no IDs assigned.

---

## 1. "Welcome back to JBC Courts" should greet the user by first name — confirmed real, low-risk

`main.tsx:517-518`:
```tsx
<h2 ...>
  Welcome back to <span style={{ color: 'var(--color-accent-700)' }}>{tenant?.appName}</span>
</h2>
```
Hardcoded to the tenant's app name only — never reads anything about the signed-in user.

**Confirmed the data is already there.** The real Google-auth JWT (`services/identity-auth/src/
index.ts:774-789`) embeds `displayName` directly in the token claims (comment at line 781-785
explicitly says this was added in F-248 specifically so the frontend has it immediately on first
login, no extra fetch). `AuthContext.tsx`'s `parseJwt` decodes the whole payload generically, so
`user.displayName` is already available in `main.tsx` right now — just unused here.
`AccountSheet.tsx:50-52` already establishes the real fallback-chain precedent:
`user?.displayName || user?.name || user?.email || 'Guest'`.

**Only "first name" specifically needs a small addition**: no separate `given_name`/first-name
field exists anywhere — Google auth only stores/returns the full `displayName` (e.g. "Viji
Subramaniam", confirmed from the Account screen). Getting just the first name means splitting
client-side, e.g. `user?.displayName?.split(' ')[0]`, with the same fallback chain
`AccountSheet.tsx` already uses for when it's unset.

**Not fixed here** — small, well-precedented change, low risk given the data's already on the
token.

---

## 2. "JBC" font — not a bug, a deliberate design choice (Caprasimo)

`index.css:132`: `--font-heading: 'Caprasimo', system-ui, sans-serif;`. `index.html:13` correctly
loads it via Google Fonts (`family=Caprasimo` is present in the stylesheet link, alongside
Inter/Outfit/Figtree). Confirmed this is genuinely rendering as designed, not a fallback from a
failed font load — Caprasimo is a bold, chunky display serif, used intentionally for every heading
across this app (`main.tsx:115`, `390`, `517`, `546`, the tab-bar label at `61`), not something
unique to this one screen.

**Not a technical defect** — this is a real aesthetic reaction to an intentional design choice,
worth routing to whoever owns admin-v2/guest-pwa's visual design (this session has separate
design-review threads for that), not something to "fix" as a bug.

---

## Summary for Chief

- Welcome-by-name: real, low-risk, data already available — recommend implementing.
- Font: working as designed, not a defect — a design-review question, not an engineering one.
