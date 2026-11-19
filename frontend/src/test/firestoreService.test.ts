import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUserProfile,
  createUserProfile,
  updateUserPreferencesInCloud,
  mapFirestoreError,
} from '../services/userService';
import * as firebaseModule from '../services/firebase';
import * as firestoreSdk from 'firebase/firestore';

vi.mock('firebase/firestore', () => {
  return {
    doc: vi.fn((_db, collection, id) => ({ path: `${collection}/${id}`, id })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP'),
  };
});

describe('Phase 7.5 Firestore User Persistence Service', () => {
  const fakeDb = { type: 'mockFirestore' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(firebaseModule, 'getFirebaseDb').mockReturnValue(fakeDb);
    vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(true);
  });

  describe('1. mapFirestoreError', () => {
    it('maps standard Firestore error codes to safe, sanitized user-friendly messages', () => {
      expect(mapFirestoreError({ code: 'firestore/unconfigured' })).toBe(
        'Firestore is not configured in this environment.'
      );
      expect(mapFirestoreError({ code: 'permission-denied' })).toBe(
        'You do not have permission to access or modify this profile.'
      );
      expect(mapFirestoreError({ code: 'unavailable' })).toBe(
        'Cloud database is currently unreachable. Please check your network connection.'
      );
      expect(mapFirestoreError({ code: 'not-found' })).toBe(
        'User profile was not found.'
      );
    });

    it('handles unexpected errors and unknown error objects cleanly', () => {
      expect(mapFirestoreError(null)).toBe('An unknown database error occurred.');
      expect(mapFirestoreError({ message: 'Custom network timeout' })).toBe(
        'Custom network timeout'
      );
      expect(
        mapFirestoreError({ code: 'unknown/code', message: 'Firebase: Internal firestore trace' })
      ).toBe('Database operation failed. Please try again.');
    });
  });

  describe('2. getUserProfile', () => {
    it('returns null if UID is empty or Firebase is unconfigured', async () => {
      expect(await getUserProfile('')).toBeNull();

      vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(false);
      expect(await getUserProfile('user-123')).toBeNull();

      vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(true);
      vi.spyOn(firebaseModule, 'getFirebaseDb').mockReturnValue(null);
      expect(await getUserProfile('user-123')).toBeNull();
    });

    it('returns null if the user document does not exist in Firestore', async () => {
      vi.mocked(firestoreSdk.getDoc).mockResolvedValue({
        exists: () => false,
      } as any);

      const result = await getUserProfile('user-nonexistent');

      expect(firestoreSdk.doc).toHaveBeenCalledWith(fakeDb, 'users', 'user-nonexistent');
      expect(result).toBeNull();
    });

    it('reads existing user document and normalizes preferences against defaults', async () => {
      const mockRawData = {
        profile: {
          displayName: 'Rohit User',
          email: 'rohit@breathewise.ai',
          photoURL: 'https://example.com/rohit.jpg',
        },
        preferences: {
          personaType: 'outdoor_worker',
          hasSensitiveMembers: false,
          commuteMode: 'bicycle',
          theme: 'dark',
        },
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T01:00:00Z',
      };

      vi.mocked(firestoreSdk.getDoc).mockResolvedValue({
        exists: () => true,
        data: () => mockRawData,
      } as any);

      const result = await getUserProfile('user-rohit');

      expect(result).not.toBeNull();
      expect(result?.profile.displayName).toBe('Rohit User');
      expect(result?.profile.email).toBe('rohit@breathewise.ai');
      expect(result?.preferences.personaType).toBe('outdoor_worker');
      expect(result?.preferences.commuteMode).toBe('bicycle');
      expect(result?.preferences.theme).toBe('dark');
      // Verifies default normalization fills in unprovided fields
      expect(result?.preferences.defaultLocation.city).toBe('Delhi');
      expect(result?.preferences.indoorFacilities.hasAirPurifier).toBe(true);
    });
  });

  describe('3. createUserProfile', () => {
    it('creates a user document at users/{uid} with server timestamps', async () => {
      vi.mocked(firestoreSdk.setDoc).mockResolvedValue(undefined);

      const profile = {
        displayName: 'New User',
        email: 'new@breathewise.ai',
        photoURL: null,
      };
      const preferences = {
        personaType: 'family' as const,
        defaultLocation: { name: 'Connaught Place', city: 'Delhi', lat: 28.6304, lon: 77.2177 },
        commuteMode: 'metro' as const,
        commuteTimes: { morningDeparture: '09:00', eveningReturn: '17:30' },
        hasSensitiveMembers: true,
        indoorFacilities: { hasAirPurifier: true, purifierFilterType: 'HEPA' as const, homeVentilationType: 'sealed_ac' as const },
        notificationsEnabled: true,
        theme: 'light' as const,
      };

      await createUserProfile('new-uid-123', profile, preferences);

      expect(firestoreSdk.doc).toHaveBeenCalledWith(fakeDb, 'users', 'new-uid-123');
      expect(firestoreSdk.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/new-uid-123' }),
        {
          profile: {
            displayName: 'New User',
            email: 'new@breathewise.ai',
            photoURL: null,
          },
          preferences,
          createdAt: 'MOCK_SERVER_TIMESTAMP',
          updatedAt: 'MOCK_SERVER_TIMESTAMP',
        }
      );
    });

    it('rejects with error when Firestore is unconfigured', async () => {
      vi.spyOn(firebaseModule, 'getFirebaseDb').mockReturnValue(null);

      await expect(
        createUserProfile('uid-err', { displayName: 'Err', email: 'err@test.com', photoURL: null }, {} as any)
      ).rejects.toMatchObject({
        code: 'firestore/unconfigured',
      });
    });
  });

  describe('4. updateUserPreferencesInCloud', () => {
    it('updates preferences at users/{uid} with merge: true and updatedAt timestamp', async () => {
      vi.mocked(firestoreSdk.setDoc).mockResolvedValue(undefined);

      await updateUserPreferencesInCloud('existing-uid-456', {
        personaType: 'student',
        theme: 'dark',
      });

      expect(firestoreSdk.doc).toHaveBeenCalledWith(fakeDb, 'users', 'existing-uid-456');
      expect(firestoreSdk.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/existing-uid-456' }),
        {
          preferences: {
            personaType: 'student',
            theme: 'dark',
          },
          updatedAt: 'MOCK_SERVER_TIMESTAMP',
        },
        { merge: true }
      );
    });

    it('rejects when Firestore is unconfigured', async () => {
      vi.spyOn(firebaseModule, 'isFirebaseConfigured').mockReturnValue(false);

      await expect(
        updateUserPreferencesInCloud('uid-err', { personaType: 'general' })
      ).rejects.toMatchObject({
        code: 'firestore/unconfigured',
      });
    });
  });
});
