import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';

const STORAGE_KEY = 'sc_notif_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function savePrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-theme/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-theme-primary">{label}</p>
        {desc && <p className="text-[11px] text-theme-secondary mt-0.5 opacity-80">{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-accent' : 'bg-theme-tertiary'}`}
      >
        <motion.span
          className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
          style={{ margin: 2 }}
          animate={{ x: value ? 16 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

const ALERT_TYPES = [
  { key: 'risk_alert',      label: 'Risk Alerts',          desc: 'Risk level changes on shipments' },
  { key: 'reroute_executed', label: 'Reroute Events',      desc: 'Automatic or manual reroutes'   },
  { key: 'cascade_alert',   label: 'Cascade Propagation',  desc: 'Upstream delay chain alerts'    },
  { key: 'gps_stuck',       label: 'GPS Anomalies',        desc: 'Location stuck / signal lost'   },
];

export default function NotificationCenterConfig() {
  const [prefs, setPrefs] = useState(loadPrefs);

  const set = (key, val) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    savePrefs(next);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
        <Bell className="w-4 h-4 text-accent" /> Notification Preferences
      </h3>
      <div className="card-standard space-y-0">
        <Toggle label="Toast Popups"        desc="Show alert toasts in the corner"            value={prefs.toasts    ?? true}  onChange={v => set('toasts', v)}   />
        <Toggle label="Sound Alerts"        desc="Play a chime on critical alerts"            value={prefs.sound     ?? false} onChange={v => set('sound', v)}    />
        <Toggle label="Desktop Notifications" desc="Browser push (requires permission)"      value={prefs.desktop   ?? false} onChange={v => {
          if (v && 'Notification' in window) Notification.requestPermission();
          set('desktop', v);
        }} />
        <Toggle label="Auto-reroute Banner" desc="Show countdown banner for reroute events"  value={prefs.banner    ?? true}  onChange={v => set('banner', v)}   />
      </div>

      <h4 className="text-xs font-bold text-theme-secondary uppercase tracking-wider pt-1">Muted Alert Types</h4>
      <div className="card-standard space-y-0">
        {ALERT_TYPES.map(at => (
          <Toggle
            key={at.key}
            label={at.label}
            desc={at.desc}
            value={!(prefs[`mute_${at.key}`] ?? false)}
            onChange={v => set(`mute_${at.key}`, !v)}
          />
        ))}
      </div>
    </div>
  );
}
