import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, CreditCard, Link2, Search } from 'lucide-react';
import { Banner, Button, Card, Select, Toggle, useToast } from '../../../components';
import { friendlyError } from '../../../lib/errorMessage';
import {
  useAvailability,
  useBranches,
  useCreateManualBooking,
  useCreateWalkIn,
  useGuestLookup,
  usePools,
} from '../queries';
import type { AvailabilitySlot, GuestLookupResult, ManualPaymentMethod, Resource } from '../types';
import {
  BANDS,
  bandsWithSlots,
  digitsOnly,
  formatSlotLabel,
  isValidPhone10,
  RATE_SOURCE_LABEL,
  resolveGuestRate,
  slotsInBand,
  todayIsoDate,
  type Band,
} from '../reservationHelpers';

type LookupState = 'idle' | 'found' | 'not-found';
type PayChoice = 'cash' | 'link';
type LinkMode = 'send' | 'qr';

const fieldStyle: React.CSSProperties = {
  padding: 'var(--av2-space-2) var(--av2-space-3)',
  fontSize: 'var(--av2-text-base)',
  borderRadius: 'var(--av2-radius-sm)',
  border: '1px solid var(--av2-border)',
  background: 'var(--av2-surface)',
  color: 'var(--av2-text)',
};

/**
 * F-229 Step 5 — the Reservations tab's walk-in booking form. Built to `Main_v2.dc.html`.
 *
 * An admin books a court for a guest who's physically present or on the phone: look up (or
 * create, no OTP) the guest by phone, pick a slot, set a price, and either take cash on the
 * spot, send a Razorpay link, or record a UPI-QR payment they've already made. Wraps the
 * Step 2 (`/users/walk-in`) and Step 3 (`/bookings/manual`) routes.
 */
