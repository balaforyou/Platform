import type { SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * Styled wrapper around the native <select> — same shape as TextField wraps <input>.
 * Every <select> in the reference is a bare native one; no custom listbox behaviour
 * anywhere, so this stays a wrapper, not a headless dropdown.
 */
export function Select({ label, hint, error, id, style, children, ...rest }: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
      <label htmlFor={fieldId} style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600, color: 'var(--av2-text)' }}>
        {label}
      </label>
      <div style={{ position: 'relative', display: 'flex' }}>
        <select
          {...rest}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          style={{
            flex: 1,
            appearance: 'none',
            padding: 'var(--av2-space-2) var(--av2-space-8) var(--av2-space-2) var(--av2-space-3)',
            fontSize: 'var(--av2-text-base)',
            borderRadius: 'var(--av2-radius-sm)',
            border: `1px solid ${error ? 'var(--av2-danger)' : 'var(--av2-border)'}`,
            background: 'var(--av2-surface)',
            color: 'var(--av2-text)',
            cursor: 'pointer',
            ...style,
          }}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          aria-hidden
          style={{
            position: 'absolute',
            right: 'var(--av2-space-3)',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--av2-muted)',
            pointerEvents: 'none',
          }}
        />
      </div>
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
