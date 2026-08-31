import { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  /** Required — source for both the initials fallback and the alt text. */
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES: Record<NonNullable<AvatarProps['size']>, number> = { sm: 24, md: 32, lg: 40 };

/** First letter of up to the first two words of `name`, uppercased. `?` if none. */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const px = SIZES[size];
  // Sizing goes through `style`, never HTML height/width attributes — Tailwind v4's
  // preflight (`img { height: auto }`) would otherwise override the attribute.
  const box: React.CSSProperties = {
    height: px,
    width: px,
    flex: 'none',
    borderRadius: 9999,
    objectFit: 'cover',
    display: 'block',
  };

  if (src && !failed) {
    return <img src={src} alt={name} onError={() => setFailed(true)} style={box} />;
  }

  return (
    <div
      aria-label={name}
      role="img"
      style={{
        ...box,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--av2-accent-soft)',
        color: 'var(--av2-accent)',
        fontSize: Math.round(px * 0.4),
        fontWeight: 600,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initialsFromName(name)}
    </div>
  );
}
