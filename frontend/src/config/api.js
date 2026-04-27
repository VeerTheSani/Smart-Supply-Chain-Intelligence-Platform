const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Configured base API URL for all requests.
 * Ensures trailing slash consistency.
 */
export const BASE_URL = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;

/**
 * WebSocket URL derived from the API URL.
 */
export const WS_URL = BASE_URL.replace(/^http/, 'ws');

/**
 * API endpoints map — single source of truth for all routes.
 */
export const ENDPOINTS = {
  // Auth
  LOGIN: '/api/auth/login',
  REGISTER: '/api/auth/register',
  ME: '/api/auth/me',

  // Shipments
  SHIPMENTS: '/api/shipments',
  SHIPMENT_BY_ID: (id) => `/api/shipments/${id}`,

  // Risk
  RISK_SCORES: '/api/risk/scores',
  RISK_BY_SHIPMENT: (id) => `/api/risk/shipments/${id}`,

  // Routes
  ROUTES: '/api/routes',
  ROUTE_OPTIMIZE: '/api/routes/optimize',

  // Reroute
  REROUTE_BY_ID: (id) => `/api/reroute/${id}`,
  REROUTE_SCORE: (id) => `/api/reroute/${id}/score`,

  // Disruptions
  DISRUPTIONS: '/api/disruptions',
  DISRUPTION_BY_ID: (id) => `/api/disruptions/${id}`,

  // Cascade Dependencies
  CASCADE_BY_SHIPMENT: (id) => `/api/shipments/${id}/cascade`,

  // Countdown
  COUNTDOWNS: '/api/countdowns',
  COUNTDOWN_CANCEL: (id) => `/api/countdown/${id}/cancel`,

  // Analytics
  ANALYTICS_OVERVIEW: '/api/analytics/overview',
  ANALYTICS_TRENDS: '/api/analytics/trends',

  // Notifications
  NOTIFICATIONS: '/api/notifications',
  NOTIFICATION_READ: (id) => `/api/notifications/${id}/read`,
  NOTIFICATION_MARK_ALL_READ: '/api/notifications/mark-all-read',

  // Real-time
  WS_UPDATES: '/ws/updates',
};
