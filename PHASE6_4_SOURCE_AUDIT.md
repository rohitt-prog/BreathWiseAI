# BreatheWise AI — Phase 6.4 Source Audit Documentation
## Alternatives Integration & Personal Exposure Comparison (Targeted Audit Corrections)

**Audit Date:** 2026-11-19  
**Audit Phase:** Phase 6.4 — Alternatives Integration (Targeted Audit Corrections)  
**Repository:** `rohitt-prog/BreathWiseAI`  
**Git Branch:** `main`  
**Git Base HEAD:** `dc9ac153f3752184653a21da72357305ca2286f3` (`feat(ai): complete Phase 5 intelligence engine`)  
**Package Mode:** Read-Only Source Audit Package  

---

## 1. Executive Summary & Defect Correction Overview

Phase 6.4 integrates the **Alternatives Page** (`AlternativesPage.tsx`) with the shared environmental telemetry system introduced in Phase 6.1 and aligns all commute mode comparisons and exposure trade-offs with authoritative backend deterministic safety standards (`backend/app/services/deterministic_safety.py`).

Following an independent source review of Phase 6.4, a targeted correction pass was performed addressing 5 specific audit findings:

1. **Independent PM10 and PM2.5 Data Extraction:**
   - Corrected pollutant extraction in `frontend/src/utils/alternativesUtils.ts` so that PM10 is independently read from `aqData?.pollutants?.['PM10']?.concentration` and PM2.5 from `aqData?.pollutants?.['PM2.5']?.concentration`.
   - Both pollutants are independently validated via `isValidPollutant()`.
   - PM10 never duplicates PM2.5; missing PM10 remains `null`, and invalid PM10 values (< 0, NaN, non-finite) remain `null` while preserving valid PM2.5 telemetry.
   - Missing PM2.5 strictly fails closed to `telemetry_insufficient` even if PM10 is valid.

2. **Removal & Qualification of Unsupported Scientific Numbers:**
   - Audited and eliminated unverified quantitative claims across the page, utility functions, and exposure determinants:
     - Removed all numerical ventilation multipliers ($2\times\text{--}5\times$ minute ventilation).
     - Removed roadside distance reduction claims ($10\text{--}50$ meters).
     - Removed quantitative alveolar deposition claims (e.g. "deposits particles deep into the pulmonary alveoli", "increases deep alveolar particulate deposition by 6x").
     - Removed dramatic or guaranteed inhalation dose claims.
   - Replaced with cautious, evidence-supported qualitative descriptions:
     - Physical exertion elevates breathing rate and inhaled air volume.
     - Roadside pollution concentrations vary with traffic density, distance from the curb, and street-canyon meteorology.
     - Total inhaled particulate exposure depends on concentration, duration, and ventilation rate.

3. **Correction of Metro and Vehicle Filtration Claims:**
   - Removed all guarantees of in-transit protection and removed the unsupported `filtrationBuffer` rating property entirely from `CommuteModeProfile` and all mode profiles.
   - Avoided implying that every metro train, bus, or private vehicle has verified filtration performance.
   - Added cautious conditional disclosures: enclosure and recirculation can reduce particulate ingress in some situations, but real-world protection varies substantially based on cabin air filter condition, window seals, HVAC maintenance, vehicle age, and passenger crowding.
   - Clarified that BreatheWise AI does not measure private vehicle or transit in-cabin air quality.

4. **Correction of Low-PM2.5 Active Travel Wording:**
   - For $\text{PM}_{2.5} < 30$ µg/m³, replaced definitive labels like `Recommended Active Travel`, `Clean ambient conditions`, and `Minimal pollution exposure risk` with proportionate, non-alarmist guidance (`Active Commute Viable`, `ACTIVE & MASS TRANSIT VIABLE`).
   - Acknowledged that regional monitoring station data does not measure microscale roadside exhaust, traffic queues, unmeasured pollutants, or route-specific conditions.
   - Provided balanced, non-alarmist advice without implying that a low regional PM2.5 proves a specific route is safe, nor making active travel sound inherently hazardous.

5. **Emissions Comparisons Qualification:**
   - Qualified emissions labels (`Very Low`, `Low`, `Moderate`, `High`) as broad illustrative categories (`{category} Emissions (Illustrative)`) rather than measured results.
   - Added an explicit disclosure banner explaining that actual greenhouse gas and tailpipe emissions vary by vehicle powertrain, occupancy rate, fuel or electricity grid source, vehicle condition, and journey characteristics.
   - Kept personal respiratory inhalation exposure strictly separated from vehicular greenhouse gas emissions; avoided adding an unverified emissions calculator.

---

## 2. Shared Live Telemetry Integration

