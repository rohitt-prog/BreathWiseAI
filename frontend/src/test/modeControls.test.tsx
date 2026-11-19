import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { useAuthStore } from '../stores/useAuthStore';
import { Navbar } from '../components/layout/Navbar';
import { AppShell } from '../components/layout/AppShell';
import { SettingsPage } from '../features/settings/SettingsPage';
import * as userService from '../services/userService';
import * as firebaseService from '../services/firebase';
import { getAirQualityQueryKey } from '../hooks/useAirQualityQuery';
import { getForecastQueryKey } from '../hooks/useAirQualityForecastQuery';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });

describe('Phase 7.6 — Mode Controls & Final Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = createTestQueryClient();
    useAppStore.setState({
      currentLocationId: 'del_anand_vihar',
      telemetryMode: 'live',
      theme: 'light',
    });
    useAuthStore.setState({
      user: null,
      status: 'unauthenticated',
      isSyncing: false,
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('1. Mode Control State Transitions & Query Isolation', () => {
    it('1.1 toggles telemetryMode in useAppStore between live and demo', () => {
      expect(useAppStore.getState().telemetryMode).toBe('live');

      useAppStore.getState().toggleTelemetryMode();
      expect(useAppStore.getState().telemetryMode).toBe('demo');

      useAppStore.getState().toggleTelemetryMode();
      expect(useAppStore.getState().telemetryMode).toBe('live');

      useAppStore.getState().setTelemetryMode('demo');
      expect(useAppStore.getState().telemetryMode).toBe('demo');
    });

    it('1.2 isolates query keys between live and demo modes for telemetry and forecast queries', () => {
      const liveCurrentKey = getAirQualityQueryKey('del_anand_vihar', 28.65, 77.31, false);
      const demoCurrentKey = getAirQualityQueryKey('del_anand_vihar', 28.65, 77.31, true);

      expect(liveCurrentKey).toEqual(['airQuality', 'del_anand_vihar', 28.65, 77.31, false]);
      expect(demoCurrentKey).toEqual(['airQuality', 'del_anand_vihar', 28.65, 77.31, true]);
      expect(liveCurrentKey).not.toEqual(demoCurrentKey);

      const liveForecastKey = getForecastQueryKey('del_anand_vihar', 28.65, 77.31, false);
      const demoForecastKey = getForecastQueryKey('del_anand_vihar', 28.65, 77.31, true);

      expect(liveForecastKey).toEqual(['airQualityForecast', 'del_anand_vihar', 28.65, 77.31, false]);
      expect(demoForecastKey).toEqual(['airQualityForecast', 'del_anand_vihar', 28.65, 77.31, true]);
      expect(liveForecastKey).not.toEqual(demoForecastKey);
    });
  });

  describe('2. Navbar & AppShell Mode Control Integration', () => {
    it('2.1 Navbar renders Live Mode pill and toggles to Demo Mode on click', async () => {
      useAppStore.setState({ telemetryMode: 'live' });

      renderWithProviders(<Navbar />);

      const toggleBtn = screen.getByTestId('telemetry-mode-toggle');
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent('Live Mode');
      expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to Simulated Demo Mode');

      fireEvent.click(toggleBtn);

      expect(useAppStore.getState().telemetryMode).toBe('demo');
      expect(toggleBtn).toHaveTextContent('Demo Mode');
      expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to Live Telemetry Mode');
    });

    it('2.2 AppShell banner dynamically updates to reflect active operating mode', () => {
      useAppStore.setState({ telemetryMode: 'live' });

      const { rerender } = render(
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      );

      const liveNotice = screen.getByRole('status', { name: /live telemetry notice/i });
      expect(liveNotice).toBeInTheDocument();
      expect(liveNotice).toHaveTextContent(/LIVE TELEMETRY/i);

      // Switch to demo mode
      act(() => {
        useAppStore.setState({ telemetryMode: 'demo' });
      });

      rerender(
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      );

      const demoNotice = screen.getByRole('status', { name: /demo mode notice/i });
      expect(demoNotice).toBeInTheDocument();
      expect(demoNotice).toHaveTextContent(/DEMO MODE/i);
      expect(demoNotice).toHaveTextContent(/Simulated environmental data/i);
    });
  });

  describe('3. SettingsPage Mode Controls & Carry-Forward Bug Resolution', () => {
    it('3.1 SettingsPage allows switching operating mode via mode cards', () => {
      useAppStore.setState({ telemetryMode: 'live' });

      renderWithProviders(<SettingsPage />);

      const demoCard = screen.getByTestId('settings-mode-demo');
      fireEvent.click(demoCard);
      expect(useAppStore.getState().telemetryMode).toBe('demo');

      const liveCard = screen.getByTestId('settings-mode-live');
      fireEvent.click(liveCard);
      expect(useAppStore.getState().telemetryMode).toBe('live');
    });

    it('3.2 Guest user saving in SettingsPage persists locally and never writes to Firestore', async () => {
      const updateCloudSpy = vi.spyOn(userService, 'updateUserPreferencesInCloud');

      useAuthStore.setState({ user: null, status: 'unauthenticated' });

      renderWithProviders(<SettingsPage />);

      // Verify guest footer text
      expect(
        screen.getByText('Settings persist in local session storage (Guest Mode)')
      ).toBeInTheDocument();

      const saveBtn = screen.getByTestId('save-preferences-button');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('save-success-indicator')).toBeInTheDocument();
        expect(screen.getByText(/Preferences saved successfully!/i)).toBeInTheDocument();
        expect(screen.getByText(/Guest Mode: Persisted in local session/i)).toBeInTheDocument();
      });

      expect(updateCloudSpy).not.toHaveBeenCalled();
    });

    it('3.3 Authenticated user awaits cloud write and shows success upon resolution', async () => {
      const updateCloudSpy = vi
        .spyOn(userService, 'updateUserPreferencesInCloud')
        .mockResolvedValueOnce(undefined);

      vi.spyOn(firebaseService, 'isFirebaseConfigured').mockReturnValue(true);

      const testUser = {
        uid: 'user-auth-76',
        email: 'user76@breathewise.ai',
        displayName: 'Mode User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user: testUser, status: 'authenticated', isSyncing: false });

      renderWithProviders(<SettingsPage />);

      const saveBtn = screen.getByTestId('save-preferences-button');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(updateCloudSpy).toHaveBeenCalledWith('user-auth-76', expect.anything());
        expect(screen.getByTestId('save-success-indicator')).toBeInTheDocument();
        expect(screen.getByText(/Synced with your BreatheWise cloud account/i)).toBeInTheDocument();
      });
    });

    it('3.4 Cloud save failure displays sanitized error and never displays false success', async () => {
      vi.spyOn(firebaseService, 'isFirebaseConfigured').mockReturnValue(true);

      const permissionError = new Error('Missing or insufficient permissions.');
      (permissionError as any).code = 'permission-denied';

      vi.spyOn(userService, 'updateUserPreferencesInCloud').mockRejectedValueOnce(permissionError);

      const testUser = {
        uid: 'user-err-76',
        email: 'error76@breathewise.ai',
        displayName: 'Error User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user: testUser, status: 'authenticated', isSyncing: false });

      renderWithProviders(<SettingsPage />);

      const saveBtn = screen.getByTestId('save-preferences-button');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('save-error-indicator')).toBeInTheDocument();
      });

      // Assert error message sanitized via mapFirestoreError
      expect(
        screen.getByText(/You do not have permission to access or modify this profile/i)
      ).toBeInTheDocument();

      // Crucial: False success MUST NOT be displayed
      expect(screen.queryByTestId('save-success-indicator')).not.toBeInTheDocument();
    });

    it('3.5 Prevents duplicate save submissions while a save is in progress', async () => {
      vi.spyOn(firebaseService, 'isFirebaseConfigured').mockReturnValue(true);

      let resolveSave: () => void = () => {};
      const slowSavePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });

      const updateCloudSpy = vi
        .spyOn(userService, 'updateUserPreferencesInCloud')
        .mockReturnValueOnce(slowSavePromise);

      const testUser = {
        uid: 'user-dup-76',
        email: 'dup@breathewise.ai',
        displayName: 'Dup User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user: testUser, status: 'authenticated', isSyncing: false });

      renderWithProviders(<SettingsPage />);

      const saveBtn = screen.getByTestId('save-preferences-button');
      fireEvent.click(saveBtn);

      // Verify in-flight saving indicator and disabled button
      expect(screen.getByTestId('save-saving-indicator')).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Attempt duplicate click while in progress
      fireEvent.click(saveBtn);
      expect(updateCloudSpy).toHaveBeenCalledTimes(1);

      // Resolve in-flight save
      resolveSave();

      await waitFor(() => {
        expect(screen.getByTestId('save-success-indicator')).toBeInTheDocument();
      });
      expect(saveBtn).not.toBeDisabled();
    });

    it('3.6 Handles unconfigured Firebase gracefully without crashing', async () => {
      vi.spyOn(firebaseService, 'isFirebaseConfigured').mockReturnValue(false);

      const testUser = {
        uid: 'user-unconf-76',
        email: 'unconf@breathewise.ai',
        displayName: 'Unconfigured User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user: testUser, status: 'authenticated', isSyncing: false });

      renderWithProviders(<SettingsPage />);

      const saveBtn = screen.getByTestId('save-preferences-button');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('save-success-indicator')).toBeInTheDocument();
        expect(screen.getByText(/Cloud sync unconfigured in this environment/i)).toBeInTheDocument();
      });
    });
  });
});
