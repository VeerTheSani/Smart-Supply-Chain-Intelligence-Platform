import { memo } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Database, BellRing, Route } from 'lucide-react';

const Settings = memo(function Settings() {
  return (
    <div className="space-y-6">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-white flex items-center gap-2"
      >
        <SettingsIcon className="w-6 h-6 text-surface-400" />
        System Configurations
      </motion.h1>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-6 border border-surface-800">
           <h3 className="text-lg text-white font-bold mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-primary-400"/> Database Intelligence</h3>
           <div className="space-y-3">
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-primary-500 rounded bg-surface-900 border-surface-700" />
                 <span className="text-surface-300">Enable Async MongoDB Syncing</span>
              </label>
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-primary-500 rounded bg-surface-900 border-surface-700" />
                 <span className="text-surface-300">Retain Historical Risk Arrays</span>
              </label>
           </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-6 border border-surface-800">
           <h3 className="text-lg text-white font-bold mb-4 flex items-center gap-2"><BellRing className="w-5 h-5 text-yellow-400"/> Event Horizon Subscriptions</h3>
           <div className="space-y-3">
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-primary-500 rounded bg-surface-900 border-surface-700" />
                 <span className="text-surface-300">WebSocket Live Broadcasting Enabled</span>
              </label>
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked readOnly className="form-checkbox text-primary-500 rounded bg-surface-900 border-surface-700" />
                 <span className="text-surface-300">Trigger Alert on Critical Severity</span>
              </label>
           </div>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl p-6 border border-surface-800 md:col-span-2">
           <h3 className="text-lg text-white font-bold mb-4 flex items-center gap-2"><Route className="w-5 h-5 text-green-400"/> Algorithmic Optimization Constraints</h3>
           <div className="space-y-4">
              <div className="space-y-1">
                 <label className="text-surface-400 text-sm">Risk Bias Weight</label>
                 <input type="range" min="0" max="100" defaultValue="70" readOnly className="w-full accent-primary-500" />
                 <p className="text-xs text-surface-500 mt-2">Algorithm strictly favors safer routes, natively bounded to 70% risk vs 30% speed distribution.</p>
              </div>
           </div>
        </motion.div>
      </div>
    </div>
  );
});

export default Settings;
