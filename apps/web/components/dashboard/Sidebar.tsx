'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wind, Activity, Heart, TrendingUp, Map,
  ShieldCheck, History, Settings, Cpu, FlaskConical,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAetherStore } from '@/lib/store';
import { sidebarItemVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard',             icon: Activity,    label: 'Live Monitor',  exact: true },
  { href: '/dashboard/health',      icon: Heart,       label: 'Health Impact' },
  { href: '/dashboard/predictions', icon: TrendingUp,  label: 'Predictions' },
  { href: '/dashboard/spatial',     icon: Map,         label: 'Room Spatial' },
  { href: '/dashboard/compliance',  icon: ShieldCheck, label: 'Compliance' },
  { href: '/dashboard/history',     icon: History,     label: 'History' },
  { href: '/dashboard/settings',    icon: Settings,    label: 'Settings' },
  { href: '/dashboard/nodes',       icon: Cpu,         label: 'Node Manager' },
  { href: '/dashboard/simulation',  icon: FlaskConical, label: 'Simulation' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAetherStore();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col h-full bg-surface-1 border-r border-theme overflow-hidden shrink-0"
      style={{ willChange: 'width' }}
    >
      {/* Logo area */}
      <div className="flex items-center h-14 px-4 border-b border-theme shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-aether-500/20 flex items-center justify-center shrink-0">
            <Wind className="w-4 h-4 text-aether-400" />
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="min-w-0"
              >
                <div className="text-sm font-bold text-primary truncate">AETHER-IAQ</div>
                <div className="text-xs text-muted truncate">v1.0.0</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive(href, exact);
          return (
            <motion.div key={href} variants={sidebarItemVariants} initial="rest" whileHover="hover">
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 group',
                  active
                    ? 'bg-aether-500/15 text-aether-400'
                    : 'text-secondary hover:text-primary hover:bg-surface-2',
                )}
              >
                <Icon
                  className={cn('w-4.5 h-4.5 shrink-0',
                    active ? 'text-aether-400' : 'text-muted group-hover:text-secondary',
                  )}
                  size={18}
                />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute right-2 w-1 h-5 rounded-full bg-aether-400"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-4 shrink-0">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-muted hover:text-primary hover:bg-surface-2 transition-colors text-xs"
        >
          {sidebarCollapsed
            ? <ChevronRight size={16} />
            : <><ChevronLeft size={16} /><span>Collapse</span></>
          }
        </button>
      </div>
    </motion.aside>
  );
}
