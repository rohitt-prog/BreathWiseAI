export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerId: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthModalMode = 'login' | 'signup';
