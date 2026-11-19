# BreatheWise AI — Phase 6.5 Final Integration Audit & Targeted Corrections Report

**Audit Date:** 2026-11-19  
**Repository:** `rohitt-prog/BreathWiseAI`  
**Branch:** `main`  
**Target Release:** Release Candidate 1 (Phase 6 Integration Complete)  
**Audit Scope:** End-to-end integration audit and targeted corrections covering Phase 6.1 (Shared Telemetry & Navbar), Phase 6.2 (Planner Integration), Phase 6.3 (Indoor Air Assistant), Phase 6.4 (Alternatives & Commute Exposure), and Phase 6.5 targeted corrections: Dashboard provenance/freshness consistency, Dashboard AI insights gating, four-feature integration coverage, and application-level `QueryClientProvider` verification.

---

## 1. Executive Summary

Phase 6 connects BreatheWise AI's specialized environmental modules—the live Navigation telemetry bar, the Activity & Schedule Planner, the Indoor Environmental Assistant, and the Clean Commute & Alternative Routes Assistant—into a cohesive, fail-closed client application powered by verified physical observations and atmospheric chemistry models.

Following the initial Phase 6.5 integration review, independent source audit identified two correctness issues and one coverage gap:
1. **Dashboard Provenance/Freshness Inconsistency (P1):** The Dashboard previously used local ad-hoc checks that failed to check missing forecast validity or missing retrieval freshness on physical observations, and mislabelled unrecognized providers as simulated demo scenarios.
2. **Dashboard AI Insights Context Mismatch (P1):** The TanStack Query hook for Gemini AI insights ran unconditionally regardless of telemetry validity, allowing live AI directives to be displayed alongside simulated demo data or stale previous queries.
3. **Four-Feature Integration Coverage Gap (P2):** The integration suite lacked `PlannerPage` in cross-feature execution and did not mount all four consumers simultaneously to verify shared QueryClient deduplication and synchronized location switching.

These issues have been resolved:
- `DashboardPage.tsx` now reuses `determineTelemetryProvenance()` from `frontend/src/utils/aqiUtils.ts`.
- AI insights on the Dashboard are strictly gated via `isTelemetryEligibleForAI`, completely suppressing actionable directives and summaries during demo, stale, unverified, missing PM2.5, or error states.
- `phase6_5FinalIntegration.test.tsx` now mounts and tests all four feature consumers (`DashboardPage`, `PlannerPage`, `IndoorAirPage`, `AlternativesPage` + `Navbar`).
- The live application's root provider composition was verified: `App.tsx` wraps all routes under a single module-scoped `QueryClientProvider`.
- Backend source integrity remains 100% byte-for-byte immutable across all 49 files (SHA-256: `54721975a8408db7b5fa1678dbadb0549ceea42cb9aa644bff7bd2f372c5c862`).
- 219 Vitest tests and 474 backend Pytest tests pass cleanly. Zero TypeScript diagnostic errors, zero build warnings.

---

## 2. Newly Identified Correctness Issues & Exact Resolutions

### 2.1 Correction 1 — Dashboard Provenance & Freshness Consistency (P1)
- **Problem:** `DashboardPage.tsx` previously evaluated source classification and freshness locally:
  - If `dataSource` did not match `MODELLED_FORECAST`, `OPEN_METEO_MODELLED`, `OBSERVATION`, `CPCB_OFFICIAL`, or `OPENAQ_V3`, it fell through to `badgeText = 'SIMULATED_DEMO (Curated Scenario)'`, incorrectly labelling unknown live providers as simulated demo data.
  - Modelled telemetry only checked `retrievalFreshness === 'STALE' || forecastValidity === 'HISTORICAL_PERIOD' || modelRunFreshness === 'STALE'`. Missing freshness metadata (e.g., `undefined` or `INVALID`) was treated as fresh.
  - Physical observation freshness checked only `observationFreshness === 'STALE'`, completely ignoring `retrievalFreshness`.
