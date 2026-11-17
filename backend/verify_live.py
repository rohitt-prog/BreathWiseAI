"""
Manual verification script for BreatheWise AI Phase 4 Backend.
Performs live queries against the FastAPI application and external APIs
to verify end-to-end data pipelines, normalization, and integrity metadata.
"""
import asyncio
import json
from httpx import AsyncClient, ASGITransport
from app.main import app

async def run_live_verification():
    print("=" * 60)
    print("BREATHEWISE AI — PHASE 4 LIVE BACKEND VERIFICATION")
    print("=" * 60)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/health")
        print(f"\n[1] Health Check: HTTP {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        assert res.status_code == 200

        # 2. Providers Status
        res = await client.get("/api/v1/providers/status")
        print(f"\n[2] Providers Status: HTTP {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        assert res.status_code == 200

        # 3. Current Air Quality (Delhi coordinates: 28.6508 N, 77.3152 E)
        res = await client.get("/api/v1/air-quality/current?latitude=28.6508&longitude=77.3152")
        print(f"\n[3] Current Air Quality: HTTP {res.status_code}")
        aq_data = res.json()
        print(f"Location: ({aq_data['location']['latitude']}, {aq_data['location']['longitude']})")
        print(f"Provider: {aq_data['provider']}")
        print(f"Source Type: {aq_data['source_type']}")
        print(f"Observed At: {aq_data['observed_at']}")
        print(f"Forecast Timestamp: {aq_data['forecast_timestamp']}")
        print(f"Indian NAQI: {aq_data['indian_naqi']}")
        print(f"NAQI Category: {aq_data['indian_naqi_category']}")
        print(f"Reason: {aq_data['indian_naqi_unavailable_reason']}")
        print(f"Dominant Pollutant: {aq_data['dominant_pollutant']}")
        print(f"Dominant Pollutant Methodology: {aq_data['dominant_pollutant_methodology']}")
        print(f"Freshness Status: {aq_data['freshness_status']}")
        print(f"Source Attribution: {aq_data['source_attribution']}")
        print(f"Available Pollutants: {list(aq_data['available_pollutants'].keys())}")
        for pol_id, p in list(aq_data['available_pollutants'].items())[:3]:
            print(f"  - {pol_id}: {p['concentration']} {p['unit']} (classification: {p['data_classification']})")
        assert res.status_code == 200
        assert aq_data['indian_naqi'] is None  # Strict integrity check: no fake NAQI
        assert aq_data['observed_at'] is None  # Modelled data must have observed_at == None
        assert aq_data['dominant_pollutant'] is None  # Modelled data cannot establish official dominant pollutant

        # 4. Air Quality Forecast (24 hours)
        res = await client.get("/api/v1/air-quality/forecast?latitude=28.6508&longitude=77.3152&hours=24")
        print(f"\n[4] Air Quality Forecast: HTTP {res.status_code}")
        fc_data = res.json()
        print(f"Forecast hours returned: {len(fc_data['hourly_forecast'])}")
        print(f"Source Type: {fc_data['source_type']}")
        print(f"Provider: {fc_data['provider']}")
        assert res.status_code == 200
        assert len(fc_data['hourly_forecast']) == 24

        # 5. Current Weather & Dispersion Conditions
        res = await client.get("/api/v1/weather/current?latitude=28.6508&longitude=77.3152")
        print(f"\n[5] Current Weather: HTTP {res.status_code}")
        w_data = res.json()
        print(f"Temperature: {w_data['temperature_c']} °C")
        print(f"Humidity: {w_data['relative_humidity']} %")
        print(f"Wind Speed: {w_data['wind_speed_kmh']} km/h ({w_data['wind_direction_cardinal']})")
        print(f"Boundary Layer Height: {w_data['boundary_layer_height_meters']} m")
        print(f"Stagnation Risk: {w_data['stagnation_risk']}")
        print(f"Dispersion Conditions: {w_data['dispersion_conditions']}")
        print(f"Stagnation Description: {w_data['stagnation_description']}")
        print(f"Observed At: {w_data['observed_at']}")
        print(f"Forecast Timestamp: {w_data['forecast_timestamp']}")
        assert res.status_code == 200
        assert "inversion_risk" not in w_data  # Obsolete field strictly removed
        assert w_data['observed_at'] is None  # Modelled weather has observed_at == None
        assert w_data['forecast_timestamp'] is not None
        assert "does not establish a confirmed" in w_data['stagnation_description']
        assert "temperature inversion" in w_data['stagnation_description']
        assert "trapping all" not in w_data['stagnation_description']

    print("\n" + "=" * 60)
    print("ALL LIVE ENDPOINTS VERIFIED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_live_verification())
