'use client';

import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Bell, BellOff, ChevronDown, Check, CheckCheck } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAetherStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { AQI_LABELS } from '@/lib/constants';
import { api } from '@/lib/api';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Pressable } from '@/components/animations/Pressable';
import { MenuItem } from '@/components/animations/MenuItem';

interface NodeRow {
  nodeId: string;
  name: string;
  isOnline: boolean;
  dataSource: 'mock' | 'live' | 'simulation';
}

const SOURCE_DOT: Record<NodeRow['dataSource'], string> = {
  live:       'var(--good)',
  mock:       'var(--moderate)',
  simulation: 'var(--accent)',
};

const SOURCE_LABEL: Record<NodeRow['dataSource'], string> = {
  live:       'Live',
  mock:       'Mock',
  simulation: 'Simulated',
};

const ALERT_LEVEL_STYLE: Record<number, { dot: string; text: string }> = {
  0: { dot: 'bg-[var(--good)]',      text: 'text-[var(--good)]'      },
  1: { dot: 'bg-[var(--moderate)]',  text: 'text-[var(--moderate)]'  },
  2: { dot: 'bg-[var(--usg)]',       text: 'text-[var(--usg)]'       },
  3: { dot: 'bg-[var(--unhealthy)]', text: 'text-[var(--unhealthy)]' },
  4: { dot: 'bg-[var(--hazard)]',    text: 'text-[var(--hazard)]'    },
};

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60)        return `${s}s ago`;
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const PANEL_STYLE: React.CSSProperties = {
  background: 'var(--paper-1)',
  border: '1px solid var(--rule)',
  borderRadius: 14,
  boxShadow: '0 30px 80px rgba(20, 17, 13, 0.10), 0 4px 16px rgba(20, 17, 13, 0.04)',
};

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

  const nodeMenuRef  = useRef<HTMLDivElement | null>(null);
  const alertMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef  = useRef<HTMLDivElement | null>(null);

  const closeAll = () => {
    setShowAlertMenu(false);
    setShowNodeMenu(false);
    setShowUserMenu(false);
  };

  // Outside-click close
  useEffect(() => {
    if (!showAlertMenu && !showNodeMenu && !showUserMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        nodeMenuRef.current?.contains(target) ||
        alertMenuRef.current?.contains(target) ||
        userMenuRef.current?.contains(target)
      ) return;
      closeAll();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAlertMenu, showNodeMenu, showUserMenu]);

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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

  const unreadAlerts = recentAlerts.filter((a) => !a.acknowledged).length;
  const isOnline = latestSnapshot !== null;
  const activeNodeMeta = nodes.find((n) => n.nodeId === activeNodeId);
  const sourceDot = SOURCE_DOT[activeNodeMeta?.dataSource ?? 'live'];
  const sourceLabel = SOURCE_LABEL[activeNodeMeta?.dataSource ?? 'live'];

  return (
    <header
      className="relative h-16 flex items-center px-6 lg:px-10 gap-4 shrink-0 z-30"
      style={{ background: 'transparent' }}
    >

      {/* LEFT — Node pill with inline source label */}
      <div className="relative flex-1 min-w-0" ref={nodeMenuRef}>
        <Pressable
          as="button"
          onClick={() => { setShowNodeMenu((v) => !v); setShowAlertMenu(false); setShowUserMenu(false); }}
          magnet={8}
          pressScale={0.94}
          lift={2}
          className="group inline-flex items-center gap-3 pl-2.5 pr-3.5 py-1.5 rounded-full transition-colors duration-300"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
          }}
        >
          {/* Status dot */}
          <span className="relative flex w-2 h-2 shrink-0">
            {isOnline && (
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: sourceDot }}
                animate={{ scale: [1, 2.4, 1], opacity: [0.55, 0, 0.55] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
            <span
              className="absolute inset-[1px] rounded-full"
              style={{ background: isOnline ? sourceDot : 'var(--ink-3)' }}
            />
          </span>

          <span className="font-data text-[11px] tracking-[0.16em] text-primary truncate">
            {activeNodeMeta?.name ?? activeNodeId}
          </span>

          <span className="hairline-vert h-3 w-px bg-[var(--rule)] hidden md:block" />

          <span
            className="hidden md:inline text-[10px] tracking-[0.22em] uppercase"
            style={{ color: 'var(--ink-3)' }}
          >
            {sourceLabel}
          </span>

          <ChevronDown
            size={11}
            className="opacity-50 group-hover:opacity-90 transition-opacity duration-300 ml-0.5"
            strokeWidth={1.5}
          />
        </Pressable>

        <AnimatePresence>
          {showNodeMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)' }}
              exit={{   opacity: 0, y: 4,  scale: 0.97, filter: 'blur(3px)' }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 top-[calc(100%+10px)] w-72 p-1.5 z-50 origin-top-left"
              style={PANEL_STYLE}
            >
              <div className="px-3 pt-2 pb-2 label-eyebrow">Active node</div>
              {nodes.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted">No nodes registered yet.</div>
              ) : (
                nodes.map((n, idx) => (
                  <MenuItem
                    key={n.nodeId}
                    onClick={() => { setActiveNode(n.nodeId); setShowNodeMenu(false); }}
                    active={n.nodeId === activeNodeId}
                    index={idx}
                    magnet={12}
                    lift={5}
                    hoverScale={1.04}
                    pressScale={0.94}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2.5',
                      n.nodeId === activeNodeId ? 'text-accent' : '',
                    )}
                    style={n.nodeId === activeNodeId
                      ? { background: 'linear-gradient(135deg, rgba(200, 96, 43, 0.10), rgba(200, 96, 43, 0.02))' }
                      : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: n.isOnline ? SOURCE_DOT[n.dataSource] : 'var(--ink-3)' }}
                      />
                      <span className="truncate text-[13px]">{n.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] tracking-[0.18em] uppercase" style={{ color: 'var(--ink-3)' }}>
                        {SOURCE_LABEL[n.dataSource]}
                      </span>
                      <span className="text-muted font-data text-[10px]">{n.nodeId}</span>
                    </div>
                  </MenuItem>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT — minimal icon group */}
      <div className="flex items-center gap-1">
        <Pressable
          as="button"
          onClick={toggleTheme}
          magnet={6}
          pressScale={0.88}
          lift={1}
          className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors duration-300"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={15} strokeWidth={1.4} /> : <Moon size={15} strokeWidth={1.4} />}
        </Pressable>

        {/* Alert bell with status dot */}
        <div className="relative" ref={alertMenuRef}>
          <Pressable
            as="button"
            onClick={() => { setShowAlertMenu((v) => !v); setShowNodeMenu(false); setShowUserMenu(false); }}
            magnet={6}
            pressScale={0.88}
            lift={1}
            className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors duration-300 relative"
            aria-label="Alerts"
          >
            <Bell size={15} strokeWidth={1.4} />
            {/* Status dot — driven solely by unread count, clears on "Mark all" */}
            <AnimatePresence>
              {unreadAlerts > 0 && (
                <motion.span
                  key="alert-dot"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'var(--unhealthy)',
                    boxShadow: '0 0 6px var(--unhealthy)',
                  }}
                />
              )}
            </AnimatePresence>
          </Pressable>

          <AnimatePresence>
            {showAlertMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)' }}
                exit={{   opacity: 0, y: 4,  scale: 0.97, filter: 'blur(3px)' }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-[calc(100%+10px)] w-80 p-1.5 z-50 origin-top-right"
                style={PANEL_STYLE}
              >
                <div className="flex items-center justify-between px-3 pt-2 pb-2 hairline">
                  <div className="label-eyebrow flex items-center gap-2">
                    Alerts
                    {unreadAlerts > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] tracking-wider"
                            style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>
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
                      className="flex items-center gap-1 text-[10px] tracking-wider uppercase text-muted hover:text-accent transition-colors"
                    >
                      <CheckCheck size={11} strokeWidth={1.4} /> Mark all
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto pt-1" data-lenis-prevent>
                  {recentAlerts.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                      <BellOff size={18} className="text-muted" strokeWidth={1.4} />
                      <div className="text-xs text-muted">No alerts — air quality is good.</div>
                    </div>
                  ) : (
                    recentAlerts.map((a, idx) => {
                      const style = ALERT_LEVEL_STYLE[a.level] ?? ALERT_LEVEL_STYLE[0];
                      const ts = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string);
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.04 + idx * 0.025 }}
                          whileHover={{ x: 3, scale: 1.012, transition: { type: 'spring', stiffness: 280, damping: 18 } }}
                          className={cn(
                            'flex items-start gap-2.5 px-3 py-2.5 rounded-lg group cursor-default',
                            a.acknowledged ? 'opacity-50' : '',
                          )}
                          style={{ willChange: 'transform' }}
                        >
                          <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-primary truncate">{a.message}</div>
                            <div className="text-[10px] text-muted font-data mt-0.5 tracking-wider">
                              {a.nodeId} · {AQI_LABELS[a.level] ?? `Level ${a.level}`} · {relativeTime(ts)}
                            </div>
                          </div>
                          {!a.acknowledged && (
                            <button
                              onClick={() => {
                                void api.ackAlert(a.id).catch(() => undefined);
                                acknowledgeAlert(a.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-accent transition-opacity"
                              title="Mark as read"
                            >
                              <Check size={11} strokeWidth={1.4} />
                            </button>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {session?.user && (
          <div className="relative ml-1" ref={userMenuRef}>
            <Pressable
              as="button"
              onClick={() => { setShowUserMenu((v) => !v); setShowNodeMenu(false); setShowAlertMenu(false); }}
              magnet={6}
              pressScale={0.93}
              lift={1}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors duration-300"
              style={{ border: '1px solid transparent' }}
            >
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? 'User'}
                  width={26}
                  height={26}
                  className="rounded-full"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                  style={{
                    background: 'var(--accent-tint)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(200, 96, 43, 0.18)',
                  }}
                >
                  {session.user.name?.[0] ?? 'U'}
                </div>
              )}
              <span className="text-[12px] text-primary hidden md:block tracking-tight">
                {session.user.name?.split(' ')[0] ?? 'User'}
              </span>
              <ChevronDown size={11} className="text-muted" strokeWidth={1.5} />
            </Pressable>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)' }}
                  exit={{   opacity: 0, y: 4,  scale: 0.97, filter: 'blur(3px)' }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-[calc(100%+10px)] w-60 p-1.5 z-50 origin-top-right"
                  style={PANEL_STYLE}
                >
                  <div className="px-3 py-2.5 hairline mb-1">
                    <div className="text-[12px] text-primary truncate">{session.user.name}</div>
                    <div className="text-[10px] text-muted truncate font-data tracking-wider mt-0.5">{session.user.email}</div>
                  </div>
                  <MenuItem
                    onClick={() => void signOut({ callbackUrl: '/auth/signin' })}
                    magnet={12}
                    lift={5}
                    hoverScale={1.04}
                    pressScale={0.93}
                    className="px-3 py-2.5 text-[12px]"
                    noEntrance
                  >
                    Sign out
                  </MenuItem>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </header>
  );
}