- **Resolution:**
  - `DashboardPage.tsx` was refactored to reuse the shared `determineTelemetryProvenance()` utility in `frontend/src/utils/aqiUtils.ts`.
  - Added explicit check in `determineTelemetryProvenance()`: `if (provenance.isVerified === false)` immediately maps to `{ tag: 'Unverified', isStale: true, statusLabel: 'Unverified Telemetry' }`.
  - Unknown providers now unambiguously display `UNVERIFIED (Unverified Telemetry)` and are never mislabelled as simulated demo.
  - Modelled telemetry requires both valid positive retrieval freshness (`FRESH` or `RECENT`) and valid forecast period (`CURRENT_PERIOD` or `FUTURE_PERIOD`), with no stale/invalid indicators; missing metadata fails closed to `MODELLED_FORECAST (STALE Modelled)`.
  - Physical observations strictly require BOTH positive observation freshness AND retrieval freshness; missing metadata fails closed to `OBSERVATION (STALE Ground Sensor)`.

### 2.2 Correction 2 — Dashboard AI Insights Telemetry Context Gating (P1)
- **Problem:** `useQuery` for `fetchAIInsights` was executed unconditionally on mount and coordinate changes. As a result:
  - Demo telemetry or offline fallback displayed actionable live AI directive cards.
  - Stale or unverified telemetry displayed independently generated live AI directives.
  - Switching locations could display cached AI summaries from previous coordinates while new telemetry was loading or ineligible.
- **Resolution:**
  - Defined `isTelemetryEligibleForAI`: strictly `true` only when `isLive === true`, `isVerifiedLive === true` (`tag === 'Modelled' || tag === 'Live Sensor'` with `isStale === false`), `provenance.isVerified !== false`, and `isValidNumericConcentration(pm25)` is valid.
  - Set `enabled: isTelemetryEligibleForAI` in `useQuery`.
  - Defined `activeAiInsights = isTelemetryEligibleForAI && !isAIError ? aiInsights : undefined`. Stale cached data cannot leak into state or DOM when telemetry is ineligible.
  - When `!isTelemetryEligibleForAI`:
    - Directives header displays: `Curated Demo Guidance (Backend Offline)`, `Baseline Guidance (Telemetry Stale)`, `Baseline Guidance (Telemetry Unverified)`, or `Baseline Guidance (Telemetry Insufficient)`.
    - AI summary is replaced by an explicit, educational gating notice explaining that live directives are suspended.
    - Actionable directive cards are completely suppressed from the DOM and replaced with an educational notice.
    - Cardiovascular exercise footer advisory states: `Simulated scenario — live cardiovascular exercise directives are suspended in demo mode.` or `Telemetry insufficient for live cardiovascular exercise directives.` rather than claiming a live outdoor restriction based on unverified data.

### 2.3 Correction 3 — Four-Feature Integration Test Coverage (P2)
- **Problem:** `phase6_5FinalIntegration.test.tsx` previously omitted `PlannerPage` from tests, and location synchronization rendered only `Navbar` and `AlternativesPage`.
- **Resolution:**
  - Added test rendering `Navbar`, `DashboardPage`, `PlannerPage`, `IndoorAirPage`, and `AlternativesPage` simultaneously.
  - Verified single shared network dispatch for current and forecast queries via QueryClient deduplication.
  - Verified synchronized station switching across all 4 features + Navbar.
  - Added dedicated regression tests for all 8 Dashboard provenance scenarios and all 8 AI gating scenarios.
  - Added cross-feature stale, demo, error, and agreement tests across all 4 features.

### 2.4 Correction 4 — Application-Level QueryClient Provider Verification
- **Audit Finding:**
  - Inspected `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/routes.tsx`, and `frontend/src/components/layout/AppShell.tsx`.
  - In `frontend/src/App.tsx`, a single `queryClient = new QueryClient({...})` is instantiated at module scope and provided via `<QueryClientProvider client={queryClient}>` directly wrapping `<RouterProvider router={router} />`.
  - In `frontend/src/routes.tsx`, all feature routes (`dashboard`, `planner`, `indoor`, `alternatives`, `settings`) are children of `AppShell`, which renders `Navbar` and `<Outlet />`.
  - **Verdict:** All features and Navbar run under one single, shared `QueryClientProvider`. No extra provider was added; the existing architecture was verified as correct.

