import { memo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { useDashboard } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const Analytics = memo(function Analytics() {
  const { data, isLoading } = useDashboard();

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-white flex items-center gap-2"
      >
        <BarChart3 className="w-6 h-6 text-primary-400" />
        System Analytics
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-8 flex flex-col border border-surface-800"
      >
          <h2 className="text-lg text-white font-bold mb-8 tracking-wide">Aggregated Telemetry Data</h2>
          <div className="space-y-6 max-w-lg">
             <div className="flex justify-between items-center border-b border-surface-800/50 pb-4">
                <span className="text-surface-400 tracking-wide">Total Lifecycle Shipments</span>
                <span className="text-white font-mono text-xl">{data?.total_shipments || 0}</span>
             </div>
             <div className="flex justify-between items-center border-b border-surface-800/50 pb-4">
                <span className="text-surface-400 tracking-wide">Active High-Risk Entities</span>
                <span className="text-red-400 font-mono text-xl">{data?.active_disruptions || 0}</span>
             </div>
             <div className="flex justify-between items-center border-b border-surface-800/50 pb-4">
                <span className="text-surface-400 tracking-wide">System Avg Risk Coefficient</span>
                <span className="text-yellow-400 font-mono text-xl">{data?.avg_risk_score?.toFixed(2) || "0.00"}</span>
             </div>
          </div>
      </motion.div>
    </div>
  );
});

export default Analytics;
