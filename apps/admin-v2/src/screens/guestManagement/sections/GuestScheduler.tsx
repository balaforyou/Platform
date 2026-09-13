import { useMemo, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import { Badge, Banner, Button, Card, EmptyState, IconButton, LoadingState, Select, TextField, Toggle } from '../../../components';
import { useAdminAuth } from '../../../auth/AdminAuthContext';
import { errorMessage } from '../../../lib/errorMessage';
import { usePools, useBranches, usePatterns, useSaveGuestSlot, useDeleteGuestSlot } from '../queries';
import { guestSlotSchema } from '../schemas';
import { weekdayOptions, formatTimeRange } from '../helpers';
import type { AvailabilityPattern } from '../types';

/**
 * F-220 §3.4 / F-238 — Dynamic Guest Scheduler. Un-deferred and picked up 13 Sep 2026 (was
 * post-MVP-deferred 10 Sep) after its absence was confirmed to be the direct reason a real
 * production incident (a branch's stated hours silently drifting from its real bookable
 * inventory, F-211) went unnoticed: this was the only screen in admin-v2 meant to show
 * `AvailabilityPattern` rows, and it never actually rendered them.
 *
 * Daily/Weekly only — writes `AvailabilityPattern` directly via the same routes the legacy
 * admin-web Scheduling screen already used (now F-211/F-237-guarded server-side). No Single-Day
 * (Option A, Bala-approved 10 Sep 2026): a one-off date goes through Branch Settings → Special
 * Hours instead, which already owns `AvailabilityOverride` — building Single-Day here would
 * create a real, silent two-surface collision on the same row (traced in
 * `technical-lead-plan-f220-3.4-dynamic-guest-scheduler.md` §6). No edit-in-place for this first
 * pass — delete and recreate, matching the approved mockup (list shows only Delete, no Edit).
 */

type Recurrence = 'Daily' | 'Weekly' | 'Monthly';

const derivedRecurrence = (daysOfWeek: string): 'Daily' | 'Weekly' => {
  const days = daysOfWeek.split(',').map((d) => d.trim()).filter(Boolean);
  return days.length >= 7 ? 'Daily' : 'Weekly';
};

export function GuestScheduler({ branchId }: { branchId: string }) {
  const branches = useBranches();
  const branch = useMemo(() => (branches.data ?? []).find((b) => b.id === branchId), [branches.data, branchId]);
  const pools = usePools(branchId);
  const { user } = useAdminAuth();
  const isOwner = !!user?.roles?.includes('owner');

  // F-220 §3.4 §11.2: a schedule is real availability tied to one pool's actual courts — operate
  // against the branch's first pool by default; a switcher only if the branch ever has more than
  // one (JBC never does today, confirmed in the preserved spec — this never renders for them).
  const branchPools = pools.data ?? [];
  const [poolIdOverride, setPoolIdOverride] = useState<string | undefined>(undefined);
  const poolId = poolIdOverride ?? branchPools[0]?.id;

  const patterns = usePatterns(poolId);
  const save = useSaveGuestSlot(poolId);
  const del = useDeleteGuestSlot(poolId);

  const branchHours = branch
    ? { workingDays: branch.workingDays ?? [], workingHoursStart: branch.workingHoursStart ?? null, workingHoursEnd: branch.workingHoursEnd ?? null }
    : undefined;
  const schema = useMemo(() => guestSlotSchema(branchHours), [branchHours]);

  const [recurrence, setRecurrence] = useState<Recurrence>('Daily');
  const [days, setDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('22:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState('60');
  const [capacity, setCapacity] = useState('4');
  const [customRate, setCustomRate] = useState(false);
  const [price, setPrice] = useState('');

  const toggleDay = (value: string) =>
    setDays((ds) => (ds.includes(value) ? ds.filter((d) => d !== value) : [...ds, value].sort()));

  const parsed = useMemo(() => {
    if (recurrence === 'Monthly') return null;
    return schema.safeParse({
      recurrence,
      daysOfWeek: days,
      startTime,
      endTime,
      slotDurationMinutes,
      capacity,
      customRate,
      price: customRate ? price : undefined,
    });
  }, [schema, recurrence, days, startTime, endTime, slotDurationMinutes, capacity, customRate, price]);
  const validationError = recurrence === 'Monthly' ? '' : parsed && !parsed.success ? (parsed.error.issues[0]?.message ?? 'Check the values above.') : '';

  const resetForm = () => {
    setRecurrence('Daily');
    setDays([]);
    setStartTime('06:00');
    setEndTime('22:00');
    setSlotDurationMinutes('60');
    setCapacity('4');
    setCustomRate(false);
    setPrice('');
  };

  const onAdd = () => {
    if (recurrence === 'Monthly' || !parsed?.success) return;
    const daysOfWeek = parsed.data.recurrence === 'Daily' ? '1,2,3,4,5,6,7' : parsed.data.daysOfWeek.join(',');
    save.mutate(
      {
        daysOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        slotDurationMinutes: parsed.data.slotDurationMinutes,
        capacity: parsed.data.capacity,
        ...(parsed.data.customRate
          ? { pricingMode: (branchPools.find((p) => p.id === poolId)?.pricingMode ?? 'FLAT') as 'FLAT' | 'PER_PERSON', price: parsed.data.price }
          : {}),
      },
      { onSuccess: resetForm },
    );
  };

  if (pools.isLoading) return <LoadingState label="Loading guest scheduler…" />;
  if (pools.error) return <Banner tone="error">{errorMessage(pools.error)}</Banner>;

  const addDisabled = !isOwner || recurrence === 'Monthly' || !parsed?.success || save.isPending || !poolId;

  return (
    <Card as="section">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <CalendarClock size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Guest Scheduler</h3>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
            Recurring windows offered to guests, beyond the branch&apos;s regular schedule.
          </p>
        </div>
      </div>

      {!isOwner && <Banner tone="info">Only an owner can change the guest scheduler. You can review it here.</Banner>}

      {branchPools.length > 1 && (
        <div style={{ marginTop: 'var(--av2-space-3)', maxWidth: 280 }}>
          <Select label="Pool" value={poolId} onChange={(e) => setPoolIdOverride(e.target.value)}>
            {branchPools.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      )}

      <p style={{ fontSize: 'var(--av2-text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--av2-muted)', marginTop: 'var(--av2-space-4)' }}>
        Configured slots
      </p>

      {(patterns.data ?? []).length === 0 && !patterns.isLoading && (
        <EmptyState icon={<CalendarClock size={20} />} title="No guest slots scheduled for this branch yet" />
      )}

      {(patterns.data ?? []).length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
          {(patterns.data as AvailabilityPattern[]).map((p) => {
            const rec = derivedRecurrence(p.daysOfWeek);
            const dayLabel = rec === 'Daily' ? 'Daily' : p.daysOfWeek.split(',').map((d) => weekdayOptions.find((w) => w.value === d.trim())?.label ?? d).join(', ');
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--av2-space-3)', padding: 'var(--av2-space-3)', border: '1px solid var(--av2-border)', borderRadius: 'var(--av2-radius-sm)' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 'var(--av2-text-sm)' }}>{formatTimeRange(p.startTime, p.endTime)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
                    {rec === 'Weekly' ? `Weekly (${dayLabel})` : dayLabel} · capacity {p.capacity}
                  </p>
                </div>
                {p.price != null && <Badge tone="neutral">₹{p.price}</Badge>}
                {isOwner && (
                  <IconButton aria-label="Delete guest slot" icon={<Trash2 size={16} />} onClick={() => del.mutate(p.id)} loading={del.isPending} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 'var(--av2-space-4)', display: 'grid', gap: 'var(--av2-space-3)' }}>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--av2-muted)' }}>
            Add a guest slot
          </p>

          <Select label="Recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            <option value="Daily">Daily</option>
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
          </Select>

          {recurrence === 'Monthly' && (
            <Badge tone="warning">Monthly recurrence isn&apos;t built yet — tell us if you need it.</Badge>
          )}

          {recurrence === 'Weekly' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--av2-space-2)' }}>
              {weekdayOptions.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  style={{
                    padding: 'var(--av2-space-2) var(--av2-space-3)',
                    borderRadius: 'var(--av2-radius-sm)',
                    border: `1px solid ${days.includes(d.value) ? 'var(--av2-accent)' : 'var(--av2-border)'}`,
                    background: days.includes(d.value) ? 'var(--av2-accent)' : 'var(--av2-surface)',
                    color: days.includes(d.value) ? 'var(--av2-accent-fg)' : 'var(--av2-text)',
                    cursor: 'pointer',
                    fontSize: 'var(--av2-text-sm)',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {recurrence !== 'Monthly' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
                <TextField label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <TextField label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
                <Select label="Slot length" value={slotDurationMinutes} onChange={(e) => setSlotDurationMinutes(e.target.value)}>
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                  <option value="120">120 min</option>
                </Select>
                <TextField label="Capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
              <Toggle checked={customRate} onChange={setCustomRate} label="Custom Rate" />
              {customRate && (
                <TextField label="Price (₹)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              )}
            </>
          )}

          {validationError && (
            <p style={{ margin: 0, fontSize: 'var(--av2-text-xs)', color: 'var(--av2-danger)', fontWeight: 600 }}>{validationError}</p>
          )}

          <div>
            <Button onClick={onAdd} disabled={addDisabled} loading={save.isPending}>Add guest slot</Button>
          </div>

          {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        </div>
      )}

      <Banner tone="info">For a one-off date, use Branch Settings → Special Hours instead.</Banner>
    </Card>
  );
}
