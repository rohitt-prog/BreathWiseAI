import { create } from 'zustand';
import { AuthUser, AuthStatus, AuthModalMode } from '../types/auth';
import { UserPreferences } from '../types/user';
import { subscribeToAuthState, logoutUser } from '../services/authService';
import { isFirebaseConfigured } from '../services/firebase';
import { getUserProfile, createUserProfile, updateUserPreferencesInCloud } from '../services/userService';
import { useAppStore } from './useAppStore';

let activeAuthUnsubscribe: (() => void) | null = null;

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  isConfigured: boolean;
  isSyncing: boolean;
  lastSyncedUid: string | null;

  setAuthModalOpen: (open: boolean, mode?: AuthModalMode) => void;
  setAuthModalMode: (mode: AuthModalMode) => void;
  setUser: (user: AuthUser | null) => void;
  setError: (error: string | null) => void;
  setStatus: (status: AuthStatus) => void;
  signOut: () => Promise<void>;
  syncUserProfile: (user: AuthUser) => Promise<void>;
  savePreferencesToCloud: (preferencesUpdates?: Partial<UserPreferences>) => Promise<void>;
  initAuth: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  error: null,
  isAuthModalOpen: false,
  authModalMode: 'login',
  isConfigured: isFirebaseConfigured(),
  isSyncing: false,
  lastSyncedUid: null,

  setAuthModalOpen: (open, mode) => {
    set({
      isAuthModalOpen: open,
      authModalMode: mode ?? get().authModalMode,
      error: null, // Clear stale errors on modal open/close
    });
  },

  setAuthModalMode: (mode) => {
    set({
      authModalMode: mode,
      error: null,
    });
  },

  setUser: (user) => {
    const prevUser = get().user;
    set({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      error: null,
    });

    if (user && prevUser?.uid !== user.uid) {
      get().syncUserProfile(user);
    } else if (!user && prevUser) {
      useAppStore.getState().resetPreferencesToDefault();
      set({ isSyncing: false, lastSyncedUid: null });
    }
  },

  setError: (error) => {
    set({ error });
  },

  setStatus: (status) => {
    set({ status });
  },

  signOut: async () => {
    try {
      await logoutUser();
      // Reset user preferences in useAppStore back to initial guest defaults
      useAppStore.getState().resetPreferencesToDefault();
      set({
        user: null,
        status: 'unauthenticated',
        error: null,
        isSyncing: false,
        lastSyncedUid: null,
      });
    } catch (err) {
      console.error('[AuthStore] Sign out error:', err);
    }
  },

  syncUserProfile: async (user: AuthUser) => {
    if (!isFirebaseConfigured() || !user || !user.uid) return;

    set({ isSyncing: true, lastSyncedUid: user.uid });

    try {
      const doc = await getUserProfile(user.uid);

      // Race-condition guard: check if user switched or logged out while read was in flight
      if (get().user?.uid !== user.uid) {
        return;
      }

      if (doc) {
        // Hydrate cloud preferences into application state
        useAppStore.getState().setUserPreferences(doc.preferences);
        if (doc.preferences.theme) {
          useAppStore.getState().setTheme(doc.preferences.theme);
        }
      } else {
        // First-time user: persist existing local defaults to cloud
        const currentPrefs = useAppStore.getState().userPreferences;
        const currentTheme = useAppStore.getState().theme;

        await createUserProfile(
          user.uid,
          {
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
          },
          {
            ...currentPrefs,
            theme: currentTheme,
          }
        );
      }
    } catch (err) {
      console.warn('[AuthStore] Cloud preference sync failed:', err);
    } finally {
      if (get().user?.uid === user.uid) {
        set({ isSyncing: false });
      }
    }
  },

  savePreferencesToCloud: async (preferencesUpdates?: Partial<UserPreferences>) => {
    const currentUser = get().user;
    if (!currentUser || !isFirebaseConfigured() || get().isSyncing) {
      return;
    }

    try {
      const currentPrefs = preferencesUpdates
        ? { ...useAppStore.getState().userPreferences, ...preferencesUpdates }
        : useAppStore.getState().userPreferences;
      const currentTheme = useAppStore.getState().theme;

      // Stale write protection
      if (get().user?.uid !== currentUser.uid) {
        return;
      }

      await updateUserPreferencesInCloud(currentUser.uid, {
        ...currentPrefs,
        theme: currentTheme,
      });
    } catch (err) {
      console.warn('[AuthStore] Saving preferences to cloud failed:', err);
      throw err;
    }
  },

  initAuth: () => {
    if (activeAuthUnsubscribe) {
      return activeAuthUnsubscribe;
    }

    const configured = isFirebaseConfigured();
    set({ isConfigured: configured });

    if (!configured) {
      set({
        user: null,
        status: 'unauthenticated',
        isSyncing: false,
        lastSyncedUid: null,
      });
      return () => {};
    }

    const unsubscribe = subscribeToAuthState(async (user) => {
      const prevUser = get().user;
      set({
        user,
        status: user ? 'authenticated' : 'unauthenticated',
      });

      if (user) {
        if (prevUser?.uid !== user.uid) {
          await get().syncUserProfile(user);
        }
      } else {
        if (prevUser) {
          useAppStore.getState().resetPreferencesToDefault();
        }
        set({ isSyncing: false, lastSyncedUid: null });
      }
    });

    activeAuthUnsubscribe = () => {
      unsubscribe();
      activeAuthUnsubscribe = null;
    };

    return activeAuthUnsubscribe;
  },
}));
