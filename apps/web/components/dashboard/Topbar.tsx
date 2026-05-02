'use client';

import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Bell, BellOff, ChevronDown, Wifi, WifiOff, Check, CheckCheck } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAetherStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { AQI_LABELS } from '@/lib/constants';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface NodeRow {
  nodeId: string;
  name: string;
  isOnline: boolean;
  dataSource: 'mock' | 'live' | 'simulation';
}

const SOURCE_STYLE: Record<NodeRow['dataSource'], { label: string; cls: string }> = {
  live:       { label: 'LIVE',       cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  mock:       { label: 'MOCK',       cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  simulation: { label: 'SIMULATED',  cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
};

const ALERT_LEVEL_STYLE: Record<number, { dot: string; text: string }> = {
  0: { dot: 'bg-green-400',  text: 'text-green-400' },
  1: { dot: 'bg-yellow-400', text: 'text-yellow-400' },
  2: { dot: 'bg-orange-400', text: 'text-orange-400' },
  3: { dot: 'bg-red-400',    text: 'text-red-400' },
  4: { dot: 'bg-purple-400', text: 'text-purple-400' },
};

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60)        return `${s}s ago`;
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Topbar() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const {
    latestSnapshot, recentAlerts, activeNodeId, setActiveNode, userId,
    acknowledgeAlert, acknowledgeAllAlerts,
  } = useAetherStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [nodes, setNodes] = useState<NodeRow[]>([]);

  // Refetch the user's nodes whenever the session userId changes (or this
  // mounts after login). Done lazily so unauthenticated routes don't hit it.
  // Also re-polled every 10s so toggling a data source on Node Manager flows
  // back into the badge without a page reload.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetchNodes = () => {
      void api.getNodes()
        .then((d) => {
          if (cancelled) return;
          const list = (d as NodeRow[]).map((n) => ({
            nodeId: n.nodeId, name: n.name, isOnline: n.isOnline,
            dataSource: (n.dataSource ?? 'live') as NodeRow['dataSource'],
          }));
          setNodes(list);
          if (list.length > 0 && !list.some((n) => n.nodeId === activeNodeId)) {
            setActiveNode(list[0].nodeId);
          }
        })
        .catch(() => setNodes([]));
    };
    fetchNodes();
    const t = setInterval(fetchNodes, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [userId, activeNodeId, setActiveNode]);

  const alertLevel = latestSnapshot?.alert_level ?? 0;
  const unreadAlerts = recentAlerts.filter((a) => !a.acknowledged).length;
  const isOnline = latestSnapshot !== null;
  const activeNodeMeta = nodes.find((n) => n.nodeId === activeNodeId);
  const activeSource = SOURCE_STYLE[activeNodeMeta?.dataSource ?? 'live'];

  return (
    <header className="h-14 flex items-center px-6 gap-4 border-b border-theme bg-surface-0 shrink-0">
      {/* Node selector */}
      <div className="relative">
        <button
          onClick={() => setShowNodeMenu(!showNodeMenu)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            isOnline
              ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/15',
          )}
        >
          {isOnline
            ? <Wifi size={12} className="shrink-0" />
            : <WifiOff size={12} className="shrink-0" />
          }
          <span className="font-data">{activeNodeMeta?.name ?? activeNodeId}</span>
          {isOnline && (
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-green-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        </button>

        <span className={cn(
          'ml-2 px-2 py-1 rounded-full text-[10px] font-bold border tracking-wider hidden sm:inline-block',
          activeSource.cls,
        )}>
          {activeSource.label} DATA
        </span>

        <AnimatePresence>
          {showNodeMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 top-full mt-2 w-64 surface-card p-1.5 shadow-lg z-50"
            >
              <div className="px-3 pt-1.5 pb-2 text-[10px] font-semibold text-muted uppercase tracking-wide">
                Active node
              </div>
              {nodes.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted">No nodes registered yet.</div>
              ) : (
                nodes.map((n) => (
                  <button
                    key={n.nodeId}
                    onClick={() => { setActiveNode(n.nodeId); setShowNodeMenu(false); }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs transition-colors',
                      n.nodeId === activeNodeId
                        ? 'bg-aether-500/15 text-aether-400'
                        : 'text-secondary hover:bg-surface-2 hover:text-primary',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', n.isOnline ? 'bg-green-400' : 'bg-slate-500')} />
                      <span className="truncate">{n.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-full text-[9px] font-bold border',
                        SOURCE_STYLE[n.dataSource].cls,
                      )}>
                        {SOURCE_STYLE[n.dataSource].label}
                      </span>
                      <span className="text-muted font-data text-[10px]">{n.nodeId}</span>
                    </div>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Alert level indicator */}
      {latestSnapshot && (
        <div className={cn(
          'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
          alertLevel === 0 ? 'bg-green-500/10  text-green-400  border-green-500/20'  :
          alertLevel === 1 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
          alertLevel === 2 ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
          alertLevel === 3 ? 'bg-red-500/10    text-red-400    border-red-500/20'    :
                             'bg-purple-500/10 text-purple-400 border-purple-500/20',
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            alertLevel === 0 ? 'bg-green-400'  :
            alertLevel === 1 ? 'bg-yellow-400' :
            alertLevel === 2 ? 'bg-orange-400' :
            alertLevel === 3 ? 'bg-red-400'    : 'bg-purple-400',
          )} />
          {AQI_LABELS[alertLevel] ?? 'Unknown'}
        </div>
      )}

      <div className="flex-1" />

      {/* Theme toggle */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={toggleTheme}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </motion.button>

      {/* Alert bell */}
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAlertMenu(!showAlertMenu)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          aria-label="Alerts"
        >
          <Bell size={17} />
          {unreadAlerts > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </motion.span>
          )}
        </motion.button>

        <AnimatePresence>
          {showAlertMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-2 w-80 surface-card p-1.5 shadow-lg z-50"
            >
              <div className="flex items-center justify-between px-3 pt-1.5 pb-2 border-b border-theme">
                <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Alerts {unreadAlerts > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px]">
                      {unreadAlerts} new
                    </span>
                  )}
                </div>
                {recentAlerts.length > 0 && unreadAlerts > 0 && (
                  <button
                    onClick={() => {
                      void api.ackAllAlerts().catch(() => undefined);
                      acknowledgeAllAlerts();
                    }}
                    className="flex items-center gap-1 text-[10px] text-aether-400 hover:text-aether-300"
                  >
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {recentAlerts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                    <BellOff size={18} className="text-muted" />
                    <div className="text-xs text-muted">No alerts — air quality is good.</div>
                  </div>
                ) : (
                  recentAlerts.map((a) => {
                    const style = ALERT_LEVEL_STYLE[a.level] ?? ALERT_LEVEL_STYLE[0];
                    const ts = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string);
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'flex items-start gap-2.5 px-3 py-2 rounded-lg group',
                          a.acknowledged ? 'opacity-50' : 'hover:bg-surface-2',
                        )}
                      >
                        <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', style.dot)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-primary truncate">
                            {a.message}
                          </div>
                          <div className="text-[10px] text-muted font-data mt-0.5">
                            {a.nodeId} · {AQI_LABELS[a.level] ?? `Level ${a.level}`} · {relativeTime(ts)}
                          </div>
                        </div>
                        {!a.acknowledged && (
                          <button
                            onClick={() => {
                              void api.ackAlert(a.id).catch(() => undefined);
                              acknowledgeAlert(a.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-aether-400 transition-opacity"
                            title="Mark as read"
                          >
                            <Check size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User menu */}
      {session?.user && (
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-surface-2 transition-colors"
          >
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                width={28}
                height={28}
                className="rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-aether-500/20 flex items-center justify-center text-xs font-bold text-aether-400">
                {session.user.name?.[0] ?? 'U'}
              </div>
            )}
            <span className="text-sm font-medium text-primary hidden md:block">
              {session.user.name?.split(' ')[0] ?? 'User'}
            </span>
            <ChevronDown size={14} className="text-muted" />
          </button>

          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-full mt-2 w-48 surface-card p-1.5 shadow-lg z-50"
            >
              <div className="px-3 py-2 border-b border-theme mb-1">
                <div className="text-xs font-medium text-primary truncate">{session.user.name}</div>
                <div className="text-xs text-muted truncate">{session.user.email}</div>
              </div>
              <button
                onClick={() => void signOut({ callbackUrl: '/auth/signin' })}
                className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-surface-2 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </motion.div>
          )}
        </div>
      )}
    </header>
  );
}
