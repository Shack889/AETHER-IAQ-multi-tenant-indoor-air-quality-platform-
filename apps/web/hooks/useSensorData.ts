'use client';

import { useEffect, useState } from 'react';
import { useAetherStore } from '@/lib/store';
import { useNodeSource } from '@/hooks/useNodeSource';
import { api } from '@/lib/api';
import type { ProcessedSnapshot, RawReading } from '@aether/shared';

/** Build a zero-valued snapshot so paused-state pages render flat-zero
 *  gauges and charts instead of stale last-known values. */
function zeroedSnapshot(template: ProcessedSnapshot | null, nodeId: string): ProcessedSnapshot {
  return {
    nodeId,
    timestamp: new Date(),
    pm25_filtered: 0, co2_filtered: 0, voc_filtered: 0, temp_filtered: 0, rh_filtered: 0,
    pm25_corrected: 0, crossValidOk: false,
    reliability_pm25: 0, reliability_co2: 0, reliability_voc: 0,
    celi_score: 0, celi_weights: { w_pm: 0, w_co2: 0, w_voc: 0 },
    deps_aqi: 0, epa_aqi: 0,
    profile_used: template?.profile_used ?? 'OFFICE_OPEN',
    direct_burden: 0, interaction_burden: 0, total_burden: 0,
    dominant_interaction: null, interaction_details: [],
    temporal_memory_pm: 0, temporal_memory_co2: 0, temporal_memory_voc: 0,
    cognitive_burden: 0, recovery_status: 'baseline', cpis_instantaneous: 0,
    cpis: 0, ced_pm25: 0, ced_co2: 0, thermal_pmv: 0,
    explanation_text: 'Data sources are paused — enable Mock or Hardware to resume readings.',
    pm25_pred_30m: 0, co2_pred_30m: 0, trend_slope: 0,
    event_type: null, event_confidence: 0, anomaly_score: 0,
    occupancy_est: 0, ventilation_cmd: 'off', pid_output: 0,
    who_pass: null, epa_pass: null, bnaaqs_pass: null,
    ashrae_pass: null, well_pass: null, reset_pass: null,
    alert_level: 0,
  };
}

function zeroedRaw(): RawReading {
  return {
    pm1: 0, pm25: 0, pm10: 0, co2: 0, tvoc: 0,
    temp_bme: 0, rh_bme: 0, pressure: 0,
    temp_scd: 0, rh_scd: 0,
  };
}

export function useSensorData() {
  const { latestSnapshot, latestRaw, chartHistory, activeNodeId } = useAetherStore();
  const { paused } = useNodeSource();
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data on mount
  useEffect(() => {
    async function fetchInitial() {
      try {
        await Promise.all([
          api.getLatest(activeNodeId),
          api.getHistory(activeNodeId),
        ]);
        // Store will be updated when WebSocket connects and sends first update
        setIsLoading(false);
      } catch {
        setIsLoading(false);
      }
    }
    void fetchInitial();
  }, [activeNodeId]);

  // Once WebSocket starts sending data, loading is done
  useEffect(() => {
    if (latestSnapshot) setIsLoading(false);
  }, [latestSnapshot]);

  // Paused: substitute zeros so the dashboard isn't lying about a frozen value.
  if (paused) {
    return {
      snapshot: zeroedSnapshot(latestSnapshot, activeNodeId),
      raw: zeroedRaw(),
      chartHistory: [],
      isLoading: false,
      paused: true,
      nodeId: activeNodeId,
    };
  }

  return {
    snapshot: latestSnapshot,
    raw: latestRaw,
    chartHistory,
    isLoading,
    paused: false,
    nodeId: activeNodeId,
  };
}
