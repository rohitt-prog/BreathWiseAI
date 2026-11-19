import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { AuthUser } from '../types/auth';

/**
 * Maps a Firebase User object to an application AuthUser model.
 */
export const mapFirebaseUser = (user: FirebaseUser): AuthUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
  photoURL: user.photoURL,
  isAnonymous: user.isAnonymous,
  emailVerified: user.emailVerified,
  providerId: user.providerData?.[0]?.providerId || 'password',
});

/**
 * Translates Firebase error codes into clear, user-friendly error messages
 * without leaking internal credentials or stack traces.
 */
export const mapFirebaseAuthError = (error: unknown): string => {
  if (!error) return 'An unknown error occurred.';

  const errObj = error as { code?: string; message?: string };
  const code = errObj.code || '';

  switch (code) {
    case 'auth/unconfigured':
      return 'Firebase authentication is not configured in this environment.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before completion.';
    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled due to a concurrent request.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled in your Firebase console.';
    case 'auth/requires-recent-login':
      return 'This operation is sensitive and requires recent authentication. Please sign in again.';
    default:
      if (errObj.message && !errObj.message.includes('Firebase:')) {
        return errObj.message;
      }
      return 'Authentication failed. Please verify your details and try again.';
  }
};

/**
 * Signs in an existing user with email and password.
 */
export const loginWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  const auth = getFirebaseAuth();
  if (!auth) {
    const error = new Error('Firebase authentication is not configured.');
    (error as any).code = 'auth/unconfigured';
    throw error;
  }

  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return mapFirebaseUser(credential.user);
};

/**
 * Creates a new user account with email and password.
 */
export const signUpWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  const auth = getFirebaseAuth();
  if (!auth) {
    const error = new Error('Firebase authentication is not configured.');
    (error as any).code = 'auth/unconfigured';
    throw error;
  }

  if (password.length < 6) {
    const error = new Error('Password must be at least 6 characters long.');
    (error as any).code = 'auth/weak-password';
    throw error;
  }

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return mapFirebaseUser(credential.user);
};

/**
 * Signs in or signs up a user using Google Authentication popup.
 */
export const loginWithGoogle = async (): Promise<AuthUser> => {
  const auth = getFirebaseAuth();
  if (!auth) {
    const error = new Error('Firebase authentication is not configured.');
    (error as any).code = 'auth/unconfigured';
    throw error;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  return mapFirebaseUser(credential.user);
};

/**
 * Signs out the currently authenticated user.
 */
export const logoutUser = async (): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
};

/**
 * Subscribes to Firebase Authentication state changes.
 * Returns an unsubscribe callback for clean component teardown.
 */
export const subscribeToAuthState = (
  onUserChanged: (user: AuthUser | null) => void
): (() => void) => {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseConfigured()) {
    // Graceful guest fallback when Firebase is not configured
    onUserChanged(null);
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    (firebaseUser) => {
      if (firebaseUser) {
        onUserChanged(mapFirebaseUser(firebaseUser));
      } else {
        onUserChanged(null);
      }
    },
    (error) => {
      console.warn('[Firebase Auth] State change error:', error);
      onUserChanged(null);
    }
  );
};
