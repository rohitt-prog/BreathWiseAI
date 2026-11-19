import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppStore } from '../stores/useAppStore';
import { DEFAULT_USER_PREFERENCES } from '../types/user';
import { SettingsPage } from '../features/settings/SettingsPage';
import * as userService from '../services/userService';
import * as firebaseModule from '../services/firebase';

vi.mock('../services/userService', () => ({
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserPreferencesInCloud: vi.fn(),
  mapFirestoreError: vi.fn(),
}));

describe('Phase 7.5 Firestore Preference Synchronization & Guest Isolation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(true);

    // Reset stores to fresh initial state
    useAuthStore.setState({
      user: null,
      status: 'unauthenticated',
      error: null,
      isAuthModalOpen: false,
      authModalMode: 'login',
      isConfigured: true,
      isSyncing: false,
      lastSyncedUid: null,
    });

    useAppStore.setState({
      currentLocationId: 'del_anand_vihar',
      theme: 'light',
      userPreferences: DEFAULT_USER_PREFERENCES,
      isLocationModalOpen: false,
      isExplanationModalOpen: false,
      activeExplanationContext: null,
    });
  });

  describe('1. Cloud Preference Hydration on Login', () => {
    it('loads existing cloud preferences and updates application store', async () => {
      const mockCloudDoc = {
        profile: {
          displayName: 'Alice Cloud',
          email: 'alice@breathewise.ai',
          photoURL: null,
        },
        preferences: {
          ...DEFAULT_USER_PREFERENCES,
          personaType: 'outdoor_worker' as const,
          hasSensitiveMembers: false,
          theme: 'dark' as const,
        },
      };

      vi.mocked(userService.getUserProfile).mockResolvedValue(mockCloudDoc as any);

      const authUser = {
        uid: 'user-alice-123',
        email: 'alice@breathewise.ai',
        displayName: 'Alice Cloud',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user: authUser });
      await useAuthStore.getState().syncUserProfile(authUser);

      expect(userService.getUserProfile).toHaveBeenCalledWith('user-alice-123');
      expect(useAppStore.getState().userPreferences.personaType).toBe('outdoor_worker');
      expect(useAppStore.getState().userPreferences.hasSensitiveMembers).toBe(false);
      expect(useAppStore.getState().theme).toBe('dark');
      expect(useAuthStore.getState().isSyncing).toBe(false);
    });

    it('creates initial profile in Firestore when returning null for first-time user', async () => {
      vi.mocked(userService.getUserProfile).mockResolvedValue(null);
      vi.mocked(userService.createUserProfile).mockResolvedValue(undefined);

      const authUser = {
        uid: 'user-newbie-456',
        email: 'newbie@breathewise.ai',
        displayName: 'New User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'google.com',
      };

      useAuthStore.setState({ user: authUser });
      await useAuthStore.getState().syncUserProfile(authUser);

      expect(userService.getUserProfile).toHaveBeenCalledWith('user-newbie-456');
      expect(userService.createUserProfile).toHaveBeenCalledWith(
        'user-newbie-456',
        {
          displayName: 'New User',
          email: 'newbie@breathewise.ai',
          photoURL: null,
        },
        expect.objectContaining({
          personaType: 'student',
          theme: 'light',
        })
      );
      expect(useAuthStore.getState().isSyncing).toBe(false);
    });
  });

  describe('2. Account Switching & Stale-Write Prevention', () => {
    it('discards in-flight cloud data if user switches accounts before read finishes', async () => {
      let resolveFirstUser: (val: any) => void = () => {};
      const pendingPromise = new Promise((resolve) => {
        resolveFirstUser = resolve;
      });

      vi.mocked(userService.getUserProfile).mockImplementation(() => pendingPromise as any);

      const userA = {
        uid: 'user-A',
        email: 'userA@breathewise.ai',
        displayName: 'User A',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user: userA });

      // Start sync for User A
      const syncPromise = useAuthStore.getState().syncUserProfile(userA);

      // User switches to User B while User A's read is in flight
      const userB = {
        uid: 'user-B',
        email: 'userB@breathewise.ai',
        displayName: 'User B',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };
      useAuthStore.setState({ user: userB });

      // Now User A's read finishes with custom preferences
      resolveFirstUser({
        profile: { displayName: 'User A', email: 'userA@breathewise.ai', photoURL: null },
        preferences: { ...DEFAULT_USER_PREFERENCES, personaType: 'outdoor_worker' },
      });

      await syncPromise;

      // User A's preferences must NOT have been applied to the store!
      expect(useAppStore.getState().userPreferences.personaType).toBe('student');
    });

    it('prevents saving preferences to cloud while initial sync is in progress', async () => {
      const user = {
        uid: 'user-syncing',
        email: 'sync@breathewise.ai',
        displayName: 'Sync User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user, isSyncing: true });

      await useAuthStore.getState().savePreferencesToCloud({ personaType: 'family' });

      // Cloud write must be blocked while syncing to prevent overwriting cloud data with local defaults
      expect(userService.updateUserPreferencesInCloud).not.toHaveBeenCalled();
    });

    it('saves updated preferences to cloud when authenticated and not syncing', async () => {
      const user = {
        uid: 'user-active',
        email: 'active@breathewise.ai',
        displayName: 'Active User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user, isSyncing: false });
      useAppStore.setState({ theme: 'dark' });

      await useAuthStore.getState().savePreferencesToCloud({ personaType: 'family' });

      expect(userService.updateUserPreferencesInCloud).toHaveBeenCalledWith(
        'user-active',
        expect.objectContaining({
          personaType: 'family',
          theme: 'dark',
        })
      );
    });
  });

  describe('3. Sign-Out & Guest Isolation', () => {
    it('resets user preferences to default upon sign-out without resetting location', async () => {
      // User is authenticated with custom preferences
      useAuthStore.setState({
        user: {
          uid: 'user-custom',
          email: 'custom@breathewise.ai',
          displayName: 'Custom User',
          photoURL: null,
          isAnonymous: false,
          emailVerified: true,
          providerId: 'password',
        },
        status: 'authenticated',
      });

      useAppStore.setState({
        userPreferences: {
          ...DEFAULT_USER_PREFERENCES,
          personaType: 'outdoor_worker',
          hasSensitiveMembers: false,
        },
        currentLocationId: 'custom-station-id',
      });

      await useAuthStore.getState().signOut();

      // Preferences must be reset to guest defaults
      expect(useAppStore.getState().userPreferences.personaType).toBe('student');
      expect(useAppStore.getState().userPreferences.hasSensitiveMembers).toBe(true);

      // Current location selection must be preserved
      expect(useAppStore.getState().currentLocationId).toBe('custom-station-id');
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().status).toBe('unauthenticated');
    });

    it('guest user modifying settings in SettingsPage never triggers cloud write', async () => {
      // Ensure in guest mode
      useAuthStore.setState({ user: null, status: 'unauthenticated' });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify guest footer text
      expect(
        screen.getByText('Settings persist in local session storage (Guest Mode)')
      ).toBeInTheDocument();

      // Submit preferences form
      const saveBtn = screen.getByRole('button', { name: /save preferences/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Preferences saved successfully!')).toBeInTheDocument();
      });

      // Assert zero cloud write calls
      expect(userService.updateUserPreferencesInCloud).not.toHaveBeenCalled();
      expect(userService.createUserProfile).not.toHaveBeenCalled();
    });

    it('authenticated user in SettingsPage shows cloud sync status and calls savePreferencesToCloud', async () => {
      const user = {
        uid: 'user-cloud-1',
        email: 'cloud@breathewise.ai',
        displayName: 'Cloud User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.setState({ user, status: 'authenticated', isSyncing: false });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify cloud synced footer text
      expect(
        screen.getByText('Settings synced with your BreatheWise cloud account')
      ).toBeInTheDocument();

      const saveBtn = screen.getByRole('button', { name: /save preferences/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(userService.updateUserPreferencesInCloud).toHaveBeenCalledWith(
          'user-cloud-1',
          expect.anything()
        );
      });
    });
  });
});
