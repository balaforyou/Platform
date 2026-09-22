import { useState } from 'react';
import { Banner, Button, Card, LoadingState } from '../../components';
import { errorMessage } from '../../lib/errorMessage';
import { useExpiringRenewals, useRenewAssignment } from '../guestManagement/queries';
import type { ExpiringBatch } from '../guestManagement/queries';

/**
 * F-133 Slice E — real batches with at least one ACTIVE member expiring this calendar month,
 * one bulk "Renew" action per batch. The link a "batches expiring this month" reminder would
 * naturally point an admin to; this panel is that surface, always browsable (not only around
 * the 20th, unlike the backend reminder itself).
 *
 * "Renew" is one real POST /member-group-assignments/:id/renew per member in the batch, not a
 * new bulk backend endpoint -- reuses the now-fixed, existing route exactly as it already works
 * for a single assignment. Real per-item failures are reported, not silently assumed away: a
 * batch of 12 where 11 renew and 1 fails shows exactly that, not a false "done".
 */
export function RenewalPanel() {
  const expiring = useExpiringRenewals();
  const renew = useRenewAssignment();
  const [renewingGroupId, setRenewingGroupId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { succeeded: number; failed: { assignmentId: string; error: string }[] }>>({});

  const doRenewBatch = async (batch: ExpiringBatch) => {
    setRenewingGroupId(batch.groupId);
    const failed: { assignmentId: string; error: string }[] = [];
    let succeeded = 0;
    for (const assignmentId of batch.assignmentIds) {
      try {
        await renew.mutateAsync({ assignmentId });
        succeeded += 1;
      } catch (err) {
        failed.push({ assignmentId, error: errorMessage(err) });
      }
    }
    setResults((prev) => ({ ...prev, [batch.groupId]: { succeeded, failed } }));
    setRenewingGroupId(null);
    expiring.refetch();
  };

  const allBatches = (expiring.data || []).flatMap((branch) => branch.batches);

  return (
    <Card as="section">
      <div>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Batches Expiring This Month</h3>
        <p style={{ margin: '3px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
          Any batch with at least one active member whose current term ends this month. Renewing
          extends every one of that batch's active members to the end of next month.
        </p>
      </div>

      <div style={{ marginTop: 'var(--av2-space-4)' }}>
        {expiring.isLoading ? (
          <LoadingState label="Loading…" />
        ) : expiring.error ? (
          <Banner tone="error">{errorMessage(expiring.error)}</Banner>
        ) : allBatches.length === 0 ? (
          <Banner tone="info">No batches expiring this month.</Banner>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
            {allBatches.map((batch) => {
              const result = results[batch.groupId];
              const isRenewing = renewingGroupId === batch.groupId;
              return (
                <div
                  key={batch.groupId}
                  style={{
                    padding: 'var(--av2-space-3)', borderRadius: 'var(--av2-radius, 8px)',
                    border: '1px solid var(--av2-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--av2-space-2)' }}>
                    <span style={{ fontSize: 'var(--av2-text-sm)' }}>
                      {batch.groupName} <span style={{ color: 'var(--av2-muted)' }}>({batch.assignmentIds.length} member{batch.assignmentIds.length === 1 ? '' : 's'})</span>
                    </span>
                    <Button size="sm" onClick={() => doRenewBatch(batch)} disabled={isRenewing}>
                      {isRenewing ? 'Renewing…' : 'Renew'}
                    </Button>
                  </div>
                  {result && (
                    result.failed.length === 0 ? (
                      <Banner tone="success">{`Renewed all ${result.succeeded} member(s).`}</Banner>
                    ) : (
                      <Banner tone="error">{`Renewed ${result.succeeded} of ${batch.assignmentIds.length} -- ${result.failed.length} failed.`}</Banner>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
