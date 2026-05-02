'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Calendar, Download, BarChart3, Upload, FileSpreadsheet, FileText, AlertCircle } from 'lucide-react';
import { useAetherStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { formatChartTime } from '@/lib/utils';
import { containerVariants, pageVariants } from '@/components/animations/variants';

interface HistoryRow {
  timestamp: string;
  pm25_corrected: number;
  co2_filtered: number;
  voc_filtered: number;
  temp_filtered: number;
  rh_filtered: number;
  deps_aqi: number;
}

const CHANNELS = [
  { key: 'pm25_corrected', label: 'PM2.5',  color: '#10b981', unit: 'µg/m³' },
  { key: 'co2_filtered',   label: 'CO₂',    color: '#6366f1', unit: 'ppm'   },
  { key: 'voc_filtered',   label: 'VOC',    color: '#f59e0b', unit: 'idx'   },
  { key: 'temp_filtered',  label: 'Temp',   color: '#ef4444', unit: '°C'    },
  { key: 'rh_filtered',    label: 'RH',     color: '#06b6d4', unit: '%'     },
] as const;

function stats(values: number[]) {
  if (values.length === 0) return { mean: 0, min: 0, max: 0, std: 0, p50: 0, p90: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    mean,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    std: Math.sqrt(variance),
    p50: pct(50),
    p90: pct(90),
    p95: pct(95),
  };
}

interface ImportResult {
  inserted: number;
  rejected: number;
  errors: string[];
}

export default function HistoryPage() {
  const { activeNodeId } = useAetherStore();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [from, setFrom] = useState<string>(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [to,   setTo]   = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    pm25_corrected: true, co2_filtered: true, voc_filtered: false, temp_filtered: false, rh_filtered: false,
  });
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | { error: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getHistory(activeNodeId, new Date(from).toISOString(), new Date(to).toISOString());
      setRows(data as HistoryRow[]);
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void fetchData(); /* initial */ // eslint-disable-next-line
  }, [activeNodeId]);

  const summaries = useMemo(() => {
    return CHANNELS.map((c) => ({
      ...c,
      stats: stats(rows.map((r) => Number(r[c.key as keyof HistoryRow]))),
    }));
  }, [rows]);

  const downloadExport = async (kind: 'csv' | 'xlsx') => {
    setExporting(kind);
    setExportError(null);
    try {
      await api.downloadExport(kind, activeNodeId, new Date(from).toISOString(), new Date(to).toISOString());
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const handleUpload = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.importCsv(file, activeNodeId);
      if (result.ok && result.data) {
        setImportResult(result.data as ImportResult);
        await fetchData();
      } else {
        setImportResult({ error: result.message ?? `Import failed (${result.status})` });
      }
    } catch (err) {
      setImportResult({ error: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Historical Data</h1>
        <p className="text-xs text-secondary mt-0.5">Custom range exploration · CSV/Excel export · CSV import</p>
      </div>

      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={16} className="text-aether-400" />
          <label className="flex items-center gap-2 text-xs text-secondary">
            From
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-surface-2 border border-theme rounded-lg px-2 py-1.5 text-xs text-primary font-data"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-secondary">
            To
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-surface-2 border border-theme rounded-lg px-2 py-1.5 text-xs text-primary font-data"
            />
          </label>
          <Button size="sm" variant="primary" onClick={() => void fetchData()}>Apply</Button>
          <Button size="sm" variant="secondary" onClick={() => void downloadExport('csv')} disabled={exporting !== null}>
            <FileText size={14} className="mr-1.5" />
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void downloadExport('xlsx')} disabled={exporting !== null}>
            <FileSpreadsheet size={14} className="mr-1.5" />
            {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
          </Button>
        </div>
        {exportError && (
          <div className="mt-2 text-xs text-orange-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> {exportError}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Upload size={14} className="text-aether-400" />
          <span className="text-xs font-medium text-secondary uppercase tracking-wide">Import CSV</span>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleUpload(file);
          }}
          className={`flex flex-col items-center justify-center gap-1.5 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? 'border-aether-400 bg-aether-500/5'
              : 'border-theme hover:border-aether-500/50'
          }`}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />
          <Upload size={20} className="text-muted" />
          <div className="text-xs text-secondary">
            {importing
              ? 'Importing… running pipeline on each row'
              : <>Drop a CSV here or click to upload — target node <span className="font-data text-primary">{activeNodeId}</span></>}
          </div>
          <div className="text-[10px] text-muted">
            Required columns: timestamp, pm25, co2, tvoc, temp, rh (pressure optional)
          </div>
        </label>
        {importResult && 'inserted' in importResult && (
          <div className="mt-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
            <div className="text-green-400 font-semibold">
              Inserted {importResult.inserted} rows · rejected {importResult.rejected}
            </div>
            {importResult.errors.length > 0 && (
              <ul className="mt-1.5 text-orange-400 space-y-0.5">
                {importResult.errors.map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            )}
          </div>
        )}
        {importResult && 'error' in importResult && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {importResult.error}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">Multi-Parameter Chart</div>
          <div className="flex items-center gap-2 flex-wrap">
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                onClick={() => setEnabled((prev) => ({ ...prev, [c.key]: !prev[c.key] }))}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors"
                style={{
                  borderColor: enabled[c.key] ? c.color : 'var(--border)',
                  backgroundColor: enabled[c.key] ? c.color + '15' : 'transparent',
                  color: enabled[c.key] ? c.color : 'var(--text-muted)',
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="h-72 flex items-center justify-center"><Spinner size="md" /></div>
        ) : rows.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-xs text-muted">
            No data in selected range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatChartTime}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12,
                }}
                labelFormatter={(t) => formatChartTime(t as string)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CHANNELS.filter((c) => enabled[c.key]).map((c) => (
                <Line
                  key={c.key}
                  type="monotone"
                  dataKey={c.key}
                  name={c.label}
                  stroke={c.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {summaries.map((s) => (
          <Card key={s.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} style={{ color: s.color }} />
              <span className="text-xs font-medium text-secondary">{s.label}</span>
            </div>
            <div className="font-data text-2xl font-bold text-primary">{s.stats.mean.toFixed(1)}</div>
            <div className="text-xs text-muted">{s.unit} · mean</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-2 border-t border-theme font-data">
              <div className="text-muted">min</div><div className="text-primary text-right">{s.stats.min.toFixed(1)}</div>
              <div className="text-muted">max</div><div className="text-primary text-right">{s.stats.max.toFixed(1)}</div>
              <div className="text-muted">std</div><div className="text-primary text-right">{s.stats.std.toFixed(1)}</div>
              <div className="text-muted">P50</div><div className="text-primary text-right">{s.stats.p50.toFixed(1)}</div>
              <div className="text-muted">P90</div><div className="text-primary text-right">{s.stats.p90.toFixed(1)}</div>
              <div className="text-muted">P95</div><div className="text-primary text-right">{s.stats.p95.toFixed(1)}</div>
            </div>
          </Card>
        ))}
      </motion.div>
    </motion.div>
  );
}