---

## 3. Four-Feature Architecture Reviewed

```
[ Zustand Store (useAppStore) ]
  - currentLocationId, userPreferences (defaultLocation, sensitivityLevel)
        │
        ▼
[ Application Root: App.tsx ]
  <QueryClientProvider client={queryClient}>  <-- Single shared QueryClient
    <RouterProvider router={router}>
      <AppShell>
        ├── <Navbar /> (Shared Telemetry Pill)
        └── <Outlet />
              ├── <DashboardPage />  (AI Insights Gated on isTelemetryEligibleForAI)
              ├── <PlannerPage />    (Itinerary & Indoor Protocols Gated on isLiveVerified)
              ├── <IndoorAirPage />  (Ventilation Assessment Gated on isLiveVerified)
              └── <AlternativesPage>(Commute Mode Assessment Gated on isLiveVerified)
```

---

## 4. Safety & Leakage Matrix (14 Scenarios Verified Across All Features)

| # | Scenario | Dashboard Behavior | Planner Behavior | Indoor Air Behavior | Alternatives Behavior | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Verified Fresh Telemetry** | Displays `MODELLED_FORECAST` or `OBSERVATION`; enables live AI insights | Computes optimal window; enables scheduling | Favorable ventilation permitted if dispersion OK | Active transit viable; route delta evaluated | **PASS** |
| 2 | **Missing PM2.5** | Provenance shown; AI directives suspended (`Telemetry Insufficient`) | Itinerary dashed; ventilation marked `Telemetry Insufficient` | Master verdict: `TELEMETRY INSUFFICIENT` | Master verdict: `TELEMETRY INSUFFICIENT` | **PASS** |
| 3 | **Negative Pollutant Value** | Failed closed; AI directives suspended | Negative values rejected; dashed indicators | Rejected as corrupt; fails closed | Fails closed; educational comparison only | **PASS** |
| 4 | **Non-Finite (NaN/Infinity)** | `isValidNumericConcentration` returns false; AI suspended | Filtered out; arithmetic crash prevented | Handled safely; fallback to unavailable | Handled safely; no NaN leakage | **PASS** |
| 5 | **Stale Physical Observation** | Displays `OBSERVATION (STALE Ground Sensor)`; AI suspended | Warning banner shown; action directives suspended | Master verdict: `TELEMETRY INSUFFICIENT` | Master verdict: `TELEMETRY INSUFFICIENT` | **PASS** |
| 6 | **Unknown Provider** | Displays `UNVERIFIED (Unverified Telemetry)`; AI suspended | Displays `Unverified Telemetry`; directives suspended | Displays `Telemetry Insufficient` | Displays `Telemetry Insufficient` | **PASS** |
| 7 | **Unverified (`isVerified: false`)** | Displays `UNVERIFIED`; AI directives suspended | Action badges suppressed; scheduling disabled | Highlights suppressed; ventilation gated | Live route guidance suppressed | **PASS** |
| 8 | **Demo Mode (`isLive: false`)** | Displays `SIMULATED_DEMO`; AI directives suspended | Illustrative demo badge; scheduling disabled | Master verdict: `TELEMETRY INSUFFICIENT` | Master verdict: `TELEMETRY INSUFFICIENT` | **PASS** |
| 9 | **Network Error (500/Offline)** | Fallback to demo notice; zero live claims | Error banner: `Forecast Telemetry Unavailable` | Error banner: `Telemetry connection offline` | Error banner: `Telemetry connection offline` | **PASS** |
| 10 | **Location Switch** | Query key updates; stale AI insights evicted | Hourly ribbons update synchronously | Ambient card updates synchronously | Route evaluations update synchronously | **PASS** |
| 11 | **Cache Isolation (Live vs Demo)** | Key: `['airQuality', ..., isDemo]` isolates responses | Key: `['airQualityForecast', ..., isDemo]` isolates | Shares isolated cache cleanly | Shares isolated cache cleanly | **PASS** |
| 12 | **Missing Dispersion Index** | Evaluates PM2.5 without claiming zero stagnation | Cautionary note applied before window ranking | Low outdoor PM2.5 alone does not guarantee safety | Cautionary note applied to roadside routes | **PASS** |
| 13 | **Stale Model Run** | Displays `STALE Modelled`; AI suspended | Warning banner: stale forecast; directives suspended | Evaluated as stale telemetry | Evaluated as stale telemetry | **PASS** |
| 14 | **Missing Optional Pollutants** | Calculates sub-index on available pollutants | Hourly forecast ribbon handles nulls | Purifier guidance focuses on PM2.5 | Commute profiles focus on PM2.5 | **PASS** |

