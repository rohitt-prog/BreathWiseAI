# BreatheWise AI — Phase 6.3 Source Audit Documentation
## Indoor Air Assistant Integration & Audit Closure Corrections

**Audit Date:** 2026-11-19  
**Audit Phase:** Phase 6.3 — Indoor Air Assistant Integration (Audit Closure Corrections)  
**Repository:** `rohitt-prog/BreathWiseAI`  
**Git Branch:** `main`  
**Git Base HEAD:** `dc9ac153f3752184653a21da72357305ca2286f3` (`feat(ai): complete Phase 5 intelligence engine`)  
**Package Mode:** Read-Only Source Audit Package  

---

## 1. Executive Summary & Audit Closure Corrections

Phase 6.3 integrates the **Indoor Air Assistant** (`IndoorAirPage.tsx`) with the shared environmental telemetry system introduced in Phase 6.1 and aligns all indoor ventilation, air cleaning, and household source-control guidance with authoritative backend deterministic safety standards (`backend/app/services/deterministic_safety.py`).

### Audit Closure Corrections Implemented

Following independent source audit, three residual defects were addressed:

1. **Strict AQI Numeric Display Validation:**
   - In `IndoorAirPage.tsx`, the Official NAQI card now strictly gates the displayed numeric value on `isValidAqi === true` (`isValidAqi ? aqData?.aqi : 'Unavailable'`).
   - Non-numeric, non-finite (NaN, $\pm\infty$), negative ($<0$), and out-of-range ($>500$) values are displayed as `Unavailable` with category `Unavailable`.
   - No negative, non-finite, or out-of-range values can appear as legitimate NAQI readings. Current-tier table highlight gating and category metadata remain strictly fail-closed.

2. **Truly Non-Prescriptive Purifier Educational Guidance:**
   - In `indoorUtils.ts`, `getPurifierGuidance()` and `educationalFactors` have been restructured to eliminate all generic operating directives when telemetry is unverified, stale, simulated, or unavailable.
   - Prescriptive statements directing continuous operation or closing windows/doors during unverified states were removed and replaced with neutral explanatory content.
   - The operational advice and factors neutrally explain true mechanical HEPA filtration, device Clean Air Delivery Rate (CADR) relative to room volume, airflow dynamics, device clearance/placement, building enclosure air exchange rates, and regular pre-filter maintenance per manufacturer specifications.
   - Explicitly notes: *"Real-time condition-dependent operating directives, modes, and window adjustments are withheld while outdoor telemetry is unverified."*
   - For verified live telemetry, existing condition-dependent guidance (`Continuous Recirculation (Elevated Ambient Smog)` vs. `Baseline Recirculation (Standard Maintenance)`) is preserved.

3. **Clarified Educational Ventilation Reference Framework:**
   - Renamed the reference table header to **Educational Household Ventilation Reference Framework** with subtitle *General educational framework across 6 NAQI tiers • Not official CPCB protocol*.
   - Added an explicit notice banner when telemetry is unverified, stale, demo, or unavailable:
     `Educational Reference Only: Real-time ambient telemetry is unverified, stale, simulated, or unavailable. No row in this reference table represents your current condition.`
   - Disclaims that the table is an educational decision-support framework and not an official CPCB-published ventilation protocol.
   - Gated table row highlighting: no category is highlighted as "Current" without verified, fresh, live telemetry and a valid statutory AQI.

---

## 2. Shared Live Telemetry Integration

- **Hook & Cache Sharing:** Connected to the shared `useAirQualityQuery()` hook, keyed by `['airQuality', locationId, lat, lon]`. Eliminates duplicate network requests between Navbar, Dashboard, Planner, and Indoor Air Assistant.
- **Active Location Sync:** Reactively responds to store changes in `currentLocationId` and user coordinate preferences without silent fallback.
- **Outdoor Ambient Disclosure:** Prominently discloses that all environmental telemetry represents outdoor ambient air quality near the selected station:
  > *"Outdoor Ambient Telemetry • Not an Indoor Sensor: The assistant adapts guidance based on outdoor ambient air quality; it does not measure private indoor rooms or fabricate indoor IoT sensor readings."*
- **Observation vs. Model Distinction:** Explicitly distinguishes physical ground station sensors (`Live Ground Sensor`, `Stale Ground Sensor`) from regional numerical forecasts (`Regional Atmospheric Model`, `Stale Atmospheric Model`), preserving source attribution, timestamps, and pollutant units.
- **Zero Fabricated Readings:** Does not invent indoor AQI, room PM2.5, filter life percentages, CADR readings, or private sensor metrics.

