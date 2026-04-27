import axios from 'axios';
import { BASE_URL } from '../config/api';

/**
 * API key for backend authentication.
 * In production, use VITE_API_KEY env var.
 * Falls back to dev key for local development.
 */
const API_KEY = import.meta.env.VITE_API_KEY || 'sc-dev-key-2026';

/**
 * Pre-configured Axios instance for all API calls.
 * Automatically attaches Bearer API key.
 */
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  },
  timeout: 45000,
});

// Response interceptor — handle 401 globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('[API] Unauthorized — check API_KEY');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
