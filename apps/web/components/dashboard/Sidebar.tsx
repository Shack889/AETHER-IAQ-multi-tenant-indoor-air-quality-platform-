'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Heart, TrendingUp, Map,
  ShieldCheck, History, Settings, Cpu, FlaskConical,
  ClipboardList, FileText, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAetherStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/animations/Pressable';

const navItems = [
  { href: '/dashboard',             icon: Activity,    label: 'Live Monitor',  exact: true },
  { href: '/dashboard/occupancy',   icon: ClipboardList, label: 'Log Occupancy' },
  { href: '/dashboard/health',      icon: Heart,       label: 'Health Impact' },
  { href: '/dashboard/predictions', icon: TrendingUp,  label: 'Predictions' },
  { href: '/dashboard/spatial',     icon: Map,         label: 'Room Spatial' },
  { href: '/dashboard/compliance',  icon: ShieldCheck, label: 'Compliance' },
  { href: '/dashboard/reports',     icon: FileText,    label: 'Reports' },
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
      animate={{ width: sidebarCollapsed ? 76 : 240 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col h-full overflow-hidden shrink-0 z-20"
      style={{ borderRight: '1px solid var(--rule)', willChange: 'width' }}
    >
      {/* Brand mark */}
      <div className="relative flex items-center h-20 px-6 shrink-0">
        <AnimatePresence>
          {!sidebarCollapsed ? (
            <motion.div
              key="full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="min-w-0"
            >
              <div className="font-display text-3xl tracking-tight text-primary leading-none">AECI</div>
              <div className="text-[9px] text-muted tracking-[0.22em] uppercase mt-2">
                Environmental Intelligence
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="font-display text-2xl text-primary leading-none"
            >
              A
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="hairline mx-6" />

      {/* Eyebrow */}
      <AnimatePresence>
        {!sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="px-6 pt-5 pb-2 label-eyebrow"
          >
            Operations
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav items */}
      <nav className="relative flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive(href, exact);
          return (
            <Pressable
              key={href}
              as="div"
              magnet={6}
              pressScale={0.94}
              lift={2}
              className="block"
            >
            <Link
              href={href}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-300 group',
                active ? 'text-primary' : 'text-secondary hover:text-primary',
              )}
            >
              {/* Atmospheric warm halo behind active item */}
              {active && (
                <motion.span
                  layoutId="sidebar-halo"
                  aria-hidden
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(200, 96, 43, 0.10), rgba(200, 96, 43, 0.02) 70%)',
                  }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                />
              )}

              <Icon
                className={cn(
                  'w-[16px] h-[16px] shrink-0 relative z-10 transition-colors duration-300',
                  active ? 'text-accent' : 'text-muted group-hover:text-primary',
                )}
                size={16}
                strokeWidth={1.4}
              />

              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="truncate relative z-10 font-normal"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Glowing rail */}
              {active && (
                <motion.span
                  layoutId="sidebar-rail"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-full"
                  style={{
                    background: 'var(--accent)',
                    boxShadow: '0 0 10px rgba(200, 96, 43, 0.55)',
                  }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </Link>
            </Pressable>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="relative px-3 pb-5 shrink-0">
        <Pressable
          as="button"
          onClick={toggleSidebar}
          magnet={6}
          pressScale={0.92}
          lift={2}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-muted hover:text-primary transition-colors text-[10px] tracking-[0.22em] uppercase"
        >
          {sidebarCollapsed
            ? <ChevronRight size={13} strokeWidth={1.4} />
            : <><ChevronLeft size={13} strokeWidth={1.4} /><span>Collapse</span></>
          }
        </Pressable>
      </div>
    </motion.aside>
  );
}
