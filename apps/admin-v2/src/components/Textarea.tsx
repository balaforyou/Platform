import type { TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * F-220: the one primitive the court/slot-config port needs that didn't exist — a labelled
 * <textarea> for the date-override `reason` field. Same prop shape and token styling as
 * `TextField` wraps `<input>`.
 */
export function Textarea({ label, hint, error, id, style, rows = 3, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
      <label htmlFor={fieldId} style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600, color: 'var(--av2-text)' }}>
        {label}
      </label>
      <textarea
        {...rest}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        style={{
          padding: 'var(--av2-space-2) var(--av2-space-3)',
          fontSize: 'var(--av2-text-base)',
          fontFamily: 'inherit',
          borderRadius: 'var(--av2-radius-sm)',
          border: `1px solid ${error ? 'var(--av2-danger)' : 'var(--av2-border)'}`,
          background: 'var(--av2-surface)',
          color: 'var(--av2-text)',
          resize: 'vertical',
          ...style,
        }}
      />
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
