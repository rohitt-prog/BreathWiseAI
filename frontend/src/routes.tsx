import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RouteErrorBoundary } from './components/feedback/RouteErrorBoundary';
import { LandingPage } from './features/landing/LandingPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { PlannerPage } from './features/planner/PlannerPage';
import { IndoorAirPage } from './features/indoor/IndoorAirPage';
import { AlternativesPage } from './features/alternatives/AlternativesPage';
import { SettingsPage } from './features/settings/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <LandingPage />
      },
      {
        path: 'dashboard',
        element: <DashboardPage />
      },
      {
        path: 'planner',
        element: <PlannerPage />
      },
      {
        path: 'indoor',
        element: <IndoorAirPage />
      },
      {
        path: 'alternatives',
        element: <AlternativesPage />
      },
      {
        path: 'settings',
        element: <SettingsPage />
      },
      {
        path: '*',
        element: <Navigate to="/dashboard" replace />
      }
    ]
  }
]);
