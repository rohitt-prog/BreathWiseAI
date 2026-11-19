# BreatheWise AI — Phase 7.5 Final Forensic Audit Report (Read-Only)

**Audit Type:** Strictly Read-Only Forensic Source Code, Data Privacy & Security Audit  
**Target Milestone:** Phase 7.5 — Firestore User Profile & Preference Persistence  
**Repository:** `rohitt-prog/BreathWiseAI` | **Branch:** `main`  
**Baseline Commit:** `0f3d40130c4f4ae5505d5a7b57da50a1f8f91b7e`  
**Monorepo Test Totals:** 777 passed (493 backend, 284 frontend)  
**Working Tree Status:** 0 files staged, 0 commits, clean working tree preservation  
**Audit Date:** 2026-11-20  

---

## Executive Summary & Final Verdict

### **FINAL VERDICT: PASS**

Phase 7.5 (Firestore User Persistence) has been independently verified through an exhaustive, read-only forensic inspection of the codebase, Firestore security rules, state synchronization lifecycle, data privacy safeguards, and automated test coverage. The implementation reuses the centralized Firebase client without duplicate app instances, adheres strictly to a scoped `users/{uid}` document schema, prevents cross-account preference leakage via deterministic race-condition guards, and preserves 100% of guest-mode capabilities. Zero backend files were modified, zero live GPS coordinates are persisted, and all 777 automated tests pass cleanly. Phase 7.5 is **APPROVED**.

---

## 1. Section-by-Section Audit Verdicts

| Section | Audit Dimension | Verdict | Summary Findings |
| :---: | :--- | :---: | :--- |
| **1** | **Firestore Initialization** | **PASS** | Reuses `firebaseApp`, prevents duplicate apps, handles unconfigured environments safely without crashing, exports `firebaseDb: Firestore \| null`. No Admin SDK in frontend. |
| **2** | **Document Schema & Data Privacy** | **PASS** | Document identity is `users/{uid}`. Stored profile and preference fields match existing application models. Default normalization guards against schema drift. Live GPS coordinates and search locations are strictly ephemeral and never persisted. |
| **3** | **Security Rules** | **PASS** | `firestore.rules` enforces `request.auth.uid == userId` for `/users/{userId}`, explicitly denies document deletion (`allow delete: if false;`), and denies all other collections by default. |
| **4** | **Auth & Sync Lifecycle** | **PASS** | Rigorously analyzed across Scenarios A–H. Initial hydration is guarded by `isSyncing`, slow reads discard results if the user switched accounts, and sign-out resets preferences to guest defaults while preserving location and telemetry. |
| **5** | **Preference Save & Hydration** | **PASS** | Form submission triggers cloud write only for authenticated users; initial hydration uses in-memory actions without triggering write loops; `setDoc(..., { merge: true })` preserves `createdAt`. Minor finding on un-awaited UI save. |
| **6** | **Offline & Cache Behavior** | **PASS** | Unconfigured mode and network drops fail closed safely. In-memory settings are preserved on read errors. Uses Firebase SDK default memory cache. |
| **7** | **Automated Tests Quality** | **PASS** | 17 new tests across [`firestoreService.test.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/test/firestoreService.test.ts) and [`firestoreSync.test.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/test/firestoreSync.test.tsx) assert real DOM elements, store mutations, server timestamps, error sanitization, and async race-condition discards. |
| **8** | **Regression & Scope Discipline** | **PASS** | Zero backend files modified, zero telemetry or AI conversation persistence, zero staged files (`git diff --cached` is empty), zero commits, zero pushes. |

---

## 2. Severity Classification of Findings

### Critical Findings: **0**
*None.*

### Major Findings: **0**
*None.*

