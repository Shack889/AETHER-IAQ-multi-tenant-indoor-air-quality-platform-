'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Map as MapIcon, Cpu, Info } from 'lucide-react';
import { useAetherStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { SpatialZone } from '@aether/shared';
import { getAlertColor, aqiToLevel } from '@/lib/utils';

/** Zones whose VEF confidence falls below this render as inactive/grey. */
const CONFIDENCE_FLOOR = 0.3;

export default function SpatialPage() {
  const { activeNodeId, latestSnapshot } = useAetherStore();
  const [zones, setZones]     = useState<SpatialZone[]>([]);
  const [selected, setSelected] = useState<SpatialZone | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api.getSpatial(activeNodeId)
      .then((d) => setZones(d as SpatialZone[]))
      .catch(() => setZones([]))
      .finally(() => setIsLoading(false));
  }, [activeNodeId, latestSnapshot?.timestamp]);

  if (isLoading && zones.length === 0) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  }

  const nodeX = 0.5;
  const nodeY = 0.5;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Room Spatial</h1>
        <p className="text-xs text-secondary mt-0.5">VEF-modeled AQI distribution across the room</p>
      </div>

      <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <MapIcon size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">2D Heatmap</h3>
            <span className="text-xs text-muted ml-auto">3×3 zones · single-node VEF</span>
          </div>

          <div className="relative aspect-square w-full max-w-2xl mx-auto rounded-2xl border-2 border-theme overflow-hidden bg-surface-2">
            <div className="grid grid-cols-3 grid-rows-3 absolute inset-0 gap-px">
              {zones.map((zone) => {
                const level = aqiToLevel(zone.aqi);
                const color = getAlertColor(level);
                const inactive = !zone.measured && zone.confidence < CONFIDENCE_FLOOR;
                return (
                  <motion.button
                    key={zone.zoneIndex}
                    onClick={() => setSelected(zone)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: zone.zoneIndex * 0.04 }}
                    className="relative flex items-center justify-center group hover:z-10"
                    style={inactive
                      ? { background: 'var(--paper-2, rgba(128,128,128,0.08))' }
                      : { background: zone.measured ? `${color}30` : `${color}18`, borderColor: color }}
                  >
                    {!inactive && (
                      <div
                        className="absolute inset-0 transition-opacity group-hover:opacity-80"
                        style={{
                          background: `radial-gradient(circle, ${color}90 0%, ${color}20 70%)`,
                          opacity: zone.measured ? 0.5 : 0.22,
                        }}
                      />
                    )}
                    {/* Hatching marks extrapolated zones as model output, not data */}
                    {!zone.measured && !inactive && (
                      <div
                        className="absolute inset-0 pointer-events-none opacity-25"
                        style={{
                          background: `repeating-linear-gradient(45deg, transparent, transparent 6px, ${color} 6px, ${color} 7px)`,
                        }}
                      />
                    )}
                    <div className="relative text-center">
                      <div className={`font-data text-lg font-bold ${inactive ? 'text-muted' : 'text-primary'}`}>
                        {inactive ? '—' : zone.aqi}
                      </div>
                      <div className="text-xs text-muted">AQI</div>
                      {zone.measured ? (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold tracking-wider">
                          MEASURED
                        </span>
                      ) : inactive ? (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-surface-3 text-muted text-[9px] font-semibold tracking-wider">
                          LOW CONF
                        </span>
                      ) : (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-surface-3 text-secondary text-[9px] font-semibold tracking-wider">
                          EST (VEF) · {Math.round(zone.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Sensor node marker */}
            <motion.div
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${nodeX * 100}%`, top: `${nodeY * 100}%` }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-aether-500 border-2 border-white shadow-lg flex items-center justify-center">
                  <Cpu size={14} className="text-white" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-aether-400 animate-[aether-pulse-ring_2s_infinite]" />
              </div>
            </motion.div>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Zone Detail</h3>
          </div>
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted">Zone #{selected.zoneIndex} — ({selected.x.toFixed(2)}, {selected.y.toFixed(2)})</div>
                {selected.measured ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold tracking-wider">
                    MEASURED
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full bg-surface-3 text-secondary text-[9px] font-semibold tracking-wider">
                    EST (VEF) · {Math.round(selected.confidence * 100)}%
                  </span>
                )}
              </div>
              <div className="space-y-2 pt-2 border-t border-theme">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">DEPS AQI</span>
                  <span className="font-data font-semibold" style={{ color: getAlertColor(aqiToLevel(selected.aqi)) }}>
                    {selected.aqi}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">PM2.5</span>
                  <span className="font-data text-primary">{selected.pm25.toFixed(1)} µg/m³</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">CO₂</span>
                  <span className="font-data text-primary">{selected.co2} ppm</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">VOC</span>
                  <span className="font-data text-primary">{selected.voc} idx</span>
                </div>
              </div>
              <div className="text-xs text-muted pt-2 border-t border-theme">
                {selected.measured
                  ? 'Direct sensor measurement — this zone contains the node.'
                  : `Model estimate via 30% distance-decay VEF (confidence ${Math.round(selected.confidence * 100)}%). Not a measurement.`}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted py-4 text-center">
              Click a zone on the heatmap to see estimated values.
            </div>
          )}
        </Card>
      </motion.div>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-primary">VEF Model Notes</h3>
        </div>
        <ul className="text-xs text-secondary space-y-1.5">
          <li>• Exactly one zone per node is a direct <span className="text-emerald-400 font-medium">measurement</span>; the other zones are VEF <span className="text-primary">model estimates</span> (hatched, with confidence %).</li>
          <li>• Single-node deployments use a 3×3 grid with 30% distance-decay from the node position.</li>
          <li>• Zones with confidence below {Math.round(CONFIDENCE_FLOOR * 100)}% render inactive — too far from the node to estimate responsibly.</li>
          <li>• Multi-node deployments switch to Inverse Distance Weighting (IDW) interpolation between measured zones (Phase II).</li>
          <li>• Heatmap updates each time a new sensor reading arrives.</li>
        </ul>
      </Card>
    </motion.div>
  );
}
