import { useEffect, useMemo, useState } from 'react';
import { Clock, IndianRupee, Plus, Trash2 } from 'lucide-react';
import { Badge, Banner, Button, Card, IconButton, LoadingState, TextField, TimeField } from '../../../components';
import { useAdminAuth } from '../../../auth/AdminAuthContext';
import { errorMessage } from '../../../lib/errorMessage';
import { useBranches, useSaveGuestPricing } from '../queries';
import { nonNegativeAmount, validateTimeWindows, type TimeWindow } from '../schemas';

/**
 * F-220 §3.2 / F-224 — Custom Pricing Rates. Branch-wide guest-only Standard + Peak rate, plus
 * an arbitrary list of non-overlapping peak windows sharing the one Peak Rate. Member pricing
 * (F-209) is separate and untouched. All three fields optional — a branch with none set prices
 * guest bookings at the pool's default rate exactly as before.
 *
 * Two independent Save actions (Peak Hours, Rates), matching the approved mock. Owner-only:
 * a non-owner sees the values read-only, same treatment as Operating Hours on Branch Settings.
 * The real write is owner-gated + GUEST_BOOKING-gated server-side regardless.
 */

const asField = (v: string | null | undefined) => (v == null || v === '' ? '' : String(Number(v)));

export function PricingRates({ branchId }: { branchId: string }) {
  const branches = useBranches();
  const { user } = useAdminAuth();
  const isOwner = !!user?.roles?.includes('owner');
  const save = useSaveGuestPricing(branchId);

  const branch = useMemo(
    () => (branches.data ?? []).find((b) => b.id === branchId),
    [branches.data, branchId],
  );

  const srvStandard = asField(branch?.guestStandardRate);
  const srvPeak = asField(branch?.guestPeakRate);
  const srvWindows = useMemo<TimeWindow[]>(
    () => (branch?.guestPeakWindows ?? []).map((w) => ({ start: w.start, end: w.end })),
    [branch?.guestPeakWindows],
  );

  const [standard, setStandard] = useState(srvStandard);
  const [peak, setPeak] = useState(srvPeak);
  const [windows, setWindows] = useState<TimeWindow[]>(srvWindows);
  const [savedWhat, setSavedWhat] = useState<'rates' | 'windows' | null>(null);

  // Re-seed from the server whenever the branch's stored values change (branch switch, or our
  // own successful save landing back through useBranches).
  useEffect(() => {
    setStandard(srvStandard);
    setPeak(srvPeak);
    setWindows(srvWindows);
  }, [branchId, srvStandard, srvPeak, srvWindows]);

  const windowErrors = useMemo(() => validateTimeWindows(windows), [windows]);
  const anyWindowError = windowErrors.some((e) => e);
  const hasWindows = windows.length > 0;

  const parseAmount = (label: string, value: string) => nonNegativeAmount(label).safeParse(value);
  const standardParsed = parseAmount('Standard Rate', standard);
  const peakProvided = peak.trim() !== '';
  const peakParsed = peakProvided ? parseAmount('Peak Rate', peak) : null;

  const standardError = standard.trim() === ''
    ? 'Standard Rate is required.'
    : standardParsed.success ? '' : (standardParsed.error.issues[0]?.message ?? 'Enter a valid amount.');
  const peakError = hasWindows && !peakProvided
    ? 'Required — you have peak hours set.'
    : peakParsed && !peakParsed.success ? (peakParsed.error.issues[0]?.message ?? 'Enter a valid amount.') : '';

  const windowsDirty =
    windows.length !== srvWindows.length ||
    windows.some((w, i) => !srvWindows[i] || w.start !== srvWindows[i].start || w.end !== srvWindows[i].end);
  const ratesDirty = standard !== srvStandard || peak !== srvPeak;

  const setWindow = (i: number, patch: Partial<TimeWindow>) =>
    setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  // Default a fresh row to a 2h slot starting after the latest existing window, so adding one
  // never instantly collides with a window already in the list (clamped to the evening).
  const addWindow = () =>
    setWindows((ws) => {
      if (ws.length === 0) return [{ start: '06:00', end: '09:00' }];
      const latestEnd = ws.reduce((m, w) => (w.end > m ? w.end : m), '00:00');
      const startH = latestEnd < '22:00' ? Number(latestEnd.slice(0, 2)) : 6;
      const pad = (n: number) => String(n).padStart(2, '0');
      return [...ws, { start: `${pad(startH)}:00`, end: `${pad(Math.min(startH + 2, 23))}:00` }];
    });
  const removeWindow = (i: number) => setWindows((ws) => ws.filter((_, j) => j !== i));

  const saveWindows = () => {
    setSavedWhat(null);
    const body: Parameters<typeof save.mutate>[0] = { guestPeakWindows: windows };
    // The server requires a peak rate to exist once windows do — send the current field value
    // alongside so a first-time setup lands atomically.
    if (hasWindows && peakParsed?.success) body.guestPeakRate = peakParsed.data;
    save.mutate(body, { onSuccess: () => setSavedWhat('windows') });
  };

  const saveRates = () => {
    setSavedWhat(null);
    const body: Parameters<typeof save.mutate>[0] = {
      guestStandardRate: standardParsed.success ? standardParsed.data : undefined,
      guestPeakRate: peakProvided ? (peakParsed?.success ? peakParsed.data : undefined) : null,
    };
    save.mutate(body, { onSuccess: () => setSavedWhat('rates') });
  };

  const windowsSaveDisabled =
    !isOwner || !windowsDirty || anyWindowError || save.isPending || (hasWindows && !peakParsed?.success);
  const ratesSaveDisabled = !isOwner || !ratesDirty || !!standardError || !!peakError || save.isPending;

  if (branches.isLoading) return <LoadingState label="Loading pricing…" />;
  if (branches.error) return <Banner tone="error">{errorMessage(branches.error)}</Banner>;

  const labelStyle = {
    fontSize: 'var(--av2-text-xs)',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: 'var(--av2-muted)',
    margin: 0,
  };

  return (
    <Card as="section">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <IndianRupee size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Custom Pricing Rates</h3>
          <p style={{ margin: '3px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
            One guest rate for every court in this branch. Member pricing is handled separately.
          </p>
        </div>
      </div>

      {!isOwner && (
        <Banner tone="info">Only an owner can change pricing. You can review it here.</Banner>
      )}

      {/* -------- Peak Hours -------- */}
      <p style={{ ...labelStyle, marginTop: 'var(--av2-space-4)' }}>Peak Hours</p>
      {windows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
          No peak hours set — only the Standard Rate applies.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--av2-space-3)' }}>
          {windows.map((w, i) => (
            <div key={i} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--av2-space-2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TimeField
                    label={i === 0 ? 'From' : ''}
                    value={w.start}
                    onChange={(v) => setWindow(i, { start: v })}
                    disabled={!isOwner}
                    icon={<Clock size={14} />}
                    minuteStep={5}
                    id={`peak-${i}-start`}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TimeField
                    label={i === 0 ? 'To' : ''}
                    value={w.end}
                    onChange={(v) => setWindow(i, { end: v })}
                    disabled={!isOwner}
                    icon={<Clock size={14} />}
                    minuteStep={5}
                    id={`peak-${i}-end`}
                  />
                </div>
                {isOwner && (
                  <IconButton
                    aria-label={`Remove peak window ${i + 1}`}
                    variant="ghost"
                    icon={<Trash2 size={16} />}
                    onClick={() => removeWindow(i)}
                  />
                )}
              </div>
              {windowErrors[i] && (
                <p style={{ margin: 0, fontSize: 'var(--av2-text-xs)', color: 'var(--av2-danger)', fontWeight: 600 }}>
                  {windowErrors[i]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 'var(--av2-space-2)' }}>
          <Button variant="secondary" size="sm" leadingIcon={<Plus size={14} />} onClick={addWindow}>
            Add peak window
          </Button>
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 'var(--av2-space-3)', display: 'flex', alignItems: 'center', gap: 'var(--av2-space-2)' }}>
          <Button onClick={saveWindows} disabled={windowsSaveDisabled} loading={save.isPending}>
            Save peak hours
          </Button>
          {hasWindows && !peakParsed?.success && (
            <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
              Enter a valid Peak Rate below first.
            </span>
          )}
        </div>
      )}
      {savedWhat === 'windows' && !windowsDirty && (
        <Banner tone="success">Peak hours saved.</Banner>
      )}

      {/* -------- Rates -------- */}
      <p style={{ ...labelStyle, marginTop: 'var(--av2-space-5)' }}>Rates</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
        <TextField
          label="Standard Rate"
          hint="₹ per hour"
          inputMode="decimal"
          value={standard}
          onChange={(e) => setStandard(e.target.value)}
          disabled={!isOwner}
          error={standardError || undefined}
        />
        <TextField
          label={hasWindows ? 'Peak Rate — required' : 'Peak Rate'}
          hint="₹ per hour"
          inputMode="decimal"
          value={peak}
          onChange={(e) => setPeak(e.target.value)}
          disabled={!isOwner}
          error={peakError || undefined}
        />
      </div>

      {isOwner && (
        <div style={{ marginTop: 'var(--av2-space-3)' }}>
          <Button onClick={saveRates} disabled={ratesSaveDisabled} loading={save.isPending}>
            Save rates
          </Button>
        </div>
      )}
      {savedWhat === 'rates' && !ratesDirty && <Banner tone="success">Rates saved.</Banner>}

      {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}

      <p style={{ marginTop: 'var(--av2-space-4)', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', lineHeight: 1.5 }}>
        Guests booking inside any Peak Hours window pay the Peak Rate; every other time uses the
        Standard Rate — the same rates apply to every court in this branch. A per-slot price set
        in the scheduler still overrides both.
      </p>
      {branch && !branch.guestStandardRate && (
        <Badge tone="neutral">Not configured — guest bookings use each court's default rate</Badge>
      )}
    </Card>
  );
}
