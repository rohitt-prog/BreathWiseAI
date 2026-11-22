import type { Firestore } from 'firebase/firestore';
import { getFirebaseDb, initFirestore, isFirebaseConfigured } from './firebase';
import { UserProfileData, PersistedPreferences, UserProfileDocument } from '../types/firestore';
import { DEFAULT_USER_PREFERENCES } from '../types/user';

/**
 * Helper to dynamically load Firestore SDK and obtain the database instance on demand.
 * Checks whether Firestore is already initialized (or provided by test mocks),
 * otherwise initializes it asynchronously.
 */
const loadFirestoreDeps = async () => {
  let db: Firestore | null = getFirebaseDb();
  if (!db) {
    db = await initFirestore();
  }
  if (!db) {
    return null;
  }
  const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
  return { db, doc, getDoc, setDoc, serverTimestamp };
};

/**
 * Sanitizes and maps Firestore errors to safe user-facing error messages
 * without leaking internal database paths or credentials.
 * Pure function: does not require or load the Firestore SDK.
 */
export const mapFirestoreError = (error: unknown): string => {
  if (!error) return 'An unknown database error occurred.';

  const errObj = error as { code?: string; message?: string };
  const code = errObj.code || '';

  switch (code) {
    case 'firestore/unconfigured':
      return 'Firestore is not configured in this environment.';
    case 'permission-denied':
      return 'You do not have permission to access or modify this profile.';
    case 'unavailable':
      return 'Cloud database is currently unreachable. Please check your network connection.';
    case 'not-found':
      return 'User profile was not found.';
    default:
      if (errObj.message && !errObj.message.includes('Firebase:')) {
        return errObj.message;
      }
      return 'Database operation failed. Please try again.';
  }
};

/**
 * Fetches the user profile and preferences document from Firestore on demand.
 * Returns null if unconfigured or if document does not exist.
 */
export const getUserProfile = async (uid: string): Promise<UserProfileDocument | null> => {
  if (!uid || !isFirebaseConfigured()) {
    return null;
  }

  const deps = await loadFirestoreDeps();
  if (!deps) {
    return null;
  }

  const { db, doc, getDoc } = deps;
  const userDocRef = doc(db, 'users', uid);
  const snap = await getDoc(userDocRef);

  if (!snap.exists()) {
    return null;
  }

  const raw = snap.data();

  // Safely normalize preferences against default values in case of schema drift
  const rawPreferences = raw.preferences || {};
  const normalizedPreferences: PersistedPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    ...rawPreferences,
    theme: rawPreferences.theme === 'dark' ? 'dark' : (rawPreferences.theme === 'light' ? 'light' : undefined),
    defaultLocation: {
      ...DEFAULT_USER_PREFERENCES.defaultLocation,
      ...(rawPreferences.defaultLocation || {}),
    },
    commuteTimes: {
      ...DEFAULT_USER_PREFERENCES.commuteTimes,
      ...(rawPreferences.commuteTimes || {}),
    },
    indoorFacilities: {
      ...DEFAULT_USER_PREFERENCES.indoorFacilities,
      ...(rawPreferences.indoorFacilities || {}),
    },
  };

  const normalizedProfile: UserProfileData = {
    displayName: raw.profile?.displayName ?? null,
    email: raw.profile?.email ?? null,
    photoURL: raw.profile?.photoURL ?? null,
  };

  return {
    profile: normalizedProfile,
    preferences: normalizedPreferences,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

/**
 * Creates an initial user document in Firestore on demand with profile data and initial preferences.
 */
export const createUserProfile = async (
  uid: string,
  profile: UserProfileData,
  preferences: PersistedPreferences
): Promise<void> => {
  if (!uid) throw new Error('Cannot create profile without UID.');

  const deps = await loadFirestoreDeps();
  if (!deps || !isFirebaseConfigured()) {
    const error = new Error('Firestore is not configured.');
    (error as any).code = 'firestore/unconfigured';
    throw error;
  }

  const { db, doc, setDoc, serverTimestamp } = deps;
  const userDocRef = doc(db, 'users', uid);

  const initialDoc: UserProfileDocument = {
    profile: {
      displayName: profile.displayName ?? null,
      email: profile.email ?? null,
      photoURL: profile.photoURL ?? null,
    },
    preferences,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(userDocRef, initialDoc);
};

/**
 * Updates a user's preferences in Firestore on demand without overwriting profile or createdAt.
 */
export const updateUserPreferencesInCloud = async (
  uid: string,
  preferencesUpdate: Partial<PersistedPreferences>
): Promise<void> => {
  if (!uid) throw new Error('Cannot update preferences without UID.');

  const deps = await loadFirestoreDeps();
  if (!deps || !isFirebaseConfigured()) {
    const error = new Error('Firestore is not configured.');
    (error as any).code = 'firestore/unconfigured';
    throw error;
  }

  const { db, doc, setDoc, serverTimestamp } = deps;
  const userDocRef = doc(db, 'users', uid);

  await setDoc(
    userDocRef,
    {
      preferences: preferencesUpdate,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};
