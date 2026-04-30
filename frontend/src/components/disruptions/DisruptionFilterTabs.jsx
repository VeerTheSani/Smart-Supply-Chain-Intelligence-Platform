const TABS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'];

const ACTIVE_STYLE = {
  ALL:      'bg-theme-tertiary text-theme-primary border-theme',
  CRITICAL: 'bg-danger/20 text-danger border-danger/40',
  HIGH:     'bg-orange-500/20 text-orange-400 border-orange-500/40',
  MEDIUM:   'bg-warning/20 text-warning border-warning/40',
};

const INACTIVE = 'bg-transparent text-theme-secondary border-transparent hover:text-theme-primary hover:border-theme';

export default function DisruptionFilterTabs({ active, onChange, counts }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map(tab => {
        const count = tab === 'ALL' ? counts.total : counts[tab.toLowerCase()] || 0;
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-200 ${isActive ? ACTIVE_STYLE[tab] : INACTIVE}`}
          >
            {tab}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${isActive ? 'bg-white/10' : 'bg-theme-tertiary'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
