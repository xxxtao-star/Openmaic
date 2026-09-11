'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = 'theme';
/** Dark is the product default: the shell, stage and editor chrome are all
 *  designed dark-first, so an unset preference must not fall back to the
 *  system (often light) setting. */
export const DEFAULT_THEME: Theme = 'dark';

/** Bumped whenever the product default changes. A browser that already stored
 *  a preference under the previous default would otherwise stay pinned to it
 *  forever, so the stale value is dropped exactly once per version. */
export const THEME_DEFAULT_VERSION_KEY = 'theme-default-version';
export const THEME_DEFAULT_VERSION = 'dark-1';

/** Runs before first paint (injected in app/layout.tsx) so the stored
 *  preference is applied to <html> without a light-then-dark flash. Mirrors
 *  migrateStoredTheme() below; both must stay in sync. */
export const THEME_INIT_SCRIPT = `(function(){try{var v='${THEME_DEFAULT_VERSION_KEY}',n='${THEME_DEFAULT_VERSION}';if(localStorage.getItem(v)!==n){localStorage.removeItem('${THEME_STORAGE_KEY}');localStorage.setItem(v,n);}var s=localStorage.getItem('${THEME_STORAGE_KEY}');var t=(s==='light'||s==='dark'||s==='system')?s:'${DEFAULT_THEME}';var d=t==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:t==='dark';var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

/** Clears a preference left over from an older default so the current default
 *  actually reaches returning visitors. Anything picked afterwards is kept. */
function migrateStoredTheme() {
  try {
    if (localStorage.getItem(THEME_DEFAULT_VERSION_KEY) === THEME_DEFAULT_VERSION) return;
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.setItem(THEME_DEFAULT_VERSION_KEY, THEME_DEFAULT_VERSION);
  } catch {
    // Storage unavailable (private mode, disabled): fall through to the default.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    migrateStoredTheme();
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored);
    }
    setSystemTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Keep native UI (scrollbars, form controls, canvas defaults) in sync.
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Listen to system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Save theme to localStorage
  const handleSetTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