### Minor Findings: **1**
1. **Un-Awaited Cloud Write Resolution in Settings UI:**
   - **File:** [`frontend/src/features/settings/SettingsPage.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/features/settings/SettingsPage.tsx#L26-L34)
   - **Code Inspection:**
     ```typescript
     const handleSave = (e: React.FormEvent) => {
       e.preventDefault();
       if (user) {
         savePreferencesToCloud();
       }
       setSaveSuccess(true);
       setTimeout(() => setSaveSuccess(false), 3000);
     };
     ```
   - **Forensic Assessment:** `savePreferencesToCloud()` is dispatched asynchronously without an `await`. If an upstream Firestore permission error or network drop occurs, `useAuthStore` logs a warning via `console.warn`, but `SettingsPage` displays `Preferences saved successfully!` immediately because local store updates succeeded.
   - **Recommendation:** Safe to defer to Phase 7.6 or future polish. Awaiting `savePreferencesToCloud()` in `handleSave` with a local `isSaving` spinner and displaying a red banner upon failure will provide stricter feedback for cloud write failures.

### Informational Findings: **2**
1. **Field-Level Schema Validation in Security Rules:**
   - **File:** [`firestore.rules`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/firestore.rules#L5-L9)
   - **Forensic Assessment:** `firestore.rules` enforces strict user ownership (`request.auth.uid == userId`) and prevents cross-user access, but does not enforce field-level data schemas (e.g. `request.resource.data.keys().hasOnly(['profile', 'preferences', 'createdAt', 'updatedAt'])`). An authenticated user directly using the SDK could write arbitrary extra keys to their own document. Because the frontend client normalizes incoming data via [`getUserProfile()`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/services/userService.ts#L61-L93) and extracts only allowlisted fields, arbitrary keys are discarded and cannot corrupt application state.
2. **Firestore Web SDK Default Offline Cache:**
   - **File:** [`frontend/src/services/firebase.ts`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/services/firebase.ts#L42)
   - **Forensic Assessment:** `firebaseDb = getFirestore(firebaseApp)` uses the modular SDK default. In Firebase Web SDK v9+, `getFirestore(app)` uses in-memory caching during active tab sessions. Long-term offline multi-tab IndexedDB persistence requires explicit configuration via `initializeFirestore(app, { localCache: persistentLocalCache(...) })`. This default is completely safe for current requirements.

---

## 3. Location Privacy Deep-Dive Assessment

**Classification: Safe as Implemented.**

A deep trace was conducted across all location selection, geocoding search, and GPS detection code paths:

1. **State Separation:**
   - `useAppStore` maintains two distinct location structures:
     - `selectedLocation`: Live, interactive location (custom search results, geocoded coordinates, or device GPS coordinates via `navigator.geolocation`). Marked with `isCustom: true` and `isGps: true`.
     - `userPreferences.defaultLocation`: Static fallback base station preset (`Anand Vihar, Delhi`, lat: `28.6508`, lon: `77.3152`).
2. **GPS Isolation:**
   - In [`frontend/src/components/layout/LocationModal.tsx`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/components/layout/LocationModal.tsx#L149-L184), `handleRequestGps()` calls `setSelectedLocation({ ... isGps: true })`.
   - `LocationModal.tsx` **never** modifies `userPreferences.defaultLocation`.
   - `DashboardPage.tsx` and `Navbar.tsx` read `selectedLocation` for active telemetry queries and only fall back to `defaultLocation` if `selectedLocation` is null.
3. **Firestore Payload Verification:**
   - When [`savePreferencesToCloud()`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAuthStore.ts#L148-L173) persists `userPreferences`, it only writes the static preset coordinates of `defaultLocation`.
   - Arbitrary search coordinates and live GPS fixes from the browser are **never** persisted to Firestore.

---

## 4. Authentication & Synchronization Lifecycle Analysis (Scenarios A–H)

### Scenario A — Returning User
1. `initAuth()` registers `onAuthStateChanged`. Firebase emits restored user credentials.
2. `syncUserProfile(user)` sets `isSyncing: true`.
3. Reads `users/{uid}` via `getUserProfile`.
4. Document exists; applies cloud preferences via `setUserPreferences(doc.preferences)` and `setTheme()`.
5. `finally` block verifies `get().user?.uid === user.uid` and clears `isSyncing: false`.
- **Verdict: VERIFIED.**

### Scenario B — New User
1. User signs in for the first time; `getUserProfile` returns `null`.
2. `syncUserProfile` detects `!doc` and dispatches `createUserProfile` with current local defaults + profile data and server timestamps.
3. Document is created at `users/{uid}` without errors.
- **Verdict: VERIFIED.**

### Scenario C — Guest User
1. Unauthenticated session emits `user: null`.
2. `syncUserProfile` is never invoked.
3. `SettingsPage` displays `Settings persist in local session storage (Guest Mode)`.
4. `savePreferencesToCloud` immediately returns if `!currentUser`. Zero Firestore operations occur.
- **Verdict: VERIFIED.**

### Scenario D — User A Sign-Out
1. `signOut()` invokes `logoutUser()` and calls `useAppStore.getState().resetPreferencesToDefault()`.
2. User A's custom preferences are wiped from client memory and reset to `DEFAULT_USER_PREFERENCES`.
3. `currentLocationId`, `selectedLocation`, and the React Query cache are preserved.
- **Verdict: VERIFIED.**

### Scenario E — User A → User B Account Switch
1. User A sign-out clears store preferences back to defaults.
2. User B sign-in emits User B.
3. `syncUserProfile(userB)` queries `users/userB` and applies User B's preferences.
4. User A's custom settings never leak into User B's account.
- **Verdict: VERIFIED.**

### Scenario F — Slow Request Race Condition
1. User A triggers `getUserProfile('user-A')` over a slow network.
2. While read is pending, user switches to User B (`get().user` is now `user-B`).
3. User A's read completes; [`syncUserProfile`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAuthStore.ts#L112-L115) checks `if (get().user?.uid !== user.uid) return;`.
4. Because `'user-B' !== 'user-A'`, the incoming payload is dropped.
5. In `finally`, `if (get().user?.uid === user.uid)` prevents User A from toggling `isSyncing` for User B.
- **Verdict: VERIFIED (Tested in `firestoreSync.test.tsx`).**

### Scenario G — Write Race Condition
1. User initiates a preference write.
2. If auth state transitions before dispatch, [`savePreferencesToCloud`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/frontend/src/stores/useAuthStore.ts#L161-L163) checks `if (get().user?.uid !== currentUser.uid) return;` and cancels the write.
3. On the backend, `firestore.rules` enforces `request.auth.uid == userId`, blocking unauthorized token writes.
- **Verdict: VERIFIED.**

### Scenario H — Concurrent Sync Operations
1. `initAuth()` caches `activeAuthUnsubscribe` module-level reference:
   ```typescript
   if (activeAuthUnsubscribe) return activeAuthUnsubscribe;
   ```
   Multiple calls return the active unsubscribe callback without registering duplicate listeners.
- **Verdict: VERIFIED.**

---

## 5. Security Rules Verification

Inspection of [`firestore.rules`](file:///Users/vishalkumar/Library/CloudStorage/GoogleDrive-rohitmpk200416@gmail.com/My%20Drive/BreathwiseAI/firestore.rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, update: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- **Unauthenticated Protection:** `request.auth != null` rejects all unauthenticated queries.
- **Cross-Account Isolation:** `request.auth.uid == userId` strictly restricts User A from reading or modifying User B's document.
- **Delete Denial:** `allow delete: if false;` explicitly prohibits client-side deletion.
- **Catch-All Default Deny:** `match /{document=**} { allow read, write: if false; }` ensures no other collections can be read or written.

---

## 6. Automated Test Coverage Audit

### Test Results Breakdown:
- **`frontend/src/test/firestoreService.test.ts` (9 tests):**
  - Error mapping for 4 distinct codes + unknown errors.
  - `getUserProfile` unconfigured handling, non-existent doc handling, and preference normalization.
  - `createUserProfile` payload structure and `serverTimestamp()` attachment.
  - `updateUserPreferencesInCloud` with `{ merge: true }`.
- **`frontend/src/test/firestoreSync.test.tsx` (8 tests):**
  - Returning user cloud hydration into store.
  - First-time user document creation.
  - Account switching in-flight read discard.
  - Write blocking while `isSyncing === true`.
  - Authenticated preference saving.
  - Sign-out preference reset to defaults while preserving location.
  - Guest mode zero-cloud-write verification in `SettingsPage`.
  - Authenticated `SettingsPage` cloud sync status display.
- **Overall Suite Status:**
  - Frontend: **284 passed** (19 test suites, 0 failures).
  - Backend: **493 passed** (9 test suites, 0 failures).
  - Monorepo Baseline: **777 passed tests**.

---

## 7. Scope & Git Discipline Confirmation

- **No Backend Changes:** Confirmed 0 backend files were modified during Phase 7.5.
- **No Telemetry Persistence:** Confirmed atmospheric observations and forecasts are not stored in Firestore.
- **No AI Conversation Persistence:** Confirmed Gemini prompts and outputs are not stored in Firestore.
- **No Phase 7.6 Work:** Mode controls and final integration phase has not been started.
- **Git State:** 
  - Staged files: **0 files** (`git diff --cached` is completely empty).
  - Commits: **0 commits**.
  - Remote operations: **0 pushes or releases**.

---

## 8. Audit Conclusion & Readiness

Phase 7.5 Firestore User Persistence is **APPROVED**.

The implementation is verified to be secure, leak-free, fail-closed when unconfigured, preserves 100% of guest-mode functionality, and complies with all project architectural standards.

**Corrective Action Required:** None. Ready to proceed to Phase 7.6 upon user authorization.
