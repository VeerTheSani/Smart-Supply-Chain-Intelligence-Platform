import { memo, useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, ShieldAlert, Navigation, Search, Filter, Plus, Pencil, Trash2, X, ChevronDown, Eye } from 'lucide-react';
import { useShipments, useDeleteShipment } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import { useUIStore } from '../stores/uiStore';
import { useCountdownStore } from '../stores/countdownStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import CreateShipmentModal from '../components/ui/CreateShipmentModal';
import EditShipmentModal from '../components/ui/EditShipmentModal';
import RerouteModal from '../components/ui/RerouteModal';
import CountdownBar from '../components/ui/CountdownBar';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

const STATUS_FILTERS = ['all', 'planned', 'in_transit', 'rerouting', 'delivered', 'delayed'];

const riskBadgeClass = (level) => {
  switch (level) {
    case 'high':
    case 'critical': return 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse';
    case 'medium': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    default: return 'bg-green-500/10 text-green-400 border border-green-500/20';
  }
};

const statusBadgeClass = (status) => {
  switch (status) {
    case 'delivered': return 'bg-green-500/10 text-green-400 border border-green-500/20';
    case 'in_transit': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    case 'rerouting': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    case 'delayed': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
    default: return 'bg-theme-tertiary text-theme-secondary border border-theme';
  }
};

