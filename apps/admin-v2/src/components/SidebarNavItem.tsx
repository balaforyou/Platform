import type { ReactNode } from 'react';

export interface NavItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Small count bubble (e.g. unread). No current caller; 0.3's Communications likely will. */
  badge?: number;
}

function CountBubble({ n }: { n: number }) {
  return (
    <span
      style={{
        marginLeft: 'auto',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        borderRadius: 999,
        background: 'var(--av2-accent)',
        color: 'var(--av2-accent-fg)',
        fontSize: 'var(--av2-text-xs)',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * Item-level primitive for the desktop sidebar. 0.3 assembles these into the real
 * nav shell — this file is just the item. Icon + label, horizontal, full-width.
 */
export function SidebarNavItem({ icon, label, active, onClick, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        appearance: 'none',
        border: 'none',
        cursor: 'pointer',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--av2-space-3)',
        padding: 'var(--av2-space-2) var(--av2-space-3)',
        borderRadius: 'var(--av2-radius-sm)',
        fontSize: 'var(--av2-text-sm)',
        fontWeight: active ? 700 : 600,
        textAlign: 'left',
        background: active ? 'var(--av2-accent-soft)' : 'transparent',
        color: active ? 'var(--av2-accent)' : 'var(--av2-muted)',
        transition: 'background var(--av2-duration-fast) var(--av2-ease-standard), color var(--av2-duration-fast) var(--av2-ease-standard)',
      }}
    >
      <span style={{ display: 'inline-flex', flex: 'none' }}>{icon}</span>
      <span>{label}</span>
      {typeof badge === 'number' && badge > 0 && <CountBubble n={badge} />}
    </button>
  );
}
