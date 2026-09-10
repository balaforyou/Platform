import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge, Banner, Button, Card, LoadingState, TextField, Toggle } from '../../../components';
import { useAdminAuth } from '../../../auth/AdminAuthContext';
import { errorMessage } from '../../../lib/errorMessage';
import { usePools, useSaveCancellationPolicy } from '../queries';
import { cancellationPolicySchema } from '../schemas';
import type { CancellationTier } from '../types';

/**
 * F-220 §3.3 — Cancellation & Refund Policy. A tiered guest refund schedule: the more notice a
 * guest gives before their slot, the higher the refund %. Exactly three tiers, both the notice
 * hours and the refund % editable on every row (Bala, 4 Sep 2026 — nothing hardcodes 24/12/0
 * server-side). Not an add/remove list — the row count is fixed at 3.
 *
 * Real and persisted: `BookingRule.cancellationPolicyJson`, written via
 * `PUT /slot-engine/resource-pools/:id/booking-rule` (upsert per pool) and consumed at real
 * cancellation time by slot-engine. Owner-only in the UI, same treatment as Pricing Rates /
 * Operating Hours — the server-side owner/entitlement gap is tracked in pending-findings.
 *
 * "Apply to all branches" writes the identical policy to every pool of every branch in the
 * tenant; unchecked, only the selected branch's pools.
 */

/** slot-engine's DEFAULT_CANCELLATION_POLICY (services/slot-engine/src/index.ts) — what the
 *  system already applies at cancellation time before any explicit save. Seeded here so an
 *  unconfigured pool shows the real effective policy, not fake 0/0/0. */
const DEFAULT_TIERS: CancellationTier[] = [
  { min_hours_before_slot: 24, refund_percent: 100 },
  { min_hours_before_slot: 6, refund_percent: 50 },
  { min_hours_before_slot: 0, refund_percent: 0 },
];

type Row = { hours: string; percent: string };

const toRows = (tiers: CancellationTier[]): Row[] =>
  tiers.slice(0, 3).map((t) => ({ hours: String(t.min_hours_before_slot), percent: String(t.refund_percent) }));

const rowsEqual = (a: Row[], b: Row[]) =>
  a.length === b.length && a.every((r, i) => r.hours === b[i].hours && r.percent === b[i].percent);

export function CancellationPolicy({ branchId }: { branchId: string }) {
  const pools = usePools(branchId);
  const { user } = useAdminAuth();
  const isOwner = !!user?.roles?.includes('owner');
  const save = useSaveCancellationPolicy(branchId);

  // Display source: the first pool's booking rule, same "first pool wins" convention as the
  // other fanned-out sections. Absent → the real default policy.
  const serverRows = useMemo<Row[]>(() => {
    const tiers = (pools.data ?? [])[0]?.bookingRules?.[0]?.cancellationPolicyJson?.tiers;
    return toRows(Array.isArray(tiers) && tiers.length >= 3 ? tiers : DEFAULT_TIERS);
  }, [pools.data]);

  const [rows, setRows] = useState<Row[]>(serverRows);
  const [applyGlobally, setApplyGlobally] = useState(false);

  useEffect(() => {
    setRows(serverRows);
  }, [branchId, serverRows]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const parsed = useMemo(
    () => cancellationPolicySchema.safeParse({ tiers: rows.map((r) => ({ hours: r.hours, percent: r.percent })) }),
    [rows],
  );
  const validationError = parsed.success ? '' : (parsed.error.issues[0]?.message ?? 'Check the values above.');

  // Labels track the live hour values while they're valid integers; fall back to the raw text
  // otherwise so a mid-edit field doesn't blank the label.
  const h = rows.map((r) => (r.hours.trim() === '' ? '—' : r.hours.trim()));
  const rowLabels = [`Above ${h[0]} hrs`, `${h[1]}–${h[0]} hrs`, `Below ${h[1]} hrs`];

  const dirty = !rowsEqual(rows, serverRows);
  const saveDisabled = !isOwner || !dirty || !parsed.success || save.isPending;

  const onSave = () => {
    if (!parsed.success) return;
    save.mutate({
      tiers: parsed.data.tiers.map((t) => ({ hours: t.hours, percent: t.percent })),
      applyGlobally,
      branchPools: pools.data ?? [],
    });
  };

  if (pools.isLoading) return <LoadingState label="Loading cancellation policy…" />;
  if (pools.error) return <Banner tone="error">{errorMessage(pools.error)}</Banner>;

  const labelStyle = {
    fontSize: 'var(--av2-text-xs)',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: 'var(--av2-muted)',
    margin: 0,
  };

  const noRuleYet = !((pools.data ?? [])[0]?.bookingRules?.[0]?.cancellationPolicyJson?.tiers);

  return (
    <Card as="section">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <RotateCcw size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Cancellation &amp; Refund Policy</h3>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
            How much a guest is refunded when they cancel, by how much notice they give.
          </p>
        </div>
      </div>

      {!isOwner && (
        <Banner tone="info">Only an owner can change the cancellation policy. You can review it here.</Banner>
      )}

      {isOwner && noRuleYet && (
        <Badge tone="neutral">Not configured — showing the default policy applied today</Badge>
      )}

      <p style={{ ...labelStyle, marginTop: 'var(--av2-space-4)' }}>Refund tiers</p>
      <div style={{ display: 'grid', gap: 'var(--av2-space-3)' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>{rowLabels[i]}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
              <TextField
                label="Notice (hours)"
                inputMode="numeric"
                value={r.hours}
                onChange={(e) => setRow(i, { hours: e.target.value })}
                disabled={!isOwner}
              />
              <TextField
                label="Refund %"
                inputMode="numeric"
                value={r.percent}
                onChange={(e) => setRow(i, { percent: e.target.value })}
                disabled={!isOwner}
              />
            </div>
          </div>
        ))}
      </div>

      {dirty && validationError && (
        <p style={{ margin: 'var(--av2-space-2) 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-danger)', fontWeight: 600 }}>
          {validationError}
        </p>
      )}

      {isOwner && (
        <div style={{ marginTop: 'var(--av2-space-4)' }}>
          <Toggle
            checked={applyGlobally}
            onChange={setApplyGlobally}
            label="Apply this policy to every branch in the tenant"
            disabled={save.isPending}
          />
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 'var(--av2-space-3)' }}>
          <Button onClick={onSave} disabled={saveDisabled} loading={save.isPending}>
            Save policy
          </Button>
        </div>
      )}

      {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}
      {save.isSuccess && !dirty && (
        <Banner tone="success">
          Cancellation policy saved{applyGlobally ? ' for every branch' : ''}.
        </Banner>
      )}

      <p style={{ marginTop: 'var(--av2-space-4)', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', lineHeight: 1.5 }}>
        A guest cancelling more than {h[0]} hours before their slot is refunded {rows[0].percent || '0'}% of what they
        paid; between {h[1]} and {h[0]} hours, {rows[1].percent || '0'}%; less than {h[1]} hours, {rows[2].percent || '0'}%.
        The same policy applies to every court in {applyGlobally ? 'every branch' : 'this branch'}.
      </p>
    </Card>
  );
}
