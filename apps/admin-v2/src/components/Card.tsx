import type { CSSProperties, ReactNode } from 'react';

export function Card({
  children,
  style,
  as: Tag = 'div',
}: {
  children: ReactNode;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'main';
}) {
  return (
    <Tag
      style={{
        background: 'var(--av2-surface)',
        border: '1px solid var(--av2-border)',
        borderRadius: 'var(--av2-radius)',
        boxShadow: 'var(--av2-shadow)',
        padding: 'var(--av2-space-6)',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