---

## 5. Exact Files Modified in Phase 6.5 Targeted Corrections

| File Path | Nature of Change |
|-----------|------------------|
| `frontend/src/features/dashboard/DashboardPage.tsx` | Integrated `determineTelemetryProvenance()`, added strict AI insight gating via `isTelemetryEligibleForAI`, suppressed active action cards & summaries when ineligible |
| `frontend/src/utils/aqiUtils.ts` | Added `isVerified === false` check in `determineTelemetryProvenance()`, exported `isValidNumericConcentration()` |
| `frontend/src/types/airQuality.ts` | Added `isVerified?: boolean;` to `CurrentAirQualityData['provenance']` |
| `frontend/src/test/aqiUtils.test.ts` | Added regression test for `isVerified: false` provenance classification |
| `frontend/src/test/phase5AiIntegration.test.tsx` | Mocked live air quality in `beforeEach` and demo in test 4 to align with AI gating rules |
| `frontend/src/test/phase6_5FinalIntegration.test.tsx` | Expanded from 8 to 25 comprehensive tests covering all 4 features, Dashboard provenance, and AI insight gating |

---

## 6. Test Results

### 6.1 Frontend Test Suite (Vitest)
Command: `cd frontend && npm test -- --run`
```
Test Files  14 passed (14)
     Tests  219 passed (219)
  Duration  2.99s
```
**Breakdown by test file:**
- `src/test/phase6_5FinalIntegration.test.tsx`: 25 passed
- `src/test/plannerUtils.test.ts`: 24 passed
- `src/test/planner.test.tsx`: 24 passed
- `src/test/alternativesUtils.test.ts`: 28 passed
- `src/test/alternativesGuidance.test.tsx`: 21 passed
- `src/test/indoorGuidance.test.tsx`: 18 passed
- `src/test/indoorUtils.test.ts`: 18 passed
- `src/test/navbarTelemetry.test.tsx`: 18 passed
- `src/test/aqiUtils.test.ts`: 23 passed
- `src/test/phase4Integration.test.tsx`: 7 passed
- `src/test/phase5AiIntegration.test.tsx`: 4 passed
- `src/test/store.test.ts`: 4 passed
- `src/test/pollutants.test.tsx`: 3 passed
- `src/test/demoMode.test.tsx`: 2 passed

### 6.2 Backend Test Suite (Pytest)
Command: `PYTHONPATH=backend ./backend/.venv/bin/pytest backend/tests`
```
======================= 474 passed, 3 warnings in 0.69s ========================
```

---

## 7. TypeScript & Production Build Verification

Command: `cd frontend && npm run build`
```
> breathewise-frontend@1.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ 1656 modules transformed.
dist/index.html                   1.24 kB │ gzip:   0.69 kB
dist/assets/index-DVhNAFgr.css   48.56 kB │ gzip:   8.43 kB
dist/assets/index-Dg9NU36P.js   463.07 kB │ gzip: 131.17 kB
✓ built in 1.68s
```
**Verdict: Clean exit code 0. Zero TypeScript errors, zero build warnings.**

---

## 8. Backend Source Immutability Verification