---

## 3. Ventilation Decision Support & Safety Gating

- **Fail-Closed Gating:** Condition-dependent ventilation recommendations are gated strictly on verified fresh live telemetry (`isLiveVerified && pm25 !== null`).
- **Telemetry Insufficient State:** For demo mode, stale data (>180 min old), unverified/unknown sources, offline API errors, or missing criteria $\text{PM}_{2.5}$ measurements, the master verdict displays `TELEMETRY INSUFFICIENT`. Condition-dependent directives and recommended ventilation time windows are suspended.
- **Evidence-Grounded Directives (Live Verified):**
  - $\text{PM}_{2.5} \ge 60$ µg/m³: `LIMIT OUTDOOR AIR INFILTRATION` — Keep exterior windows closed to limit particulate infiltration, while managing indoor air needs through active kitchen range hoods and continuous mechanical HEPA filtration in recirculation mode. If indoor moisture or $\text{CO}_2$ rises, brief 10–15 min controlled airing may be evaluated.
  - $\text{PM}_{2.5} < 30$ µg/m³ & non-stagnant: `CONDITIONAL VENTILATION CONSIDERATION` — Outdoor air is cleaner; conditional natural ventilation may be evaluated. Low outdoor $\text{PM}_{2.5}$ alone does not guarantee indoor air quality; evaluate immediate local conditions before opening windows. Windows are never opened automatically.
  - $\text{PM}_{2.5} \in [30, 60)$ µg/m³ or stagnant dispersion: `SELECTIVE AIRING CONSIDERATION` — Brief 10–15 min cross-ventilation if indoor $\text{CO}_2$ or moisture is elevated; continuous open windows are not recommended.
- **No Unsafe Assumptions:** Avoids claiming afternoon or night is always safer, avoids categorical window-open/close mandates, and recognizes that outdoor pollution is not the only indoor air quality hazard.

---

## 4. Indoor Source Control & Purifier Guidance

- **Strict Ozone Safety Directive:** Prominently banners the prohibition of ozone generators, "activated oxygen" machines, and uncertified electronic ionizers under US EPA and CPCB guidelines.
- **Practical Purifier Guidance:**
  - Explains true mechanical HEPA filtration without unsupported numerical removal guarantees.
  - Contextual operation: continuous recirculation during verified high ambient $\text{PM}_{2.5}$; baseline maintenance during cleaner periods.
  - Real-world performance determinants: CADR vs. room volume, continuous operation, placement/airflow away from walls/curtains, enclosure integrity, and pre-filter cleaning.
- **Source Control Protocols:**
  - Active kitchen exhaust and stove safety (gas combustion producing $\text{NO}_2$ and $\text{CO}$ vs. induction cooktops).
  - Elimination of smoldering incense, scented paraffin candles, and mosquito coils.
  - 100% smoke-free home policy (zero indoor smoking and vaping).
  - Dust management: damp mopping and wet wiping over dry broom sweeping.
  - Moisture & mold prevention: relative humidity 30–50% and bathroom exhaust ventilation.
  - Avoids claims that source control actions reduce outdoor pollution or global emissions, and provides zero clinical diagnoses or medication advice.

---

## 5. Modified and Created Files

| File | Status | Purpose |
| :--- | :--- | :--- |
| `frontend/src/features/indoor/IndoorAirPage.tsx` | Modified | UI connected to shared `useAirQualityQuery`, outdoor ambient disclosure, fail-closed master verdict, validated AQI display, educational reference framework table with no-row notice, and educational room cards. |
| `frontend/src/utils/indoorUtils.ts` | Created | Evidence-grounded indoor ventilation evaluation, fail-closed freshness gating, truly non-prescriptive educational purifier guidance, and practical source-control protocols. |
| `frontend/src/utils/aqiUtils.ts` | Modified | Strict AQI numerical validation in `getAQIMetadata()` (rejection of NaN, $\pm\infty$, negative, and $>500$ values to `'Unavailable'`). |
| `frontend/src/test/indoorGuidance.test.tsx` | Modified | Integration test suite covering 18 test cases (gated table highlights, validated AQI display, non-prescriptive purifier educational content, and educational framework disclaimers). |
| `frontend/src/test/indoorUtils.test.ts` | Created | Unit test suite covering 18 test cases for ventilation logic, non-prescriptive purifier guidance, factor validations, and source-control rules. |
| `frontend/src/test/aqiUtils.test.ts` | Modified | Unit test suite covering 22 test cases including out-of-range, NaN, negative, and null AQI validations. |

