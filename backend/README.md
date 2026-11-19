# BreatheWise AI — FastAPI Backend Service

Production-oriented Python FastAPI service providing normalized, validated, and transparent environmental intelligence for BreatheWise AI.

---

## 1. Overview & Architectural Philosophy

The BreatheWise AI backend bridges real-world atmospheric chemistry models, physical air quality monitoring networks, and meteorological telemetry with a modern React frontend.

### Core Data Integrity & Scientific Principles
1. **Strict Data Classification**: Every reading is strictly classified as either `OBSERVATION` (physical sensor measurement), `MODELLED_FORECAST` (atmospheric chemistry/weather model output), or `SIMULATED_DEMO`. Modelled outputs are **never** presented as live physical ground stations.
2. **Statutory Indian NAQI Integrity**: Official Indian National Air Quality Index (NAQI) requires statutory multi-pollutant measurements conforming to CPCB guidelines (24-hour averaging for PM2.5, PM10, NO2, SO2, NH3, Pb; 8-hour averaging for CO and O3; minimum 3 pollutants with at least one PM pollutant). If verified statutory data is unavailable, the backend returns `indian_naqi = null` alongside an explicit explanatory reason rather than fabricating or mislabeling international scales (such as US AQI or European AQI).
3. **Atmospheric Dispersion & Stagnation Heuristics**: Surface meteorological observations are synthesized with atmospheric boundary layer height ($h_{\text{PBL}}$) to assess atmospheric dispersion conditions and stagnation risk. The service clearly documents this as a heuristic indicator and **never claims a confirmed temperature inversion** or complete particulate trapping without vertical temperature profile soundings ($\partial T / \partial z > 0$).
4. **Separation of Retrieval Freshness and Forecast Validity**:
   - `retrieved_at`: UTC timestamp when backend retrieved the provider response.
   - `retrieval_freshness`: `FRESH` (<60m), `RECENT` (60-180m), or `STALE` (>180m).
   - `forecast_timestamp`: Timestep represented by the forecast value.
   - `forecast_validity`: `CURRENT_PERIOD` (±60m), `FUTURE_PERIOD`, or `HISTORICAL_PERIOD`.
   - `model_run_timestamp` / `model_data_available_at`: Strictly `null` when unexposed by provider (no invented metadata).
5. **Dominant Pollutant Scientific Integrity**: Raw concentrations across differing units ($\text{mg/m}^3$ vs $\mu\text{g/m}^3$) or toxicological potencies are **never compared directly**. For modelled data, dominant pollutant is derived from dimensionless exceedance ratios against official Indian National Ambient Air Quality Standards (NAAQS) benchmarks and explicitly labeled as a screening heuristic.
6. **Google Gemini & Deterministic Safety Supremacy (Phase 5)**: Generative synthesis transforms validated telemetry into plain-language actionable advice via Google Gemini Flash models using the official `google-genai` SDK and Pydantic structured output. Generative AI **never acts as the source of measurements or authoritative safety decisions**. Pre-generation deterministic safety rules strictly enforce action allowlists, ban uncertified air cleaners (e.g. ozone generators), balance indoor air ventilation, and prevent clinical medical diagnosis. If Gemini is unconfigured, times out, or fails post-generation semantic validation, the system automatically falls back to safe deterministic recommendations.
7. **No Scraping & Graceful Degradation**: Adheres strictly to the National Data Sharing and Accessibility Policy (NDSAP). Unconfigured or rate-limited third-party providers gracefully degrade without crashing or breaking dependent frontend workflows.

---

## 2. Architecture & Data Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│                    External Data Providers                      │
├───────────────────────┬────────────────────────┬────────────────┤
│ Open-Meteo CAMS       │ OpenAQ v3              │ CPCB (India)   │
│ (Atmospheric Models)  │ (Physical Sensors)     │ (Statutory)    │
└──────────┬────────────┴───────────┬────────────┴───────┬────────┘
           │                        │                    │
           ▼                        ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│               Provider Adapters (app/providers/)                │