```python
Total tracked backend files: 49
Baseline Hash:   54721975a8408db7b5fa1678dbadb0549ceea42cb9aa644bff7bd2f372c5c862
Post-Audit Hash: 54721975a8408db7b5fa1678dbadb0549ceea42cb9aa644bff7bd2f372c5c862
Result: 100% BYTE-FOR-BYTE IDENTICAL. ZERO BACKEND SOURCE FILES MODIFIED.
```

---

## 9. Git State Verification

Command: `git status`
```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit: (working tree changes only)
	modified:   frontend/src/components/layout/Navbar.tsx
	modified:   frontend/src/features/alternatives/AlternativesPage.tsx
	modified:   frontend/src/features/dashboard/DashboardPage.tsx
	modified:   frontend/src/features/indoor/IndoorAirPage.tsx
	modified:   frontend/src/features/planner/PlannerPage.tsx
	modified:   frontend/src/services/apiClient.ts
	modified:   frontend/src/services/mockData.ts
	modified:   frontend/src/test/aqiUtils.test.ts
	modified:   frontend/src/test/indoorGuidance.test.tsx
	modified:   frontend/src/test/phase5AiIntegration.test.tsx
	modified:   frontend/src/test/planner.test.tsx
	modified:   frontend/src/types/airQuality.ts
	modified:   frontend/src/types/planner.ts
	modified:   frontend/src/utils/aqiUtils.ts

Untracked files:
	PHASE6_1_SOURCE_AUDIT.md
	PHASE6_1_SOURCE_AUDIT.zip
	PHASE6_2_SOURCE_AUDIT.md
	PHASE6_2_SOURCE_AUDIT.zip
	PHASE6_3_SOURCE_AUDIT.md
	PHASE6_3_SOURCE_AUDIT.zip
	PHASE6_4_SOURCE_AUDIT.md
	PHASE6_4_SOURCE_AUDIT.zip
	PHASE6_5_FINAL_INTEGRATION_AUDIT.md
	PHASE6_5_FINAL_SOURCE_AUDIT.zip
	frontend/src/hooks/
	frontend/src/test/alternativesGuidance.test.tsx
	frontend/src/test/alternativesUtils.test.ts
	frontend/src/test/indoorUtils.test.ts
	frontend/src/test/navbarTelemetry.test.tsx
	frontend/src/test/phase6_5FinalIntegration.test.tsx
	frontend/src/test/plannerUtils.test.ts
	frontend/src/utils/alternativesUtils.ts
	frontend/src/utils/indoorUtils.ts
	frontend/src/utils/plannerUtils.ts

no changes added to commit (use "git add" and/or "git commit -a")
```
Command: `git diff --cached`
```
(empty output — 0 files staged)
```
- **Staged files:** 0
- **Commits created:** 0
- **Pushes performed:** 0

---

## 10. Remaining Limitations

1. **Direct CPCB CAAQMS Ingest:** Real-time physical monitoring from official CPCB stations remains supplementary via OpenAQ v3 where available; CPCB direct API integration is unverified and properly disclosed to users.
2. **Modelled Atmospheric Chemistry Resolution:** Open-Meteo CAMS provides gridded atmospheric chemistry model data (~11 km resolution in Europe, ~25-40 km globally). Hyperlocal urban street-canyon variations are approximated through route delta factors rather than direct physical monitoring on every block.
3. **Indoor Sensor Telemetry:** Indoor ventilation suitability is calculated against outdoor ambient air and home characteristics; physical IoT indoor air sensor integration (e.g., Matter/HomeKit) is not part of Phase 6.

---

## 11. Final Source Audit Package

- **Archive Name:** `PHASE6_5_FINAL_SOURCE_AUDIT.zip`
- **Total Files Included:** 34 files (all Phase 6.1–6.4 pages, hooks, utils, types, mock data, API clients, test files, root provider files `main.tsx`, `App.tsx`, `routes.tsx`, `AppShell.tsx`, and the updated audit report)
- **Status:** Complete and ready for independent human review.
