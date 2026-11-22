import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RouteErrorBoundary } from './components/feedback/RouteErrorBoundary';
import { PageLoadingFallback } from './components/feedback/PageLoadingFallback';

// Route-level code splitting via React.lazy with named-export adaptors
const LandingPage = lazy(() =>
  import('./features/landing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const PlannerPage = lazy(() =>
  import('./features/planner/PlannerPage').then((m) => ({ default: m.PlannerPage }))
);
const IndoorAirPage = lazy(() =>
  import('./features/indoor/IndoorAirPage').then((m) => ({ default: m.IndoorAirPage }))
);
const AlternativesPage = lazy(() =>
  import('./features/alternatives/AlternativesPage').then((m) => ({ default: m.AlternativesPage }))
);
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<PageLoadingFallback />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: withSuspense(LandingPage),
      },
      {
        path: 'dashboard',
        element: withSuspense(DashboardPage),
      },
      {
        path: 'planner',
        element: withSuspense(PlannerPage),
      },
      {
        path: 'indoor',
        element: withSuspense(IndoorAirPage),
      },
      {
        path: 'alternatives',
        element: withSuspense(AlternativesPage),
      },
      {
        path: 'settings',
        element: withSuspense(SettingsPage),
      },
      {
        path: '*',
        element: <Navigate to="/dashboard" replace />,
      },
    ],
  },
]);