│ - open_meteo.py: CAMS chemistry + boundary layer meteorology    │
│ - openaq.py: Physical station discovery & latest measurements   │
│ - cpcb.py: Statutory CAAQMS integration & 8-pollutant formulas  │
└───────────────────────────────────┬─────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              Validation & Normalization Engine                  │
│                      (app/services/)                            │
│ - Geographic coordinate validation (-90/90, -180/180)           │
│ - Concentration physical bounds & unit normalization (µg / mg)  │
│ - Retrieval freshness & forecast validity window separation     │
│ - NAAQS dimensionless benchmark ratios for dominant pollutant   │
│ - Boundary layer height & dispersion/stagnation heuristics      │
└───────────────────────────────────┬─────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│        Phase 5: Evidence & Deterministic Safety Engine          │
│                  (app/services/ & app/ai/)                      │
│ - evidence_builder.py: constructs structured evidence context   │
│ - deterministic_safety.py: authoritative allowlist & constraints│
│ - gemini_service.py: google-genai SDK structured synthesis      │
│ - Post-generation semantic validator & automatic fallback       │
└───────────────────────────────────┬─────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI API Layer (app/api/routes/)                │
│ - GET /health & /api/v1/health                                  │
│ - GET /api/v1/providers/status                                  │
│ - GET /api/v1/air-quality/current                               │
│ - GET /api/v1/air-quality/forecast                              │
│ - GET /api/v1/weather/current                                   │
│ - POST /api/v1/ai/insights                                      │
└───────────────────────────────────┬─────────────────────────────┘
                                    │
                                    ▼
                           React 18 Frontend
```

---

## 3. Directory Structure

```text
backend/
├── app/
│   ├── ai/
│   │   ├── gemini_service.py       # Google GenAI SDK client lifecycle & async generation
│   │   └── prompt_manager.py       # Versioned prompts & structured output instructions
│   ├── api/
│   │   └── routes/
│   │       ├── air_quality.py      # Air quality current & forecast endpoints
│   │       ├── ai.py               # Evidence-grounded AI insights endpoint
│   │       ├── health.py           # Health check endpoints
│   │       ├── providers.py        # Environmental provider telemetry status
│   │       └── weather.py          # Weather & dispersion conditions endpoints
│   ├── core/
│   │   ├── config.py               # Pydantic Settings & environment variables
│   │   ├── exceptions.py           # Domain exception classes & HTTP mappings
│   │   └── logging.py              # Key-scrubbing audit logger
│   ├── providers/
│   │   ├── base.py                 # Abstract provider interfaces
│   │   ├── cpcb.py                 # CPCB statutory formulas & integration stub
│   │   ├── open_meteo.py           # Open-Meteo CAMS & NWP implementation
│   │   └── openaq.py               # OpenAQ v3 physical monitor implementation
│   ├── schemas/
│   │   ├── ai.py                   # Structured synthesis, evidence & action schemas
│   │   ├── air_quality.py          # Air quality request/response Pydantic schemas
│   │   ├── common.py               # Enums, coordinates, and error schemas
│   │   ├── providers.py            # Provider status Pydantic schemas
│   │   └── weather.py              # Weather & dispersion Pydantic schemas
│   ├── services/
│   │   ├── ai_service.py           # AI insight pipeline orchestrator
│   │   ├── air_quality_service.py  # Air quality aggregation & fallback orchestrator
│   │   ├── data_validation.py      # Physical bounds, units & dispersion heuristics
│   │   ├── deterministic_safety.py # Authoritative safety allowlists & semantic validators
│   │   ├── evidence_builder.py     # Verifiable evidence context builder
│   │   └── weather_service.py      # Weather & boundary layer orchestrator
│   └── main.py                     # FastAPI application factory & middleware
├── tests/
│   ├── test_ai_endpoints.py        # AI insights API endpoint tests
│   ├── test_ai_service.py          # Gemini integration & deterministic safety tests
│   ├── test_air_quality_service.py # Orchestrator unit tests
│   ├── test_api_endpoints.py       # FastAPI HTTP endpoint tests
│   ├── test_health.py              # Health check tests
│   ├── test_open_meteo.py          # Open-Meteo provider unit tests
│   ├── test_openaq.py              # OpenAQ provider unit tests
│   └── test_validation.py          # Validation rules, CPCB math, & dominant pollutant tests
├── verify_live.py                  # Live network integration test script
├── requirements.txt                # Production & test dependencies
├── pytest.ini                      # Pytest configuration
├── .env.example                    # Environment variable template
└── README.md                       # Service documentation
```

---

## 4. Setup & Installation

### Prerequisites
- Python 3.11+
- pip

### Step-by-Step Installation
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` if you have an OpenAQ API key (`OPENAQ_API_KEY`). If omitted, the backend runs smoothly with Open-Meteo.*

5. Run the development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The interactive API docs are available at: `http://localhost:8000/docs`.

---

## 5. API Reference

### 1. Health Checks
- `GET /health` or `GET /api/v1/health`
  - Returns service status, version, uptime, and provider operational statuses.

### 2. Providers Status
- `GET /api/v1/providers/status`
  - Returns metadata, configuration state, classification, and caveats for all providers.

