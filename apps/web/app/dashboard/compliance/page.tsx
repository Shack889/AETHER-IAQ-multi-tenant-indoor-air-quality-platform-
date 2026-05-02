'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { CheckCircle, XCircle, Minus, ShieldCheck, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { useSensorData } from '@/hooks/useSensorData';
import { useAetherStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

interface CellState {
  state: 'pass' | 'fail' | 'na';
  value?: number | string;
}

const STANDARDS = [
  { key: 'who',    label: 'WHO 2021',           pmLimit: 15,  co2Limit: 1000, vocLimit: 200, tempLow: 18, tempHigh: 27, rhLow: 30, rhHigh: 60 },
  { key: 'epa',    label: 'EPA NAAQS',          pmLimit: 35,  co2Limit: 1100, vocLimit: 300, tempLow: 18, tempHigh: 27, rhLow: 30, rhHigh: 65 },
  { key: 'bnaaqs', label: 'BD NAAQS',           pmLimit: 35,  co2Limit: 1200, vocLimit: 300, tempLow: 18, tempHigh: 30, rhLow: 30, rhHigh: 70 },
  { key: 'ashrae', label: 'ASHRAE 62.1/55',     pmLimit: 35,  co2Limit: 1000, vocLimit: 250, tempLow: 20, tempHigh: 26, rhLow: 30, rhHigh: 60 },
  { key: 'well',   label: 'WELL Building v2',   pmLimit: 15,  co2Limit:  900, vocLimit: 200, tempLow: 20, tempHigh: 25, rhLow: 30, rhHigh: 60 },
  { key: 'reset',  label: 'RESET Air',          pmLimit: 25,  co2Limit:  800, vocLimit: 250, tempLow: 20, tempHigh: 26, rhLow: 30, rhHigh: 60 },
] as const;

const PARAMS = ['PM2.5', 'CO₂', 'VOC', 'Temp', 'RH'] as const;

function Cell({ state }: { state: CellState }) {
  if (state.state === 'na') {
    return (
      <div className="flex items-center justify-center h-9 rounded-lg bg-surface-2 border border-theme">
        <Minus size={14} className="text-muted" />
      </div>
    );
  }
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1,   opacity: 1 }}
      className={cn(
        'flex items-center justify-center gap-1 h-9 rounded-lg border text-xs font-semibold',
        state.state === 'pass'
          ? 'bg-green-500/10 border-green-500/20 text-green-400'
          : 'bg-red-500/10   border-red-500/20   text-red-400',
      )}
    >
      {state.state === 'pass'
        ? <CheckCircle size={12} />
        : <XCircle    size={12} />}
      <span className="font-data">{state.value}</span>
    </motion.div>
  );
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export default function CompliancePage() {
  const { snapshot, isLoading } = useSensorData();
  const { activeNodeId } = useAetherStore();
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  if (isLoading || !snapshot) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton width={140} height={20} />
          <Skeleton width={240} variant="text" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="surface-card p-5 space-y-3">
            <Skeleton variant="text" width="50%" />
            <Skeleton height={48} width="40%" />
            <Skeleton height={6} />
          </div>
          <div className="lg:col-span-2 surface-card p-5 space-y-3">
            <Skeleton variant="text" width="30%" />
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}
            </div>
          </div>
        </div>
        <div className="surface-card p-5 space-y-3">
          <Skeleton variant="text" width="20%" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-2">
              {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} height={36} />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const pm   = snapshot.pm25_corrected;
  const co2  = snapshot.co2_filtered;
  const voc  = snapshot.voc_filtered;
  const temp = snapshot.temp_filtered;
  const rh   = snapshot.rh_filtered;

  const matrix: Record<string, Record<string, CellState>> = {};
  for (const std of STANDARDS) {
    matrix[std.key] = {
      'PM2.5': { state: pm   <= std.pmLimit  ? 'pass' : 'fail', value: `${pm.toFixed(1)}/${std.pmLimit}` },
      'CO₂':   { state: co2  <= std.co2Limit ? 'pass' : 'fail', value: `${Math.round(co2)}/${std.co2Limit}` },
      'VOC':   { state: voc  <= std.vocLimit ? 'pass' : 'fail', value: `${Math.round(voc)}/${std.vocLimit}` },
      'Temp':  { state: temp >= std.tempLow && temp <= std.tempHigh ? 'pass' : 'fail', value: `${temp.toFixed(1)}°` },
      'RH':    { state: rh   >= std.rhLow   && rh   <= std.rhHigh   ? 'pass' : 'fail', value: `${Math.round(rh)}%` },
    };
  }

  const total = STANDARDS.length * PARAMS.length;
  const passed = STANDARDS.reduce((acc, s) => {
    return acc + PARAMS.reduce((p, pa) => p + (matrix[s.key][pa].state === 'pass' ? 1 : 0), 0);
  }, 0);
  const compliancePct = (passed / total) * 100;

  const alertColor =
    snapshot.alert_level === 0 ? '#22c55e' :
    snapshot.alert_level === 1 ? '#eab308' :
    snapshot.alert_level === 2 ? '#f97316' :
    snapshot.alert_level === 3 ? '#ef4444' : '#7c3aed';

  const exportSnapshotCsv = () => {
    setExporting('csv');
    try {
      const ts = snapshot.timestamp instanceof Date
        ? snapshot.timestamp.toISOString()
        : new Date(snapshot.timestamp as unknown as string).toISOString();
      const header = [
        '# AETHER-IAQ Compliance Snapshot',
        `# Node,${csvCell(snapshot.nodeId)}`,
        `# Timestamp,${csvCell(ts)}`,
        `# Profile,${csvCell(snapshot.profile_used)}`,
        `# DEPS AQI,${snapshot.deps_aqi}`,
        `# EPA AQI,${snapshot.epa_aqi}`,
        `# Alert level,${snapshot.alert_level} / 4`,
        `# Overall compliance,${compliancePct.toFixed(0)}% (${passed}/${total})`,
        '',
        '# Live readings',
        `PM2.5 (µg/m³),${pm.toFixed(2)}`,
        `CO₂ (ppm),${Math.round(co2)}`,
        `VOC (idx),${Math.round(voc)}`,
        `Temp (°C),${temp.toFixed(2)}`,
        `RH (%),${Math.round(rh)}`,
        '',
        '# Standards matrix',
      ].join('\n');

      const matrixHeader = ['Standard', ...PARAMS].map(csvCell).join(',');
      const matrixRows = STANDARDS.map((std) => {
        const row = matrix[std.key];
        return [
          std.label,
          ...PARAMS.map((p) => `${row[p].state.toUpperCase()} (${row[p].value ?? ''})`),
        ].map(csvCell).join(',');
      });

      const csv = [header, matrixHeader, ...matrixRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aether-${snapshot.nodeId}-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportHistoryXlsx = async () => {
    setExporting('xlsx');
    try {
      const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const to = new Date().toISOString();
      await api.downloadExport('xlsx', activeNodeId, from, to);
    } finally {
      setExporting(null);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Compliance</h1>
          <p className="text-xs text-secondary mt-0.5">Live status against 6 international standards</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportSnapshotCsv}
            disabled={exporting !== null}
          >
            <Download size={14} className="mr-1.5" />
            {exporting === 'csv' ? 'Exporting…' : 'Export Snapshot (CSV)'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void exportHistoryXlsx()}
            disabled={exporting !== null}
          >
            <FileSpreadsheet size={14} className="mr-1.5" />
            {exporting === 'xlsx' ? 'Exporting…' : 'Export 24h History (Excel)'}
          </Button>
        </div>
      </div>

      <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Overall Compliance</h3>
          </div>
          <div className="font-data text-5xl font-bold tabular-nums" style={{
            color: compliancePct >= 80 ? '#22c55e' : compliancePct >= 60 ? '#f97316' : '#ef4444',
          }}>
            {compliancePct.toFixed(0)}%
          </div>
          <div className="text-xs text-muted">{passed} / {total} parameter checks passing</div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-3">
            <motion.div
              className="h-full rounded-full"
              style={{ background: compliancePct >= 80 ? '#22c55e' : compliancePct >= 60 ? '#f97316' : '#ef4444' }}
              animate={{ width: `${compliancePct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </Card>

        <Card className="space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Alert Level</h3>
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold border" style={{
              borderColor: alertColor + '40',
              backgroundColor: alertColor + '15',
              color: alertColor,
            }}>
              Level {snapshot.alert_level} / 4
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((lvl) => {
              const colors = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#7c3aed'];
              const labels = ['Good', 'Moderate', 'Warning', 'Alert', 'Hazardous'];
              const active = snapshot.alert_level >= lvl;
              return (
                <div
                  key={lvl}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-opacity"
                  style={{
                    borderColor: active ? colors[lvl] + '60' : 'var(--border)',
                    backgroundColor: active ? colors[lvl] + '15' : 'transparent',
                    opacity: active ? 1 : 0.4,
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: colors[lvl] }} />
                  <span className="text-xs font-medium" style={{ color: active ? colors[lvl] : 'var(--text-muted)' }}>
                    {labels[lvl]}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Matrix */}
      <Card padding="lg" className="overflow-x-auto">
        <h3 className="text-sm font-semibold text-primary mb-4">Standards Matrix</h3>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-muted px-3 py-2 min-w-[160px]">Standard</th>
              {PARAMS.map((p) => (
                <th key={p} className="text-xs font-medium text-muted px-2 py-2 min-w-[100px]">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STANDARDS.map((std) => (
              <tr key={std.key} className="border-t border-theme">
                <td className="text-xs font-medium text-primary px-3 py-2 whitespace-nowrap">{std.label}</td>
                {PARAMS.map((p) => (
                  <td key={p} className="px-2 py-2">
                    <Cell state={matrix[std.key][p]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-primary mb-2">Auto-Generated Report Preview</h3>
        <div className="space-y-2 text-xs text-secondary font-data">
          <div>Node: <span className="text-primary">{snapshot.nodeId}</span></div>
          <div>Timestamp: <span className="text-primary">{snapshot.timestamp.toString()}</span></div>
          <div>Profile: <span className="text-primary">{snapshot.profile_used}</span></div>
          <div className="pt-2 border-t border-theme">
            <span className="text-muted">PM2.5:</span> {pm.toFixed(1)} µg/m³ ·
            <span className="text-muted ml-2">CO₂:</span> {Math.round(co2)} ppm ·
            <span className="text-muted ml-2">VOC:</span> {Math.round(voc)} idx
          </div>
          <div>
            <span className="text-muted">Temp:</span> {temp.toFixed(1)}°C ·
            <span className="text-muted ml-2">RH:</span> {Math.round(rh)}% ·
            <span className="text-muted ml-2">DEPS AQI:</span> {snapshot.deps_aqi}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
