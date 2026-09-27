import './LoadingState.css';

export interface LoadingStateProps {
  variant: 'full' | 'compact' | 'inline';
  label?: string;
}

// 26 Sep 2026, real replacement: the prior SVG rally scene was an explicitly-flagged "good-faith
// reconstruction" -- the real canvas artboard was never accessible in that session, and Bala
// called the result unintuitive. This ports his real supplied design (two rackets rallying a
// shuttlecock, div/CSS-based, not SVG) verbatim for its choreography (keyframe values unchanged),
// with colors repointed from the reference's own hardcoded hex onto this app's real theme tokens
// (tenant-derived green for the rackets, matching the rest of the app's post-reversal theming --
// see index.css's own gold-to-green history -- rather than reintroducing a new fixed blue/red).
// `variant`/`label` props and every real call site (main.tsx, AboutSheet.tsx, VenueSwitcherSheet.
// tsx, Button.tsx) are unchanged. `inline` (only ever used inside Button.tsx's own 22px spinner
// slot) keeps a small dedicated spinner rather than squeezing the full 180x80 rally scene into
// that space -- the reference has no guidance for that size, and Bala's own complaint was about
// the loaders users actually see (full/compact), not this tiny in-button one.
export default function LoadingState({ variant, label }: LoadingStateProps) {
  const showLabel = variant !== 'inline' && !!label;

  if (variant === 'inline') {
    return (
      <div className="gpwa-loading gpwa-loading--inline" role="status" aria-live="polite">
        <span className="gpwa-loading__inline-spinner" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`gpwa-loading gpwa-loading--${variant}`} role="status" aria-live="polite">
      <div className="gpwa-loading__rally-stage" aria-hidden="true">
        <div className="gpwa-loading__racket gpwa-loading__racket--left">
          <div className="gpwa-loading__racket-head" />
          <div className="gpwa-loading__racket-shaft" />
          <div className="gpwa-loading__racket-grip" />
        </div>

        <div className="gpwa-loading__shuttle">
          <div className="gpwa-loading__shuttle-skirt" />
          <div className="gpwa-loading__shuttle-cork" />
        </div>

        <div className="gpwa-loading__racket gpwa-loading__racket--right">
          <div className="gpwa-loading__racket-head" />
          <div className="gpwa-loading__racket-shaft" />
          <div className="gpwa-loading__racket-grip" />
        </div>

        <div className="gpwa-loading__rally-shadow" />
      </div>

      {showLabel && <p className="gpwa-loading__label">{label}</p>}
    </div>
  );
}
