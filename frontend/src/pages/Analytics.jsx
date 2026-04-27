import { memo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Activity, ShieldAlert, Route, Zap } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';

const COLORS = {
  low: '#10b981',    // green-500
  medium: '#eab308', // yellow-500
  high: '#f97316',   // orange-500
  critical: '#ef4444', // red-500
  unknown: '#64748b' // slate-500
};

const STATUS_COLORS = {
  planned: '#3b82f6',
  in_transit: '#10b981',
  rerouting: '#eab308',
  delivered: '#64748b',
  delayed: '#ef4444'
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-theme-secondary/90 border border-theme p-3 rounded-lg shadow-xl backdrop-blur-md">
        <p className="text-theme-primary font-bold mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-theme-secondary">{entry.name}:</span>
            <span className="text-theme-primary font-mono">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const Analytics = memo(function Analytics() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;
  if (error) return <ErrorFallback error={error} />;

  // Prepare Risk Distribution Data
  const riskDistribution = Object.entries(data?.risk_counts || {})
    .filter(([key]) => key !== 'unknown')
    .map(([key, value]) => ({
      name: key.toUpperCase(),
      value,
      color: COLORS[key] || COLORS.unknown
    }));

  // Prepare Status Distribution Data
  const statusDistribution = Object.entries(data?.status_counts || {}).map(([key, value]) => ({
    name: key.replace('_', ' ').toUpperCase(),
    value,
    color: STATUS_COLORS[key] || COLORS.unknown
  }));

  // Prepare Risk Trend Data (averaging risk across time using shipment history)
  let trendDataMap = {};
  if (data?.shipments) {
    data.shipments.forEach(shipment => {
      if (shipment.risk?.history) {
        shipment.risk.history.forEach((hist) => {
           if (!hist.timestamp) return;
           const date = new Date(hist.timestamp);
           const timeKey = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
           
           if (!trendDataMap[timeKey]) {
             trendDataMap[timeKey] = { time: timeKey, totalRisk: 0, count: 0 };
           }
           trendDataMap[timeKey].totalRisk += hist.risk_score;
           trendDataMap[timeKey].count += 1;
        });
      }
    });
  }
  const riskTrendData = Object.values(trendDataMap)
    .sort((a,b) => a.time.localeCompare(b.time))
    .map(d => ({
      time: d.time,
      avgRisk: Number((d.totalRisk / d.count).toFixed(1))
    }))
    .slice(-10); // Show last 10 points

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2 tracking-tight">
          <BarChart3 className="w-6 h-6 text-accent" />
          Global Command Analytics
        </h1>
      </motion.div>

      {/* Top Value Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
           { label: 'Total active Shipments', value: data?.total_shipments || 0, icon: Route, color: 'text-blue-500', bg: 'bg-blue-500/10' },
           { label: 'Active Disruptions', value: data?.active_disruptions || 0, icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-500/10' },
           { label: 'Average Risk Score', value: data?.avg_risk_score?.toFixed(1) || '0.0', icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
           { label: 'Optimized Routes', value: data?.optimized_routes || 0, icon: Zap, color: 'text-green-500', bg: 'bg-green-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-theme-secondary rounded-2xl border border-theme p-5 flex items-center gap-4 shadow-sm"
          >
            <div className={`p-3 rounded-xl ${stat.bg}`}>
               <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
               <p className="text-xs uppercase tracking-widest text-theme-secondary font-bold mb-1">{stat.label}</p>
               <p className="text-2xl font-black text-theme-primary font-mono tracking-tight">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Risk Trend Over Time */}
        <motion.div 
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           className="lg:col-span-2 bg-theme-secondary border border-theme rounded-2xl p-6 shadow-sm flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-theme-primary flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              Network Risk Coefficient Trend
            </h3>
            <p className="text-xs text-theme-secondary mt-1">Aggregated mean risk score across all tracked entities.</p>
          </div>
          
          <div className="flex-1 min-h-[300px]">
             {riskTrendData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={riskTrendData}>
                   <defs>
                     <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-theme-tertiary opacity-20" vertical={false} />
                   <XAxis dataKey="time" stroke="currentColor" className="text-theme-secondary text-xs" tickLine={false} axisLine={false} />
                   <YAxis stroke="currentColor" className="text-theme-secondary text-xs" tickLine={false} axisLine={false} domain={[0, 100]} />
                   <Tooltip content={<CustomTooltip />} />
                   <Area type="monotone" dataKey="avgRisk" name="Avg Risk Score" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" activeDot={{ r: 6, strokeWidth: 0 }} />
                 </AreaChart>
               </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-sm text-theme-secondary">Gathering telemetry...</div>
             )}
          </div>
        </motion.div>

        {/* Risk Distribution */}
        <motion.div 
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.1 }}
           className="bg-theme-secondary border border-theme rounded-2xl p-6 shadow-sm flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-theme-primary flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-accent" />
              Exposure Profile
            </h3>
            <p className="text-xs text-theme-secondary mt-1">Risk severity distribution.</p>
          </div>
          
          <div className="flex-1 min-h-[300px] flex items-center justify-center">
            {riskDistribution.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
                <div className="text-sm text-theme-secondary">No risk data available</div>
            )}
          </div>
        </motion.div>

        {/* Operational Status */}
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2 }}
           className="lg:col-span-3 bg-theme-secondary border border-theme rounded-2xl p-6 shadow-sm flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-theme-primary flex items-center gap-2">
              <Route className="w-4 h-4 text-accent" />
              Operational Status Matrix
            </h3>
          </div>
          
          <div className="min-h-[250px]">
             {statusDistribution.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={statusDistribution} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" horizontal={false} className="text-theme-tertiary opacity-10" />
                   <XAxis type="number" stroke="currentColor" className="text-theme-secondary text-xs" tickLine={false} axisLine={false} />
                   <YAxis dataKey="name" type="category" stroke="currentColor" className="text-theme-primary text-xs font-bold font-mono" tickLine={false} axisLine={false} width={120} />
                   <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                   <Bar dataKey="value" name="Shipments" radius={[0, 4, 4, 0]} barSize={30}>
                     {statusDistribution.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.color} />
                     ))}
                   </Bar>
                 </BarChart>
               </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-sm text-theme-secondary">Awaiting operations data...</div>
             )}
          </div>
        </motion.div>

      </div>
    </div>
  );
});

export default Analytics;
