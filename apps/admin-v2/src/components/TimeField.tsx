import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { Modal } from './Modal';

interface TimeFieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** 24-hour "HH:MM", or "" for unset. Unchanged contract. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown in the trigger box and the picker title bar. Defaults to a clock icon — pass
   *  Sun/Moon etc. to match a specific field, same convention the read-only display already
   *  uses elsewhere on this screen. */
  icon?: ReactNode;
  /** F-220 §1b (Finding 3): restrict the minute wheel to multiples of this many minutes
   *  (e.g. a pool's slot duration). Default 1 = every minute 00–59, so existing callers are
   *  untouched. Only honoured for values that divide 60 (15/20/30/60); anything else falls
   *  back to 1. When both fields on a screen share the same step, a range that isn't a whole
   *  number of steps becomes unpickable — see the Special Hours modal. */
  minuteStep?: number;
  id?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOURS_12 = Array.from({ length: 12 }, (_, i) => pad2(i + 1)); // '01'..'12'
const PERIODS = ['AM', 'PM'] as const;

/** '00'..'59', or a coarser grid ('00','15',…) when minuteStep divides 60. */
function minuteOptions(minuteStep?: number): string[] {
  const step = minuteStep && minuteStep > 0 && 60 % minuteStep === 0 ? minuteStep : 1;
  return Array.from({ length: 60 / step }, (_, i) => pad2(i * step));
}
const ITEM_H = 40;
const VISIBLE = 5;
const HHMM = /^(\d{2}):(\d{2})$/;

/** 24h "HH:MM" -> { h12, mm, period }. Falls back to a sane default (08:00 AM) when unset. */
function to12hParts(value: string): { h12: string; mm: string; period: 'AM' | 'PM' } {
  const m = HHMM.exec(value);
  if (!m) return { h12: '08', mm: '00', period: 'AM' };
  const h24 = Number(m[1]);
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM';
  return { h12: pad2(h24 % 12 || 12), mm: m[2], period };
}

/** { h12, mm, period } -> 24h "HH:MM", the value this component always commits. */
function from12h(h12: string, mm: string, period: 'AM' | 'PM'): string {
  let h = Number(h12) % 12;
  if (period === 'PM') h += 12;
  return `${pad2(h)}:${mm}`;
}

/**
 * Generic time-of-day input, built for F-220 but intended as a reusable `components/`
 * primitive from here on, not specific to Branch Settings — reach for this anywhere admin-v2
 * needs a time value (e.g. Setup Rules' Dynamic Guest Scheduler, still to come).
 *
 * Wheel-only by design — no typed entry, so it can never end up mid-way
 * through a malformed value. Tapping the field itself opens a picker Modal (Hour 1-12 / Minute
 * / AM-PM, tinted centre-selection band, soft top/bottom fade — the "Schedule overview" card's
 * accent-soft + accent-hairline recipe, not a new visual language). The picker displays and
 * edits in 12h/AM-PM; it still only ever commits a 24h "HH:MM" string via onChange, so no
 * caller or server contract changes.
 *
 * Renders as a compact label+value box (the same shape the read-only display already uses),
 * so two of these sit comfortably side by side in one row — see the Opening/Closing time row
 * in BranchSettingsScreen.
 *
 * Built on the existing `Modal` (Radix Dialog — focus trap, Escape, scroll lock, ARIA) rather
 * than a custom anchored popover: with two fields sitting side by side, an anchored popover
 * under the right-hand field would routinely run off the edge of a phone screen. A centred
 * modal sidesteps that regardless of which field opened it.
 */
