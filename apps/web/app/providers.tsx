'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { useAetherStore } from '@/lib/store';

const STORAGE_KEY = 'aeci:theme';

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme       = useAetherStore((s) => s.theme);
  const themeSource = useAetherStore((s) => s.themeSource);
  const setTheme    = useAetherStore((s) => s.setTheme);
  const setSystemTheme = useAetherStore((s) => s.setSystemTheme);

  // ── 1. Hydrate from localStorage / matchMedia on mount ──
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setSystemTheme(mq.matches ? 'dark' : 'light');
    }
  }, [setTheme, setSystemTheme]);

  // ── 2. Subscribe to OS changes when in 'system' mode ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (themeSource !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeSource, setSystemTheme]);

  // ── 3. Reflect theme onto <html data-theme> ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── 4. Persist manual preference, clear when reset to system ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (themeSource === 'manual') {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [theme, themeSource]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
