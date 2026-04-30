import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback((originRect) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const x = originRect ? originRect.left + originRect.width / 2 : window.innerWidth / 2;
    const y = originRect ? originRect.top + originRect.height / 2 : window.innerHeight / 2;

    const isGoingLight = next === 'light';
    const [r, g, b] = isGoingLight ? [59, 130, 246] : [148, 163, 184];

    // ── Set CSS custom properties so the CSS animation knows the origin ──
    document.documentElement.style.setProperty('--vt-x', `${x}px`);
    document.documentElement.style.setProperty('--vt-y', `${y}px`);

    // ── Single water ripple ring ──
    const spawnRings = () => {
      const size = 40;
      const ring = document.createElement('div');
      Object.assign(ring.style, {
        position: 'fixed',
        left: `${x}px`, top: `${y}px`,
        width: `${size}px`, height: `${size}px`,
        marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`,
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: '99999',
        border: `1px solid rgba(${r},${g},${b},0.45)`,
        boxShadow: `0 0 0 0px rgba(${r},${g},${b},0.15)`,
        background: 'transparent',
      });
      document.body.appendChild(ring);
      gsap.to(ring, {
        scale: 40,
        opacity: 0,
        duration: 0.75,
        ease: 'power2.out',
        onComplete: () => ring.remove(),
      });
    };

    // ── View Transition API (Chrome/Edge 111+) ──────────────────────
    if (document.startViewTransition) {
      spawnRings();
      const transition = document.startViewTransition(() => setTheme(next));
      transition.ready.catch(() => {});
    } else {
      // Fallback: instant switch + rings only
      setTheme(next);
      spawnRings();
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
