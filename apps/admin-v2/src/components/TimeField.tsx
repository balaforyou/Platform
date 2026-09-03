import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface TimeFieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** 24-hour "HH:MM", or "" for unset. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));
const ITEM_H = 34;
const VISIBLE = 5;

/** Typing filter: digits only, ':' auto-inserted after 2, capped at HH:MM. */
function maskTyping(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Blur normaliser: pad + clamp to a real 24h time, or clear if it isn't a full one. */
function normalize(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length < 3) return ''; // empty or single-segment -> not a time
  const hh = Math.min(23, Number(d.slice(0, 2)) || 0);
  const mm = Math.min(59, Number(d.slice(2, 4).padEnd(2, '0')) || 0);
  return `${pad2(hh)}:${pad2(mm)}`;
}

/**
 * F-220: 24-hour time input, reusable. A masked text field (digits only, ':' auto-inserts,
 * clamps to 00:00-23:59 on blur, clears an incomplete value) plus a clock button that opens a
 * scroll-wheel picker (hours / minutes columns, scroll-snap, tap or scroll to pick). No
 * dependency - the wheel is plain scroll-snap CSS. Same prop shape as `TextField`.
 */
export function TimeField({ label, hint, error, value, onChange, disabled, placeholder = 'HH:MM', id }: TimeFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);

  // Re-sync the visible text when the value changes from outside (branch switch, wheel pick).
  useEffect(() => {
    setText(value);
  }, [value]);

  const [selHour, selMin] = useMemo(() => {
    const m = /^(\d{2}):(\d{2})$/.exec(value);
    return m ? [m[1], m[2]] : ['08', '00']; // wheel defaults when nothing is set yet
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;

  const commit = (v: string) => {
    if (v !== value) onChange(v);
  };

  const setPart = (part: 'h' | 'm', v: string) => {
    const next = part === 'h' ? `${v}:${selMin}` : `${selHour}:${v}`;
    setText(next);
    commit(next);
  };

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)', position: 'relative' }}>
      <label htmlFor={fieldId} style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600, color: 'var(--av2-text)' }}>
        {label}
      </label>

      <div style={{ display: 'flex', gap: 'var(--av2-space-2)' }}>
        <input
          id={fieldId}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => setText(maskTyping(e.target.value))}
          onBlur={() => {
            const n = normalize(text);
            setText(n);
            commit(n);
          }}
          style={{
            flex: 1,
            padding: 'var(--av2-space-2) var(--av2-space-3)',
            fontSize: 'var(--av2-text-base)',
            fontVariantNumeric: 'tabular-nums',
            borderRadius: 'var(--av2-radius-sm)',
            border: `1px solid ${error ? 'var(--av2-danger)' : 'var(--av2-border)'}`,
            background: 'var(--av2-surface)',
            color: 'var(--av2-text)',
          }}
        />
        <button
          type="button"
          aria-label={open ? 'Close time picker' : 'Pick a time'}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          style={{
            flex: 'none',
            width: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--av2-radius-sm)',
            border: '1px solid var(--av2-border)',
            background: open ? 'var(--av2-accent-soft)' : 'var(--av2-surface)',
            color: open ? 'var(--av2-accent-hover)' : 'var(--av2-muted)',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          <Clock size={16} />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} picker`}
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--av2-space-1))',
            left: 0,
            zIndex: 50,
            display: 'flex',
            gap: 'var(--av2-space-1)',
            padding: 'var(--av2-space-2)',
            borderRadius: 'var(--av2-radius-sm)',
            border: '1px solid var(--av2-border)',
            background: 'var(--av2-surface)',
            boxShadow: 'var(--av2-shadow-lg)',
          }}
        >
          <WheelColumn items={HOURS} selected={selHour} onSelect={(v) => setPart('h', v)} />
          <div style={{ alignSelf: 'center', fontWeight: 700, color: 'var(--av2-muted)' }}>:</div>
          <WheelColumn items={MINUTES} selected={selMin} onSelect={(v) => setPart('m', v)} />
        </div>
      )}

      {hint && !error && (
        <span id={`${fieldId}-hint`} style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${fieldId}-err`} style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

function WheelColumn({ items, selected, onSelect }: { items: string[]; selected: string; onSelect: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const settle = useRef<number | undefined>(undefined);

  const openSelected = useRef(selected);

  // Centre the current selection once, when the wheel opens. This component remounts on every
  // open, so the ref captured at mount is the value to land on — deliberately not re-run on
  // later `selected` changes (that would fight the user's own scroll).
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
        height: ITEM_H * VISIBLE,
        width: 48,
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
            borderRadius: 'var(--av2-radius-sm)',
            background: it === selected ? 'var(--av2-accent-soft)' : 'transparent',
            color: it === selected ? 'var(--av2-accent-hover)' : 'var(--av2-text)',
            fontWeight: it === selected ? 700 : 400,
            fontSize: 'var(--av2-text-base)',
            fontVariantNumeric: 'tabular-nums',
            cursor: 'pointer',
          }}
        >
          {it}
        </button>
      ))}
      <div style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
    </div>
  );
}
