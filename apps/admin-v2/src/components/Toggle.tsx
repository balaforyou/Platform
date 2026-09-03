import { useId } from 'react';

interface ToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

const WIDTH = 44;
const HEIGHT = 24;
const THUMB = 18;
const INSET = 3;

/**
 * Generic on/off switch, built for F-220's "Open every day" / "Edit hours" toggles but intended
 * as a reusable `components/` primitive from here on — reach for this anywhere admin-v2 needs
 * a boolean switch, rather than a bare `<input type="checkbox">` or a bespoke one-off toggle
 * (as "Edit hours" itself was, before this pass). Not screen-specific.
 *
 * A real `<input type="checkbox">` under a styled track/thumb, so it keeps native checkbox
 * semantics (keyboard, screen reader, form behaviour) rather than reimplementing them on a
 * `<div>`. Colours come from the existing `--av2-*` tokens (accent for "on", border for "off")
 * instead of hardcoded hex, so it already matches both themes. The focus ring
 * (`.av2-toggle-input:focus-visible + .av2-toggle-track` in styles.css) only shows on keyboard
 * focus, same as every other focusable control here — inline styles can't target
 * `:focus-visible`, which is the one bit of CSS this component needs outside its own file.
 */
export function Toggle({ id, checked, onChange, label, disabled }: ToggleProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <label
      htmlFor={fieldId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--av2-space-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-block', flex: 'none', width: WIDTH, height: HEIGHT }}>
        <input
          id={fieldId}
          type="checkbox"
          className="av2-toggle-input"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
        <span
          aria-hidden
          className="av2-toggle-track"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 9999,
            background: checked ? 'var(--av2-accent)' : 'var(--av2-border)',
            transition: 'background var(--av2-duration-base) var(--av2-ease-standard)',
            pointerEvents: 'none',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: INSET,
            left: INSET,
            width: THUMB,
            height: THUMB,
            borderRadius: '50%',
            background: 'var(--av2-surface)',
            boxShadow: 'var(--av2-shadow)',
            transform: checked ? `translateX(${WIDTH - THUMB - INSET * 2}px)` : 'translateX(0)',
            transition: 'transform var(--av2-duration-base) var(--av2-ease-standard)',
            pointerEvents: 'none',
          }}
        />
      </span>
      {label && (
        <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600, color: 'var(--av2-text)' }}>{label}</span>
      )}
    </label>
  );
}
