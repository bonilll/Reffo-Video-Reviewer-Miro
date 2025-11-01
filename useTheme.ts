import { useEffect, useMemo, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'reffo:theme';

export function applyTheme(pref: ThemePref) {
  const systemDark = typeof window !== 'undefined'
    ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  const isDark = pref === 'dark' || (pref === 'system' && systemDark);
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {}
  return isDark;
}

export const useThemePreference = (pref: ThemePref | undefined) => {
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = useMemo(() => {
    if (pref === 'dark') return true;
    if (pref === 'light') return false;
    return systemDark;
  }, [pref, systemDark]);

  useEffect(() => {
    // Apply classes and persist preference for no-flash hydration
    if (pref) {
      try { localStorage.setItem(THEME_STORAGE_KEY, pref); } catch {}
    }
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);
  }, [isDark, pref]);

  return isDark;
};
