import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, Select, TextField, TimeField, Toggle } from '../../components';
import { errorMessage } from '../../lib/errorMessage';
import { useBranches, useCreateGroup, usePools } from '../guestManagement/queries';
import { nonNegativeAmount } from '../guestManagement/schemas';

/** ISO weekday, 1=Mon .. 7=Sun -- matches `MemberGroupAssignment.daysOfWeek`'s existing format. */
const DAY_LABELS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
];

/**
 * F-133 §2/§4/§5 — create a batch (Group). Name, branch → pool cascading selection (branch
 * resolves the pool's own `branchId`, no separate branch field on the batch itself), days/time,
 * Peak/Non-Peak tag + optional custom rate override. `startDate`/`endDate` are entirely
 * server-computed (calendar-month-aligned) -- this form never sends or shows them.
 *
 * Rate resolution (own customRate, else the matching Tenant default) is validated server-side;
 * a save that can't resolve a rate is rejected with a clear 400 surfaced via `errorMessage`,
 * not silently accepted with an unclear price.
 */
export function CreateBatchForm() {
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const pools = usePools(branchId);
  const [poolId, setPoolId] = useState('');

  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [isPeak, setIsPeak] = useState(false);
  const [customRate, setCustomRate] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);

  const createGroup = useCreateGroup();

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  useEffect(() => {
    setPoolId('');
  }, [branchId]);

  useEffect(() => {
    if (!poolId && pools.data?.[0]) setPoolId(pools.data[0].id);
  }, [poolId, pools.data]);

  const toggleDay = (iso: number) =>
    setDays((ds) => (ds.includes(iso) ? ds.filter((d) => d !== iso) : [...ds, iso].sort((a, b) => a - b)));

  const rateProvided = customRate.trim() !== '';
  const rateParsed = rateProvided ? nonNegativeAmount('Custom Rate').safeParse(customRate) : null;
  const rateError = rateParsed && !rateParsed.success ? (rateParsed.error.issues[0]?.message ?? 'Enter a valid amount.') : '';

  const daysOfWeek = useMemo(() => days.join(','), [days]);

  const canSubmit =
    !!name.trim() && !!poolId && days.length > 0 && !!startTime && !rateError && !createGroup.isPending;

  const submit = () => {
    setSavedName(null);
    createGroup.mutate(
      {
        name: name.trim(),
        resourcePoolId: poolId,
        daysOfWeek,
        startTime,
        isPeak,
        ...(rateProvided && rateParsed?.success ? { customRate: rateParsed.data } : {}),
      },
      {
        onSuccess: (group) => {
          setSavedName(group.name);
          setName('');
          setDays([]);
          setStartTime('');
          setIsPeak(false);
          setCustomRate('');
        },
      },
    );
  };

  return (
    <Card as="section">
      <div>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Create Batch</h3>
        <p style={{ margin: '3px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
          A recurring member batch on one court, with its own schedule and pricing tag. Starts the
          1st of this month if created today, otherwise the 1st of next month.
        </p>
      </div>

      <div style={{ marginTop: 'var(--av2-space-4)', display: 'grid', gap: 'var(--av2-space-3)' }}>
        <TextField label="Batch Name" value={name} onChange={(e) => setName(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
          <Select
            label="Branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={branches.isLoading || (branches.data || []).length === 0}
          >
            <option value="">{branches.isLoading ? 'Loading branches…' : 'Select branch'}</option>
            {(branches.data || []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
          <Select
            label="Court / Pool"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            disabled={!branchId || pools.isLoading || (pools.data || []).length === 0}
          >
            <option value="">{pools.isLoading ? 'Loading courts…' : 'Select court'}</option>
            {(pools.data || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>

        <div>
          <p style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600, color: 'var(--av2-text)', margin: '0 0 var(--av2-space-2)' }}>
            Days
          </p>
          <div style={{ display: 'flex', gap: 'var(--av2-space-2)', flexWrap: 'wrap' }}>
            {DAY_LABELS.map(({ iso, label }) => {
              const active = days.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(iso)}
                  aria-pressed={active}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--av2-radius-full, 9999px)',
                    border: `1px solid ${active ? 'var(--av2-accent)' : 'var(--av2-border)'}`,
                    background: active ? 'var(--av2-accent)' : 'var(--av2-surface)',
                    color: active ? 'var(--av2-on-accent, #fff)' : 'var(--av2-text)',
                    fontSize: 'var(--av2-text-xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <TimeField label="Start Time" value={startTime} onChange={setStartTime} minuteStep={5} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-3)' }}>
          <Toggle checked={isPeak} onChange={setIsPeak} label={isPeak ? 'Peak' : 'Non-Peak'} />
        </div>

        <TextField
          label="Custom Rate (optional)"
          hint="₹ per member per month — leave blank to use the tenant's Peak/Non-Peak default"
          inputMode="decimal"
          value={customRate}
          onChange={(e) => setCustomRate(e.target.value)}
          error={rateError || undefined}
        />
      </div>

      <div style={{ marginTop: 'var(--av2-space-4)' }}>
        <Button onClick={submit} disabled={!canSubmit} loading={createGroup.isPending}>
          Create batch
        </Button>
      </div>

      {savedName && <Banner tone="success">{`"${savedName}" created.`}</Banner>}
      {createGroup.error && <Banner tone="error">{errorMessage(createGroup.error)}</Banner>}
    </Card>
  );
}
