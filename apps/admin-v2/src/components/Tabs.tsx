interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

/**
 * Pill-in-a-strip tabs. Controlled only (parent owns `activeKey`) — matches the
 * reference's `useState`-in-the-parent convention. The full-width sidebar-item active
 * style is SidebarNavItem's job (2.10); Tabs stays visually distinct from nav.
 */
export function Tabs({ items, activeKey, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 'var(--av2-space-1)',
        padding: 'var(--av2-space-1)',
        background: 'var(--av2-surface-alt)',
        borderRadius: 'var(--av2-radius-sm)',
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--av2-space-1) var(--av2-space-3)',
              borderRadius: 'var(--av2-radius-sm)',
              fontSize: 'var(--av2-text-sm)',
              fontWeight: active ? 700 : 600,
              lineHeight: 'var(--av2-leading-tight)',
              whiteSpace: 'nowrap',
              background: active ? 'var(--av2-accent-soft)' : 'transparent',
              color: active ? 'var(--av2-accent)' : 'var(--av2-muted)',
              transition: 'background var(--av2-duration-fast) var(--av2-ease-standard), color var(--av2-duration-fast) var(--av2-ease-standard)',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
