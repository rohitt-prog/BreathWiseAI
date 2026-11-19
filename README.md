# BreatheWise AI — Breathe Smarter. Live Healthier.

**PromptWars Virtual — Challenge 6: Urban Air Quality Assistant**
**Final Submission Deadline:** 29 November 2026, 11:59 PM IST

---

## 1. Project Overview
BreatheWise AI is an urban air quality assistant specifically architected for families, students, and outdoor workers in severely polluted urban centers (such as North India's annual winter smog crisis).

### Core Product Philosophy
$$\text{Environmental Data} \longrightarrow \text{Intelligence} \longrightarrow \text{Action} \longrightarrow \text{Impact}$$

BreatheWise AI bridges verified multi-source environmental telemetry and practical daily decisions, with an explicit distinction between:
- **Personal Exposure Reduction**: Protecting lungs from hazardous PM2.5/PM10 inhalation.
- **Community Emission Abatement**: Practical choices that minimize individual environmental footprints.

---

## 2. Key Architecture Pillars
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Leaflet (OpenStreetMap), Zustand, TanStack Query.
- **Backend**: Python 3.11+, FastAPI, Pydantic v2 validation, Async HTTP (httpx).
- **AI Intelligence**: Google Gemini API with native structured JSON outputs and deterministic safety guardrails (*Phase 5*).
- **Environmental Data Providers**:
  - **Open-Meteo**: Atmospheric chemistry forecasts (Copernicus CAMS) and numerical weather predictions (boundary layer height, thermal inversion dynamics).
  - **OpenAQ v3**: Global physical sensor observations (with graceful unconfigured fallback).
  - **CPCB / data.gov.in**: Statutory Indian National Air Quality Index (NAQI) reference and piecewise linear sub-index calculations.

---

## 3. Project Structure
```text
BreathwiseAI/
├── frontend/               # React 18 + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/     # UI primitives & visualization widgets (AQIGauge, PollutantGrid)
│   │   ├── features/       # Feature pages (Dashboard, IndoorAir, Planner, ActionTracker)
│   │   ├── services/       # API client & mock scenario data
│   │   └── types/          # Strict TypeScript interfaces & NAQI contracts
│   └── test/               # Vitest + React Testing Library suites (240 tests)
├── backend/                # Python FastAPI REST API
│   ├── app/
│   │   ├── api/routes/     # Clean endpoints (air-quality, weather, providers, health)
│   │   ├── core/           # Config, safe logging, custom exceptions
│   │   ├── providers/      # Open-Meteo, OpenAQ, and CPCB provider adapters
│   │   ├── schemas/        # Strict Pydantic v2 validation models
│   │   └── services/       # Data validation, inversion physics, and provider orchestration
│   ├── tests/              # Pytest test suite (492 tests)
│   ├── verify_live.py      # Live external API verification script
│   └── requirements.txt    # Python dependencies
├── .gitignore              # Enforces lean repository budget (< 10 MB limit)
└── README.md
```

---

## 4. Current Phase: Phase 7.3 (Backend Resilience & Caching)

- **Phase 1**: Domain Research & Strategic Architecture (Completed)
- **Phase 2**: Product Architecture & UX Specification (Approved)
- **Phase 3**: Frontend Foundation & Scientific Presentation (Completed & Verified)
- **Phase 4**: Backend & Live Environmental Data Integration (Completed & Verified)
- **Phase 5**: Google Gemini AI Intelligence & Deterministic Safety Engine (Completed & Verified)
  - Official `google-genai` SDK structured JSON outputs with Pydantic validation.
  - Deterministic pre- and post-generation safety rules, action allowlists, and fail-closed automatic fallbacks.
- **Phase 6**: Full Feature Module & Shared Telemetry Integration (Completed & Verified)
  - Unified TanStack React Query telemetry caching across Dashboard, Planner, Indoor Air, and Alternatives.
  - Strict provenance, freshness, and safety gating across all four core modules.
- **Phase 7**: Live Data Activation & Firebase Integration (In Progress)
  - **Phase 7.1 — Live Location System** (Completed & Approved): Global geocoding search (Open-Meteo) and explicit browser GPS ("Use my current location") propagating directly into shared telemetry.
  - **Phase 7.2 — Live Telemetry Activation & Verification** (Completed & Approved): Verification of genuine live environmental data pipelines across arbitrary global coordinates.
  - **Phase 7.3 — Backend Resilience & Caching** (Current): In-memory LRU caching with single-flight request coalescing, 4-decimal coordinate normalization, and strict timestamp/provenance preservation.
  - **Phase 7.4 — Firebase Setup & Authentication** (Upcoming)
  - **Phase 7.5 — Firestore User Persistence** (Upcoming)
  - **Phase 7.6 — Mode Controls & Final Integration** (Upcoming)

### Automated Test Suite Baseline
- **Total Tests**: 732+ automated tests passing with zero errors
  - **Backend (Pytest)**: 492 automated tests across 9 test suites
  - **Frontend (Vitest)**: 240 automated unit and integration tests across 15 test suites
  - **TypeScript & Vite**: Production compilation verified with 0 errors

### Data Provider Capabilities & Real Limitations
- **Open-Meteo CAMS**: Operational hourly global atmospheric chemistry forecasts (~40 km grid). Normalizes PM2.5, PM10, NO2, SO2, CO, and O3. Does not generate statutory Indian NAQI.
- **Open-Meteo Weather**: Operational numerical weather predictions providing temperature, humidity, wind velocity, and planetary boundary layer height ($h_{\text{PBL}}$) for dispersion/stagnation heuristics.
- **OpenAQ v3**: Physical ground sensor station discovery within 25 km radius. Requires `OPENAQ_API_KEY`; runs in graceful unconfigured fallback when key is absent.
- **CPCB / data.gov.in**: Statutory Indian National AQI formulas implemented in pure Python. Official live CAAQMS automated ingestion requires registered credentials; returns explicit unavailable reason if unverified. No unauthorized scraping is performed.

---

## 5. Quick Start Guide

### Running the Backend Service
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
- API Documentation: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### Running the Frontend Application
```bash
cd frontend
npm install
npm run dev
```
- Frontend UI: `http://localhost:5173`

### Running Test Suites
- **Backend**: `cd backend && PYTHONPATH=. pytest`
- **Frontend**: `cd frontend && npm run test`
- **Frontend Build**: `cd frontend && npm run build`
