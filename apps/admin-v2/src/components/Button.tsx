import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
}

const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--av2-space-2)',
  padding: 'var(--av2-space-3) var(--av2-space-5)',
  borderRadius: 'var(--av2-radius-sm)',
  fontSize: 'var(--av2-text-base)',
  fontWeight: 600,
  lineHeight: 'var(--av2-leading-tight)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition:
    'background var(--av2-duration-fast) var(--av2-ease-standard), border-color var(--av2-duration-fast) var(--av2-ease-standard), opacity var(--av2-duration-fast) var(--av2-ease-standard)',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--av2-accent)', color: 'var(--av2-accent-fg)' },
  secondary: {
    background: 'var(--av2-surface)',
    color: 'var(--av2-text)',
    borderColor: 'var(--av2-border)',
  },
  ghost: { background: 'transparent', color: 'var(--av2-muted)' },
};

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  leadingIcon,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{
        ...base,
        ...variants[variant],
        width: fullWidth ? '100%' : undefined,
        opacity: isDisabled ? 0.6 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {loading ? <Spinner size={16} /> : leadingIcon}
      {children}
    </button>
  );
}
