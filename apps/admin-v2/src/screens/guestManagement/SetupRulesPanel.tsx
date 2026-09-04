import { AuthorizedCourts } from './sections/AuthorizedCourts';
import { PricingRates } from './sections/PricingRates';

/**
 * F-220 §3 — the Setup Rules tab's content: a stack of independent full-width sections scoped to
 * the branch selected on `GuestManagementScreen`. The four sections land one at a time (§3.1–§3.4);
 * this is the one place that grows. `GuestManagementScreen` remounts this via `key={branchId}` so
 * each branch gets its own fresh section state.
 */
export function SetupRulesPanel({ branchId }: { branchId: string }) {
  if (!branchId) {
    return (
      <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
        Select a branch to configure its guest booking rules.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-4)', minWidth: 0 }}>
      <AuthorizedCourts branchId={branchId} />
      <PricingRates branchId={branchId} />

      <div className="setup-rules-next">
        <b>2 more sections land next, one at a time:</b> Cancellation &amp; Refund Policy, Dynamic
        Guest Scheduler — each its own hand-off, same as this one.
      </div>
    </div>
  );
}
