import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useShipments } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import DisruptionSummaryBar from '../components/disruptions/DisruptionSummaryBar';
import DisruptionFilterTabs from '../components/disruptions/DisruptionFilterTabs';
import DisruptionCard from '../components/disruptions/DisruptionCard';

const RISK_ORDER = { critical: 0, high: 1, medium: 2 };

const Disruptions = memo(function Disruptions() {
  const { isLoading, error } = useShipments();
  const shipments = useShipmentStore(s => s.shipments);
  const [filter, setFilter] = useState('ALL');

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;
  if (error) return <ErrorFallback error={error} />;

  const disrupted = (shipments || [])
    .filter(s => ['critical', 'high', 'medium'].includes(s.risk?.current?.risk_level))
    .sort((a, b) => (RISK_ORDER[a.risk?.current?.risk_level] ?? 9) - (RISK_ORDER[b.risk?.current?.risk_level] ?? 9));

  const filtered = filter === 'ALL'
    ? disrupted
    : disrupted.filter(s => s.risk?.current?.risk_level === filter.toLowerCase());

  const counts = {
    total:    disrupted.length,
    critical: disrupted.filter(s => s.risk?.current?.risk_level === 'critical').length,
    high:     disrupted.filter(s => s.risk?.current?.risk_level === 'high').length,
    medium:   disrupted.filter(s => s.risk?.current?.risk_level === 'medium').length,
  };

  return (
    <div className="space-y-5 bg-theme-primary">
      <div>
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-lg sm:text-xl md:text-2xl font-bold text-theme-primary flex items-center gap-2"
        >
          <AlertTriangle className="w-6 h-6 text-danger" />
          Active Disruptions
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-theme-secondary text-sm mt-1"
        >
          Real-time risk intelligence across your active fleet
        </motion.p>
      </div>

      <DisruptionSummaryBar disrupted={disrupted} />
      <DisruptionFilterTabs active={filter} onChange={setFilter} counts={counts} />

      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-theme-secondary p-10 text-center text-theme-secondary rounded-xl border border-theme"
          >
            {disrupted.length === 0
              ? '✅ Fleet operating optimally — no active disruptions.'
              : `No ${filter.toLowerCase()} disruptions found.`}
          </motion.div>
        ) : (
          filtered.map((shipment, i) => (
            <DisruptionCard key={shipment.id} shipment={shipment} index={i} />
          ))
        )}
      </div>
    </div>
  );
});

export default Disruptions;
