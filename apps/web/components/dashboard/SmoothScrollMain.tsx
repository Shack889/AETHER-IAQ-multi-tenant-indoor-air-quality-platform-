'use client';

import Lenis from 'lenis';
import { useEffect, useRef } from 'react';

interface SmoothScrollMainProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Lenis-driven smooth scroll on the main content column.
 *
 * Tuning is intentionally loose so the glide is felt:
 *   lerp = 0.07   — soft inertia, content keeps drifting after release
 *   duration = 1.4 — programmatic scroll-to is languid
 *   ease = quartic-out — long cinematic deceleration
 *
 * Publishes the current normalized scroll progress (0..1) and absolute
 * pixel scroll on `document` as CSS custom properties, so any component
 * can react to scroll without subscribing to JS:
 *
 *   var(--scroll-progress)   →  0..1
 *   var(--scroll-y)          →  pixels
 *
 * Also dispatches `aeci:scroll` CustomEvents with { progress, y } detail
 * so canvas-driven backgrounds can synchronize with the scroll position.
 */
export function SmoothScrollMain({ className, children }: SmoothScrollMainProps) {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.07,
      duration: 1.4,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      prevent: (node: Element) =>
        Boolean((node as HTMLElement).closest?.('[data-lenis-prevent]')),
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // Publish scroll state for reactive backgrounds
    lenis.on('scroll', (e: { scroll: number; progress: number; velocity: number }) => {
      const root = document.documentElement;
      root.style.setProperty('--scroll-progress', e.progress.toFixed(4));
      root.style.setProperty('--scroll-y', `${e.scroll.toFixed(1)}px`);
      root.style.setProperty('--scroll-velocity', e.velocity.toFixed(3));
      window.dispatchEvent(new CustomEvent('aeci:scroll', {
        detail: { progress: e.progress, y: e.scroll, velocity: e.velocity },
      }));
    });

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <main ref={wrapperRef} className={className}>
      <div ref={contentRef}>
        {children}
      </div>
    </main>
  );
}
