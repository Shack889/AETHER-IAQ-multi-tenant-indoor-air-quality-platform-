'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { SplitText } from '@/components/animations/SplitText';

/**
 * Cinematic transition veil: plays once when the dashboard mounts
 * (after login → redirect, or on first page load).
 *
 * Composition:
 *   1. Deep graphite veil fades in over the entire viewport
 *   2. ~260 particles drift along a curl-noise wind field, leaving fading
 *      streamline trails — reads as "air currents in volume"
 *   3. AECI wordmark reveals char-by-char with blur→focus
 *   4. Status caption fades in beneath
 *   5. Whole composition dissolves with motion-blur, particles disperse,
 *      revealing the dashboard underneath
 *
 * All canvas drawing is GPU-accelerated (single fillRect per frame to a
 * trail layer for the persistence-of-vision effect).
 */
export function DashboardLoadIntro() {
  const [show, setShow] = useState(true);
  const [running, setRunning] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Once-per-session gate
  useEffect(() => {
    const seen = sessionStorage.getItem('aeci:intro-played');
    if (seen) {
      setShow(false);
      setRunning(false);
      return;
    }
    const t = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem('aeci:intro-played', '1');
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // Wind / curl-noise streamlines
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width  = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    interface P {
      x: number; y: number;
      vx: number; vy: number;
      life: number;
      lifetime: number;
      hue: 'warm' | 'cool';
    }

    const COUNT = 260;
    const particles: P[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * (W || window.innerWidth),
      y: Math.random() * (H || window.innerHeight),
      vx: 0, vy: 0,
      life: Math.random() * 80,
      lifetime: 80 + Math.random() * 90,
      hue: Math.random() < 0.6 ? 'warm' : 'cool',
    }));

    // Pseudo curl-noise — sine/cos field with slow time evolution
    const field = (x: number, y: number, t: number): [number, number] => {
      const s = 0.0028;
      const a = Math.sin(x * s + t * 0.4) + Math.cos(y * s * 1.3 + t * 0.3);
      const b = Math.cos(x * s * 0.9 + t * 0.5) - Math.sin(y * s + t * 0.4);
      return [a * 1.4, b * 1.4];
    };

    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.012;

      // Persistence-of-vision: fade prior frame instead of clearing
      ctx.fillStyle = 'rgba(14, 11, 8, 0.10)';
      ctx.fillRect(0, 0, W, H);

      for (const p of particles) {
        const [fx, fy] = field(p.x, p.y, t);
        p.vx += fx * 0.18;
        p.vy += fy * 0.18;
        p.vx *= 0.93;
        p.vy *= 0.93;
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Respawn when out of bounds or aged out
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20 || p.life > p.lifetime) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.vx = 0; p.vy = 0;
          p.life = 0;
          p.lifetime = 80 + Math.random() * 90;
        }

        const fade = Math.sin((p.life / p.lifetime) * Math.PI) * 0.55;
        const alpha = fade.toFixed(3);
        ctx.fillStyle = p.hue === 'warm'
          ? `rgba(224, 146, 106, ${alpha})`
          : `rgba(140, 124, 200, ${alpha})`;
        ctx.fillRect(p.x, p.y, 1.4, 1.4);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [running]);

  if (!show && !running) return null;

  return (
    <AnimatePresence
      onExitComplete={() => setRunning(false)}
    >
      {show && (
        <motion.div
          key="aeci-intro"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            filter: 'blur(20px)',
            transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, #1A1612 0%, #0E0B08 70%)',
          }}
        >
          {/* Wind field canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ opacity: 0.95 }}
          />

          {/* Soft warm ambient glow at center */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 720, height: 720,
              background: 'radial-gradient(closest-side, rgba(224, 146, 106, 0.20), transparent 70%)',
              filter: 'blur(60px)',
            }}
          />

          {/* Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)' }}
          />

          {/* Brand reveal */}
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.985, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0,  scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.06, filter: 'blur(14px)' }}
            transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center"
          >
            <SplitText
              text="AECI"
              as="h1"
              stagger={0.085}
              duration={1.15}
              delay={0.35}
              className="font-display tracking-tight leading-none"
            />
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="text-[10px] tracking-[0.32em] uppercase mt-6 flex items-center justify-center gap-2"
              style={{ color: 'rgba(242, 235, 220, 0.55)' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#E0926A', boxShadow: '0 0 8px #E0926A' }}
              />
              Initialising environmental intelligence
            </motion.div>
          </motion.div>

          {/* Override SplitText color for this dark stage */}
          <style jsx global>{`
            div[key="aeci-intro"] h1,
            .fixed.z-\\[100\\] h1 {
              color: rgba(242, 235, 220, 0.96);
              font-size: clamp(72px, 11vw, 168px);
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
