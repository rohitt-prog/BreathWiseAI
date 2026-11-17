# BreatheWise AI — Breathe Smarter. Live Healthier.

**PromptWars Virtual — Challenge 6: Urban Air Quality Assistant**  
**Final Submission Deadline:** 29 November 2026, 11:59 PM IST  

---

## 1. Project Overview
BreatheWise AI is a GenAI-augmented urban air quality assistant specifically architected for families, students, and outdoor workers in severely polluted urban centers (such as North India's annual winter smog crisis).

### Core Product Philosophy
$$\text{Environmental Data} \longrightarrow \text{Intelligence} \longrightarrow \text{Action} \longrightarrow \text{Impact}$$

BreatheWise AI bridges verified multi-source environmental telemetry and practical daily decisions, with an explicit distinction between:
- **Personal Exposure Reduction**: Protecting lungs from hazardous PM2.5/PM10 inhalation.
- **Community Emission Abatement**: Practical choices that minimize individual environmental footprints.

---

## 2. Key Architecture Pillars
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Leaflet (OpenStreetMap).
- **Backend**: Python 3.11+, FastAPI, Pydantic v2 validation, Async HTTP (httpx).
- **AI Intelligence**: Google Gemini API with native structured JSON outputs and deterministic safety guardrails.
- **Persistence**: Firebase Authentication, Google Cloud Firestore.
- **Environmental Data Providers**: CPCB / data.gov.in (Official India NAQI), OpenAQ v3 (Ground sensors), Open-Meteo (Atmospheric chemistry & meteorological forecasts).

---

## 3. Project Structure
```
BreathwiseAI/
├── frontend/               # React 18 + TypeScript + Vite SPA
├── backend/                # Python FastAPI REST API
├── .gitignore              # Strict rules enforcing < 10 MB repository budget
└── README.md
```

---

## 4. Current Phase: Phase 3 (Frontend Foundation)
Phase 2 (Architecture & UX Specification) has been approved. Phase 3 establishes the complete frontend application shell, design system tokens, responsive layout, and interactive mock-data views across all primary screens.
