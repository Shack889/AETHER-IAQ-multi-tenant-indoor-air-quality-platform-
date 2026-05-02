import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'AETHER-IAQ | Intelligent Air. Healthier Spaces.',
  description: 'Adaptive Environment-aware Temporal Health Evaluation and Response — Indoor Air Quality monitoring system with 9-layer algorithmic intelligence.',
  keywords: ['IAQ', 'indoor air quality', 'PM2.5', 'CO2', 'sensor', 'monitoring'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
