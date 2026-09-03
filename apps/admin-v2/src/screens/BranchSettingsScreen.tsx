import { useEffect, useMemo, useState } from 'react';
import { Clock, Save } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Badge, Banner, Button, Card, EmptyState, LoadingState, Select, TextField } from '../components';
import { errorMessage } from '../lib/errorMessage';
import { branchSettingsSchema, WEEKDAYS } from './branchSettings/schema';
import { useBranchList, useSaveBranchSettings } from './branchSettings/queries';

/**
 * F-210 / F-220 — `/branch-settings`: operating hours + open days per branch.
 *
 * The mockup has no branch-settings screen at all (branches are hardcoded filter dropdowns
 * everywhere they appear), so this is genuinely new UI over data that already exists on
 * `Branch` (workingHoursStart / workingHoursEnd / workingDays), saved with the existing
 * `PATCH /tenant/branches/:id`. First pass: just those three fields, nothing bigger.
 *
 * No F-206 module gate — branch hours aren't a sellable module, same as Dashboard / Ledger / etc.
 */
export function BranchSettingsScreen() {
  const { user } = useAdminAuth();
  const branches = useBranchList();
  const [branchId, setBranchId] = useState('');

  const selected = branches.data?.find((b) => b.id === branchId) || branches.data?.[0];
  const isOwner = !!user?.roles?.includes('owner');

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [zodError, setZodError] = useState<string | null>(null);

  const save = useSaveBranchSettings(selected?.id ?? '');

  useEffect(() => {
    if (!selected) return;
    setBranchId(selected.id);
    setStart(selected.workingHoursStart ?? '');
    setEnd(selected.workingHoursEnd ?? '');
    setDays(selected.workingDays ?? []);
    setZodError(null);
    save.reset();
    // Keyed on the branch id only — re-syncing on every query refetch would clobber
    // an in-progress edit.
  }, [selected?.id]);

  const dirty = useMemo(() => {
    if (!selected) return false;
    const sameDays =
      (selected.workingDays ?? []).length === days.length &&
      (selected.workingDays ?? []).every((d) => days.includes(d));
    return (
      (selected.workingHoursStart ?? '') !== start ||
      (selected.workingHoursEnd ?? '') !== end ||
      !sameDays
    );
  }, [selected, start, end, days]);

  const toggleDay = (day: string) =>
    setDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      // Keep canonical Mon-first order so the stored array and the guest-facing
      // "Days: Mon, Tue, …" display read consistently regardless of click order.
      const order = WEEKDAYS as readonly string[];
      return [...next].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });

  const submit = () => {
    setZodError(null);
    const parsed = branchSettingsSchema.safeParse({ workingHoursStart: start, workingHoursEnd: end, workingDays: days });
    if (!parsed.success) {
      setZodError(errorMessage(parsed.error));
      return;
    }
    save.mutate(parsed.data);
  };

  if (branches.isLoading) return <LoadingState label="Loading branches…" />;
  if (branches.isError) return <Banner tone="error">{errorMessage(branches.error)}</Banner>;
  if ((branches.data ?? []).length === 0) {
    return <EmptyState icon={<Clock size={20} />} title="No branches yet" description="This account has no branches to configure." />;
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)', maxWidth: 560 }}>
      <div>
        <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Branch Settings</h2>
        <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
          When each branch opens and closes, and which days it runs.
        </p>
      </div>

      <Select label="Branch" value={selected?.id ?? ''} onChange={(e) => setBranchId(e.target.value)}>
        {(branches.data ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>

      <Card as="section" style={{ display: 'grid', gap: 'var(--av2-space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Operating hours</h3>

        {!isOwner && (
          <Banner tone="info">
            Only an owner can change branch settings. You can review them here.
          </Banner>
        )}

        <TextField
          label="Opens"
          placeholder="06:00"
          value={start}
          disabled={!isOwner}
          onChange={(e) => {
            setStart(e.target.value);
            setZodError(null);
          }}
        />
        <TextField
          label="Closes"
          placeholder="22:00"
          value={end}
          disabled={!isOwner}
          onChange={(e) => {
            setEnd(e.target.value);
            setZodError(null);
          }}
        />

        <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
          <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>Open days</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--av2-space-2)' }}>
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={days.includes(day)}
                disabled={!isOwner}
                onClick={() => toggleDay(day)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: isOwner ? 'pointer' : 'default',
                  opacity: isOwner ? 1 : 0.6,
                }}
              >
                <Badge tone={days.includes(day) ? 'success' : 'neutral'}>{day.slice(0, 3)}</Badge>
              </button>
            ))}
          </div>
        </div>

        {zodError && <Banner tone="error">{zodError}</Banner>}
        {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        {save.isSuccess && !dirty && <Banner tone="success">Branch settings saved.</Banner>}

        <Button
          leadingIcon={<Save size={16} />}
          loading={save.isPending}
          disabled={!isOwner || !dirty || save.isPending}
          onClick={submit}
        >
          Save settings
        </Button>
      </Card>
    </div>
  );
}
