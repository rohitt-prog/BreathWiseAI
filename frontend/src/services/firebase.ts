import { initializeApp, getApps, getApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

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

if (isFirebaseConfigured()) {
  try {
    firebaseApp = getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApp();
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);
  } catch (error) {
    console.warn('[Firebase] Initialization failed:', error);
    firebaseApp = null;
    firebaseAuth = null;
    firebaseDb = null;
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
 * Returns the initialized Firestore Database instance, or null if unconfigured.
 */
export const getFirebaseDb = (): Firestore | null => firebaseDb;

export { firebaseApp, firebaseAuth, firebaseDb };
