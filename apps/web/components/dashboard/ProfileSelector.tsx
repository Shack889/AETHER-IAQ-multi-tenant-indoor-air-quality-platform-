'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { DEPS_PROFILES } from '@aether/shared';
import { useAetherStore } from '@/lib/store';
import { api } from '@/lib/api';
import { useActiveEnvironment } from '@/hooks/useActiveEnvironment';
import { Pressable } from '@/components/animations/Pressable';
import { MenuItem } from '@/components/animations/MenuItem';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';

const QUIET = [0.22, 1, 0.36, 1] as const;

export function ProfileSelector() {
  const { activeProfile, setActiveProfile } = useAetherStore();
  const { room, refresh } = useActiveEnvironment();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ newProfile: string; oldProfile: string; rowCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const current = DEPS_PROFILES[activeProfile];
  const profiles = Object.values(DEPS_PROFILES);

  /** Profile changes go through the server (room.profile drives profile_used
   *  on every new row) and never recompute history without confirmation. */
  const requestProfileChange = async (profileKey: string) => {
    setOpen(false);
    if (!room || profileKey === room.profile) {
      // No room to attribute to — purely a display change.
      setActiveProfile(profileKey);
      return;
    }
    const preview = await api.getRecomputePreview(room.id, profileKey);
    setPending({ newProfile: profileKey, oldProfile: preview.oldProfile, rowCount: preview.rowCount });
  };

  const applyProfile = async (recomputeHistorical: boolean) => {
    if (!pending || !room) return;
    setBusy(true);
    try {
      await api.setProfile(room.id, pending.newProfile, recomputeHistorical);
      setActiveProfile(pending.newProfile);
      await refresh();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  // Outside click + ESC
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      {pending && room && (
        <ConfirmModal
          title="Change environment profile?"
          subtitle={`${room.name}: ${pending.oldProfile} → ${pending.newProfile}`}
          onClose={() => setPending(null)}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void applyProfile(false)}>
                Apply to new data only
              </Button>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void applyProfile(true)}>
                Apply + recompute {pending.rowCount.toLocaleString()} rows
              </Button>
            </>
          }
        >
          <p>
            <span className="text-primary font-medium">{pending.rowCount.toLocaleString()} historical rows</span>{' '}
            in {room.name} were recorded under <span className="font-data">{pending.oldProfile}</span>.
            Recomputing rewrites their CELI scores; rows from other profiles are never touched.
          </p>
        </ConfirmModal>
      )}
      <Pressable
        as="button"
        onClick={() => setOpen((v) => !v)}
        magnet={10}
        pressScale={0.93}
        lift={3}
        className="group flex items-center gap-4 pl-5 pr-3 py-3 rounded-full transition-colors duration-300"
        style={{
          background: 'var(--paper-1)',
          border: '1px solid var(--rule)',
          willChange: 'transform',
        }}
      >
        <div className="flex flex-col items-start text-left">
          <span className="text-[9px] tracking-[0.24em] uppercase text-muted leading-none">
            {room ? room.name : 'Profile · no room'}
          </span>
          <span className="font-display text-[15px] text-primary leading-tight tracking-tight mt-1">
            {current?.label ?? 'Select profile'}
          </span>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.45, ease: QUIET }}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ border: '1px solid var(--rule)' }}
        >
          <ChevronDown size={12} className="text-muted" strokeWidth={1.5} />
        </motion.div>
      </Pressable>

      <AnimatePresence>
        {open && (
          <motion.div
            key="profile-menu"
            initial={{ opacity: 0, y: 10, scale: 0.97, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)' }}
            exit={{   opacity: 0, y: 6,  scale: 0.97, filter: 'blur(4px)' }}
            transition={{ duration: 0.55, ease: QUIET }}
            className="absolute top-[calc(100%+10px)] right-0 w-[340px] z-50 origin-top-right"
            style={{
              background: 'var(--paper-1)',
              border: '1px solid var(--rule)',
              borderRadius: 18,
              boxShadow: '0 30px 80px rgba(20, 17, 13, 0.10), 0 4px 16px rgba(20, 17, 13, 0.04)',
              willChange: 'transform, opacity, filter',
            }}
          >
            {/* Hairline highlight along top edge */}
            <span
              aria-hidden
              className="absolute top-0 left-1/4 right-1/4 h-px pointer-events-none"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(20,17,13,0.18), transparent)',
              }}
            />

            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <span className="label-eyebrow">Environment Profile</span>
              <span className="text-[10px] text-muted font-data tracking-wider">
                {profiles.length} presets
              </span>
            </div>

            <div className="px-2 pb-3 max-h-[60vh] overflow-y-auto" data-lenis-prevent>
              {profiles.map((profile, i) => {
                const active = profile.key === activeProfile;
                return (
                  <MenuItem
                    key={profile.key}
                    onClick={() => void requestProfileChange(profile.key)}
                    active={active}
                    index={i}
                    magnet={14}
                    lift={7}
                    hoverScale={1.05}
                    pressScale={0.93}
                    className="px-3 py-3"
                  >
                    {active && (
                      <motion.span
                        layoutId="profile-active-bg"
                        aria-hidden
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{
                          background:
                            'linear-gradient(135deg, rgba(200, 96, 43, 0.10), rgba(200, 96, 43, 0.02) 70%)',
                          border: '1px solid rgba(200, 96, 43, 0.18)',
                        }}
                        transition={{ duration: 0.55, ease: QUIET }}
                      />
                    )}

                    <div className="relative flex items-baseline justify-between gap-3">
                      <div className="font-display text-[15px] leading-snug">
                        {profile.label}
                      </div>
                      {active && (
                        <span
                          className="flex items-center gap-1 text-[9px] tracking-[0.18em] uppercase shrink-0"
                          style={{ color: 'var(--accent)' }}
                        >
                          <Check size={10} strokeWidth={1.6} />
                          Active
                        </span>
                      )}
                    </div>

                    <div
                      className={`relative text-[11px] mt-1 leading-snug line-clamp-2 ${
                        active ? 'text-secondary' : 'text-muted'
                      }`}
                    >
                      {profile.description}
                    </div>
                  </MenuItem>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