- **Hook & Cache Sharing:** Integrated with the shared `useAirQualityQuery()` hook, keyed by `['airQuality', locationId, lat, lon]`. Guarantees query deduplication between Navbar, Dashboard, Planner, Indoor Air Assistant, and Alternatives.
- **Active Location Sync:** Reactively reflects store changes in `currentLocationId` and user coordinate preferences without silent fallback.
- **Outdoor Ambient Disclosure:** Prominently clarifies that all environmental readings represent outdoor ambient air quality near the selected station:
  > *"Outdoor Ambient Telemetry • Not an In-Cabin Sensor: The assistant adapts guidance based on outdoor ambient air quality; it does not measure private in-cabin vehicle air, route-level IoT sensors, or dynamic traffic congestion."*
- **Observation vs. Model Distinction:** Explicitly distinguishes physical ground station sensors (`Live Ground Sensor`, `Stale Ground Sensor`) from regional numerical forecasts (`Regional Atmospheric Model`, `Stale Atmospheric Model`), preserving source attribution, timestamps, and pollutant units.
- **Zero Fabricated Readings:** Does not invent in-cabin PM2.5 readings, route congestion indices, or private vehicle IoT telemetry.

---

## 3. Supported Commute Modes & Exposure Methodology

- **Supported Travel Options (7 Modes):**
  1. *Metro / Mass Rail Transit:* Rail corridors physically separated from street-level tailpipe plumes; mechanical ventilation attenuates particulate ingress, varying with train HVAC maintenance and crowding.
  2. *Enclosed Vehicle (AC / Filtered):* Closed cabin with recirculation mode may reduce roadway exhaust ingress; protection varies by filter condition, seals, and maintenance.
  3. *Public Bus (Electric / CNG):* Shared transit reduces per-capita emissions; curbside stops and door openings expose riders to localized exhaust plumes.
  4. *Auto-Rickshaw (Three-Wheeler):* Open-sided cabin close to traffic tailpipes; direct unbuffered exhaust exposure in traffic congestion.
  5. *Motorcycle / Scooter:* Zero physical enclosure; riders travel in close proximity to vehicle exhaust plumes and road dust.
  6. *Bicycle / Active Commute:* Zero operational emissions; physical exertion elevates breathing rate and inhaled air volume, increasing particulate intake during smog.
  7. *Pedestrian Walking:* Zero operational emissions; roadside arterial walking incurs unbuffered exhaust exposure varying with distance from curb and traffic flow.
- **Personal Exposure vs. Emissions Distinction:** Explicitly highlights the core dilemma: reducing personal inhaled pollution exposure is not identical to reducing vehicular greenhouse gas emissions. Adheres to backend deterministic rules prohibiting claims that *"cycling in traffic reduces your exposure"* or that *"sustainable commute reduces your inhaled pollution"*.

---

## 4. Recommendation and Safety Gating (Fail-Closed)

- **Strict Telemetry Gating:** Condition-dependent commute recommendations and live verdicts are gated strictly on verified fresh live telemetry (`isLiveVerified && pm25 !== null`).
- **Telemetry Insufficient State:** For demo mode, stale data (>180 min old), unverified/unknown sources, offline API errors, or missing criteria $\text{PM}_{2.5}$ measurements:
  - Master verdict displays `TELEMETRY INSUFFICIENT`.
  - Condition-dependent mode verdicts are withheld and replaced with `Educational Comparison`.
  - No recommendation leakage occurs through secondary cards, badges, or detail sections.
- **Evidence-Grounded Directives (Live Verified):**
  - $\text{PM}_{2.5} \ge 60$ µg/m³: `PRIORITIZE ENCLOSED TRANSIT` — Prioritize enclosed transit options separated from traffic (Metro, enclosed vehicles with closed windows and recirculation); advise against high-exertion open travel along arterial corridors; advise certified N95 respirators for open transit.
  - $\text{PM}_{2.5} < 30$ µg/m³: `ACTIVE & MASS TRANSIT VIABLE` — Active commuting and mass transit are viable under regional conditions; note that station telemetry does not measure localized traffic queues.
  - $\text{PM}_{2.5} \in [30, 60)$ µg/m³: `SELECTIVE COMMUTE PLANNING` — Selective route planning avoiding arterial choke points.

---

## 5. Modified and Created Files

| File | Status | Purpose |
| :--- | :--- | :--- |
| `frontend/src/features/alternatives/AlternativesPage.tsx` | Modified | UI connected to shared `useAirQualityQuery`, outdoor ambient disclosure, fail-closed master verdict, loading skeleton, error retry, multi-modal commute comparison matrix, illustrative emissions context, and educational exposure determinants. |
| `frontend/src/utils/alternativesUtils.ts` | Modified | Independent PM10/PM2.5 extraction, fail-closed freshness gating, qualitative exposure factors, removal of unsupported numbers, and qualified microenvironmental determinants. |
| `frontend/src/test/alternativesGuidance.test.tsx` | Modified | Integration test suite expanded to 21 tests covering UI telemetry, independent PM10 rendering, low-PM2.5 non-definitive wording, and illustrative emissions qualification. |
| `frontend/src/test/alternativesUtils.test.ts` | Modified | Unit test suite expanded to 28 tests covering independent pollutant extraction, content integrity, filtration claims qualification, and fail-closed safety gating. |

