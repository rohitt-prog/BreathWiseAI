# BreatheWise AI — Phase 7.5: Firestore User Persistence Implementation Report

**Status:** Implementation Complete & Fully Verified  
**Milestone:** Phase 7.5 — Firestore User Profile & Preference Persistence  
**Repository:** `rohitt-prog/BreathWiseAI` | **Branch:** `main`  
**Baseline Commit:** `0f3d40130c4f4ae5505d5a7b57da50a1f8f91b7e`  
**Date:** 2026-11-20  

---

## 1. Pre-Implementation Audit Findings

Before modifying source code, an architectural audit of existing application preferences was performed:

- **Existing State Management:** [`frontend/src/stores/useAppStore.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAppStore.ts) maintained an in-memory `userPreferences` object adhering to [`frontend/src/types/user.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/types/user.ts) (`personaType`, `commuteMode`, `commuteTimes`, `hasSensitiveMembers`, `indoorFacilities`, `notificationsEnabled`, `defaultLocation`) alongside a root `theme` ('light' | 'dark').
- **Settings UI:** [`frontend/src/features/settings/SettingsPage.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/features/settings/SettingsPage.tsx) presented persona selection, sensitive member guardrails, and daily commute schedules.
- **Dependency Status:** The official Firebase Web SDK (`firebase@^13.4.0`) was already installed; `firebase/firestore` was available out of the box with zero new npm dependencies required.
- **Scope Discipline:** Live GPS coordinates, current interactive map locations, atmospheric telemetry observations, and AI conversation history are strictly ephemeral and are excluded from database persistence.

---

## 2. Preference Fields Selected for Persistence & Justification

Only verified, functional user preference fields are persisted:

| Category | Persisted Field | Type | Justification |
| :--- | :--- | :--- | :--- |
| **Profile** | `displayName` | `string \| null` | Authenticated user display identity for Navbar and personalized greetings. |
| **Profile** | `email` | `string \| null` | User contact identifier. |
| **Profile** | `photoURL` | `string \| null` | User profile avatar link (e.g. from Google sign-in). |
| **Lifestyle** | `personaType` | `'student' \| 'family' \| 'outdoor_worker' \| 'general'` | Tailors Action Planner thresholds and indoor guidance without medical records. |
| **Guardrails** | `hasSensitiveMembers` | `boolean` | Lowers pollution safety alert thresholds for children, elderly, or respiratory-sensitive household members. |
| **Commute** | `commuteMode` | `'metro' \| 'bus' \| 'walk' \| 'bicycle' \| ...` | Default transit modality for Sustainable Commute alternatives. |
| **Commute** | `commuteTimes` | `{ morningDeparture: string, eveningReturn: string }` | Schedules morning and evening exposure window calculations. |
| **Indoor** | `indoorFacilities` | `{ hasAirPurifier: boolean, purifierFilterType: string, homeVentilationType: string }` | Determines indoor ventilation recommendations and filter replacement advice. |
| **System** | `notificationsEnabled`| `boolean` | User preference for ambient air quality alerts. |
| **System** | `theme` | `'light' \| 'dark'` | Retains user interface appearance preference across browsers. |
| **Location** | `defaultLocation` | `{ name: string, city: string, lat: number, lon: number }` | User's preferred home/base station preset. (Does NOT persist live GPS). |

---

## 3. Firestore Document Schema

Documents are keyed by the authenticated user's Firebase UID at path: `users/{uid}`

```json
{
  "profile": {
    "displayName": "Rohit Kumar",
    "email": "rohit@breathewise.ai",
    "photoURL": "https://example.com/avatar.jpg"
  },
  "preferences": {
    "personaType": "family",
    "hasSensitiveMembers": true,
    "commuteMode": "metro",
    "commuteTimes": {
      "morningDeparture": "08:30",
      "eveningReturn": "18:00"
    },
    "indoorFacilities": {
      "hasAirPurifier": true,
      "purifierFilterType": "HEPA",
      "homeVentilationType": "sealed_ac"
    },
    "notificationsEnabled": true,
    "theme": "dark",
    "defaultLocation": {
      "name": "Anand Vihar, Delhi",
      "city": "Delhi",
      "lat": 28.6508,
      "lon": 77.3152
    }
  },
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

---

## 4. Initialization Architecture

In [`frontend/src/services/firebase.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/services/firebase.ts):
- Added modular Firestore initialization via `getFirestore(firebaseApp)`.
- Reuses the shared `firebaseApp` instance.
- Safely exports `firebaseDb: Firestore | null` and `getFirebaseDb(): Firestore | null`.
- If environment variables are missing or unconfigured, `firebaseDb` remains `null`. The app gracefully runs in Guest Mode with zero exceptions.

---

## 5. Synchronization Strategy

Managed deterministically inside [`frontend/src/stores/useAuthStore.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAuthStore.ts):

1. **Sign-In / Session Restoration:**
   - When a non-null `user` is detected, `syncUserProfile(user)` is dispatched.
   - `isSyncing: true` is set immediately to block accidental local default overwrites.
   - Reads `doc = await getUserProfile(user.uid)`.
   - **Returning User:** If `doc` exists, hydrates cloud preferences into application memory via `useAppStore.getState().setUserPreferences(doc.preferences)` and `setTheme()`.
   - **First-Time User:** If `doc === null`, creates the initial user document in Firestore populated with current defaults and profile data.
   - `isSyncing: false` is cleared upon completion.
2. **User Modifies Settings in UI:**
   - In [`SettingsPage.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/features/settings/SettingsPage.tsx), form submissions dispatch `savePreferencesToCloud()` for authenticated users.
   - Uses `{ merge: true }` in `setDoc()` to preserve document `createdAt` and `profile` fields while updating `preferences` and `updatedAt`.
   - Guest users continue to have preferences applied locally in memory without triggering network writes.

---

## 6. Account Switching & Stale-Write Protections

- **In-Flight Cancellation / Identity Verification:** Before `syncUserProfile` applies cloud data to `useAppStore`, it asserts `get().user?.uid === user.uid`. If the user switched accounts or logged out while the read request was in-flight, the incoming payload is discarded.
- **Write Guarding during Hydration:** `savePreferencesToCloud` rejects execution if `isSyncing === true`, guaranteeing local default states never overwrite cloud data during initial page load.
- **Sign-Out Evacuation:** When a user signs out, `signOut()` invokes `useAppStore.getState().resetPreferencesToDefault()`, ensuring User A's custom settings are wiped from memory and never leak into guest sessions or User B's account.

---

## 7. Guest-Mode Preservation

- Guest users never trigger Firestore reads or writes.
- 100% of non-persistence features remain accessible:
  - Live AQI Dashboard & Weather cards
  - Real-world location search & GPS selection
  - 48-Hour AQI hourly forecasts
  - Action Planner activity recommendations
  - Indoor Air Assistant ventilation advice
  - Sustainable Commute route alternatives
  - Simulated demo scenarios & AI safety gates
- In [`SettingsPage.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/features/settings/SettingsPage.tsx), guest users see explicit status: `Settings persist in local session storage (Guest Mode)`.

---

## 8. Security Rules

Created [`firestore.rules`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/firestore.rules) at project root:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users may read, create, and update their own document
    match /users/{userId} {
      allow read, update: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow delete: if false; // Document deletion is not supported in this phase
    }

    // Default deny all other collections and wildcard access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- **Authentication Enforcement:** `request.auth != null` ensures all unauthenticated requests are rejected.
- **Document Ownership Isolation:** `request.auth.uid == userId` prevents cross-user document access.
- **No Wildcard Leaks:** Catch-all rule `match /{document=**}` denies read and write across any unspecified collection.

---

## 9. Files Created & Modified

### Files Created:
1. [`firestore.rules`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/firestore.rules): Production-ready security rules for Firestore.
2. [`frontend/src/types/firestore.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/types/firestore.ts): Strongly typed Firestore document schema interfaces.
3. [`frontend/src/services/userService.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/services/userService.ts): Firestore read, create, and update operations with schema normalization and error sanitization.
4. [`frontend/src/test/firestoreService.test.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/test/firestoreService.test.ts): 9 unit tests for Firestore service methods.
5. [`frontend/src/test/firestoreSync.test.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/test/firestoreSync.test.tsx): 8 integration tests for cloud synchronization, account switching, and guest isolation.

### Files Modified:
1. [`frontend/src/services/firebase.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/services/firebase.ts): Initialized `firebaseDb` via `getFirestore(firebaseApp)`.
2. [`frontend/src/types/user.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/types/user.ts): Exported verified `DEFAULT_USER_PREFERENCES`.
3. [`frontend/src/stores/useAppStore.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAppStore.ts): Added `setUserPreferences`, `resetPreferencesToDefault`, and `setTheme` actions.
4. [`frontend/src/stores/useAuthStore.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAuthStore.ts): Added cloud hydration, stale-write checks, signout cleanup, and idempotent listener caching.
5. [`frontend/src/features/settings/SettingsPage.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/features/settings/SettingsPage.tsx): Connected form submission to cloud persistence and added dynamic sync status indicator.

---

## 10. Tests Added & Coverage Details

### 1. Firestore Service Tests (`firestoreService.test.ts`, 9 tests)
- `mapFirestoreError`: Verified sanitized messaging for `firestore/unconfigured`, `permission-denied`, `unavailable`, and `not-found`.
- `getUserProfile`: Verified empty UID rejection, unconfigured rejection, non-existent document handling (`null`), and schema normalization against defaults.
- `createUserProfile`: Verified correct document path `users/{uid}`, profile payload, and `serverTimestamp()` attachment.
- `updateUserPreferencesInCloud`: Verified `{ merge: true }` semantics and `updatedAt` update.

### 2. Firestore Sync Tests (`firestoreSync.test.tsx`, 8 tests)
- Cloud hydration: Verified existing cloud documents override store defaults.
- First-time user creation: Verified non-existent cloud documents trigger initial profile creation.
- Stale-write prevention: Verified in-flight cloud data is discarded if user switches accounts or signs out before the read finishes.
- Write guarding: Verified cloud write is blocked while `isSyncing === true`.
- Sign-out isolation: Verified preferences reset to guest defaults on signout while preserving location selection.
- Guest mode verification: Verified guest settings modifications do not invoke Firestore write methods.
- Authenticated UI verification: Verified `SettingsPage` displays cloud sync status and dispatches updates.

---

## 11. Exact Test Counts & Results

### Frontend Test Results (`vitest`)
```
Test Files  19 passed (19)
     Tests  284 passed (284)
  Duration  6.39s
```
- **New tests added in Phase 7.5:** +17 tests (9 service tests, 8 sync/isolation tests).
- **Previous frontend baseline:** 267 tests.
- **Current frontend total:** 284 tests (100% pass rate).

### Backend Regression Results (`pytest`)
```
493 passed, 3 warnings in 1.13s
```
- **Backend total:** 493 tests (100% pass rate).
- **Backend files modified:** 0 files.

### Monorepo Total Test Baseline
$$\text{Total Passed Tests} = 493 \text{ (Backend)} + 284 \text{ (Frontend)} = \mathbf{777 \text{ Tests}}$$

---

## 12. TypeScript & Production Build Results

### TypeScript Verification (`npx tsc --noEmit`)
```bash
cd frontend && npx tsc --noEmit
# Result: Exit code 0, zero errors.
```

### Production Build (`npm run build`)
```bash
cd frontend && npm run build
# Result: Built in 2.33s. Output: dist/assets/index-gwnj6dA0.js (1,205.46 kB)
```

---

## 13. Backend Regression Results

- Confirmed **0 backend files** were created, modified, or deleted during Phase 7.5.
- All 493 backend unit and integration tests passed cleanly in 1.13 seconds.
- In-memory caching, request coalescing, AI safety gates, and environmental data endpoints operate unchanged.

---

## 14. Offline & Error Limitations

1. **Offline Firestore Cache:** Firebase Web SDK maintains an internal IndexedDB offline cache when enabled; however, if a user is offline during their initial first-time login, initial profile creation will be queued until network connectivity is reestablished.
2. **Read Failures Fail-Safe:** If Firestore encounters a network drop during initial hydration, `useAuthStore` logs a warning and leaves the in-memory store intact, preventing blank pages or loss of guest usability.
3. **No Multi-Device Live Collaboration:** Firestore is used as a persistence store on session load and settings save; real-time multi-device synchronization listeners (`onSnapshot`) were intentionally avoided to minimize unnecessary document reads.

---

## 15. Firebase Console Configuration Required from Project Owner

To enable Firestore in the live Firebase project:

1. In the [Firebase Console](https://console.firebase.google.com/), navigate to **Build** -> **Firestore Database**.
2. Click **Create Database**.
3. Select your production region (e.g., `asia-south1` or nearest users).
4. Start in **Production Mode** (this activates the secure default deny rule).
5. In the **Rules** tab, copy and paste the contents of [`firestore.rules`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/firestore.rules) and click **Publish**.

---

## 16. Manual Verification Checklist

Once live credentials are configured and Firestore is created:

- [ ] **Guest Mode Verification:**
  - Launch application without signing in.
  - Navigate to Preferences (`/settings`).
  - Verify footer reads: `Settings persist in local session storage (Guest Mode)`.
  - Change persona and save; verify no network errors occur.
- [ ] **First-Time User Document Creation:**
  - Sign in with a new account.
  - Check Firebase Console Firestore data; verify document `users/{uid}` is automatically created with profile and default preferences.
- [ ] **Cloud Preference Persistence:**
  - On `/settings`, change persona to `Family Household`, check `Sensitive household member present`, and click `Save Preferences`.
  - Verify footer indicates `Settings synced with your BreatheWise cloud account`.
  - Refresh the browser (`F5`); verify `Family Household` persona and sensitive member checkbox remain preserved.
- [ ] **Account Switching Isolation:**
  - Sign out; verify preferences in memory reset to default (`Student`).
  - Sign in with a different account; verify Account B's saved preferences load accurately without inheriting Account A's state.

---

## 17. Git Status & Discipline Confirmation

- **Working Tree State:** All changes remain unstaged in working directory.
- **Staged Files:** **0 files** (`git diff --cached` is completely empty).
- **Commits Created:** **0 commits**.
- **Remote Operations:** **0 pushes or releases**.
- **Phase Discipline:** Strictly respected. Phase 7.6 has **NOT** been started.

---

### Phase 7.5 Conclusion

Phase 7.5 (Firestore User Persistence) is **COMPLETE and VERIFIED**. All 777 automated tests pass, TypeScript and production build succeed with zero errors, and guest mode remains 100% operational.
