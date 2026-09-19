// F-263: a human-facing court label, honest about whether `courtSlotIndex` ties to a real
// Resource or is F-186's cosmetic fallback index. Both paths set a non-null `courtSlotIndex`
// (`assignPooledCourt`, services/slot-engine/src/index.ts) -- `resourceId` is the real signal.
// Mirrors the identical helper added server-side in the same batch (services/slot-engine/src/
// index.ts's `describeCourtAssignment`); duplicated here rather than shared because no package
// exists between this app and slot-engine (see root CLAUDE.md's "Deferred technical debt" note
// on the same tradeoff for the day/time-validation logic).
export function describeCourtAssignment(
  resourceName: string | null | undefined,
  resourceId: string | null | undefined,
  courtSlotIndex: number | null | undefined,
): string | null {
  if (resourceName) return resourceName;
  // Real assignment, but the joined Resource's name wasn't available (e.g. deleted) -- keep the
  // numbered label rather than inventing a new, rarer-still fallback state for this edge case.
  if (resourceId != null && courtSlotIndex != null) return `Court ${courtSlotIndex}`;
  if (courtSlotIndex != null) return 'General allocation';
  return null;
}
