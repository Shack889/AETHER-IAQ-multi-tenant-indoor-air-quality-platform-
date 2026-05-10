import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'AECI | Intelligent Air. Healthier Spaces.',
  description: 'Adaptive Environmental Cognitive-Exposure Intelligence — 7-domain / 9-layer indoor air quality framework with pollutant-interaction modeling, temporal exposure memory, and natural-language explainability.',
  keywords: ['AECI', 'IAQ', 'indoor air quality', 'PM2.5', 'CO2', 'CELI', 'sensor', 'monitoring'],
};

/**
 * Inline init script: synchronously sets data-theme on <html> before any CSS
 * paints, preventing a light→dark flash. Reads localStorage 'aeci:theme'
 * (manual override) or falls back to prefers-color-scheme.
 */
const themeInit = `
(function () {
  try {
    var stored = localStorage.getItem('aeci:theme');
    var theme = (stored === 'light' || stored === 'dark')
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
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
