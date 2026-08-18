/**
 * Display formatters shared by both apps.
 *
 * WHY THIS FILE EXISTS (F-037, F-029, F-034). Raw internal identifiers have now been rendered to
 * users in six places across two separate discoveries: F-029 found four (raw user IDs on the guest
 * and member dashboards and in Admin Assignments), and F-037 found a fifth on the pre-payment
 * screen. F-029's fix was applied per-screen rather than through a shared helper — `admin-web` grew
 * a local `formatMemberContact()` while the PWA inlined the same idea — which is a large part of
 * why the pattern recurred instead of being closed. F-034 records the recurrence itself as the
 * finding.
 *
 * So this module is deliberately a shared home rather than another local fix: the next occurrence
 * should have somewhere obvious to go.
 */

/**
 * Renders a booking's UUID as a short, human-readable reference.
 *
 * DISPLAY ONLY. The booking UUID remains the primary key and is unchanged everywhere it actually
 * matters — routes, API payloads, database rows. Nothing here is persisted, and no caller should
 * ever send this value back to the server.
 *
 * WHY DERIVED FROM THE REAL ID RATHER THAN RANDOM. A random code would need storing, would need a
 * uniqueness guarantee, and would break the one workflow that might still want it: a support
 * conversation. Deriving from the first block of the UUID keeps the displayed value **traceable
 * back to the booking by prefix match**, so if anyone ever does need to find a booking from what a
 * customer read out, they can — without asking them to recite 36 characters.
 *
 * Not guaranteed unique on its own, and deliberately so: it is a reference for a human, not a key.
 * Anything that needs identity uses `booking.id`.
 *
 * formatBookingReference('6c6f43c6-900c-4b77-a4bc-0e1572ab9953')  ->  'BK-6C6F43C6'
 */
export function formatBookingReference(id: string | null | undefined): string {
  if (!id) return '—';
  const firstBlock = String(id).split('-')[0];
  // Fall back to the leading characters for any id that is not UUID-shaped, so this can never
  // render worse than the raw value it replaced.
  const code = (firstBlock || String(id)).slice(0, 8).toUpperCase();
  return `BK-${code}`;
}
