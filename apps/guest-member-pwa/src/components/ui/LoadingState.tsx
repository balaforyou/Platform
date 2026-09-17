import './LoadingState.css';

export interface LoadingStateProps {
  variant: 'full' | 'compact' | 'inline';
  label?: string;
}

// F-235 Phase 0: the shuttlecock-and-racket rally loader, ported from the design canvas's
// `LoadingState.dc.html` artboard (Bala's supplied component -- see claude/guestPWA2/02-*.md
// §0.3 and 05-*.md §3 for the full behavioral spec: two independently-fixed rackets, each
// striking only when the shuttle reaches its side; request-driven, never a fixed-duration
// timer; a static single frame under prefers-reduced-motion).
//
// NOTE: the actual canvas artboard lives behind Bala's claude.ai sign-in and this session had
// no access to it (private, no credentials) -- the illustration below is a good-faith
// reconstruction from the written spec (two fixed rackets, shuttle arcs between them, feather
// ink / cork green-yellow-green / racket teal illustration colors), not a pixel-verified port.
// Flagged explicitly in the implementation report: diff this against the real canvas before
// treating it as done.
export default function LoadingState({ variant, label }: LoadingStateProps) {
  const showLabel = variant !== 'inline' && !!label;

  return (
    <div className={`gpwa-loading gpwa-loading--${variant}`} role="status" aria-live="polite">
      <svg
        className="gpwa-loading__stage"
        viewBox="0 0 220 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Left racket, fixed on its own side */}
        <g className="gpwa-loading__racket gpwa-loading__racket--left">
          <ellipse cx="30" cy="50" rx="16" ry="20" fill="none" stroke="var(--gpwa-loading-teal)" strokeWidth="4" />
          <line x1="30" y1="70" x2="22" y2="94" stroke="var(--gpwa-loading-teal)" strokeWidth="5" strokeLinecap="round" />
        </g>

        {/* Right racket, fixed on its own side */}
        <g className="gpwa-loading__racket gpwa-loading__racket--right">
          <ellipse cx="190" cy="50" rx="16" ry="20" fill="none" stroke="var(--gpwa-loading-teal)" strokeWidth="4" />
          <line x1="190" y1="70" x2="198" y2="94" stroke="var(--gpwa-loading-teal)" strokeWidth="5" strokeLinecap="round" />
        </g>

        {/* Shuttlecock, arcs between the two fixed rackets */}
        <g className="gpwa-loading__shuttle">
          <circle r="4" fill="var(--gpwa-loading-ink)" />
          <path
            d="M 0 0 L -6 8 L -2 6 L -4 12 L 0 8 L 4 12 L 2 6 L 6 8 Z"
            fill="var(--gpwa-loading-cork)"
            transform="translate(0,-2)"
          />
        </g>
      </svg>

      {showLabel && <p className="gpwa-loading__label">{label}</p>}
    </div>
  );
}
