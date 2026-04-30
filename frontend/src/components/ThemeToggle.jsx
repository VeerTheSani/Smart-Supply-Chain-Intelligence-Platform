import React, { useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const btnRef = useRef(null);

  const handleClick = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    toggleTheme(rect);
  };

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className="p-2 rounded-xl bg-theme-secondary border border-theme hover:bg-theme-tertiary transition-all duration-200 cursor-pointer overflow-hidden relative"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={theme}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-warning-500" />
          ) : (
            <Moon className="w-5 h-5 text-accent" />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
};

export default ThemeToggle;