const Shipments = memo(function Shipments() {
  const { isLoading, error } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);
  const countdowns = useCountdownStore(state => state.countdowns);
  const deleteMutation = useDeleteShipment();
  const { inspectingShipmentId, setInspectingShipmentId } = useUIStore();

  const [showCreate, setShowCreate] = useState(false);
  const [editShipment, setEditShipment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rerouteId, setRerouteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const filterRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredShipments = useMemo(() => {
    let list = shipments ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.tracking_number?.toLowerCase().includes(q) ||
        s.origin?.toLowerCase().includes(q) ||
        s.destination?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }
    return list;
  }, [shipments, searchQuery, statusFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`Shipment ${deleteTarget.tracking_number} removed.`);
    } catch {
      toast.error('Failed to delete shipment.');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Active countdowns to show at top
  const activeCountdownIds = Object.keys(countdowns);

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4">
        <LoadingSpinner />
        <p className="text-theme-secondary text-sm tracking-widest uppercase font-bold animate-pulse">
          Loading Route Architectures...
        </p>
      </div>
    );
  }
  if (error) return <ErrorFallback error={error} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-theme-primary flex items-center gap-2 tracking-tight"
        >
          <Package className="w-6 h-6 text-accent" />
          Shipment Core
        </motion.h1>

        <div className="flex w-full sm:w-auto items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search ID, Origin, Dest..."
              className="w-full bg-theme-secondary border border-theme rounded-xl py-2 pl-10 pr-4 text-sm text-theme-primary focus:ring-2 focus:ring-accent focus:outline-none transition-all"
            />
          </div>

          {/* Status filter */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors cursor-pointer',
                statusFilter !== 'all'
                  ? 'bg-accent/10 border-accent/40 text-accent'
                  : 'bg-theme-secondary border-theme text-theme-primary hover:bg-theme-tertiary'
              )}
            >
              <Filter className="w-4 h-4" />
              {statusFilter === 'all' ? 'Filter' : statusFilter.replace('_', ' ')}
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showFilterMenu && 'rotate-180')} />
            </button>

            <AnimatePresence>
              {showFilterMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-44 bg-theme-secondary border border-theme rounded-xl shadow-xl z-30 overflow-hidden"
                >
                  {STATUS_FILTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => { setStatusFilter(s); setShowFilterMenu(false); }}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                        statusFilter === s
                          ? 'bg-accent/10 text-accent'
                          : 'text-theme-primary hover:bg-theme-tertiary'
                      )}
                    >
                      {s === 'all' ? 'All statuses' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* New shipment */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Shipment
          </button>
        </div>
      </div>

      {/* Active countdown alerts at top */}
      {activeCountdownIds.length > 0 && (
        <div className="space-y-2">
          {activeCountdownIds.map(sid => (
            <CountdownBar key={sid} shipmentId={sid} />
          ))}
        </div>
      )}

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-theme-secondary rounded-2xl overflow-hidden border border-theme shadow-lg"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-theme-tertiary text-theme-secondary text-xs uppercase tracking-widest">
                <th className="py-4 px-6 font-semibold">Tracking ID</th>
                <th className="py-4 px-6 font-semibold">Route</th>
                <th className="py-4 px-6 font-semibold">Status</th>
                <th className="py-4 px-6 font-semibold">Environment</th>
                <th className="py-4 px-6 font-semibold text-center">Risk Intel</th>
                <th className="py-4 px-6 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme">
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-theme-secondary">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Package className="w-10 h-10 opacity-30" />
                      <span className="text-sm font-medium uppercase tracking-widest">
                        {searchQuery || statusFilter !== 'all' ? 'No shipments match your filters.' : 'No active shipments in system.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredShipments.map((shipment) => {
                  const riskLevel = shipment.risk?.current?.risk_level || 'low';
                  const riskScore = shipment.risk?.current?.risk_score || 0;
                  const isCritical = riskLevel === 'high' || riskLevel === 'critical';
                  const isWarning = riskLevel === 'medium';
                  const hasCountdown = !!countdowns[shipment.id];

                  return (
                    <tr
                      key={shipment.id}
                      className={cn(
                        'group transition-colors hover:bg-theme-tertiary/50 cursor-pointer',
                        isCritical && 'bg-red-500/5',
                        hasCountdown && 'bg-amber-500/5'
                      )}
                      onClick={() => setInspectingShipmentId(shipment.id)}
                    >
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-semibold text-theme-primary bg-theme-tertiary px-2 py-1 rounded">
                          {shipment.tracking_number}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-theme-secondary">{shipment.origin}</span>
                          <span className="text-theme-secondary font-bold opacity-50">→</span>
                          <span className="text-theme-primary font-medium">{shipment.destination}</span>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide',
                            statusBadgeClass(shipment.status)
                          )}>
                            {shipment.status?.replace('_', ' ')}
                          </span>
                          {hasCountdown && (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.2)]">
                              REROUTING
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-xs text-theme-secondary flex flex-col gap-0.5">
                          {shipment.conditions?.weather && <span>{shipment.conditions.weather}</span>}
                          {shipment.conditions?.traffic && <span className="opacity-60">{shipment.conditions.traffic}</span>}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <div className={cn(
                          'inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold',
                          riskBadgeClass(riskLevel)
                        )}>
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {riskScore.toFixed(0)} ({riskLevel})
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setInspectingShipmentId(shipment.id)}
                            className="text-xs font-bold text-theme-secondary uppercase cursor-pointer hover:text-accent transition-all duration-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-accent/5 border border-transparent hover:border-accent/10"
                          >
                            <Eye className="w-3.5 h-3.5" /> Intel
                          </button>
                          <button
                            onClick={() => setRerouteId(shipment.id)}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-lg shadow-purple-500/20 transition-all hover:scale-105 active:scale-95 uppercase tracking-wider cursor-pointer"
                          >
                            <Navigation className="w-3.5 h-3.5" /> Reroute
                          </button>
                          <button
                            onClick={() => setEditShipment(shipment)}
                            title="Edit shipment"
                            className="p-2 rounded-lg text-theme-secondary hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(shipment)}
                            title="Delete shipment"
                            className="p-2 rounded-lg text-theme-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Modals */}
      <CreateShipmentModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <EditShipmentModal shipment={editShipment} onClose={() => setEditShipment(null)} />
      <RerouteModal shipmentId={rerouteId} onClose={() => setRerouteId(null)} />

      {/* Inline delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-primary/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.18 }}
              className="bg-theme-secondary rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-theme"
            >
              <div className="p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <h2 className="text-lg font-extrabold text-theme-primary">Remove Shipment</h2>
                </div>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="p-2 text-theme-secondary hover:text-theme-primary rounded-xl hover:bg-theme-tertiary cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-theme-secondary text-sm">
                  Permanently remove shipment{' '}
                  <span className="font-mono font-bold text-theme-primary">{deleteTarget.tracking_number}</span>?
                  This action cannot be undone.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2.5 rounded-xl border border-theme text-theme-primary text-sm font-bold hover:bg-theme-tertiary transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {deleteMutation.isPending ? 'Removing...' : 'Confirm Remove'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NOTE: Global ShipmentDetailPanel and DecisionPanel are handled in RootLayout */}
    </div>
  );
});

export default Shipments;
