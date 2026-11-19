# BreatheWise AI — Phase 6.1 Source Audit Documentation

**Audit Date:** 2026-11-18  
**Audit Phase:** Phase 6.1 — Shared Telemetry & Navbar Unification (Final Freshness Classification Correction)  
**Repository:** `rohitt-prog/BreathWiseAI`  
**Git Branch:** `main`  
**Git Base HEAD:** `dc9ac153f3752184653a21da72357305ca2286f3` (`feat(ai): complete Phase 5 intelligence engine`)  
**Package Mode:** Read-Only Source Audit Package  

---

## 1. Executive Summary & Corrections Addressed

During the independent Phase 6.1 source review, two edge cases in `determineTelemetryProvenance` were identified and corrected:

1. **Issue A — Physical Sensor Missing Retrieval Freshness:**
   Previously, physical sensor telemetry checked that `observationFreshness` was `FRESH` or `RECENT` and that `retrievalFreshness` was not `STALE` or `INVALID`. However, if `retrievalFreshness` was omitted, undefined, or unrecognized, it could pass through as fresh.
   **Correction:** Fresh physical sensor telemetry now strictly requires that **both** `observationFreshness` is explicitly `FRESH` or `RECENT` **and** `retrievalFreshness` is explicitly `FRESH` or `RECENT`. Any missing, undefined, `STALE`, `INVALID`, `NOT_CONFIGURED`, or unrecognized retrieval freshness tier is conservatively classified as `Stale Sensor` (`isStale: true`).

2. **Issue B — Unrecognized Data Source Fallback:**
   Previously, unmapped data source strings fell through to `{ tag: 'Live', isStale: false, statusLabel: 'Live Telemetry' }`.
   **Correction:** Unrecognized data sources now fail closed to a conservative, visibly unverified state: `{ tag: 'Unverified', isStale: true, statusLabel: 'Unverified Telemetry' }`. They reuse the amber clock icon (`<Clock />`) without falsely claiming sensor or model provenance.

---

## 2. Complete Inventory of Archive Files

### A. Phase 6.1 Direct Implementation Files

| File Path | Status | Role / Changes |
| :--- | :--- | :--- |
| `frontend/src/utils/aqiUtils.ts` | **MODIFIED** | Implemented `determineTelemetryProvenance` enforcing dual positive freshness checks (`observationFreshness` + `retrievalFreshness`), model freshness, and fail-closed `Unverified` fallback. |
| `frontend/src/components/layout/Navbar.tsx` | **MODIFIED** | Replaced static mock indexing with `useAirQualityQuery()`. Integrated status badge rendering `(Modelled)`, `(Stale Modelled)`, `(Live Sensor)`, `(Stale Sensor)`, `(Unverified)`, and `(Demo)`. |
| `frontend/src/features/dashboard/DashboardPage.tsx` | **MODIFIED** | Harmonized local query key to `useAirQualityQuery()`, enabling request deduplication with Navbar. |
| `frontend/src/hooks/useAirQualityQuery.ts` | **CREATED** | Custom React Query hook providing coordinate-keyed telemetry caching with fallback client. |
| `frontend/src/test/navbarTelemetry.test.tsx` | **CREATED** | 18 regression tests covering NAQI display, location reactivity, loading indicators, error fallbacks, demo disclosures, missing NAQI, request deduplication, stale value prevention, and UI freshness badges. |
| `frontend/src/test/aqiUtils.test.ts` | **MODIFIED** | 21 unit tests covering official Indian NAQI breakpoints and `determineTelemetryProvenance` logic (including missing/invalid retrieval freshness and unrecognized feeds). |

### B. Supporting Frontend Architecture Files (Read-Only Context)

| File Path | Role in Architecture |
| :--- | :--- |
| `frontend/src/stores/useAppStore.ts` | Single source of truth for `currentLocationId` and user preferences. |
| `frontend/src/App.tsx` | Application root providing TanStack `QueryClientProvider` and React Router configuration. |
| `frontend/src/services/apiClient.ts` | Core HTTP client resolving live Open-Meteo/OpenAQ endpoints with fail-closed demo fallback. |
| `frontend/src/services/mockData.ts` | Scenario location definitions (`MOCK_LOCATIONS`) and simulated fallback telemetry. |
| `frontend/src/types/airQuality.ts` | Complete TypeScript contracts for telemetry, pollutants, provenance, and station metadata. |
| `frontend/src/types/ai.ts` | AI insight response contracts and action schema definitions. |
| `frontend/src/components/layout/AppShell.tsx` | Root layout hosting `Navbar`, `Outlet`, and persistent demo disclosure banner. |
| `frontend/src/components/layout/LocationModal.tsx` | Location selection modal updating `currentLocationId` in `useAppStore`. |
| `frontend/src/components/visualization/AQIGauge.tsx` | Primary Dashboard gauge rendering live or fallback NAQI. |
| `frontend/src/test/demoMode.test.tsx` | Regression tests verifying persistent demo disclosure banners and non-misleading labels. |
| `frontend/src/test/phase4Integration.test.tsx` | Integration tests verifying provenance badges, scientific honesty, and offline fallbacks. |
| `frontend/src/test/phase5AiIntegration.test.tsx` | Integration tests verifying Google Gemini AI synthesis and deterministic safety overrides. |

