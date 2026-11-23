'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'luxtax_theme';

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f6f7f9',
  dark: '#0e1014',
};

/**
 * Synchronous pre-hydration script injected into <head> so the saved or OS
 * theme class is applied to <html> before first paint (preventing FOUC).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var m=(s==='light'||s==='dark'||s==='system')?s:'system';var d=m==='dark'||(m==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';var c=d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}';var ms=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ms.length;i++){ms[i].setAttribute('content',c);}}catch(e){}})();`;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getStorage(): Storage | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return undefined;
}

export function readStoredTheme(): ThemeMode {
  try {
    const raw = getStorage()?.getItem?.(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function writeStoredTheme(mode: ThemeMode): void {
  try {
    getStorage()?.setItem?.(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore storage access or quota errors in restricted contexts
  }
}

export function applyThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root?.classList) {
    root.classList.toggle('dark', resolved === 'dark');
  }
  if (root?.style) {
    root.style.colorScheme = resolved;
  }
  if (typeof document.querySelector === 'function') {
    const metas = document.querySelectorAll?.('meta[name="theme-color"]');
    if (metas && typeof metas.forEach === 'function') {
      metas.forEach((meta) => meta.setAttribute('content', THEME_COLORS[resolved]));
    } else {
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', THEME_COLORS[resolved]);
    }
  }
}

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [systemDark, setSystemDark] = useState<boolean>(false);

  useEffect(() => {
    const stored = readStoredTheme();
    const initialSystemDark = getSystemPrefersDark();
    setThemeState(stored);
    setSystemDark(initialSystemDark);
    applyThemeToDocument(resolveTheme(stored, initialSystemDark));

    if (typeof window === 'undefined') return;

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const onMediaChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };

    mediaQuery?.addEventListener?.('change', onMediaChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextMode = isThemeMode(event.newValue) ? event.newValue : 'system';
      setThemeState(nextMode);
    };
    window.addEventListener?.('storage', onStorage);

    return () => {
      mediaQuery?.removeEventListener?.('change', onMediaChange);
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('storage', onStorage);
      }
    };
  }, []);

  const resolvedTheme = resolveTheme(theme, systemDark);

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    writeStoredTheme(mode);
    const nextResolved = resolveTheme(mode, getSystemPrefersDark());
    applyThemeToDocument(nextResolved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Returns the shared theme context when inside <ThemeProvider>, or a safe
 * standalone state controller when components are rendered directly in isolation.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  const [fallbackTheme, setFallbackTheme] = useState<ThemeMode>(() => readStoredTheme());
  const fallbackResolved = resolveTheme(fallbackTheme, getSystemPrefersDark());

  const setFallback = useCallback((mode: ThemeMode) => {
    setFallbackTheme(mode);
    writeStoredTheme(mode);
    applyThemeToDocument(resolveTheme(mode, getSystemPrefersDark()));
  }, []);

  const toggleFallback = useCallback(() => {
    const next: ThemeMode = fallbackResolved === 'dark' ? 'light' : 'dark';
    setFallback(next);
  }, [fallbackResolved, setFallback]);

  if (ctx) return ctx;
  return {
    theme: fallbackTheme,
    resolvedTheme: fallbackResolved,
    setTheme: setFallback,
    toggleTheme: toggleFallback,
  };
}
