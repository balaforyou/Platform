export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 10))}px solid var(--av2-border)`,
        borderTopColor: 'var(--av2-accent)',
        borderRadius: '9999px',
        animation: 'av2-spin 0.7s linear infinite',
      }}
    >
      <style>{'@keyframes av2-spin { to { transform: rotate(360deg); } }'}</style>
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        color: 'var(--av2-muted)',
      }}
    >
      <Spinner size={36} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
}
