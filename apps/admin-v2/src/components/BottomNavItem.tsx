import type { NavItemProps } from './SidebarNavItem';

/**
 * Item-level primitive for the mobile bottom nav — icon above label, fixed narrow
 * width, no rounding (standard bottom-nav convention). No direct in-repo precedent
 * for this half; the shape is the conventional one, flagged as not reference-derived.
 * 0.3 assembles these into the real bar.
 */
export function BottomNavItem({ icon, label, active, onClick, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        position: 'relative',
        flex: 1,
        minWidth: 56,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: 'var(--av2-space-1) 0',
        fontSize: 'var(--av2-text-xs)',
        fontWeight: active ? 700 : 600,
        color: active ? 'var(--av2-accent)' : 'var(--av2-muted)',
        transition: 'color var(--av2-duration-fast) var(--av2-ease-standard)',
      }}
    >
      <span style={{ display: 'inline-flex', position: 'relative' }}>
        {icon}
        {typeof badge === 'number' && badge > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -8,
              minWidth: 15,
              height: 15,
              padding: '0 3px',
              borderRadius: 999,
              background: 'var(--av2-accent)',
              color: 'var(--av2-accent-fg)',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}
