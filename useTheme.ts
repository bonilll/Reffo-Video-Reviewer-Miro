import { useEffect } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'reffo:theme';

export function applyTheme(pref: ThemePref) {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
  } catch {}
  return false;
}

export const useThemePreference = (pref: ThemePref | undefined) => {
  useEffect(() => {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
    try { localStorage.setItem(THEME_STORAGE_KEY, 'light'); } catch {}
  }, []);

  return false;
};
