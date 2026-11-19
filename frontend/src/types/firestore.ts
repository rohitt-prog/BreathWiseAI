import { UserPreferences } from './user';

export interface UserProfileData {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export type PersistedPreferences = UserPreferences & {
  theme?: 'light' | 'dark';
};

export interface UserProfileDocument {
  profile: UserProfileData;
  preferences: PersistedPreferences;
  createdAt?: any;
  updatedAt?: any;
}
