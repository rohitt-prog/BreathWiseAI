import { initializeApp, getApps, getApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

/**
 * Validates whether the required Firebase Web SDK environment variables are present
 * and do not contain placeholder values.
 */
export const isFirebaseConfigured = (): boolean => {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    return false;
  }

  // Reject placeholder values from .env.example
  if (apiKey.includes('your_') || projectId.includes('your_')) {
    return false;
  }

  return true;
};

const getFirebaseConfig = (): FirebaseOptions => ({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;
let firestoreInitPromise: Promise<Firestore | null> | null = null;

// Eagerly initialize Firebase App and Auth to prevent UI flicker and maintain session state
if (isFirebaseConfigured()) {
  try {
    firebaseApp = getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApp();
    firebaseAuth = getAuth(firebaseApp);
  } catch (error) {
    console.warn('[Firebase] Initialization failed:', error);
    firebaseApp = null;
    firebaseAuth = null;
  }
}

/**
 * Returns the initialized Firebase App instance, or null if unconfigured.
 */
export const getFirebaseApp = (): FirebaseApp | null => firebaseApp;

/**
 * Returns the initialized Firebase Auth instance, or null if unconfigured.
 */
export const getFirebaseAuth = (): Auth | null => firebaseAuth;

/**
 * Returns the initialized Firestore Database instance, or null if not yet initialized.
 * Synchronous and backward-compatible with existing test spies.
 */
export const getFirebaseDb = (): Firestore | null => firebaseDb;

/**
 * Asynchronously and lazily initializes Firestore on demand.
 * Dynamically imports firebase/firestore only when invoked.
 * Safe against concurrent initialization races.
 */
export const initFirestore = async (): Promise<Firestore | null> => {
  if (!isFirebaseConfigured() || !firebaseApp) {
    return null;
  }

  if (firebaseDb) {
    return firebaseDb;
  }

  if (firestoreInitPromise) {
    return firestoreInitPromise;
  }

  firestoreInitPromise = (async () => {
    try {
      const { getFirestore } = await import('firebase/firestore');
      firebaseDb = getFirestore(firebaseApp);
      return firebaseDb;
    } catch (error) {
      console.warn('[Firebase Firestore] Lazy initialization failed:', error);
      firebaseDb = null;
      return null;
    } finally {
      firestoreInitPromise = null;
    }
  })();

  return firestoreInitPromise;
};

export { firebaseApp, firebaseAuth, firebaseDb };
