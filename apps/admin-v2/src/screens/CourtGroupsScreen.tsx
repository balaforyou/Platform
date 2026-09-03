import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { useAdminTenant, moduleVisible } from '../auth/AdminTenantContext';
import { Banner, EmptyState, LoadingState, Select, Tabs } from '../components';
import { useBranches, usePools } from './courtGroups/queries';
import { ConfigurationPanel } from './courtGroups/ConfigurationPanel';
import { SchedulingPanel } from './courtGroups/SchedulingPanel';

const TABS = [
  { key: 'configuration', label: 'Configuration' },
  { key: 'scheduling', label: 'Scheduling' },
];

/**
 * F-220 — `/court-groups`: court & slot configuration, ported from admin-web's
 * `ResourcesPage` + `SchedulingPage` onto admin-v2's design system. Two tabs over one shared
 * branch + pool selection.
 *
 * This is F-206's proof case: `court-groups` carries `module: 'GUEST_BOOKING'` in `nav.ts`, so
 * the nav hides it for an unentitled tenant — and this screen also refuses to render its config
 * UI if reached directly (matching F-206's "never UI-only" posture; the API would 403 anyway).
 */
export function CourtGroupsScreen() {
  const { entitlements } = useAdminTenant();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [poolId, setPoolId] = useState('');
  const [tab, setTab] = useState('configuration');

  const pools = usePools(branchId);

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  useEffect(() => {
    if (!poolId && pools.data?.[0]) setPoolId(pools.data[0].id);
  }, [poolId, pools.data]);

  // F-206 gate. `null` = fetch still in flight; treat as "wait, don't flash the denied state".
  if (entitlements === null) return <LoadingState label="Loading…" />;
  if (!moduleVisible(entitlements.GUEST_BOOKING)) {
    return (
      <EmptyState
        icon={<FolderPlus size={20} />}
        title="Guest Booking isn’t active for this account"
        description="Court and slot configuration is part of the Guest Booking module. Contact the platform team to enable it."
      />
    );
  }

  const selectedPool = pools.data?.find((p) => p.id === poolId);

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)' }}>
      <div>
        <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Manage Court Groups</h2>
        <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
          Branch hours, court-pool capacity and pricing, booking rules, recurring availability and date overrides.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-4)', maxWidth: 560 }}>
        <Select
          label="Branch"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPoolId('');
          }}
        >
          <option value="">Select branch</option>
          {(branches.data || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          label="Resource pool"
          value={poolId}
          onChange={(e) => setPoolId(e.target.value)}
          disabled={!branchId || (pools.data || []).length === 0}
        >
          <option value="">{pools.isLoading ? 'Loading pools…' : 'Select pool'}</option>
          {(pools.data || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {(branches.error || pools.error) && (
          <Banner tone="error">{((branches.error || pools.error) as Error)?.message}</Banner>
        )}
      </div>

      <Tabs items={TABS} activeKey={tab} onChange={setTab} />

      {tab === 'configuration' ? (
        <ConfigurationPanel
          branchId={branchId}
          poolId={poolId}
          onPoolChange={setPoolId}
          branches={branches}
          pools={pools}
        />
      ) : (
        <SchedulingPanel poolId={poolId} poolPricingMode={selectedPool?.pricingMode} />
      )}
    </div>
  );
}
