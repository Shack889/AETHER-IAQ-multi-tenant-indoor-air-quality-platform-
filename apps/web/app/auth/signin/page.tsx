'use client';

import { signIn, getProviders, type ClientSafeProvider } from 'next-auth/react';
import {
  motion, AnimatePresence, useMotionValue, useSpring, useTransform,
  type MotionValue,
} from 'framer-motion';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { User } from 'lucide-react';
import { SplitText } from '@/components/animations/SplitText';
import { ClickRipples, useRipples } from '@/components/animations/Ripple';

/* ─── Reactive cinematic backdrop ────────────────────────── */
function PortalBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const haloRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = 0; let height = 0;
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const COUNT = 150;
    const motes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.5 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12 - 0.05,
      a: 0.10 + Math.random() * 0.30,
      hue: Math.random() < 0.5 ? 'warm' : 'cool',
    }));

    let mx = -9999; let my = -9999;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('mousemove', onMove);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const m of motes) {
        m.x += m.vx; m.y += m.vy;
        if (m.x < -10) m.x = width + 10;
        if (m.x > width + 10) m.x = -10;
        if (m.y < -10) m.y = height + 10;
        if (m.y > height + 10) m.y = -10;

        const dx = m.x - mx, dy = m.y - my;
        const dist2 = dx * dx + dy * dy;
        const near = dist2 < 40000;
        const boost = near ? 1 - dist2 / 40000 : 0;
        const alpha = m.a + boost * 0.45;

        ctx.beginPath();
        ctx.fillStyle = m.hue === 'warm'
          ? `rgba(224, 146, 106, ${alpha.toFixed(3)})`
          : `rgba(140, 124, 200, ${(alpha * 0.85).toFixed(3)})`;
        ctx.arc(m.x, m.y, m.r + boost * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  useEffect(() => {
    const el = haloRef.current;
    if (!el) return;
    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    const onMove = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; };
    window.addEventListener('mousemove', onMove, { passive: true });
    let raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
      el.style.transform = `translate3d(${cx - 380}px, ${cy - 380}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, []);

  return (
    <>
      <div
        className="absolute -top-60 -right-40 w-[55rem] h-[55rem] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(closest-side, rgba(224, 146, 106, 0.18), transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute -bottom-60 -left-40 w-[55rem] h-[55rem] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(closest-side, rgba(110, 74, 138, 0.16), transparent 70%)',
          filter: 'blur(90px)',
        }}
      />
      <div
        ref={haloRef}
        className="absolute pointer-events-none"
        style={{
          width: 760, height: 760,
          background: 'radial-gradient(closest-side, rgba(224, 146, 106, 0.16), transparent 70%)',
          filter: 'blur(40px)',
          willChange: 'transform',
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </>
  );
}

/* ─── Cursor highlight inside each button ────────────────── */
function ButtonHighlight({
  gx, gy, opacity, color = 'rgba(224, 146, 106, 0.28)',
}: {
  gx: MotionValue<string>;
  gy: MotionValue<string>;
  opacity: MotionValue<number>;
  color?: string;
}) {
  const bg = useTransform(
    [gx, gy] as MotionValue<string>[],
    (v: string[]) =>
      `radial-gradient(220px circle at ${v[0]} ${v[1]}, ${color}, transparent 60%)`,
  );
  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 pointer-events-none rounded-[inherit]"
      style={{ background: bg, opacity }}
    />
  );
}

/* ─── Cinematic auth button — full magnetic + spring + ripple ── */
interface AuthButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'ghost';
  delay?: number;
  children: ReactNode;
}

function AuthButton({ onClick, disabled, variant, delay = 0, children }: AuthButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { ripples, trigger } = useRipples();

  // Magnet drift
  const x  = useMotionValue(0);
  const y  = useMotionValue(0);
  const xs = useSpring(x, { stiffness: 180, damping: 13, mass: 0.7 });
  const ys = useSpring(y, { stiffness: 180, damping: 13, mass: 0.7 });

  // Cursor-anchored highlight
  const mxv = useMotionValue(50);
  const myv = useMotionValue(50);
  const gx = useTransform(mxv, (v) => `${v}%`);
  const gy = useTransform(myv, (v) => `${v}%`);
  const highlightOpacity = useSpring(0, { stiffness: 260, damping: 28 });

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set(((e.clientX - cx) / (rect.width  / 2)) * 12);
    y.set(((e.clientY - cy) / (rect.height / 2)) * 8);
    mxv.set(((e.clientX - rect.left) / rect.width)  * 100);
    myv.set(((e.clientY - rect.top)  / rect.height) * 100);
    highlightOpacity.set(1);
  };
  const onLeave = () => { x.set(0); y.set(0); highlightOpacity.set(0); };

  const isPrimary = variant === 'primary';
  const highlightColor = isPrimary
    ? 'rgba(255, 200, 160, 0.45)'
    : 'rgba(224, 146, 106, 0.30)';
  const rippleColor = isPrimary
    ? 'rgba(20, 17, 13, 0.18)'   // dark ring on light button
    : 'rgba(242, 235, 220, 0.30)'; // light ring on dark button

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onPointerDown={trigger}
      disabled={disabled}
      initial={{ opacity: 0, y: 14, scale: 0.96, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)' }}
      transition={{ delay, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{
        scale: 1.05,
        y: -4,
        transition: { type: 'spring', stiffness: 260, damping: 11, mass: 0.7 },
      }}
      whileTap={{
        scale: 0.92,
        transition: { type: 'spring', stiffness: 360, damping: 9, mass: 0.55 },
      }}
      style={{
        x: xs, y: ys,
        willChange: 'transform',
        background: isPrimary ? 'rgba(242, 235, 220, 0.95)' : 'transparent',
        color:      isPrimary ? '#14110D'                   : 'rgba(242, 235, 220, 0.88)',
        border:     isPrimary ? '1px solid rgba(242, 235, 220, 0.95)'
                              : '1px solid rgba(242, 235, 220, 0.18)',
      }}
      className="relative w-full overflow-hidden flex items-center justify-center gap-3 px-6 py-3.5 rounded-full text-[11px] tracking-[0.22em] uppercase font-medium transition-colors duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <ButtonHighlight gx={gx} gy={gy} opacity={highlightOpacity} color={highlightColor} />
      <ClickRipples ripples={ripples} color={rippleColor} blend="screen" />
      <span className="relative flex items-center gap-3">
        {children}
      </span>
    </motion.button>
  );
}

export default function SignInPage() {
  const [loading, setLoading] = useState<'google' | 'demo' | null>(null);
  const [mounted, setMounted] = useState(false);
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);

  useEffect(() => {
    setMounted(true);
    void getProviders().then((p) => setProviders(p));
  }, []);

  const handleGoogle = async () => {
    setLoading('google');
    sessionStorage.removeItem('aeci:intro-played');
    await signIn('google', { callbackUrl: '/dashboard' });
  };
  const handleDemo = async () => {
    setLoading('demo');
    sessionStorage.removeItem('aeci:intro-played');
    await signIn('demo', { email: 'demo@aether-iaq.local', callbackUrl: '/dashboard' });
  };

  // Panel cursor-tracked subtle tilt
  const panelMx = useMotionValue(0);
  const panelMy = useMotionValue(0);
  const panelRx = useSpring(useTransform(panelMy, [-1, 1], [3, -3]),
    { stiffness: 110, damping: 15, mass: 0.9 });
  const panelRy = useSpring(useTransform(panelMx, [-1, 1], [-3, 3]),
    { stiffness: 110, damping: 15, mass: 0.9 });

  const onPanelMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width  * 2 - 1;
    const dy = (e.clientY - rect.top)  / rect.height * 2 - 1;
    panelMx.set(Math.max(-1, Math.min(1, dx)));
    panelMy.set(Math.max(-1, Math.min(1, dy)));
  };
  const onPanelLeave = () => { panelMx.set(0); panelMy.set(0); };

  if (!mounted) return null;
  const googleEnabled = !!providers?.google;

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      data-theme="dark"
      style={{
        background: 'radial-gradient(ellipse at center, #1A1612 0%, #0E0B08 75%)',
      }}
    >
      <PortalBackdrop />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)' }}
      />

      {/* Floating glass panel — now cursor-tilt reactive */}
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.985, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0,  scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
        whileHover={{ y: -4, transition: { type: 'spring', stiffness: 180, damping: 14 } }}
        onMouseMove={onPanelMove}
        onMouseLeave={onPanelLeave}
        style={{
          rotateX: panelRx,
          rotateY: panelRy,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
        className="relative z-10 w-full max-w-[440px] mx-4"
      >
        <div
          className="relative rounded-[28px] px-9 py-12 text-center overflow-hidden"
          style={{
            background: 'rgba(20, 17, 13, 0.55)',
            border: '1px solid rgba(242, 235, 220, 0.10)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            boxShadow:
              '0 60px 120px rgba(0,0,0,0.55), 0 2px 0 rgba(242,235,220,0.06) inset',
          }}
        >
          <span
            aria-hidden
            className="absolute top-0 left-1/4 right-1/4 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(242,235,220,0.4), transparent)' }}
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.7 }}
            className="text-[10px] tracking-[0.3em] uppercase mb-5"
            style={{ color: 'rgba(242, 235, 220, 0.5)' }}
          >
            Environmental Intelligence
          </motion.div>

          <SplitText
            text="AECI"
            as="h1"
            stagger={0.06}
            duration={1.0}
            delay={1.0}
            className="font-display text-[64px] leading-none tracking-tight mb-3"
          />

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display italic text-base mb-10"
            style={{ color: 'rgba(242, 235, 220, 0.5)' }}
          >
            A quiet, continuous reading of the air around you.
          </motion.div>

          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 1.8, duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            className="h-px mx-12 mb-10"
            style={{ background: 'rgba(242, 235, 220, 0.12)', transformOrigin: 'center' }}
          />

          <div className="flex flex-col gap-3">
            {googleEnabled && (
              <AuthButton
                onClick={() => void handleGoogle()}
                disabled={loading !== null}
                variant="primary"
                delay={2.0}
              >
                {loading === 'google' ? (
                  <>
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full aether-spinner" />
                    Signing in
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </AuthButton>
            )}

            <AuthButton
              onClick={() => void handleDemo()}
              disabled={loading !== null}
              variant="ghost"
              delay={googleEnabled ? 2.15 : 2.0}
            >
              {loading === 'demo' ? (
                <>
                  <div className="w-3 h-3 border border-current border-t-transparent rounded-full aether-spinner" />
                  Entering
                </>
              ) : (
                <>
                  <User size={13} strokeWidth={1.4} />
                  Enter as guest
                </>
              )}
            </AuthButton>
          </div>

          <AnimatePresence>
            {!googleEnabled && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.4, duration: 0.5 }}
                className="text-[10px] mt-7 tracking-wider"
                style={{ color: 'rgba(242, 235, 220, 0.35)' }}
              >
                Google OAuth not configured · guest mode active
              </motion.p>
            )}
          </AnimatePresence>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5, duration: 0.5 }}
            className="text-[10px] mt-8 tracking-[0.22em] uppercase"
            style={{ color: 'rgba(242, 235, 220, 0.32)' }}
          >
            AECI · 2024 research prototype
          </motion.p>
        </div>
      </motion.div>

      <style jsx global>{`
        .relative.z-10 h1 { color: rgba(242, 235, 220, 0.96); }
      `}</style>
    </div>
  );
}
