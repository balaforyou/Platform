import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Optional lucide icon — same convention as Banner. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional Button, e.g. "Add your first member". */
  action?: ReactNode;
}

/**
 * Reusable "nothing here yet" panel — replaces admin-web's copy-pasted `.empty-state`
 * class + ad hoc JSX per screen. Also the default fallback for an empty Table (2.2).
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--av2-space-2)',
        padding: 'var(--av2-space-10) var(--av2-space-6)',
        border: '1px dashed var(--av2-border)',
        borderRadius: 'var(--av2-radius)',
        background: 'var(--av2-surface-alt)',
        color: 'var(--av2-muted)',
      }}
    >
      {icon && <span style={{ color: 'var(--av2-muted)', display: 'inline-flex' }}>{icon}</span>}
      <span style={{ fontSize: 'var(--av2-text-base)', fontWeight: 600, color: 'var(--av2-text)' }}>{title}</span>
      {description && (
        <span style={{ fontSize: 'var(--av2-text-sm)', maxWidth: 320, lineHeight: 'var(--av2-leading-normal)' }}>
          {description}
        </span>
      )}
      {action && <div style={{ marginTop: 'var(--av2-space-2)' }}>{action}</div>}
    </div>
  );
}
