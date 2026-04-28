import { memo } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Database, BellRing, Route } from 'lucide-react';

const Settings = memo(function Settings() {
  return (
    <div className="space-y-6 bg-theme-primary">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-lg sm:text-xl md:text-2xl font-bold text-theme-primary flex items-center gap-2"
      >
        <SettingsIcon className="w-6 h-6 text-theme-secondary" />
        System Configurations
      </motion.h1>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-theme-secondary rounded-xl p-6 border border-theme shadow-md">
           <h3 className="text-lg text-theme-primary font-bold mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-accent"/> Database Intelligence</h3>
           <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-accent rounded bg-theme-tertiary border-theme" />
                 <span className="text-theme-secondary group-hover:text-theme-primary transition-colors">Enable Async MongoDB Syncing</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-accent rounded bg-theme-tertiary border-theme" />
                 <span className="text-theme-secondary group-hover:text-theme-primary transition-colors">Retain Historical Risk Arrays</span>
              </label>
           </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-theme-secondary rounded-xl p-6 border border-theme shadow-md">
           <h3 className="text-lg text-theme-primary font-bold mb-4 flex items-center gap-2"><BellRing className="w-5 h-5 text-warning"/> Event Horizon Subscriptions</h3>
           <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-accent rounded bg-theme-tertiary border-theme" />
                 <span className="text-theme-secondary group-hover:text-theme-primary transition-colors">WebSocket Live Broadcasting Enabled</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-accent rounded bg-theme-tertiary border-theme" />
                 <span className="text-theme-secondary group-hover:text-theme-primary transition-colors">Trigger Alert on Critical Severity</span>
              </label>
           </div>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-theme-secondary rounded-xl p-6 border border-theme shadow-md md:col-span-2">
           <h3 className="text-lg text-theme-primary font-bold mb-4 flex items-center gap-2"><Route className="w-5 h-5 text-success"/> Algorithmic Optimization Constraints</h3>
           <div className="space-y-4">
              <div className="space-y-1">
                 <label className="text-theme-secondary text-sm">Risk Bias Weight</label>
                 <input type="range" min="0" max="100" defaultValue="70" readOnly className="w-full accent-accent h-1.5 bg-theme-tertiary rounded-lg appearance-none" />
                 <p className="text-xs text-theme-secondary mt-2 opacity-70">Algorithm strictly favors safer routes, natively bounded to 70% risk vs 30% speed distribution.</p>
              </div>
           </div>
        </motion.div>
      </div>
    </div>
  );
});

export default Settings;
