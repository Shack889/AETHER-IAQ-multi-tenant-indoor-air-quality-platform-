'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2 } from 'lucide-react';
import { DEPS_PROFILES, DEPSProfile } from '@aether/shared';
import { useAetherStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function ProfileSelector() {
  const { activeProfile, setActiveProfile } = useAetherStore();
  const [open, setOpen] = useState(false);

  const current = DEPS_PROFILES[activeProfile];
  const profiles = Object.values(DEPS_PROFILES);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-theme transition-colors text-sm"
      >
        <Building2 size={14} className="text-aether-400 shrink-0" />
        <span className="text-primary font-medium truncate max-w-32">{current?.label ?? 'Select profile'}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-muted" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-64 surface-card p-1.5 shadow-xl z-50 max-h-80 overflow-y-auto"
          >
            {profiles.map((profile) => (
              <button
                key={profile.key}
                onClick={() => {
                  setActiveProfile(profile.key);
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors',
                  profile.key === activeProfile
                    ? 'bg-aether-500/15 text-aether-400 font-semibold'
                    : 'text-secondary hover:text-primary hover:bg-surface-2',
                )}
              >
                <div className="font-medium">{profile.label}</div>
                <div className="text-muted mt-0.5 leading-tight line-clamp-1">{profile.description}</div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
