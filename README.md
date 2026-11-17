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
│   └── test/               # Vitest + React Testing Library suites (28 tests)
├── backend/                # Python FastAPI REST API
│   ├── app/
│   │   ├── api/routes/     # Clean endpoints (air-quality, weather, providers, health)
│   │   ├── core/           # Config, safe logging, custom exceptions
│   │   ├── providers/      # Open-Meteo, OpenAQ, and CPCB provider adapters
│   │   ├── schemas/        # Strict Pydantic v2 validation models
│   │   └── services/       # Data validation, inversion physics, and provider orchestration
│   ├── tests/              # Pytest test suite (25 tests)
│   ├── verify_live.py      # Live external API verification script
│   └── requirements.txt    # Python dependencies
├── .gitignore              # Enforces lean repository budget (< 10 MB limit)
└── README.md
```

---

## 4. Current Phase: Phase 4 Completed (Backend & Live Environmental Data Integration)

- **Phase 1**: Domain Research & Strategic Architecture (Completed)
- **Phase 2**: Product Architecture & UX Specification (Approved)
- **Phase 3**: Frontend Foundation & Scientific Presentation (Completed & Verified)
- **Phase 4**: Backend & Live Environmental Data Integration (Completed & Verified)
  - Python 3.11+ FastAPI service with Pydantic v2 normalization.
  - Multi-provider adapter layer (Open-Meteo CAMS, OpenAQ v3, CPCB integration).
  - Transparent data provenance (`OBSERVATION` vs `MODELLED_FORECAST`).
  - Strict Indian NAQI integrity: returns `null` with explanation if certified CPCB data is unavailable (zero fabrication of international indices).
  - Atmospheric boundary layer stagnation and nocturnal thermal inversion risk physics.
  - React frontend integrated with live backend endpoints and graceful offline fallback.
  - 53 total automated tests (25 backend pytest, 28 frontend vitest) all passing with zero errors.

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
