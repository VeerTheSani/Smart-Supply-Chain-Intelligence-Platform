import { memo, useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
<<<<<<< Updated upstream
import { Package, ShieldAlert, Navigation, Search, Filter, Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react';
=======
import { Package, ShieldAlert, Navigation, Search, Filter, Plus, Pencil, Trash2, X, ChevronDown, Eye } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
>>>>>>> Stashed changes
import { useShipments, useDeleteShipment } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import CreateShipmentModal from '../components/ui/CreateShipmentModal';
import EditShipmentModal from '../components/ui/EditShipmentModal';
import RerouteModal from '../components/ui/RerouteModal';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

const STATUS_FILTERS = ['all', 'planned', 'in_transit', 'rerouting', 'delivered', 'delayed'];

const riskBadgeClass = (level) => {
  switch (level) {
    case 'high':
    case 'critical': return 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse';
    case 'medium':   return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    default:         return 'bg-green-500/10 text-green-400 border border-green-500/20';
  }
};

const statusBadgeClass = (status) => {
  switch (status) {
    case 'delivered':  return 'bg-green-500/10 text-green-400 border border-green-500/20';
    case 'in_transit': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    case 'rerouting':  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    case 'delayed':    return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
    default:           return 'bg-theme-tertiary text-theme-secondary border border-theme';
  }
};

const calculateProgress = (shipment) => {
  if (shipment.status === 'delivered') return 100;
  if (shipment.status === 'planned') return 0;
  
  if (!shipment.created_at || !shipment.expected_travel_seconds) return 0;
  
  const created = new Date(shipment.created_at).getTime();
  const now = Date.now();
  const elapsed = (now - created) / 1000;
  
  const simulatedElapsed = elapsed * 50; 
  const progress = Math.min((simulatedElapsed / shipment.expected_travel_seconds) * 100, 100);
  return progress;
};

const Shipments = memo(function Shipments() {
  const { isLoading, error } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);
  const deleteMutation = useDeleteShipment();

  const [showCreate, setShowCreate]       = useState(false);
  const [editShipment, setEditShipment]   = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [rerouteId, setRerouteId]         = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
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

<<<<<<< Updated upstream
=======
      {/* API Limit Global Banner */}
      <AnimatePresence>
        {(() => {
          const mapplsLimiting = shipments?.some(s => s.road_names?.some(r => r.includes('API-Limit')));
          const weatherLimiting = shipments?.some(s => s.risk?.current?.reason?.includes('Weather data unavailable'));
          if (!mapplsLimiting && !weatherLimiting) return null;

          return (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-4 w-full"
            >
              <div className="p-2.5 bg-red-500/20 rounded-lg shrink-0 mt-1">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest">
                  External Service API {mapplsLimiting && weatherLimiting ? 'Limits' : 'Limit'} Exhausted
                </h3>
                <p className="text-xs text-red-400 mt-1.5 max-w-4xl leading-relaxed">
                  The system detected HTTP `401/403/429` Rate Limit rejections from the following integrated services:
                </p>
                <div className="flex gap-3 mt-2 mb-2">
                  {mapplsLimiting && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/40 rounded-full text-xs font-black text-red-400 tracking-wide">
                      🛑 MAPMYINDIA ROUTING API
                    </span>
                  )}
                  {weatherLimiting && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/40 rounded-full text-xs font-black text-red-400 tracking-wide">
                      ⛈️ OPEN-METEO WEATHER API
                    </span>
                  )}
                </div>
                <p className="text-xs text-red-400/80 max-w-4xl leading-relaxed">
                  <strong className="text-red-400">Resilience Grid Enabled:</strong> Offline fallback mathematical prediction mock engines have been automatically engaged. Tracking is uninterrupted, but metrics are simulated.
                </p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Active countdown alerts at top */}
      {activeCountdownIds.length > 0 && (
        <div className="space-y-2">
          {activeCountdownIds.map(sid => (
            <CountdownBar key={sid} shipmentId={sid} />
          ))}
        </div>
      )}

>>>>>>> Stashed changes
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
                  const riskScore = shipment.risk?.current?.risk_score  || 0;
                  const isCritical = riskLevel === 'high' || riskLevel === 'critical';
                  const isWarning  = riskLevel === 'medium';

                  return (
                    <tr
                      key={shipment.id}
                      className={cn(
                        'group transition-colors hover:bg-theme-tertiary/50',
                        isCritical && 'bg-red-500/5'
                      )}
                    >
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-semibold text-theme-primary bg-theme-tertiary px-2 py-1 rounded">
                          {shipment.tracking_number}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1.5 w-full min-w-[200px]">
                          <div className="flex items-center gap-2 text-sm justify-between">
                            <span className="text-theme-secondary truncate">{shipment.origin}</span>
                            <span className="text-theme-secondary font-bold opacity-50 shrink-0">→</span>
                            <span className="text-theme-primary font-medium truncate text-right">{shipment.destination}</span>
                          </div>
                          {(shipment.distance_km || shipment.eta_hours) ? (
                             <div className="text-[10px] uppercase font-bold tracking-widest text-theme-secondary flex items-center justify-between mt-1">
                               <span>{shipment.distance_km?.toFixed(0) || '0'} km</span>
                               <span>{calculateProgress(shipment).toFixed(0)}%</span>
                               <span>{shipment.eta_hours?.toFixed(1) || '0'}h ETA</span>
                             </div>
                          ) : null}
                          <div className="h-1.5 w-full bg-theme-tertiary rounded-full overflow-hidden mt-0.5">
                             <div className="h-full bg-accent transition-all duration-1000" style={{ width: `${calculateProgress(shipment)}%` }}></div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className={cn(
                          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide',
                          statusBadgeClass(shipment.status)
                        )}>
                          {shipment.status?.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-xs text-theme-secondary flex flex-col gap-0.5">
                          {shipment.conditions?.weather && <span>{shipment.conditions.weather}</span>}
                          {shipment.conditions?.traffic && <span className="opacity-60">{shipment.conditions.traffic}</span>}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className={cn(
                            'inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold',
                            riskBadgeClass(riskLevel)
                          )}>
                            <ShieldAlert className="w-3.5 h-3.5" />
                            {riskScore.toFixed(0)} ({riskLevel})
                          </div>
                          {shipment.risk?.history?.length > 1 && (
                            <div className="h-8 w-24 mx-auto hover:opacity-100 transition-opacity">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={shipment.risk.history.map((h, i) => ({ val: h.risk_score, idx: i }))}>
                                   <defs>
                                     <linearGradient id={`colorRisk-${shipment.id}`} x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor={isCritical ? "#ef4444" : isWarning ? "#eab308" : "#10b981"} stopOpacity={0.3}/>
                                       <stop offset="95%" stopColor={isCritical ? "#ef4444" : isWarning ? "#eab308" : "#10b981"} stopOpacity={0}/>
                                     </linearGradient>
                                   </defs>
                                   <YAxis domain={[0, 100]} hide />
                                   <Area type="monotone" dataKey="val" stroke={isCritical ? "#ef4444" : isWarning ? "#eab308" : "#10b981"} fill={`url(#colorRisk-${shipment.id})`} strokeWidth={2} isAnimationActive={false} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-2">
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
    </div>
  );
});

export default Shipments;
