import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Handle Vercel/Vite chunk loading errors on new deployments
window.addEventListener('error', (e) => {
  if (e.message?.includes('Loading chunk') || e.message?.includes('CSS_CHUNK_LOAD_FAILED')) {
    window.location.reload();
  }
}, true);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
