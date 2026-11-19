import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapFirebaseUser,
  mapFirebaseAuthError,
  loginWithEmail,
  signUpWithEmail,
  loginWithGoogle,
  logoutUser,
  subscribeToAuthState,
} from '../services/authService';
import * as firebaseModule from '../services/firebase';
import * as firebaseAuth from 'firebase/auth';

vi.mock('firebase/auth', () => {
  return {
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
    GoogleAuthProvider: vi.fn().mockImplementation(() => ({
      setCustomParameters: vi.fn(),
    })),
  };
});

describe('Phase 7.4 Auth Service & Firebase Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. mapFirebaseUser', () => {
    it('correctly maps Firebase User object to application AuthUser model', () => {
      const mockUser = {
        uid: 'user-12345',
        email: 'test@breathewise.ai',
        displayName: 'Test User',
        photoURL: 'https://example.com/avatar.jpg',
        isAnonymous: false,
        emailVerified: true,
        providerData: [{ providerId: 'google.com' }],
      } as any;

      const result = mapFirebaseUser(mockUser);
      expect(result).toEqual({
        uid: 'user-12345',
        email: 'test@breathewise.ai',
        displayName: 'Test User',
        photoURL: 'https://example.com/avatar.jpg',
        isAnonymous: false,
        emailVerified: true,
        providerId: 'google.com',
      });
    });

    it('falls back to email prefix when displayName is missing', () => {
      const mockUser = {
        uid: 'user-67890',
        email: 'rohit@breathewise.ai',
        displayName: null,
        photoURL: null,
        isAnonymous: false,
        emailVerified: false,
        providerData: [],
      } as any;

      const result = mapFirebaseUser(mockUser);
      expect(result.displayName).toBe('rohit');
      expect(result.providerId).toBe('password');
    });
  });

  describe('2. mapFirebaseAuthError', () => {
    it('maps known Firebase Auth codes to clear, safe user-facing messages', () => {
      expect(mapFirebaseAuthError({ code: 'auth/invalid-email' })).toBe(
        'Please enter a valid email address.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/user-not-found' })).toBe(
        'Invalid email or password.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/wrong-password' })).toBe(
        'Invalid email or password.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/invalid-credential' })).toBe(
        'Invalid email or password.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/email-already-in-use' })).toBe(
        'An account with this email address already exists. Please sign in instead.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/weak-password' })).toBe(
        'Password must be at least 6 characters long.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' })).toBe(
        'Google sign-in was closed before completion.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/popup-blocked' })).toBe(
        'Google sign-in popup was blocked by your browser. Please allow popups for this site.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/network-request-failed' })).toBe(
        'Network connection error. Please check your internet connection.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/too-many-requests' })).toBe(
        'Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.'
      );
      expect(mapFirebaseAuthError({ code: 'auth/unconfigured' })).toBe(
        'Firebase authentication is not configured in this environment.'
      );
    });

    it('handles unexpected or unknown error objects without crashing', () => {
      expect(mapFirebaseAuthError(null)).toBe('An unknown error occurred.');
      expect(mapFirebaseAuthError({ message: 'Custom server error' })).toBe(
        'Custom server error'
      );
      expect(mapFirebaseAuthError({ code: 'unknown/code', message: 'Firebase: Internal detail' })).toBe(
        'Authentication failed. Please verify your details and try again.'
      );
    });
  });

  describe('3. loginWithEmail', () => {
    it('authenticates user and returns AuthUser when Firebase is configured', async () => {
      const mockAuth = {} as any;
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(mockAuth);

      const fakeUser = {
        uid: 'user-111',
        email: 'alice@breathewise.ai',
        displayName: 'Alice',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
      };

      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
        user: fakeUser,
      } as any);

      const result = await loginWithEmail('alice@breathewise.ai', 'Secret123');

      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        'alice@breathewise.ai',
        'Secret123'
      );
      expect(result.uid).toBe('user-111');
      expect(result.email).toBe('alice@breathewise.ai');
    });

    it('rejects with auth/unconfigured error when Firebase auth is null', async () => {
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(null);

      await expect(loginWithEmail('test@example.com', 'password')).rejects.toMatchObject({
        code: 'auth/unconfigured',
      });
    });
  });

  describe('4. signUpWithEmail', () => {
    it('creates a new user account with validated credentials', async () => {
      const mockAuth = {} as any;
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(mockAuth);

      const fakeUser = {
        uid: 'user-222',
        email: 'bob@breathewise.ai',
        displayName: 'Bob',
        photoURL: null,
        isAnonymous: false,
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      };

      vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue({
        user: fakeUser,
      } as any);

      const result = await signUpWithEmail('bob@breathewise.ai', 'Password123');

      expect(firebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        'bob@breathewise.ai',
        'Password123'
      );
      expect(result.uid).toBe('user-222');
    });

    it('rejects short passwords client-side before calling Firebase', async () => {
      const mockAuth = {} as any;
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(mockAuth);

      await expect(signUpWithEmail('bob@breathewise.ai', '12345')).rejects.toMatchObject({
        code: 'auth/weak-password',
      });
      expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });
  });

  describe('5. loginWithGoogle', () => {
    it('triggers Google popup sign-in and returns AuthUser', async () => {
      const mockAuth = {} as any;
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(mockAuth);

      const fakeUser = {
        uid: 'google-user-333',
        email: 'google@breathewise.ai',
        displayName: 'Google User',
        photoURL: 'https://lh3.googleusercontent.com/photo.jpg',
        isAnonymous: false,
        emailVerified: true,
        providerData: [{ providerId: 'google.com' }],
      };

      vi.mocked(firebaseAuth.signInWithPopup).mockResolvedValue({
        user: fakeUser,
      } as any);

      const result = await loginWithGoogle();

      expect(firebaseAuth.signInWithPopup).toHaveBeenCalledWith(
        mockAuth,
        expect.anything()
      );
      expect(result.uid).toBe('google-user-333');
      expect(result.providerId).toBe('google.com');
    });
  });

  describe('6. logoutUser', () => {
    it('calls Firebase signOut when auth is configured', async () => {
      const mockAuth = {} as any;
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(mockAuth);
      vi.mocked(firebaseAuth.signOut).mockResolvedValue(undefined);

      await logoutUser();

      expect(firebaseAuth.signOut).toHaveBeenCalledWith(mockAuth);
    });

    it('safely handles logout when Firebase is unconfigured', async () => {
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(null);
      await expect(logoutUser()).resolves.toBeUndefined();
      expect(firebaseAuth.signOut).not.toHaveBeenCalled();
    });
  });

  describe('7. subscribeToAuthState and listener cleanup', () => {
    it('invokes callback on state change and returns working unsubscribe function', () => {
      const mockAuth = {} as any;
      vi.spyOn(firebaseModule, 'getFirebaseAuth').mockReturnValue(mockAuth);
      vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(true);

      const unsubscribeMock = vi.fn();
      let listenerCallback: any;

      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, callback: any) => {
        listenerCallback = callback;
        return unsubscribeMock as any;
      });

      const onUserChanged = vi.fn();
      const unsubscribe = subscribeToAuthState(onUserChanged);

      // Verify listener attached
      expect(firebaseAuth.onAuthStateChanged).toHaveBeenCalledWith(mockAuth, expect.any(Function), expect.any(Function));

      // Simulate Firebase emitting authenticated user
      const fakeFirebaseUser = {
        uid: 'user-777',
        email: 'listener@breathewise.ai',
        displayName: 'Listener Test',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
      };
      listenerCallback(fakeFirebaseUser);
      expect(onUserChanged).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-777' }));

      // Simulate Firebase emitting signout (null user)
      listenerCallback(null);
      expect(onUserChanged).toHaveBeenCalledWith(null);

      // Verify unsubscribe cleanup
      unsubscribe();
      expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('falls back to null and returns no-op unsubscribe when unconfigured', () => {
      vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(false);

      const onUserChanged = vi.fn();
      const unsubscribe = subscribeToAuthState(onUserChanged);

      expect(onUserChanged).toHaveBeenCalledWith(null);
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
