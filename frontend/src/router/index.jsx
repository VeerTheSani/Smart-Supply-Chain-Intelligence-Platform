import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import RootLayout from '../components/layout/RootLayout';

/**
 * Lazy-loaded page imports — React.lazy + Suspense for code splitting.
 * Each route is a separate chunk for optimal bundle size.
 */
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Shipments = lazy(() => import('../pages/Shipments'));
const Disruptions = lazy(() => import('../pages/Disruptions'));
const Routes = lazy(() => import('../pages/Routes'));
const Analytics = lazy(() => import('../pages/Analytics'));
const Settings = lazy(() => import('../pages/Settings'));
const NotFound = lazy(() => import('../pages/NotFound'));

/**
 * Application router — React Router v6 with data router pattern.
 * All page routes are lazy loaded for performance.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'shipments', element: <Shipments /> },
      { path: 'disruptions', element: <Disruptions /> },
      { path: 'routes', element: <Routes /> },
      { path: 'analytics', element: <Analytics /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
