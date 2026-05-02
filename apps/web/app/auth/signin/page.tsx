'use client';

import { signIn, getProviders, type ClientSafeProvider } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Wind, User } from 'lucide-react';

function FloatingParticle({ x, y, size, duration, delay }: {
  x: number; y: number; size: number; duration: number; delay: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full bg-aether-400/20"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
      animate={{
        y: [0, -30, 0],
        x: [0, 15, -10, 0],
        opacity: [0.2, 0.5, 0.2],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

const particles = [
  { x: 10, y: 20, size: 8,  duration: 7,  delay: 0 },
  { x: 80, y: 15, size: 12, duration: 9,  delay: 1 },
  { x: 60, y: 70, size: 6,  duration: 6,  delay: 2 },
  { x: 30, y: 80, size: 10, duration: 8,  delay: 0.5 },
  { x: 90, y: 50, size: 7,  duration: 10, delay: 3 },
  { x: 5,  y: 60, size: 9,  duration: 7,  delay: 1.5 },
  { x: 70, y: 90, size: 5,  duration: 11, delay: 2.5 },
  { x: 45, y: 10, size: 11, duration: 8,  delay: 0.8 },
];

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
    await signIn('google', { callbackUrl: '/dashboard' });
  };

  const handleDemo = async () => {
    setLoading('demo');
    await signIn('demo', {
      email: 'demo@aether-iaq.local',
      callbackUrl: '/dashboard',
    });
  };

  if (!mounted) return null;

  const googleEnabled = !!providers?.google;

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      data-theme="dark"
      style={{ background: 'linear-gradient(135deg, #0f1117 0%, #1a1d27 50%, #0f1117 100%)' }}
    >
      {particles.map((p, i) => (
        <FloatingParticle key={i} {...p} />
      ))}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(26, 29, 39, 0.9)',
            border: '1px solid rgba(51, 56, 71, 0.8)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-aether-500/20 flex items-center justify-center">
                <Wind className="w-7 h-7 text-aether-400" />
              </div>
              <motion.div
                className="absolute inset-0 rounded-xl border border-aether-400/30"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </div>
            <div className="text-left">
              <div className="text-xl font-bold text-white tracking-tight">AETHER</div>
              <div className="text-xs text-aether-400 font-medium tracking-widest uppercase">IAQ Monitor</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <h1 className="text-lg font-semibold text-white mb-1">Welcome back</h1>
            <p className="text-sm text-slate-400 mb-8">Intelligent air. Healthier spaces.</p>
          </motion.div>

          <div className="flex flex-col gap-3">
            {googleEnabled && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                onClick={() => void handleGoogle()}
                disabled={loading !== null}
                whileHover={{ scale: 1.02, translateY: -1 }}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: loading === 'google'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(255,255,255,0.95)',
                  color: '#1f2937',
                }}
              >
                {loading === 'google' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-aether-500 rounded-full aether-spinner" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </motion.button>
            )}

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: googleEnabled ? 0.6 : 0.5, duration: 0.4 }}
              onClick={() => void handleDemo()}
              disabled={loading !== null}
              whileHover={{ scale: 1.02, translateY: -1 }}
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: loading === 'demo'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#a7f3d0',
              }}
            >
              {loading === 'demo' ? (
                <>
                  <div className="w-4 h-4 border-2 border-aether-300 border-t-aether-100 rounded-full aether-spinner" />
                  <span>Entering demo...</span>
                </>
              ) : (
                <>
                  <User size={16} />
                  <span>Continue as Demo User</span>
                </>
              )}
            </motion.button>
          </div>

          {!googleEnabled && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="text-[11px] text-slate-500 mt-4"
            >
              Google OAuth is not configured — demo mode active.
            </motion.p>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-xs text-slate-500 mt-6"
          >
            Research prototype — IEEE submission 2024
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
