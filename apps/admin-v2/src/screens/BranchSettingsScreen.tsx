import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Moon,
  Repeat,
  Save,
  Sun,
} from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useAdminTenant } from '../auth/AdminTenantContext';
import { Badge, Banner, Button, Card, EmptyState, LoadingState, Select, TimeField, Toggle } from '../components';
import { errorMessage } from '../lib/errorMessage';
import { branchSettingsSchema, WEEKDAYS } from './branchSettings/schema';
import { cityFromAddress, describeSchedule, to12h } from './branchSettings/format';
import { useBranchList, useSaveBranchSettings } from './branchSettings/queries';

const HHMM = /^\d{2}:\d{2}$/;

/**
 * F-210 / F-220 §1a — `/branch-settings`: operating hours + open days per branch, redesigned
 * to the mobile mockup (branch card, computed schedule-overview summary, read-only-by-default
 * operating-hours card, open-days card with an "open every day" bulk toggle).
 *
 * Data model is unchanged from §1 — `Branch.workingHoursStart` / `workingHoursEnd` / `workingDays`,
 * saved with `PATCH /tenant/branches/:id`, stored as 24h HH:MM. The 12h display is a format-only
 * change. Special Hours (`AvailabilityOverride`) is §1b, not here. No F-206 module gate.
 */