export function ReservationsPanel({ branchId }: { branchId: string }) {
  const toast = useToast();
  const branches = useBranches();
  const pools = usePools(branchId);
  const lookup = useGuestLookup();
  const createWalkIn = useCreateWalkIn();
  const createBooking = useCreateManualBooking();

  const branch = useMemo(() => (branches.data ?? []).find((b) => b.id === branchId), [branches.data, branchId]);
  const tz = branch?.timezone;
  const branchPools = pools.data ?? [];

  const [poolId, setPoolId] = useState('');
  useEffect(() => {
    if (branchPools.length && !branchPools.some((p) => p.id === poolId)) setPoolId(branchPools[0].id);
  }, [branchPools, poolId]);
  const pool = branchPools.find((p) => p.id === poolId);
  const isPooled = (pool?.allocationMode ?? 'POOLED') !== 'FIXED_INSTANCE';

  // --- guest ---
  const [phone, setPhone] = useState('');
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [foundUser, setFoundUser] = useState<GuestLookupResult | null>(null);
  const [newName, setNewName] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  const resetGuest = () => {
    setLookupState('idle');
    setFoundUser(null);
    setNewName('');
    setLookupError(null);
  };
  const runLookup = async () => {
    setLookupError(null);
    try {
      const out = await lookup.mutateAsync(phone);
      if (out.status === 'found') {
        setFoundUser(out.user);
        setLookupState('found');
      } else {
        setLookupState('not-found');
      }
    } catch (err) {
      setLookupError(friendlyError(err, 'Couldn’t look up that number. Try again.'));
    }
  };

  // --- date / band / slot ---
  const [date, setDate] = useState(todayIsoDate());
  const availability = useAvailability(poolId, date);
  const slots: AvailabilitySlot[] = availability.data ?? [];
  const bandSet = useMemo(() => bandsWithSlots(slots, tz), [slots, tz]);

  const [band, setBand] = useState<Band>('evening');
  const [windowId, setWindowId] = useState('');

  // When the slot list changes, keep `band` on something that has slots, and drop a stale windowId.
  useEffect(() => {
    if (!slots.length) return;
    if (!bandSet.has(band)) {
      const first = BANDS.find((b) => bandSet.has(b.key));
      if (first) setBand(first.key);
    }
  }, [slots, bandSet, band]);
  useEffect(() => {
    setWindowId('');
  }, [poolId, date]);

  const bandSlots = useMemo(() => slotsInBand(slots, band, tz), [slots, band, tz]);
  const selectedSlot = slots.find((s) => s.window.id === windowId) ?? null;

  // --- court ---
  const [showAllCourts, setShowAllCourts] = useState(false);
  const [resourceId, setResourceId] = useState('');
  const courts: Resource[] = pool?.resources ?? [];
  const visibleCourts = showAllCourts ? courts : courts.filter((c) => c.guestBookable);
  useEffect(() => {
    if (resourceId && !visibleCourts.some((c) => c.id === resourceId)) setResourceId('');
  }, [visibleCourts, resourceId]);

  // --- price ---
  const rate = useMemo(
    () => resolveGuestRate(branch, pool, selectedSlot?.window),
    [branch, pool, selectedSlot],
  );
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  useEffect(() => {
    if (!priceTouched) setPrice(rate.amount ? String(rate.amount) : '');
  }, [rate.amount, priceTouched]);

  // --- payment ---
  const [pay, setPay] = useState<PayChoice>('cash');
  const [linkMode, setLinkMode] = useState<LinkMode>('send');
  const [upiTxnId, setUpiTxnId] = useState('');

  const method: ManualPaymentMethod = pay === 'cash' ? 'cash' : linkMode === 'send' ? 'razorpay_link' : 'upi_qr';
  const submitLabel =
    pay === 'cash' ? 'Confirm & mark paid' : linkMode === 'send' ? 'Create booking & send link' : 'Confirm — paid via QR';

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const guestReady = lookupState === 'found' || (lookupState === 'not-found' && newName.trim().length > 0);
  const priceValid = Number(price) > 0;
  const upiReady = method !== 'upi_qr' || upiTxnId.trim().length > 0;
  const canSubmit = !!pool && guestReady && !!windowId && priceValid && upiReady;
  const submitting = createWalkIn.isPending || createBooking.isPending;

  const resetAfterSuccess = () => {
    setPhone('');
    resetGuest();
    setWindowId('');
    setResourceId('');
    setPriceTouched(false);
    setPay('cash');
    setLinkMode('send');
    setUpiTxnId('');
  };

  const submit = async () => {
    if (!pool || !canSubmit) return;
    setSubmitError(null);
    setLinkUrl(null);
    try {
      const userId =
        lookupState === 'found' && foundUser
          ? foundUser.id
          : (await createWalkIn.mutateAsync({ phone, name: newName.trim() })).id;

      const res = await createBooking.mutateAsync({
        branchId,
        resourcePoolId: pool.id,
        resourceId: resourceId || undefined,
        windowId,
        userId,
        negotiatedPrice: Number(price),
        paymentMethod: method,
        upiTransactionId: method === 'upi_qr' ? upiTxnId.trim() : undefined,
      });

      if (method === 'razorpay_link' && res.paymentLink?.shortUrl) {
        setLinkUrl(res.paymentLink.shortUrl);
        toast.push('Booking created — send the payment link below.', 'success');
      } else {
        toast.push('Booking confirmed and payment recorded.', 'success');
      }
      resetAfterSuccess();
    } catch (err) {
      setSubmitError(friendlyError(err, 'Couldn’t record the booking. Nothing was charged — try again.'));
    }
  };

  const segStrip: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
    background: 'var(--av2-surface-alt)',
    borderRadius: 'var(--av2-radius-sm)',
    width: 'fit-content',
    maxWidth: '100%',
  };
  const segBtn = (active: boolean): React.CSSProperties => ({
    appearance: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 14px',
    borderRadius: 'var(--av2-radius-sm)',
    fontSize: 'var(--av2-text-sm)',
    fontWeight: active ? 700 : 600,
    background: active ? 'var(--av2-accent-soft)' : 'transparent',
    color: active ? 'var(--av2-accent)' : 'var(--av2-muted)',
  });
  const hint: React.CSSProperties = { fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' };
  const label: React.CSSProperties = { fontSize: 'var(--av2-text-sm)', fontWeight: 600, color: 'var(--av2-text)' };

  if (pools.isLoading) return <Banner tone="info">Loading courts…</Banner>;
  if (pools.error) return <Banner tone="error">{friendlyError(pools.error, "Couldn’t load this branch’s courts.")}</Banner>;
  if (!branchPools.length) return <Banner tone="info">This branch has no court pool configured yet.</Banner>;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-5)' }}>
      <div>
        <h3 style={{ margin: '0 0 2px', fontSize: 'var(--av2-text-base)', fontWeight: 700 }}>New walk-in booking</h3>
        <p style={{ margin: 0, ...hint }}>For a guest who’s here in person or on the phone right now.</p>
      </div>

      {branchPools.length > 1 && (
        <Select label="Court pool" value={poolId} onChange={(e) => setPoolId(e.target.value)}>
          {branchPools.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}

      {/* Guest */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
        <span style={label}>Guest</span>

        {lookupState === 'idle' && (
          <div style={{ display: 'flex', gap: 'var(--av2-space-2)' }}>
            <input
              placeholder="Mobile number"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(digitsOnly(e.target.value))}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Search size={16} />}
              disabled={!isValidPhone10(phone) || lookup.isPending}
              loading={lookup.isPending}
              onClick={runLookup}
            >
              Search
            </Button>
          </div>
        )}

        {lookupState === 'found' && foundUser && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--av2-space-2)',
              padding: '10px 12px',
              borderRadius: 'var(--av2-radius-sm)',
              background: 'var(--av2-accent-soft)',
              border: '1px solid var(--av2-accent)',
              color: 'var(--av2-accent-hover)',
              fontSize: 'var(--av2-text-sm)',
            }}
          >
            <Check size={16} style={{ flex: 'none' }} />
            <span>
              <strong>+91 {phone}</strong> — existing guest{foundUser.name ? `, ${foundUser.name}` : ''}
            </span>
            <button type="button" onClick={() => { resetGuest(); setPhone(''); }} style={tryAnother('var(--av2-accent-hover)')}>
              try another
            </button>
          </div>
        )}

        {lookupState === 'not-found' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--av2-space-2)',
                padding: '10px 12px',
                borderRadius: 'var(--av2-radius-sm)',
                background: 'var(--av2-info-soft)',
                border: '1px solid var(--av2-info-border)',
                color: 'var(--av2-info-text)',
                fontSize: 'var(--av2-text-sm)',
              }}
            >
              <CircleAlert size={16} style={{ flex: 'none' }} />
              <span>
                <strong>+91 {phone}</strong> — no account found
              </span>
              <button type="button" onClick={() => { resetGuest(); setPhone(''); }} style={tryAnother('var(--av2-info-text)')}>
                try another
              </button>
            </div>
            <input
              placeholder="Guest’s name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={fieldStyle}
            />
            <span style={hint}>
              Creates a guest account with this name and number — no OTP needed, you’re verifying them.
            </span>
          </div>
        )}

        {lookupError && <Banner tone="error">{lookupError}</Banner>}
      </div>

      {/* Date + time of day */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--av2-space-3)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
          <span style={label}>Date</span>
          <input type="date" value={date} min={todayIsoDate()} onChange={(e) => setDate(e.target.value)} style={fieldStyle} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
          <span style={label}>Time of day</span>
          <div role="tablist" style={segStrip}>
            {BANDS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => { setBand(b.key); setWindowId(''); }}
                disabled={!bandSet.has(b.key)}
                style={{ ...segBtn(b.key === band), opacity: bandSet.has(b.key) ? 1 : 0.4, cursor: bandSet.has(b.key) ? 'pointer' : 'not-allowed' }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Slot */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)', maxWidth: 280 }}>
        <Select
          label="Slot"
          value={windowId}
          onChange={(e) => setWindowId(e.target.value)}
          disabled={availability.isLoading || bandSlots.length === 0}
        >
          <option value="">
            {availability.isLoading ? 'Loading slots…' : bandSlots.length ? 'Select a slot' : 'No open slots'}
          </option>
          {bandSlots.map((s) => (
            <option key={s.window.id} value={s.window.id}>
              {formatSlotLabel(s.window, tz)}
            </option>
          ))}
        </Select>
        <span style={hint}>Open slots for {BANDS.find((b) => b.key === band)?.label} on {date} — pick the exact one.</span>
      </div>

      {/* Court */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={label}>Court</span>
          <Toggle checked={showAllCourts} onChange={setShowAllCourts} label="Show all courts" />
        </div>
        {courts.length === 0 ? (
          <span style={hint}>This pool has no individually-tracked courts.</span>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 'var(--av2-space-2)' }}>
              {visibleCourts.map((c) => {
                const selected = c.id === resourceId;
                const reserved = !c.guestBookable;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setResourceId(selected ? '' : c.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '10px 6px',
                      borderRadius: 'var(--av2-radius-sm)',
                      cursor: 'pointer',
                      border: selected ? '2px solid var(--av2-accent)' : '1px solid var(--av2-border)',
                      background: selected ? 'var(--av2-accent-soft)' : 'var(--av2-surface)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--av2-text-sm)',
                        fontWeight: 700,
                        color: reserved ? 'var(--av2-warning)' : selected ? 'var(--av2-accent-hover)' : 'var(--av2-text)',
                      }}
                    >
                      {c.name}
                    </span>
                    {reserved && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--av2-warning)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Reserved
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <span style={hint}>
              {showAllCourts
                ? 'Showing every court in this pool, including ones reserved for members.'
                : 'Showing courts open to guest bookings only.'}
              {isPooled && ' Court is assigned automatically for this pool.'}
            </span>
          </>
        )}
      </div>

      {/* Price */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)', maxWidth: 200 }}>
        <span style={label}>Price</span>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 12, color: 'var(--av2-muted)', fontSize: 'var(--av2-text-base)' }}>₹</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }}
            style={{ ...fieldStyle, width: '100%', padding: '8px 12px 8px 26px' }}
          />
        </div>
        <span style={hint}>Pre-filled from {RATE_SOURCE_LABEL[rate.source]} — edit to override.</span>
      </div>

      {/* Payment method */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
        <span style={label}>How will they pay?</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--av2-space-3)' }}>
          <PayCard
            selected={pay === 'cash'}
            tone="accent"
            icon={<CreditCard size={18} />}
            title="Cash"
            desc="Collected now — booking confirms immediately."
            onClick={() => setPay('cash')}
          />
          <PayCard
            selected={pay === 'link'}
            tone="info"
            icon={<Link2 size={18} />}
            title="Payment link"
            desc="Sent to their phone, or scan your QR — either way you confirm once they’ve paid."
            onClick={() => setPay('link')}
          />
        </div>

        {pay === 'link' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--av2-space-3)',
              marginTop: 'var(--av2-space-1)',
              padding: 'var(--av2-space-4)',
              borderRadius: 'var(--av2-radius-sm)',
              background: 'var(--av2-info-soft)',
              border: '1px solid var(--av2-info-border)',
            }}
          >
            <div role="tablist" style={{ ...segStrip, background: 'var(--av2-surface)' }}>
              {(['send', 'qr'] as LinkMode[]).map((m) => {
                const active = linkMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLinkMode(m)}
                    style={{
                      ...segBtn(active),
                      fontSize: 'var(--av2-text-xs)',
                      background: active ? 'var(--av2-info-text)' : 'transparent',
                      color: active ? 'var(--av2-accent-fg)' : 'var(--av2-info-text)',
                    }}
                  >
                    {m === 'send' ? 'Send Razorpay link' : 'Already paid via your QR'}
                  </button>
                );
              })}
            </div>

            {linkMode === 'send' ? (
              <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-info-text)', lineHeight: 'var(--av2-leading-normal)' }}>
                A real Razorpay link goes to their phone. Confirms automatically once they pay — no action needed from you.
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
                <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-info-text)', lineHeight: 'var(--av2-leading-normal)' }}>
                  If Razorpay’s down or they’d rather scan your static UPI QR directly, enter the transaction reference they
                  show you to confirm the booking yourself.
                </span>
                <input
                  placeholder="UPI transaction ID"
                  value={upiTxnId}
                  onChange={(e) => setUpiTxnId(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {submitError && <Banner tone="error">{submitError}</Banner>}
      {linkUrl && (
        <Banner tone="success">
          Payment link created — send it to the guest:{' '}
          <a href={linkUrl} target="_blank" rel="noreferrer">
            {linkUrl}
          </a>
        </Banner>
      )}

      <Button
        variant="primary"
        style={{ alignSelf: 'flex-start', marginTop: 'var(--av2-space-2)', fontWeight: 700 }}
        disabled={!canSubmit || submitting}
        loading={submitting}
        onClick={submit}
      >
        {submitLabel}
      </Button>
    </Card>
  );
}

