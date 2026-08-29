// F-195 Phase 2 — admin-web light/dark theme.
//
// Local to admin-web: guest-member-pwa has no toggle and no need for one, so this
// is not promoted to @badminton/ui-shared (same "no shared infra before a second
// real consumer" discipline as TrendIndicator in main.tsx).
//
// Model: three stored states — 'light' | 'dark' | 'system'. Default is 'system'
// (no stored value → follow the OS via prefers-color-scheme). Only an explicit
// 'light'/'dark' choice writes `document.documentElement.dataset.theme`; 'system'
// removes it and the CSS media query in styles.css takes over. The pre-paint
// <script> in index.html applies the stored value before first paint — keep the
// two in sync.

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'admin-theme';

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* private mode / storage disabled — fall through to default */
  }
  return 'system';
}

function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore — the in-memory state still drives this session */
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  return systemPrefersDark() ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
}

/**
 * Theme state for the Shell toggle. `theme` is the stored preference,
 * `resolved` is what's actually showing (system collapsed to light/dark).
 * `toggle` flips between explicit light and dark (dropping 'system').
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setStoredTheme(next);
    applyTheme(next);
    setResolved(resolveTheme(next));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolveTheme(theme) === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Keep 'system' tracking the OS live.
  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Reconcile on mount in case the pre-paint script and React state ever diverge.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return { theme, resolved, setTheme, toggle };
}