### 3. Current Air Quality
- `GET /api/v1/air-quality/current?latitude={lat}&longitude={lon}`
  - Returns normalized current pollutant concentrations (`PM2.5`, `PM10`, `NO2`, `SO2`, `CO`, `O3`).
  - Strict compliance: `indian_naqi` is `null` with explicit `indian_naqi_unavailable_reason` if certified CPCB data is unavailable.
  - Dominant pollutant derived from NAAQS dimensionless exceedance ratios with documented methodology.
  - Returns separate `retrieved_at`, `observed_at` (null for model data), `forecast_timestamp`, and `retrieval_freshness`.

### 4. Air Quality Forecast
- `GET /api/v1/air-quality/forecast?latitude={lat}&longitude={lon}&hours={hours}`
  - Returns hourly forecast points (up to 48 hours) derived from CAMS atmospheric chemistry models.

### 5. Current Weather & Dispersion Conditions
- `GET /api/v1/weather/current?latitude={lat}&longitude={lon}`
  - Returns ambient temperature, relative humidity, 10m wind speed, cardinal wind direction, and atmospheric boundary layer height in meters.
  - Returns documented dispersion conditions (`Potentially Unfavorable`, `Moderate`, `Favorable`) and stagnation risk (`Elevated`, `Moderate`, `Low`).
  - Never claims a confirmed thermal inversion without atmospheric sounding profiles.

### 6. AI Insights & Evidence-Grounded Recommendations (Phase 5)
- `POST /api/v1/ai/insights`
  - Accepts JSON request body: `{"latitude": float, "longitude": float, "activity_context": "GENERAL" | "OUTDOOR_EXERCISE" | "COMMUTE" | "VENTILATION" | "SENSITIVE_POPULATION"}`.
  - Retrieves environmental telemetry, constructs minimal structured evidence context, and evaluates authoritative deterministic safety constraints.
  - Synthesizes structured plain-language explanations and permissible recommendations using Google Gemini (`gemini-2.5-flash`).
  - Strict allowlist enforcement: every recommendation must match a pre-authorized canonical action ID and cite verified evidence IDs.
  - Automatic fallback: gracefully degrades to deterministic protective recommendations if Gemini is unconfigured, times out, throws errors, or produces invalid output.

---

## 6. Testing & Verification

### Run Automated Unit Tests (Offline / Mocked)
```bash
PYTHONPATH=. pytest
```
*Current test suite: 492 automated tests across 9 test modules (100% offline; all Gemini and external APIs mocked).*

### Run Live Network Verification
```bash
PYTHONPATH=. python verify_live.py
```
*Performs live queries against real Open-Meteo atmospheric chemistry (CAMS) and numerical weather prediction endpoints, validating coordinate normalization, pollutant extraction, boundary layer meteorology, and stagnation heuristics.*

---

## 7. Project Phases & Integration Roadmap

- **Phase 1–4**: Domain research, UX specifications, frontend foundation, and backend provider architecture (Completed)
- **Phase 5**: Google Gemini AI Intelligence & Deterministic Safety Engine (Completed & Verified)
  - Pydantic structured output, canonical action allowlists, and fail-closed automatic fallbacks.
- **Phase 6**: Feature Integration & Shared Telemetry Architecture (Completed & Verified)
  - TanStack React Query shared telemetry caching and provenance/freshness gating.
- **Phase 7**: Live Data Activation & Firebase Integration (In Progress)
  - **Phase 7.1 — Live Location System** (Completed & Approved): Global geocoding search (Open-Meteo) and explicit browser GPS ("Use my current location") propagating into shared telemetry.
  - **Phase 7.2 — Live Telemetry Activation & Verification** (Completed & Approved): Verification of genuine live environmental data pipelines across arbitrary global coordinates without provider rebuild.
  - **Phase 7.3 — Backend Resilience & Caching** (Current): In-memory LRU caching with single-flight request coalescing, 4-decimal coordinate keys, and strict provenance preservation.
  - **Phase 7.4 — Firebase Setup & Authentication** (Upcoming)
  - **Phase 7.5 — Firestore User Persistence** (Upcoming)
  - **Phase 7.6 — Mode Controls & Final Integration** (Upcoming)

### Provider Status & Operational Boundaries
- **Open-Meteo CAMS**: Active default provider. Global model output (~40 km grid). Hourly pollutant concentrations normalized. Does not produce statutory Indian NAQI.
- **Open-Meteo Weather**: Active default provider. Global surface meteorology and boundary layer height ($h_{\text{PBL}}$) for dispersion/stagnation risk assessment.
- **OpenAQ v3**: Supplementary physical sensor provider. Inactive gracefully (`NOT_CONFIGURED`) when `OPENAQ_API_KEY` is omitted in `.env`; backend falls back to Open-Meteo without error.
- **CPCB / data.gov.in**: Statutory Indian National AQI computation engine. Direct automated scraping is prohibited under NDSAP; returns `indian_naqi = null` with explicit reason when official ground sensor data is unavailable.
