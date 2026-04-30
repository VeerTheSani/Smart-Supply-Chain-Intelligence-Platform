import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity } from 'lucide-react';
import { useShipmentStore } from '../../stores/shipmentStore';

const FACTORS = [
  { key: 'weather',     label: 'Weather'     },
  { key: 'traffic',     label: 'Traffic'     },
  { key: 'events',      label: 'Events'      },
  { key: 'time_buffer', label: 'Time Buffer' },
  { key: 'historical',  label: 'Gemini AI Risk'  },
];

export default function RiskRadarChart() {
  const shipments = useShipmentStore(s => s.shipments);

  const data = FACTORS.map(({ key, label }) => {
    const scores = shipments
      .map(s => s.last_risk_assessment?.breakdown?.[key]?.score ?? 0)
      .filter(v => v > 0);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { factor: label, value: avg, fullMark: 100 };
  });

  const hasData = data.some(d => d.value > 0);

  return (
    <div className="card-standard flex flex-col gap-3 h-full">
      <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
        <Activity className="w-4 h-4 text-accent" /> Network Risk Radar
      </h3>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-theme-secondary opacity-60">Awaiting risk assessments…</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <PolarGrid stroke="var(--border-color)" strokeOpacity={0.6} />
            <PolarAngleAxis
              dataKey="factor"
              tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
            />
            <Radar
              name="Avg Risk"
              dataKey="value"
              stroke="#4d9fff"
              strokeWidth={2}
              fill="rgba(77,159,255,0.18)"
              dot={{ fill: '#4d9fff', r: 3 }}
              isAnimationActive
              animationDuration={900}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                fontSize: 11,
                color: 'var(--text-primary)',
              }}
              formatter={(val) => [`${val}`, 'Avg Score']}
            />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
