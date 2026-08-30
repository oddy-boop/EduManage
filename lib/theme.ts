import { useEffect, useState } from 'react';

/**
 * Theme
 *
 * The stylesheet already carries a full dark palette: `index.css` re-points the
 * same custom properties under `.dark`, so every Tailwind utility follows without
 * a single `dark:` variant. What was missing was anything that ever put that class
 * on the document — the dark styles existed but could not be reached.
 *
 * This is that switch. Three states, because "follow my computer" is a real
 * preference and not the same as either fixed choice: a user on system-dark wants
 * the app to change when their OS does, and a user who picked Light wants it to
 * stay light at night.
 */
export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'edumanage.theme';
const THEMES: Theme[] = ['light', 'dark', 'system'];

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const readTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (THEMES as string[]).includes(stored)) return stored as Theme;
  } catch {
    // Private windows and locked-down browsers throw on access rather than
    // returning null. A stored preference is a convenience, never a requirement.
  }
  return 'system';
};

/** Resolve a preference to the mode actually painted right now. */
export const resolveTheme = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolveTheme(theme) === 'dark');
  // Lets form controls, scrollbars and the canvas behind the page follow too.
  root.style.colorScheme = resolveTheme(theme);
};

/** Notifies every mounted `useTheme` so the whole app moves together. */
const listeners = new Set<(t: Theme) => void>();

export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not being able to remember the choice must not stop us applying it now.
  }
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
};

/** Applied once at startup, before React paints, to avoid a flash of the wrong theme. */
export const initTheme = () => {
  applyTheme(readTheme());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    // Only a "system" preference should move when the OS does.
    if (readTheme() === 'system') {
      applyTheme('system');
      listeners.forEach((fn) => fn('system'));
    }
  });
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    listeners.add(setThemeState);
    return () => {
      listeners.delete(setThemeState);
    };
  }, []);

  return { theme, resolved: resolveTheme(theme), setTheme };
}
