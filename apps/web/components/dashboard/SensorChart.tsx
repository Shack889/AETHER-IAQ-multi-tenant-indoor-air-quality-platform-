'use client';

import React, { memo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { formatChartTime } from '@/lib/utils';

interface ChartDataPoint {
  timestamp: string;
  value: number;
}

interface SensorChartProps {
  data: ChartDataPoint[];
  color: string;
  label: string;
  unit: string;
  thresholdValue?: number;
  thresholdLabel?: string;
  height?: number;
  yDomain?: [number | 'auto', number | 'auto'];
}

const CustomTooltip = ({
  active, payload, label, unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="text-xs rounded-lg px-3 py-2"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <div className="text-muted mb-1">{label}</div>
      <div className="font-bold text-primary">
        {payload[0].value.toFixed(1)} {unit}
      </div>
    </div>
  );
};

export const SensorChart = memo(function SensorChart({
  data,
  color,
  label,
  unit,
  thresholdValue,
  thresholdLabel,
  height = 180,
  yDomain = ['auto', 'auto'],
}: SensorChartProps) {
  const gradientId = `grad-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div>
      <div className="text-xs font-medium text-secondary mb-3 uppercase tracking-wide">{label}</div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatChartTime}
            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                active={props.active}
                payload={props.payload as Array<{ value: number }>}
                label={props.label as string}
                unit={unit}
              />
            )}
          />
          {thresholdValue && (
            <ReferenceLine
              y={thresholdValue}
              stroke="#ef4444"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{
                value: thresholdLabel ?? `${thresholdValue} ${unit}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#ef4444',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            animationDuration={800}
            animationEasing="ease-out"
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
