# Observations — guest-member-pwa booking screen: "seats" wording, payment footer

From: Claude Code
Context: Bala's real screenshots from the live booking flow. Verified against
`apps/guest-member-pwa/src/components/BranchBooking.tsx` / `CourtBooking.tsx` /
`BookingPay.tsx`. Described only, no IDs assigned.

---

## 1. "X seats" on slot cards — real wording risk, product question for Bala/Chief

`BranchBooking.tsx:678` / `CourtBooking.tsx:727`:
```tsx
{isAlmostFull ? `${slot.remainingCapacity} left` : `${slot.remainingCapacity} seats`}
```
Confirmed: this is `slot.remainingCapacity` — the number of still-bookable courts remaining in
that hour's POOLED slot (capacity 4, nobody booked yet → "4 seats"). It is **not** "seats per
booking" or "how many players this booking covers."

**Bala's read is the real risk.** "4 seats" naturally suggests either (a) this one booking
includes 4 seats/players, or (b) you need 4 people to book it — neither is true; a guest books
one court among the pool's shared capacity, same as any other slot. The badminton domain makes
"seats" a specifically bad word choice — a court isn't a seat. `${n} left` (already used once
capacity is low) reads unambiguously as "spots remaining" in a way `${n} seats` doesn't.

**On "shall we remove it altogether"**: not obviously the right call either. Some real signal of
remaining capacity is useful — it's the difference between "plenty of room" and "almost full,"
which the existing `isAlmostFull` branch already treats as worth calling out. Removing the number
entirely loses that. The more surgical fix is probably just the word choice — "X courts left" /
"X of 4 open" / similar — rather than dropping the count. Real product decision, not something
to unilaterally pick here.

---

## 2. Two "₹600" labels on the payment footer — confirmed intentional, not a bug

`BookingPay.tsx:560-568`, verbatim comment already in the code:
> "F-235 Slice F: sticky TOTAL + Pay footer... `#pay-amount-display` (in the summary card above)
> is not duplicated here -- the footer repeating the amount is the mockup's own intentional
> redundancy (TOTAL label + Pay button both show it), not a mistake to fix."

So the TOTAL amount and the "Pay ₹600" button both showing ₹600 is a deliberate design decision
from F-235 Slice F, matching the real mockup — not something to change without a real design
review overturning that decision.

**Separately, re: the visual "strikethrough" on the TOTAL's ₹600 in the screenshot** — checked
directly: no `line-through`/`text-decoration`/strikethrough styling exists anywhere in
`BookingPay.tsx`. The amount uses Tailwind's `font-mono` class with no custom monospace font
defined anywhere in this app (grepped `index.html`/`*.css`/`tailwind.config.*`, zero hits), so it
falls back to the browser's default `ui-monospace` stack (SFMono/Menlo/Consolas/etc.) — several of
which render the digit "0" with a slash or dot through it by design convention, to distinguish it
from the letter "O" in code. What reads as a strikethrough is very likely that font's zero glyph,
not an actual line through the price. Not a bug; a font-rendering artifact worth being aware of
if it keeps getting misread as a discount/strikethrough indicator.

---

## Summary for Chief

- "seats" wording: real, worth a small copy change — recommend rewording rather than removing the
  count entirely. Needs Bala's/Chief's call on exact wording.
- Payment footer double-total: confirmed intentional (F-235 Slice F), no action needed.
- "Strikethrough" on TOTAL: not a bug — monospace font's slashed-zero glyph, confirmed via code
  (no strikethrough styling exists).
