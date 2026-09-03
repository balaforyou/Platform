import { useEffect, useState } from 'react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useAdminApi } from '../../lib/useAdminApi';
import { useAdminTenant } from '../../auth/AdminTenantContext';
import { Banner, Button, Card, EmptyState, Select, Spinner, TextField } from '../../components';
import { branchScheduleSchema, poolSchema, ruleSchema } from './schemas';
import { resourcePoolFieldLabels } from './helpers';
import { errorMessage } from './feedback';
import { courtGroupsKeys } from './queries';
import type { Branch, BookingRule, ResourcePool } from './types';

/**
 * F-220 — "Configuration" tab: branch working hours + resource-pool fields + booking rule.
 * The admin-web `ResourcesPage` flow, faithfully ported onto admin-v2's design system. Same
 * three independent saves, same schemas, same "PATCH the selected pool / PUT its rule".
 */
export function ConfigurationPanel({
  branchId,
  poolId,
  onPoolChange,
  branches,
  pools,
}: {
  branchId: string;
  poolId: string;
  onPoolChange: (id: string) => void;
  branches: UseQueryResult<Branch[]>;
  pools: UseQueryResult<ResourcePool[]>;
}) {
  const api = useAdminApi();
  const qc = useQueryClient();
  const { tenant } = useAdminTenant();

  const selectedBranch = branches.data?.find((b) => b.id === branchId);
  const selectedPool = pools.data?.find((p) => p.id === poolId) || pools.data?.[0];

  const [branchDraft, setBranchDraft] = useState({ workingHoursStart: '', workingHoursEnd: '' });
  const [poolDraft, setPoolDraft] = useState<Record<string, string>>({});
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedBranch) {
      setBranchDraft({
        workingHoursStart: selectedBranch.workingHoursStart || '',
        workingHoursEnd: selectedBranch.workingHoursEnd || '',
      });
    }
  }, [selectedBranch?.id, selectedBranch?.workingHoursStart, selectedBranch?.workingHoursEnd]);

  useEffect(() => {
    if (selectedPool) {
      onPoolChange(selectedPool.id);
      setPoolDraft({
        name: selectedPool.name,
        capacity: String(selectedPool.capacity),
        minOccupancy: String(selectedPool.minOccupancy),
        minBookingDurationMinutes: String(selectedPool.minBookingDurationMinutes),
        pricingMode: selectedPool.pricingMode,
        defaultRate: String(selectedPool.defaultRate),
      });
      const rule = selectedPool.bookingRules?.[0];
      setRuleDraft({
        guestAccessCutoffMinutes: String(rule?.guestAccessCutoffMinutes ?? 120),
        lowOccupancyThresholdPct: String(rule?.lowOccupancyThresholdPct ?? ''),
      });
    }
    // Keyed on the pool id only — reloading the draft on every pool-object identity change
    // would clobber the admin's in-progress edits (admin-web's ResourcesPage does the same).
  }, [selectedPool?.id]);

  const saveBranch = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error('Select a branch');
      return api.patch<Branch>(`/tenant/branches/${branchId}`, branchScheduleSchema.parse(branchDraft));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: courtGroupsKeys.branches(tenant?.id) }),
  });

  const savePool = useMutation({
    mutationFn: () => {
      if (!selectedPool) throw new Error('Select a resource pool');
      return api.patch<ResourcePool>(`/slot-engine/resource-pools/${selectedPool.id}`, poolSchema.parse(poolDraft));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: courtGroupsKeys.pools(branchId) }),
  });

  const saveRule = useMutation({
    mutationFn: () => {
      if (!selectedPool) throw new Error('Select a resource pool');
      return api.put<BookingRule>(
        `/slot-engine/resource-pools/${selectedPool.id}/booking-rule`,
        ruleSchema.parse(ruleDraft),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: courtGroupsKeys.pools(branchId) }),
  });

  const noPools = !pools.isLoading && (pools.data || []).length === 0;

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)', maxWidth: 560 }}>
      <Card as="section" style={{ display: 'grid', gap: 'var(--av2-space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Branch schedule</h3>
        <TextField
          label="Opens"
          placeholder="06:00"
          value={branchDraft.workingHoursStart}
          onChange={(e) => setBranchDraft((d) => ({ ...d, workingHoursStart: e.target.value }))}
        />
        <TextField
          label="Closes"
          placeholder="22:00"
          value={branchDraft.workingHoursEnd}
          onChange={(e) => setBranchDraft((d) => ({ ...d, workingHoursEnd: e.target.value }))}
        />
        <Button
          variant="secondary"
          leadingIcon={<Save size={16} />}
          loading={saveBranch.isPending}
          disabled={saveBranch.isPending || !branchId}
          onClick={() => saveBranch.mutate()}
        >
          Save hours
        </Button>
        {saveBranch.error && <Banner tone="error">{errorMessage(saveBranch.error)}</Banner>}
        {saveBranch.isSuccess && <Banner tone="success">Branch schedule saved.</Banner>}
      </Card>

      <Card as="section" style={{ display: 'grid', gap: 'var(--av2-space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Resource pool</h3>

        {pools.isLoading ? (
          <Spinner label="Loading pools" />
        ) : noPools ? (
          <EmptyState
            title="No court pools on this branch yet"
            description="Court pools are created through the existing admin workflow — pool creation isn't available in this screen yet."
          />
        ) : (
          <>
            <Select
              label="Pool"
              value={selectedPool?.id || ''}
              onChange={(e) => onPoolChange(e.target.value)}
            >
              {(pools.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            {selectedPool && (
              <>
                {(['name', 'capacity', 'minOccupancy', 'minBookingDurationMinutes', 'defaultRate'] as const).map(
                  (field) => (
                    <TextField
                      key={field}
                      label={resourcePoolFieldLabels[field]}
                      value={poolDraft[field] || ''}
                      onChange={(e) => setPoolDraft((d) => ({ ...d, [field]: e.target.value }))}
                    />
                  ),
                )}
                <Select
                  label={resourcePoolFieldLabels.pricingMode}
                  value={poolDraft.pricingMode || 'FLAT'}
                  onChange={(e) => setPoolDraft((d) => ({ ...d, pricingMode: e.target.value }))}
                >
                  <option value="FLAT">FLAT</option>
                  <option value="PER_PERSON">PER_PERSON</option>
                </Select>
                <Button
                  leadingIcon={<Save size={16} />}
                  loading={savePool.isPending}
                  disabled={savePool.isPending}
                  onClick={() => savePool.mutate()}
                >
                  Save pool
                </Button>
                {savePool.error && <Banner tone="error">{errorMessage(savePool.error)}</Banner>}
                {savePool.isSuccess && <Banner tone="success">Resource pool saved.</Banner>}

                <hr style={{ border: 'none', borderTop: '1px solid var(--av2-border)', margin: 0 }} />
                <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Booking rule</h3>
                <TextField
                  label={resourcePoolFieldLabels.guestAccessCutoffMinutes}
                  value={ruleDraft.guestAccessCutoffMinutes || ''}
                  onChange={(e) => setRuleDraft((d) => ({ ...d, guestAccessCutoffMinutes: e.target.value }))}
                />
                <TextField
                  label={resourcePoolFieldLabels.lowOccupancyThresholdPct}
                  value={ruleDraft.lowOccupancyThresholdPct || ''}
                  onChange={(e) => setRuleDraft((d) => ({ ...d, lowOccupancyThresholdPct: e.target.value }))}
                />
                <Button
                  variant="secondary"
                  leadingIcon={<Save size={16} />}
                  loading={saveRule.isPending}
                  disabled={saveRule.isPending}
                  onClick={() => saveRule.mutate()}
                >
                  Save rule
                </Button>
                {saveRule.error && <Banner tone="error">{errorMessage(saveRule.error)}</Banner>}
                {saveRule.isSuccess && <Banner tone="success">Booking rule saved.</Banner>}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
