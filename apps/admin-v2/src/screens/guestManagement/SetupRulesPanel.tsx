import { AuthorizedCourts } from './sections/AuthorizedCourts';
import { PricingRates } from './sections/PricingRates';
import { CancellationPolicy } from './sections/CancellationPolicy';
import { GuestScheduler } from './sections/GuestScheduler';

/**
 * F-220 §3 — the Setup Rules tab's content: a stack of independent full-width sections scoped to
 * the branch selected on `GuestManagementScreen`. All four sections (§3.1–§3.4) are now live —
 * §3.4 (Guest Scheduler) was picked up 13 Sep 2026 as F-238, un-deferred from its 10 Sep MVP
 * deferral. `GuestManagementScreen` remounts this via `key={branchId}` so each branch gets its
 * own fresh section state.
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
      <CancellationPolicy branchId={branchId} />
      <GuestScheduler branchId={branchId} />
    </div>
  );
}
