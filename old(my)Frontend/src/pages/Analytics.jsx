import { memo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';

const Analytics = memo(function Analytics() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;
  if (error) return <ErrorFallback error={error} />;

  return (
    <div className="space-y-6 bg-theme-primary">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-theme-primary flex items-center gap-2"
      >
        <BarChart3 className="w-6 h-6 text-accent" />
        System Analytics
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-theme-secondary rounded-2xl p-8 flex flex-col border border-theme shadow-md"
      >
          <h2 className="text-lg text-theme-primary font-bold mb-8 tracking-wide">Aggregated Telemetry Data</h2>
          <div className="space-y-6 max-w-lg">
             <div className="flex justify-between items-center border-b border-theme pb-4">
                <span className="text-theme-secondary tracking-wide">Total Lifecycle Shipments</span>
                <span className="text-theme-primary font-mono text-xl">{data?.total_shipments || 0}</span>
             </div>
             <div className="flex justify-between items-center border-b border-theme pb-4">
                <span className="text-theme-secondary tracking-wide">Active High-Risk Entities</span>
                <span className="text-danger font-mono text-xl">{data?.active_disruptions || 0}</span>
             </div>
             <div className="flex justify-between items-center border-b border-theme pb-4">
                <span className="text-theme-secondary tracking-wide">System Avg Risk Coefficient</span>
                <span className="text-warning font-mono text-xl">{data?.avg_risk_score?.toFixed(2) || "0.00"}</span>
             </div>
          </div>
      </motion.div>
    </div>
  );
});

export default Analytics;
