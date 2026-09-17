/**
 * Light/dark theme control. Direct port of apps/admin-v2/src/lib/theme.ts (same shape,
 * different storage key) -- see that file for the original precedent. Must apply BEFORE first
 * paint (synchronously, top of main.tsx), same reasoning as admin-v2's own version.
 */

export type Theme = 'light' | 'dark';

const KEY = 'gpwa-theme';

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(theme: Theme | null) {
  try {
    if (theme) localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode / storage disabled */
  }
}

export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export function effectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
