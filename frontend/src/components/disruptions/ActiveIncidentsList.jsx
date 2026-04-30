const TYPE_STYLE = {
  ACCIDENT:   { badge: 'bg-danger/15 text-danger border-danger/30',       icon: '💥' },
  ROAD_CLOSED:{ badge: 'bg-danger/15 text-danger border-danger/30',       icon: '🚧' },
  JAM:        { badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', icon: '🚗' },
  ROAD_WORKS: { badge: 'bg-warning/15 text-warning border-warning/30',    icon: '⚠️' },
  FLOODING:   { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: '🌊' },
  HAZARD:     { badge: 'bg-warning/15 text-warning border-warning/30',    icon: '⚡' },
};

const SEV_DOT = ['bg-success', 'bg-warning', 'bg-orange-500', 'bg-danger'];

export default function ActiveIncidentsList({ incidents = [] }) {
  if (!incidents || incidents.length === 0) {
    return (
      <p className="text-[11px] text-theme-secondary opacity-60 italic">No active incidents on current route</p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-secondary mb-0.5">Active Incidents</span>
      {incidents.slice(0, 4).map((inc, i) => {
        const st = TYPE_STYLE[inc.type] || { badge: 'bg-theme-tertiary text-theme-secondary border-theme', icon: '📍' };
        return (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs">{st.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${st.badge}`}>
                  {inc.type?.replace(/_/g, ' ')}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[inc.severity] || SEV_DOT[0]}`} title={`Severity ${inc.severity}`} />
              </div>
              {inc.description && (
                <p className="text-[10px] text-theme-secondary mt-0.5 truncate">{inc.description}</p>
              )}
            </div>
          </div>
        );
      })}
      {incidents.length > 4 && (
        <p className="text-[10px] text-theme-secondary opacity-60">+{incidents.length - 4} more incidents</p>
      )}
    </div>
  );
}
