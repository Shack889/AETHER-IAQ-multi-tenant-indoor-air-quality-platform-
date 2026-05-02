'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { useAetherStore } from '@/lib/store';

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAetherStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
