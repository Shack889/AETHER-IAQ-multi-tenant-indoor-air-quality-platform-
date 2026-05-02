'use client';

import { useEffect } from 'react';
import { useAetherStore } from '@/lib/store';

export function useTheme() {
  const { theme, setTheme } = useAetherStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return { theme, toggleTheme };
}
