/**
 * Light/dark theme control (0.3 addendum). 0.1 built the full three-block token
 * layer; this is the missing real UI control that sets `data-theme`.
 *
 * Must apply BEFORE first paint (synchronously, top of main.tsx) — unlike the tenant
 * accent ramp, a wrong light/dark theme flashing on every screen (LoginScreen included,
 * before any provider mounts) is a visible correctness issue, not a benign blip.
 */

export type Theme = 'light' | 'dark';

const KEY = 'av2-theme';

/** The explicit stored preference, or null = follow the OS (`prefers-color-scheme`). */
export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode / storage disabled — the in-memory toggle still works this session */
  }
}

/** Stamp (or clear) `data-theme` on <html>. `null` removes it → OS-follow default. */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

/** What the user actually sees right now: the stored choice, else the OS setting. */
export function effectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
