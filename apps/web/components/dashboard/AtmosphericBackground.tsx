'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll-reactive cinematic backdrop. Three layers, sub-pixel restraint:
 *
 *  1. Two CSS gradient blobs that drift in opposite directions as you scroll
 *     (transform-only — GPU). One warm (copper), one cool (plum).
 *  2. Cursor-following ambient halo on a lazy lerp follower.
 *  3. Canvas value-noise field that animates continuously AND morphs its
 *     hue / scale based on scroll progress. The noise drifts independently
 *     so even when the user is idle the page feels alive.
 *
 * The noise is *value noise + smoothstep* rendered into ~80×80 cells then
 * upsampled with image-rendering smoothing, so the canvas stays cheap on
 * the GPU. Hue interpolates between paper-warm and dusk-plum across the
 * page. Scroll velocity nudges the field's drift speed for parallax-y feel.
 */

function smoothstep(t: number) { return t * t * (3 - 2 * t); }

// 2-D value noise via hashed grid + bilinear smoothstep
function makeNoise(seed = 0) {
  const hash = (x: number, y: number) => {
    let n = (x + seed) * 374761393 + (y - seed) * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi,        yf = y - yi;
    const u = smoothstep(xf), v = smoothstep(yf);
    const a = hash(xi,     yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi,     yi + 1);
    const d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

export function AtmosphericBackground() {
  const blob1Ref = useRef<HTMLDivElement | null>(null);
  const blob2Ref = useRef<HTMLDivElement | null>(null);
  const haloRef  = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Scroll-linked blob drift
  useEffect(() => {
    const onScroll = (e: Event) => {
      const detail = (e as CustomEvent<{ progress: number; y: number }>).detail;
      if (!detail) return;
      const p = detail.progress;
      const y = detail.y;
      // Blobs translate slowly with parallax (different speeds) and rotate
      // a few degrees as you scroll — adds the "things are moving with the
      // page" feel without being noisy.
      if (blob1Ref.current) {
        blob1Ref.current.style.transform =
          `translate3d(${(-y * 0.08).toFixed(1)}px, ${(-y * 0.18).toFixed(1)}px, 0) rotate(${(p * 12).toFixed(2)}deg)`;
      }
      if (blob2Ref.current) {
        blob2Ref.current.style.transform =
          `translate3d(${(y * 0.05).toFixed(1)}px, ${(-y * 0.10).toFixed(1)}px, 0) rotate(${(-p * 8).toFixed(2)}deg)`;
      }
    };
    window.addEventListener('aeci:scroll', onScroll);
    return () => window.removeEventListener('aeci:scroll', onScroll);
  }, []);

  // Cursor-following ambient halo (lazy lerp)
  useEffect(() => {
    const el = haloRef.current;
    if (!el) return;

    let targetX = window.innerWidth  / 2;
    let targetY = window.innerHeight / 2;
    let curX = targetX, curY = targetY;
    let raf = 0;

    const onMove = (e: MouseEvent) => { targetX = e.clientX; targetY = e.clientY; };
    window.addEventListener('mousemove', onMove, { passive: true });

    const tick = () => {
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      el.style.transform = `translate3d(${curX - 320}px, ${curY - 320}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, []);

  // Scroll- + time-driven noise field
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Render into a small offscreen buffer then upscale — fast & dreamy
    const W = 96, H = 96;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;

    const noiseA = makeNoise(11);
    const noiseB = makeNoise(73);
    const buffer = offCtx.createImageData(W, H);

    let progress = 0;
    let velocity = 0;
    const onScroll = (e: Event) => {
      const detail = (e as CustomEvent<{ progress: number; velocity: number }>).detail;
      if (!detail) return;
      progress = detail.progress;
      velocity = Math.min(2, Math.abs(detail.velocity));
    };
    window.addEventListener('aeci:scroll', onScroll);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width  = Math.floor(canvas.clientWidth  * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let t = 0;
    let raf = 0;

    const draw = () => {
      // Drift speed is mostly time, plus a small scroll-velocity nudge
      t += 0.0024 + velocity * 0.0010;
      velocity *= 0.92; // bleed off

      // Stay warm throughout — only a gentle hue tint as you scroll, not a full
      // crossfade to a different color (that was harming readability).
      // 0..1 progress maps to 0..0.35 mix toward a cooler copper-pink.
      const mix = progress * 0.35;

      const r1 = 210, g1 = 130, b1 = 90;   // soft warm copper
      const r2 = 180, g2 = 110, b2 = 130;  // dusk-pink (only 35% of the way there at bottom)
      const r  = r1 * (1 - mix) + r2 * mix;
      const g  = g1 * (1 - mix) + g2 * mix;
      const b  = b1 * (1 - mix) + b2 * mix;

      const scale = 0.04 + progress * 0.012;

      const data = buffer.data;
      let i = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const nx = x * scale + t * 1.6;
          const ny = y * scale - t * 1.0;
          const wA = noiseA(nx,            ny           );
          const wB = noiseB(nx * 1.7 + wA, ny * 1.7 + wA);
          const v  = (wA * 0.6 + wB * 0.4);
          // Stronger contrast curve + much lower max alpha → only the
          // brightest peaks are visible, the rest stays paper-clean.
          const a  = Math.pow(v, 3.2) * 0.22;

          data[i    ] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a * 255;
          i += 4;
        }
      }
      offCtx.putImageData(buffer, 0, 0);

      // Stretch the small buffer over the full canvas — bilinear filtering
      // gives us the dreamy bloom for free.
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.drawImage(off, 0, 0, canvas.clientWidth, canvas.clientHeight);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('aeci:scroll', onScroll);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Drifting depth blobs */}
      <div
        ref={blob1Ref}
        className="absolute -top-40 -right-40 w-[44rem] h-[44rem] rounded-full"
        style={{
          background: 'radial-gradient(closest-side, rgba(200, 96, 43, 0.10), transparent 70%)',
          filter: 'blur(60px)',
          willChange: 'transform',
        }}
      />
      <div
        ref={blob2Ref}
        className="absolute -bottom-44 -left-40 w-[44rem] h-[44rem] rounded-full"
        style={{
          background: 'radial-gradient(closest-side, rgba(110, 74, 138, 0.08), transparent 70%)',
          filter: 'blur(70px)',
          willChange: 'transform',
        }}
      />

      {/* Scroll- + time-animated noise field */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ mixBlendMode: 'soft-light', opacity: 0.55 }}
      />

      {/* Cursor-anchored ambient halo */}
      <div
        ref={haloRef}
        className="absolute"
        style={{
          width: 640, height: 640,
          background: 'radial-gradient(closest-side, rgba(200, 96, 43, 0.10), transparent 70%)',
          filter: 'blur(40px)',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
