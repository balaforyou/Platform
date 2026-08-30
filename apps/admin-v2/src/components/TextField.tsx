import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, id, style, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={fieldId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--av2-text)' }}>
        {label}
      </label>
      <input
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        style={{
          padding: '9px 12px',
          fontSize: 14,
          borderRadius: 'var(--av2-radius-sm)',
          border: `1px solid ${error ? 'var(--av2-danger)' : 'var(--av2-border)'}`,
          background: 'var(--av2-surface)',
          color: 'var(--av2-text)',
          ...style,
        }}
      />
      {hint && !error && (
        <span id={`${fieldId}-hint`} style={{ fontSize: 12, color: 'var(--av2-muted)' }}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${fieldId}-err`} style={{ fontSize: 12, color: 'var(--av2-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