export function TimeField({ label, hint, error, value, onChange, disabled, icon, minuteStep, id }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const minutes = useMemo(() => minuteOptions(minuteStep), [minuteStep]);
  const { h12: selHour, mm: selMin, period: selPeriod } = useMemo(() => to12hParts(value), [value]);
  const isSet = HHMM.test(value);

  const setPart = (part: 'h' | 'm' | 'p', v: string) => {
    const next = from12h(part === 'h' ? v : selHour, part === 'm' ? v : selMin, part === 'p' ? (v as 'AM' | 'PM') : selPeriod);
    if (next !== value) onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={{
          textAlign: 'left',
          width: '100%',
          padding: 'var(--av2-space-3)',
          borderRadius: 'var(--av2-radius-sm)',
          border: `1px solid ${error ? 'var(--av2-danger)' : 'var(--av2-border)'}`,
          background: 'var(--av2-surface)',
          color: 'var(--av2-text)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 'var(--av2-space-2)' }}>
          <span style={{ fontSize: 'var(--av2-text-lg)', fontWeight: 700 }}>
            {isSet ? `${selHour}:${selMin} ${selPeriod}` : 'Not set'}
          </span>
          <span style={{ flex: 'none', color: 'var(--av2-muted)' }}>{icon ?? <Clock size={16} />}</span>
        </div>
      </button>

      {hint && !error && (
        <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>{hint}</span>
      )}
      {error && <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-danger)' }}>{error}</span>}

      <Modal open={open} onOpenChange={setOpen} title={label} size="sm">
        <div
          style={{
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 'var(--av2-text-base)',
            color: 'var(--av2-text)',
            marginBottom: 'var(--av2-space-4)',
          }}
        >
          {selHour}:{selMin} {selPeriod}
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            borderRadius: 'var(--av2-radius-sm)',
            background: 'var(--av2-surface-alt)',
            overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, transparent, black 24%, black 76%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 24%, black 76%, transparent)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: ITEM_H * Math.floor(VISIBLE / 2),
              left: 4,
              right: 4,
              height: ITEM_H,
              borderRadius: 'var(--av2-radius-sm)',
              background: 'var(--av2-accent-soft)',
              borderTop: '1px solid var(--av2-accent)',
              borderBottom: '1px solid var(--av2-accent)',
              pointerEvents: 'none',
            }}
          />
          <WheelColumn width={56} items={HOURS_12} selected={selHour} onSelect={(v) => setPart('h', v)} />
          <Divider />
          <WheelColumn width={56} items={minutes} selected={selMin} onSelect={(v) => setPart('m', v)} />
          <Divider />
          <WheelColumn width={52} items={[...PERIODS]} selected={selPeriod} onSelect={(v) => setPart('p', v)} />
        </div>
      </Modal>
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ flex: 'none', width: 1, alignSelf: 'stretch', background: 'var(--av2-border)', zIndex: 1 }}
    />
  );
}

function WheelColumn({
  items,
  selected,
  onSelect,
  width,
}: {
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
  width: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const settle = useRef<number | undefined>(undefined);
  const openSelected = useRef(selected);

  // Centre the current selection once, when the picker opens. This column remounts fresh every
  // time the Modal opens (Radix unmounts Dialog.Content on close), so the ref captured at mount
  // is the value to land on — deliberately not re-run on later `selected` changes (that would
  // fight the user's own in-progress scroll).
  useEffect(() => {
    const idx = Math.max(0, items.indexOf(openSelected.current));
    const el = ref.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = idx * ITEM_H; });
  }, [items]);

  const onScroll = () => {
    if (!touched.current) return; // ignore the programmatic open-scroll
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
      if (items[idx] !== selected) onSelect(items[idx]);
    }, 140);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      onScroll={onScroll}
      onPointerDown={() => (touched.current = true)}
      onWheel={() => (touched.current = true)}
      className="av2-timewheel"
      style={{
        position: 'relative',
        zIndex: 2,
        flex: 'none',
        width,
        height: ITEM_H * VISIBLE,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        textAlign: 'center',
      }}
    >
      <div style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
      {items.map((it) => (
        <button
          key={it}
          type="button"
          role="option"
          aria-selected={it === selected}
          onClick={() => {
            touched.current = true;
            ref.current?.scrollTo({ top: items.indexOf(it) * ITEM_H, behavior: 'smooth' });
            if (it !== selected) onSelect(it);
          }}
          style={{
            display: 'block',
            width: '100%',
            height: ITEM_H,
            scrollSnapAlign: 'center',
            border: 'none',
            background: 'transparent',
            color: it === selected ? 'var(--av2-accent-hover)' : 'var(--av2-text)',
            opacity: it === selected ? 1 : 0.55,
            fontWeight: it === selected ? 700 : 400,
            fontSize: it === selected ? 'var(--av2-text-xl)' : 'var(--av2-text-lg)',
            fontVariantNumeric: 'tabular-nums',
            cursor: 'pointer',
            transition:
              'opacity var(--av2-duration-fast) var(--av2-ease-standard), font-size var(--av2-duration-fast) var(--av2-ease-standard)',
          }}
        >
          {it}
        </button>
      ))}
      <div style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
    </div>
  );
}