### Supporting Files Included in Source Audit Package
- `frontend/src/hooks/useAirQualityQuery.ts` (React Query telemetry hook)
- `frontend/src/types/airQuality.ts` (Telemetry and provenance types)
- `frontend/src/types/planner.ts` (Commute mode comparison types)
- `frontend/src/services/apiClient.ts` (API client and live endpoints)
- `frontend/src/utils/aqiUtils.ts` (AQI calculation and provenance evaluation)

---

## 6. Verification Test Results

### Frontend Test Suite (Vitest)
Command: `npm --prefix frontend test -- --run`
```
 ✓ src/test/plannerUtils.test.ts (24)
 ✓ src/test/indoorGuidance.test.tsx (18)
 ✓ src/test/planner.test.tsx (24)
 ✓ src/test/alternativesGuidance.test.tsx (21)
 ✓ src/test/navbarTelemetry.test.tsx (18)
 ✓ src/test/alternativesUtils.test.ts (28)
 ✓ src/test/indoorUtils.test.ts (18)
 ✓ src/test/aqiUtils.test.ts (22)
 ✓ src/test/phase4Integration.test.tsx (7)
 ✓ src/test/phase5AiIntegration.test.tsx (4)
 ✓ src/test/store.test.ts (4)
 ✓ src/test/pollutants.test.tsx (3)
 ✓ src/test/demoMode.test.tsx (2)

 Test Files  13 passed (13)
      Tests  193 passed (193)
   Duration  3.70s
```

### Frontend Production Build
Command: `npm --prefix frontend run build`
```
> breathewise-frontend@1.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ 1656 modules transformed.
dist/index.html                   1.24 kB │ gzip:   0.69 kB
dist/assets/index-9B8Exdlv.css   48.48 kB │ gzip:   8.40 kB
dist/assets/index-DDRaj7q7.js   456.92 kB │ gzip: 130.21 kB
✓ built in 1.71s
```

### Backend Test Suite (Pytest)
Command: `PYTHONPATH=backend ./backend/.venv/bin/pytest backend/tests`
```
======================= 474 passed, 3 warnings in 0.75s ========================
```

### Backend Source Immutability Check
```python
# Initial Baseline Hash:
Total tracked backend files: 49
Overall backend hash: 54721975a8408db7b5fa1678dbadb0549ceea42cb9aa644bff7bd2f372c5c862

# Post-Correction Hash:
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

- **Archive File:** `PHASE6_4_SOURCE_AUDIT.zip`
- **Archive Size:** 32,314 bytes
- **SHA-256 Checksum:** `514e49d00bd3ff8b55a556207a9973279383d39563665208ecd3e5fde3241aa5`

### Archive File Listing
```
Length      Date    Time    Name
------      ----    ----    ----
 25727  11-19-2026 20:54   frontend/src/features/alternatives/AlternativesPage.tsx
 20945  11-19-2026 20:53   frontend/src/utils/alternativesUtils.ts
 21410  11-19-2026 20:55   frontend/src/test/alternativesGuidance.test.tsx
 19528  11-19-2026 20:56   frontend/src/test/alternativesUtils.test.ts
  2397  11-18-2026 19:15   frontend/src/hooks/useAirQualityQuery.ts
  3675  11-18-2026 23:10   frontend/src/types/airQuality.ts
  2547  11-19-2026 18:49   frontend/src/types/planner.ts
 15987  11-18-2026 23:24   frontend/src/services/apiClient.ts
  8010  11-19-2026 20:17   frontend/src/utils/aqiUtils.ts
```

---

## 8. Remaining Limitations
1. **Station Ambient vs. In-Transit Microenvironment:** All telemetry reflects regional outdoor ambient concentrations near the selected monitoring station. Individual vehicular in-cabin filtration, traffic queues, and road-level microenvironments are qualitative estimates, not direct IoT measurements.
2. **Dynamic Route Traversal:** Does not interface with dynamic GPS routing or traffic APIs; guidance is designed for pre-commute mode selection and exposure awareness.
3. **Illustrative Emissions Framework:** Emissions categories are broad illustrative groupings based on typical passenger transit modes rather than measured journey calculations.

---

## 9. Stop Condition & Next Steps

Phase 6.4 targeted corrections, testing, and documentation are complete.
Zero Git mutations have been performed, and backend source files remain 100% untouched.
Execution is stopped in accordance with workflow constraints. Phase 6.5 will not begin without explicit user approval.