### Supporting Files Included in Source Audit Package
- `frontend/src/hooks/useAirQualityQuery.ts` (React Query telemetry hook)
- `frontend/src/types/airQuality.ts` (Telemetry and provenance types)
- `frontend/src/services/apiClient.ts` (API client and live endpoints)

---

## 6. Verification Test Results

### Frontend Test Suite (Vitest)
Command: `npm --prefix frontend test -- --run`
```
 ✓ src/test/plannerUtils.test.ts (24)
 ✓ src/test/indoorGuidance.test.tsx (18)
 ✓ src/test/planner.test.tsx (24)
 ✓ src/test/navbarTelemetry.test.tsx (18)
 ✓ src/test/indoorUtils.test.ts (18)
 ✓ src/test/aqiUtils.test.ts (22)
 ✓ src/test/phase4Integration.test.tsx (7)
 ✓ src/test/phase5AiIntegration.test.tsx (4)
 ✓ src/test/store.test.ts (4)
 ✓ src/test/pollutants.test.tsx (3)
 ✓ src/test/demoMode.test.tsx (2)

 Test Files  11 passed (11)
      Tests  144 passed (144)
   Duration  2.77s
```

### Frontend Production Build
Command: `npm --prefix frontend run build`
```
> breathewise-frontend@1.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ 1655 modules transformed.
dist/index.html                   1.24 kB │ gzip:   0.69 kB
dist/assets/index-5huXbK90.css   47.87 kB │ gzip:   8.30 kB
dist/assets/index-YQBLPCZb.js   432.03 kB │ gzip: 124.53 kB
✓ built in 1.58s
```

### Backend Test Suite (Pytest)
Command: `PYTHONPATH=backend ./backend/.venv/bin/pytest backend/tests`
```
======================= 474 passed, 3 warnings in 0.67s ========================
```

### Backend Source Immutability Check
```python
# Baseline Hash:
Total tracked backend files: 49
Overall backend hash: 54721975a8408db7b5fa1678dbadb0549ceea42cb9aa644bff7bd2f372c5c862

# Post-Implementation Hash:
Total tracked backend files: 49
Overall backend hash: 54721975a8408db7b5fa1678dbadb0549ceea42cb9aa644bff7bd2f372c5c862

Result: 100% BYTE-FOR-BYTE IDENTICAL. ZERO BACKEND SOURCE FILES MODIFIED.
```

### Git Repository State
```
On branch main
Your branch is up to date with 'origin/main'.
Changes not staged for commit: (working tree edits only)
Untracked files: (audit exports and new frontend utility/hook files)
No changes added to commit (0 files staged, 0 commits, 0 pushes).
```

---

## 7. Audit Package Artifact Details

- **Archive File:** `PHASE6_3_SOURCE_AUDIT.zip`
- **Archive Size:** 33,531 bytes
- **SHA-256 Checksum:** `8a8c8cd968139c4c2ae6772b6f1ff96103baff80d5fe821bc30c7e07fec2a406`

### Archive File Listing
```
Length      Date    Time    Name
------      ----    ----    ----
 30605  11-19-2026 20:23   frontend/src/features/indoor/IndoorAirPage.tsx
 13539  11-19-2026 20:22   frontend/src/utils/indoorUtils.ts
  7586  11-19-2026 19:47   frontend/src/utils/aqiUtils.ts
 20387  11-19-2026 20:24   frontend/src/test/indoorGuidance.test.tsx
 14352  11-19-2026 20:23   frontend/src/test/indoorUtils.test.ts
  7422  11-19-2026 19:48   frontend/src/test/aqiUtils.test.ts
  2397  11-18-2026 19:15   frontend/src/hooks/useAirQualityQuery.ts
  3675  11-18-2026 23:10   frontend/src/types/airQuality.ts
 15987  11-18-2026 23:24   frontend/src/services/apiClient.ts
```

---

## 8. Stop Condition & Next Steps

Phase 6.3 implementation, audit closure corrections, comprehensive verification, and source audit packaging are complete.
Zero Git mutations have been performed, and backend source files remain 100% untouched.
Execution is stopped in accordance with workflow constraints. We await independent review before proceeding to Phase 6.4.