export function BranchSettingsScreen() {
  const navigate = useNavigate();
  const { user } = useAdminAuth();
  const { tenant } = useAdminTenant();
  const branches = useBranchList();
  const isOwner = !!user?.roles?.includes('owner');

  const [branchId, setBranchId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [zodError, setZodError] = useState<string | null>(null);

  const selected = branches.data?.find((b) => b.id === branchId) || branches.data?.[0];
  const save = useSaveBranchSettings(selected?.id ?? '');

  useEffect(() => {
    if (!selected) return;
    setBranchId(selected.id);
    setStart(selected.workingHoursStart ?? '');
    setEnd(selected.workingHoursEnd ?? '');
    setDays(selected.workingDays ?? []);
    setZodError(null);
    setPickerOpen(false);
    // Drop straight into edit mode if this branch has no hours to show yet.
    setEditingHours(!(selected.workingHoursStart && selected.workingHoursEnd));
    save.reset();
    // Keyed on the branch id only — re-syncing on every refetch would clobber an in-progress edit.
  }, [selected?.id]);

  const hoursSet = HHMM.test(start) && HHMM.test(end);

  const dirty = useMemo(() => {
    if (!selected) return false;
    const b = selected;
    const sameDays =
      (b.workingDays ?? []).length === days.length && (b.workingDays ?? []).every((d) => days.includes(d));
    return (b.workingHoursStart ?? '') !== start || (b.workingHoursEnd ?? '') !== end || !sameDays;
  }, [selected, start, end, days]);

  const setAllDays = () => setDays((prev) => (prev.length === 7 ? [] : [...WEEKDAYS]));
  const toggleDay = (day: string) =>
    setDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
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
    save.mutate(parsed.data, { onSuccess: () => setEditingHours(false) });
  };

  if (branches.isLoading) return <LoadingState label="Loading branches…" />;
  if (branches.isError) return <Banner tone="error">{errorMessage(branches.error)}</Banner>;
  if ((branches.data ?? []).length === 0) {
    return <EmptyState icon={<Clock size={20} />} title="No branches yet" description="This account has no branches to configure." />;
  }

  const photo = selected?.photos?.[0] || tenant?.logo || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-4)', maxWidth: 640, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <button
          type="button"
          aria-label="Back to Apps"
          onClick={() => navigate('/apps')}
          style={{
            flex: 'none',
            marginTop: 2,
            display: 'inline-flex',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--av2-muted)',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Branch Settings</h2>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            Manage when this branch is open for bookings.
          </p>
        </div>
      </div>

      {/* Branch card — compact */}
      <Card as="section" style={{ padding: 'var(--av2-space-4)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-3)' }}>
          <div
            style={{
              flex: 'none',
              width: 40,
              height: 40,
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--av2-surface-alt)',
              color: 'var(--av2-muted)',
            }}
          >
            {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--av2-text-base)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {selected?.name}
            </div>
            {cityFromAddress(selected?.address) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 'var(--av2-text-xs)',
                  color: 'var(--av2-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <MapPin size={12} style={{ flex: 'none' }} /> {cityFromAddress(selected?.address)}
              </div>
            )}
          </div>
          {(branches.data ?? []).length > 1 && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Repeat size={14} />}
              onClick={() => setPickerOpen((o) => !o)}
              style={{ flex: 'none' }}
            >
              Change branch
            </Button>
          )}
        </div>
        {pickerOpen && (
          <Select
            label="Branch"
            value={selected?.id ?? ''}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPickerOpen(false);
            }}
          >
            {(branches.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
      </Card>

      {/* Regular operating hours — merged with what used to be a separate "Schedule overview"
          card. Both showed the same information (a computed summary sentence duplicating the
          Opening/Closing values right below it); now the summary is this card's own subtitle
          and the Active/Not set badge sits next to its title, instead of a whole second card. */}
      <Card as="section" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--av2-space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--av2-space-3)', minWidth: 0 }}>
            <Clock size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-2)', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Regular operating hours</h3>
                {hoursSet && days.length > 0 ? (
                  <Badge tone="success">
                    <CheckCircle2 size={12} /> Active
                  </Badge>
                ) : (
                  <Badge tone="neutral">Not set</Badge>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
                {describeSchedule(days, start, end)}
              </p>
            </div>
          </div>
          {isOwner && <Toggle checked={editingHours} onChange={setEditingHours} label="Edit hours" />}
        </div>

        {!isOwner && (
          <Banner tone="info">Only an owner can change branch settings. You can review them here.</Banner>
        )}

        {editingHours ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TimeField
                label="Opening time"
                icon={<Sun size={16} />}
                value={start}
                onChange={(v) => {
                  setStart(v);
                  setZodError(null);
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TimeField
                label="Closing time"
                icon={<Moon size={16} />}
                value={end}
                onChange={(v) => {
                  setEnd(v);
                  setZodError(null);
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-3)' }}>
            <ReadonlyTime label="Opening time" value={start} icon={<Sun size={16} />} />
            <span style={{ color: 'var(--av2-muted)' }}>–</span>
            <ReadonlyTime label="Closing time" value={end} icon={<Moon size={16} />} />
          </div>
        )}
      </Card>

      {/* Open days */}
      <Card as="section" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--av2-space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--av2-space-3)' }}>
            <CalendarDays size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Open days</h3>
              <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
                Select days when this branch is available.
              </p>
            </div>
          </div>
          <Toggle checked={days.length === 7} disabled={!isOwner} onChange={setAllDays} label="Open every day" />
        </div>
        {/* One row, all 7 — day name on top, tick below. */}
        <div style={{ display: 'flex', gap: 'var(--av2-space-1)' }}>
          {WEEKDAYS.map((day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={day}
                disabled={!isOwner}
                onClick={() => toggleDay(day)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  padding: 'var(--av2-space-2) 2px',
                  borderRadius: 'var(--av2-radius-sm)',
                  border: `1px solid ${on ? 'var(--av2-accent)' : 'var(--av2-border)'}`,
                  background: on ? 'var(--av2-accent)' : 'var(--av2-surface)',
                  color: on ? 'var(--av2-accent-fg)' : 'var(--av2-text)',
                  fontSize: 'var(--av2-text-xs)',
                  fontWeight: 700,
                  cursor: isOwner ? 'pointer' : 'default',
                  opacity: isOwner ? 1 : 0.6,
                }}
              >
                {day.slice(0, 3)}
                <span
                  style={{
                    display: 'inline-flex',
                    width: 15,
                    height: 15,
                    borderRadius: '50%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1.5px solid ${on ? 'currentColor' : 'var(--av2-border)'}`,
                  }}
                >
                  {on && <Check size={10} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {zodError && <Banner tone="error">{zodError}</Banner>}
      {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}
      {save.isSuccess && !dirty && <Banner tone="success">Branch settings saved.</Banner>}
      {isOwner && dirty && days.length === 0 && (
        <p style={{ margin: 0, fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', textAlign: 'center' }}>
          Pick at least one open day to save.
        </p>
      )}

      <Button
        leadingIcon={<Save size={16} />}
        loading={save.isPending}
        disabled={!isOwner || !dirty || save.isPending || !hoursSet || days.length === 0}
        onClick={submit}
        fullWidth
      >
        Save changes
      </Button>
    </div>
  );
}

function ReadonlyTime({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: 'var(--av2-space-3)',
        borderRadius: 'var(--av2-radius-sm)',
        border: '1px solid var(--av2-border)',
        background: 'var(--av2-surface)',
      }}
    >
      <div style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 'var(--av2-text-lg)', fontWeight: 700 }}>{HHMM.test(value) ? to12h(value) : 'Not set'}</span>
        <span style={{ color: 'var(--av2-muted)' }}>{icon}</span>
      </div>
    </div>
  );
}
