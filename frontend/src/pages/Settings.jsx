import { memo } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon } from 'lucide-react';
import SystemHealthPanel from '../components/settings/SystemHealthPanel';
import PlatformInsightsPanel from '../components/settings/PlatformInsightsPanel';
import RiskAlgorithmViewer from '../components/settings/RiskAlgorithmViewer';
import NotificationCenterConfig from '../components/settings/NotificationCenterConfig';

const Settings = memo(function Settings() {
  return (
    <div className="space-y-6 bg-theme-primary">
      <div>
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-lg sm:text-xl md:text-2xl font-bold text-theme-primary flex items-center gap-2"
        >
          <SettingsIcon className="w-6 h-6 text-accent" />
          Platform Control Center
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-theme-secondary text-sm mt-1"
        >
          Live system health, telemetry, and notification preferences
        </motion.p>
      </div>

      {/* Row 1: health full width */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <SystemHealthPanel />
      </motion.div>

      {/* Row 2: insights + notifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <PlatformInsightsPanel />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <NotificationCenterConfig />
        </motion.div>
      </div>

      {/* Row 3: algorithm viewer full width */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <RiskAlgorithmViewer />
      </motion.div>
    </div>
  );
});

export default Settings;
