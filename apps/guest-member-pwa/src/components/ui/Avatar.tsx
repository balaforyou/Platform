import { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  /** Required — source for both the initials fallback and the alt text. */
  name: string;
  size?: number;
}

/** First letter of up to the first two words of `name`, uppercased. `?` if none. */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// F-248: same img-with-error-fallback-to-initials shape admin-v2's own Avatar.tsx already
// proved for F-219 -- ported rather than imported directly, since that component is styled with
// admin-v2-only CSS variables. Sizing goes through `style`, never HTML height/width attributes,
// same reasoning as the admin-v2 original (Tailwind's preflight img{height:auto} would otherwise
// override the attribute).
export default function Avatar({ src, name, size = 32 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    height: size,
    width: size,
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
        background: 'var(--color-accent-100)',
        color: 'var(--color-accent-700)',
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initialsFromName(name)}
    </div>
  );
}