function tryAnother(color: string): React.CSSProperties {
  return {
    marginLeft: 'auto',
    appearance: 'none',
    border: 'none',
    background: 'none',
    color,
    fontSize: 'var(--av2-text-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  };
}

function PayCard({
  selected,
  tone,
  icon,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  tone: 'accent' | 'info';
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  const on = tone === 'accent'
    ? { border: '2px solid var(--av2-accent)', bg: 'var(--av2-accent-soft)', fg: 'var(--av2-accent-hover)' }
    : { border: '2px solid var(--av2-info-text)', bg: 'var(--av2-info-soft)', fg: 'var(--av2-info-text)' };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 'var(--av2-space-4)',
        borderRadius: 'var(--av2-radius)',
        cursor: 'pointer',
        textAlign: 'left',
        border: selected ? on.border : '1px solid var(--av2-border)',
        background: selected ? on.bg : 'var(--av2-surface)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--av2-space-2)', color: selected ? on.fg : 'var(--av2-muted)' }}>
        {icon}
        <span style={{ fontSize: 'var(--av2-text-base)', fontWeight: 700, color: selected ? on.fg : 'var(--av2-text)' }}>{title}</span>
      </span>
      <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', lineHeight: 'var(--av2-leading-normal)' }}>{desc}</span>
    </button>
  );
}
