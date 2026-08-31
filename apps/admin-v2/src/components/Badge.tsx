import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

// Generic status primitive — serves booking / member / payment status domains alike.
// The status-string -> tone mapping belongs in the consuming screen, never here.
const tones: Record<BadgeTone, { bg: string; border: string; fg: string }> = {
  neutral: { bg: 'var(--av2-surface-alt)', border: 'var(--av2-border)', fg: 'var(--av2-muted)' },
  success: { bg: 'var(--av2-accent-soft)', border: 'var(--av2-accent)', fg: 'var(--av2-accent-hover)' },
  warning: { bg: 'var(--av2-warning-soft)', border: 'var(--av2-warning-border)', fg: 'var(--av2-warning)' },
  danger: { bg: 'var(--av2-danger-soft)', border: 'var(--av2-danger-border)', fg: 'var(--av2-danger)' },
  info: { bg: 'var(--av2-info-soft)', border: 'var(--av2-info-border)', fg: 'var(--av2-info-text)' },
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--av2-space-1)',
        padding: '2px var(--av2-space-2)',
        borderRadius: 999,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
        fontSize: 'var(--av2-text-xs)',
        fontWeight: 600,
        lineHeight: 'var(--av2-leading-tight)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
