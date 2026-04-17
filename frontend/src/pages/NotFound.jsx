import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, AlertCircle } from 'lucide-react';

const NotFound = memo(function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-6"
      >
        <div className="mx-auto w-20 h-20 rounded-full bg-surface-800/50 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-surface-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold gradient-text">404</h1>
          <p className="text-surface-400">This page doesn't exist</p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-primary 
                     text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Home className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </motion.div>
    </div>
  );
});

export default NotFound;