### C. Backend Contract Reference Files (Read-Only Supporting Context)

| File Path | Contract Role |
| :--- | :--- |
| `backend/app/schemas/common.py` | Official Pydantic enum definitions for `FreshnessStatus` (FRESH, RECENT, STALE, UNAVAILABLE, INVALID, NOT_CONFIGURED) and `ForecastValidityStatus` (CURRENT_PERIOD, FUTURE_PERIOD, HISTORICAL_PERIOD). |
| `backend/app/schemas/air_quality.py` | Official Pydantic schema for `NormalizedAirQualityResponse` exposing `retrieval_freshness`, `model_run_freshness`, `observation_freshness`, and `forecast_validity`. |

---

## 3. Freshness Determination Decision Matrix

```
┌───────────────────────────────────────┬────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Classification Tier                   │ Rendered Provenance Label                  │ Exact Backend Field Evaluation                         │
├───────────────────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Fresh Modelled Telemetry           │ `AQI [val] • [Category] (Modelled)`        │ `retrievalFreshness` ∈ {FRESH, RECENT} AND             │
│                                       │                                            │ `forecastValidity` ∈ {CURRENT_PERIOD, FUTURE_PERIOD}   │
│                                       │                                            │ AND `modelRunFreshness` ∉ {STALE, INVALID}.            │
├───────────────────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. Stale Modelled Telemetry           │ `AQI [val] • [Category] (Stale Modelled)`  │ `retrievalFreshness` ∈ {STALE, INVALID, NOT_CONFIG}   │
│                                       │                                            │ OR `forecastValidity` == HISTORICAL_PERIOD             │
│                                       │                                            │ OR `modelRunFreshness` == STALE OR missing metadata.   │
├───────────────────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Fresh Physical Sensor Observation  │ `AQI [val] • [Category] (Live Sensor)`     │ `observationFreshness` ∈ {FRESH, RECENT} AND           │
│                                       │                                            │ `retrievalFreshness` ∈ {FRESH, RECENT}.                │
├───────────────────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 4. Stale Physical Sensor Observation  │ `AQI [val] • [Category] (Stale Sensor)`    │ `observationFreshness` == STALE OR                     │
│                                       │                                            │ `retrievalFreshness` ∉ {FRESH, RECENT}                 │
│                                       │                                            │ (includes missing, undefined, INVALID, STALE, etc.).   │
├───────────────────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 5. Unrecognized Data Source           │ `AQI [val] • [Category] (Unverified)`      │ `dataSource` not recognized as observation, model,     │
│                                       │                                            │ or demo. `isStale: true`, `statusLabel: Unverified`.   │
├───────────────────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 6. Simulated Demo Fallback            │ `AQI [val] • [Category] (Demo)`            │ `isLive == false` or `dataSource == SIMULATED_DEMO`.   │
└───────────────────────────────────────┴────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 4. Test Verification Metrics

### Frontend Vitest Suite
- **Command:** `cd frontend && npm test -- --run`
- **Result:** **9 test files passed, 68 tests passed in 2.19s** (exit code `0`).
- **Targeted Test Coverage:**
  - `Physical observation with FRESH observation freshness but missing retrieval freshness` -> Passed (`Stale Sensor`).
  - `Physical observation with RECENT observation freshness but missing retrieval freshness` -> Passed (`Stale Sensor`).
  - `Physical observation with INVALID retrieval freshness` -> Passed (`Stale Sensor`).
  - `Physical observation with unknown retrieval freshness value` -> Passed (`Stale Sensor`).
  - `Unrecognized data source conservatively classified as Unverified Telemetry` -> Passed (`Unverified`, `isStale: true`).
  - `Existing fresh physical sensor passes when both observation and retrieval are RECENT` -> Passed (`Live Sensor`).
  - `Existing fresh/stale modelled and demo tests` -> All passed without regression.

### TypeScript Compilation
- **Command:** `cd frontend && npx tsc -b`
- **Result:** **0 type errors** (exit code `0`).

### Production Build
- **Command:** `cd frontend && npm run build`
- **Result:** **1,652 modules transformed, built in 1.62s** (exit code `0`).

### Backend Pytest Suite
- **Command:** `PYTHONPATH=backend ./backend/.venv/bin/pytest backend/tests`
- **Result:** **474 passed in 0.66s** (exit code `0`).

---

## 5. Git Baseline & Integrity Confirmation

- **Branch:** `main`
- **HEAD:** `dc9ac153f3752184653a21da72357305ca2286f3`
- **Staged File Count:** `0` (working tree unstaged, zero staging executed)
- **Zero Git Mutations:** No commits, pushes, stashes, or branch switches were executed.
