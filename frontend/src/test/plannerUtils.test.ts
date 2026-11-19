import { describe, it, expect } from 'vitest';
import {
  formatLocalTime,
  inspectForecastSufficiency,
  isForecastDataSufficient,
  groupForecastIntoDiurnalSlots,
  calculateSlotAverages,
  evaluateSmogRisk,
  generateDynamicDailyPlan,
  isStagnationVerified,
  isValidPollutantValue,
  isValidAqiValue,
  DispersionEvidence,
} from '../utils/plannerUtils';
import { getMockForecastResponse } from '../services/apiClient';
import { AirQualityForecastResponse, HourlyForecastPoint } from '../types/airQuality';
import { UserPreferences } from '../types/user';

const mockPreferences: UserPreferences = {
  personaType: 'student',
  defaultLocation: { name: 'Delhi', city: 'Delhi', lat: 28.65, lon: 77.31 },
  commuteMode: 'metro',
  commuteTimes: { morningDeparture: '08:30', eveningReturn: '18:00' },
  hasSensitiveMembers: false,
  indoorFacilities: { hasAirPurifier: true, purifierFilterType: 'HEPA', homeVentilationType: 'sealed_ac' },
  notificationsEnabled: true,
};

describe('Planner Utilities (Scientific Grounding & Safety)', () => {
  describe('formatLocalTime', () => {
    it('formats ISO timestamps to local HH:mm string', () => {
      const formatted = formatLocalTime('2026-11-29T10:00:00Z');
      expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    });

    it('returns fallback string for invalid timestamp strings', () => {
      expect(formatLocalTime('not-a-date')).toBe('--:--');
    });
  });

  describe('Strict Numerical Validation (isValidPollutantValue & isValidAqiValue)', () => {
    it('5. Accepts only finite non-negative numbers and rejects NaN, Infinity, negative, null, undefined, strings', () => {
      // Valid numeric values
      expect(isValidPollutantValue(0)).toBe(true);
      expect(isValidPollutantValue(15.5)).toBe(true);
      expect(isValidPollutantValue(150)).toBe(true);

      expect(isValidAqiValue(0)).toBe(true);
      expect(isValidAqiValue(50)).toBe(true);
      expect(isValidAqiValue(300)).toBe(true);

      // Invalid values
      expect(isValidPollutantValue(NaN)).toBe(false);
      expect(isValidPollutantValue(Infinity)).toBe(false);
      expect(isValidPollutantValue(-Infinity)).toBe(false);
      expect(isValidPollutantValue(-0.1)).toBe(false);
      expect(isValidPollutantValue(-25)).toBe(false);
      expect(isValidPollutantValue(null)).toBe(false);
      expect(isValidPollutantValue(undefined)).toBe(false);
      expect(isValidPollutantValue('45')).toBe(false);
      expect(isValidPollutantValue({})).toBe(false);
      expect(isValidPollutantValue([])).toBe(false);

      expect(isValidAqiValue(NaN)).toBe(false);
      expect(isValidAqiValue(Infinity)).toBe(false);
      expect(isValidAqiValue(-1)).toBe(false);
      expect(isValidAqiValue(null)).toBe(false);
      expect(isValidAqiValue(undefined)).toBe(false);
      expect(isValidAqiValue('150')).toBe(false);
    });
  });

  describe('groupForecastIntoDiurnalSlots', () => {
    it('groups 24 hourly forecast points into diurnal buckets', () => {
      const baseDate = new Date();
      baseDate.setMinutes(0, 0, 0);

      const points: HourlyForecastPoint[] = [];
      for (let i = 0; i < 24; i++) {
        const d = new Date(baseDate.getTime() + i * 3600 * 1000);
        points.push({
          timestamp: d.toISOString(),
          modelled_aqi_estimate: 150,
          pm2_5: 50,
          pm10: 100,
          nitrogen_dioxide: 30,
          sulphur_dioxide: 10,
          ozone: 20,
          data_classification: 'MODELLED_FORECAST',
        });
      }

      const grouped = groupForecastIntoDiurnalSlots(points);
      expect(grouped).toHaveProperty('morning');
      expect(grouped).toHaveProperty('afternoon');
      expect(grouped).toHaveProperty('evening');
      expect(grouped).toHaveProperty('night');

      const totalGrouped =
        grouped.morning.length +
        grouped.afternoon.length +
        grouped.evening.length +
        grouped.night.length;
      expect(totalGrouped).toBe(24);
    });
  });

  describe('inspectForecastSufficiency & isForecastDataSufficient', () => {
    it('returns false for undefined, null, or empty hourly forecast', () => {
      expect(isForecastDataSufficient(undefined)).toBe(false);
      expect(isForecastDataSufficient(null)).toBe(false);
      expect(
        isForecastDataSufficient({
          location: { latitude: 28.65, longitude: 77.31 },
          provider: 'Open-Meteo',
          source_type: 'MODELLED_FORECAST',
          retrieved_at: '2026-11-29T10:00:00Z',
          retrieval_freshness: 'FRESH',
          model_run_freshness: 'UNAVAILABLE',
          hourly_forecast: [],
          source_attribution: 'Test',
          limitations: [],
        })
      ).toBe(false);
    });

    it('distinguishes PM2.5/PM10 availability from modelled AQI-only availability', () => {
      const aqiOnlyForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: '2026-11-29T10:00:00Z',
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: [
          {
            timestamp: '2026-11-29T10:00:00Z',
            modelled_aqi_estimate: 165,
            pm2_5: null,
            pm10: null,
            nitrogen_dioxide: null,
            sulphur_dioxide: null,
            ozone: null,
            data_classification: 'MODELLED_FORECAST',
          },
        ],
        source_attribution: 'Test',
        limitations: [],
      };

      const result = inspectForecastSufficiency(aqiOnlyForecast);
      expect(result.isSufficient).toBe(true);
      expect(result.isAqiOnly).toBe(true);
      expect(result.hasPm25).toBe(false);
      expect(result.hasModelledAqi).toBe(true);
    });

    it('2. PM10-only telemetry cannot produce unsupported PM2.5 risk decisions', () => {
      const pm10OnlyForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: '2026-11-29T10:00:00Z',
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: [
          {
            timestamp: '2026-11-29T10:00:00Z',
            modelled_aqi_estimate: null,
            pm2_5: null, // missing PM2.5!
            pm10: 180,  // only coarse PM10 present
            nitrogen_dioxide: null,
            sulphur_dioxide: null,
            ozone: null,
            data_classification: 'MODELLED_FORECAST',
          },
        ],
        source_attribution: 'Test',
        limitations: [],
      };

      const result = inspectForecastSufficiency(pm10OnlyForecast);
      expect(result.isSufficient).toBe(false);
      expect(result.isPm10Only).toBe(true);
      expect(result.reason).toContain('PM10-only telemetry is insufficient');
      expect(isForecastDataSufficient(pm10OnlyForecast)).toBe(false);
    });

    it('returns false if all points have null, negative, or NaN pollutants and no valid AQI', () => {
      const forecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: '2026-11-29T10:00:00Z',
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: [
          {
            timestamp: '2026-11-29T10:00:00Z',
            modelled_aqi_estimate: NaN,
            pm2_5: -10,
            pm10: NaN,
            nitrogen_dioxide: null,
            sulphur_dioxide: null,
            ozone: null,
            data_classification: 'MODELLED_FORECAST',
          },
        ],
        source_attribution: 'Test',
        limitations: [],
      };
      expect(isForecastDataSufficient(forecast)).toBe(false);
    });
  });

  describe('calculateSlotAverages (Deduplication, Strict Validation, Metric Coverage)', () => {
    it('does NOT treat missing PM2.5 data as zero', () => {
      const points: HourlyForecastPoint[] = [
        {
          timestamp: '2026-11-29T10:00:00Z',
          modelled_aqi_estimate: null,
          pm2_5: null, // missing!
          pm10: 100,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T11:00:00Z',
          modelled_aqi_estimate: null,
          pm2_5: 60,
          pm10: 120,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
      ];

      const res = calculateSlotAverages(points);
      expect(res.avgPm25).toBe(60);
      expect(res.avgPm10).toBe(110);
      expect(res.avgModelledAqi).toBeNull();
    });

    it('4. Rejects duplicate hourly timestamps so duplicate points do not inflate coverage', () => {
      const duplicatePoints: HourlyForecastPoint[] = [
        {
          timestamp: '2026-11-29T10:00:00Z',
          modelled_aqi_estimate: null,
          pm2_5: 45.0,
          pm10: 80.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T10:00:00Z', // Duplicate timestamp!
          modelled_aqi_estimate: null,
          pm2_5: 45.0,
          pm10: 80.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T10:00:00Z', // Another duplicate timestamp!
          modelled_aqi_estimate: null,
          pm2_5: 45.0,
          pm10: 80.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
      ];

      const res = calculateSlotAverages(duplicatePoints);
      expect(res.count).toBe(1);
      expect(res.validPm25Count).toBe(1);
      expect(res.hasAdequatePm25Coverage).toBe(false); // < MIN_HOURLY_COVERAGE_POINTS (3)
    });

    it('3. Enforces metric-specific coverage: AQI points do NOT count toward PM2.5 coverage', () => {
      const points: HourlyForecastPoint[] = [
        {
          timestamp: '2026-11-29T07:00:00Z',
          modelled_aqi_estimate: 120,
          pm2_5: null, // missing PM2.5
          pm10: null,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T08:00:00Z',
          modelled_aqi_estimate: 125,
          pm2_5: null, // missing PM2.5
          pm10: null,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T09:00:00Z',
          modelled_aqi_estimate: 130,
          pm2_5: null, // missing PM2.5
          pm10: null,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
      ];

      const res = calculateSlotAverages(points);
      expect(res.hasAdequateAqiCoverage).toBe(true);
      expect(res.hasAdequatePm25Coverage).toBe(false);
      expect(res.validPm25Count).toBe(0);
      expect(res.validAqiCount).toBe(3);
    });

    it('5. Filters out NaN, Infinity, and negative values before computing averages', () => {
      const malformedPoints: HourlyForecastPoint[] = [
        {
          timestamp: '2026-11-29T12:00:00Z',
          modelled_aqi_estimate: NaN,
          pm2_5: -50.0, // negative!
          pm10: Infinity,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T13:00:00Z',
          modelled_aqi_estimate: 100,
          pm2_5: 30.0,
          pm10: 50.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
      ];

      const res = calculateSlotAverages(malformedPoints);
      expect(res.avgPm25).toBe(30.0);
      expect(res.avgPm10).toBe(50.0);
      expect(res.avgModelledAqi).toBe(100);
      expect(res.validPm25Count).toBe(1);
    });
  });

  describe('Stagnation Evidence Verification (isStagnationVerified)', () => {
    it('2. Verified unfavorable dispersion returns true only when fresh and usable', () => {
      const verifiedEvidence1: DispersionEvidence = {
        isUsable: true,
        freshness: 'FRESH',
        stagnationRisk: 'Elevated',
      };
      expect(isStagnationVerified(verifiedEvidence1)).toBe(true);

      const verifiedEvidence2: DispersionEvidence = {
        weatherUsable: true,
        freshness: 'RECENT',
        dispersionConditions: 'Potentially Unfavorable',
      };
      expect(isStagnationVerified(verifiedEvidence2)).toBe(true);

      const verifiedEvidence3: DispersionEvidence = {
        isUsable: true,
        freshness: 'FRESH',
        stagnationRisk: 'Moderate',
      };
      expect(isStagnationVerified(verifiedEvidence3)).toBe(true);
    });

    it('2. Missing dispersion evidence does NOT imply stagnation (fails closed)', () => {
      expect(isStagnationVerified(undefined)).toBe(false);
      expect(isStagnationVerified(null)).toBe(false);
      expect(isStagnationVerified({})).toBe(false);
    });

    it('2. Stale or invalid dispersion evidence cannot affect classification', () => {
      // Stale freshness
      expect(
        isStagnationVerified({
          isUsable: true,
          freshness: 'STALE',
          stagnationRisk: 'Elevated',
        })
      ).toBe(false);

      // Invalid freshness
      expect(
        isStagnationVerified({
          isUsable: true,
          freshness: 'INVALID',
          dispersionConditions: 'Potentially Unfavorable',
        })
      ).toBe(false);

      // Not usable
      expect(
        isStagnationVerified({
          isUsable: false,
          freshness: 'FRESH',
          stagnationRisk: 'Elevated',
        })
      ).toBe(false);

      // Favorable dispersion
      expect(
        isStagnationVerified({
          isUsable: true,
          freshness: 'FRESH',
          stagnationRisk: 'Low',
          dispersionConditions: 'Favorable',
        })
      ).toBe(false);
    });
  });

  describe('evaluateSmogRisk (Authoritative Backend Alignment & Fail-Closed)', () => {
    it('1. Missing PM2.5 produces unavailable risk, not moderate risk', () => {
      expect(evaluateSmogRisk(null, null)).toBe('unavailable');
      expect(evaluateSmogRisk(null, 150)).toBe('unavailable');
      expect(evaluateSmogRisk(null, 200, true)).toBe('unavailable');
    });

    it('1. Aligns PM2.5 boundaries at 30, 40, and 60 with backend deterministic safety rules', () => {
      // PM2.5 < 30 and no verified stagnation -> 'low'
      expect(evaluateSmogRisk(29.9, null, false, false)).toBe('low');
      expect(evaluateSmogRisk(15.0, null, false, false)).toBe('low');

      // PM2.5 < 30 with verified stagnation -> 'moderate'
      expect(evaluateSmogRisk(29.9, null, false, true)).toBe('moderate');
      expect(evaluateSmogRisk(15.0, null, false, true)).toBe('moderate');

      // PM2.5 30 to < 40 -> 'moderate'
      expect(evaluateSmogRisk(30.0, null, false)).toBe('moderate');
      expect(evaluateSmogRisk(35.0, null, false)).toBe('moderate');
      expect(evaluateSmogRisk(39.9, null, false)).toBe('moderate');

      // PM2.5 40 to < 60 -> 'moderate'
      expect(evaluateSmogRisk(40.0, null, false)).toBe('moderate');
      expect(evaluateSmogRisk(45.0, null, false)).toBe('moderate');
      expect(evaluateSmogRisk(59.9, null, false)).toBe('moderate');

      // PM2.5 >= 60 -> 'high' (elevated particulate scenario)
      expect(evaluateSmogRisk(60.0, null, false)).toBe('high');
      expect(evaluateSmogRisk(65.0, null, false)).toBe('high');
      expect(evaluateSmogRisk(130.0, null, false)).toBe('high');
    });

    it('4. AQI-only telemetry cannot produce unsupported risk tiers', () => {
      // Unsupported hardcoded thresholds (100, 150) are removed
      expect(evaluateSmogRisk(null, 160)).toBe('unavailable');
      expect(evaluateSmogRisk(null, 120)).toBe('unavailable');
      expect(evaluateSmogRisk(null, 50)).toBe('unavailable');
    });
  });

  describe('generateDynamicDailyPlan (Gating, Demo Purity, Sensitive Wording, and Provenance)', () => {
    it('1. Stale telemetry cannot produce favorable or restricted indoor ventilation recommendations', () => {
      const now = new Date();
      now.setHours(12, 0, 0, 0);

      const points: HourlyForecastPoint[] = [];
      for (let i = 0; i < 4; i++) {
        points.push({
          timestamp: new Date(now.getTime() + i * 3600 * 1000).toISOString(),
          modelled_aqi_estimate: null,
          pm2_5: 20.0, // Seemingly low PM2.5
          pm10: 35.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        });
      }

      const staleForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(), // 90 min ago
        retrieval_freshness: 'STALE',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: points,
        source_attribution: 'Test',
        limitations: [],
      };

      const plan = generateDynamicDailyPlan(staleForecast, mockPreferences, 'balanced', null, { isStale: true });
      expect(plan.indoorProtocols.ventilationPermitted).toBe(false);
      expect(plan.indoorProtocols.ventilationStatus).toBe('telemetry_insufficient');
      expect(plan.indoorProtocols.ventilationSafeHours).toHaveLength(0);
      expect(plan.indoorProtocols.ventilationReason).toContain('Telemetry stale');
    });

    it('2. Unknown-source telemetry cannot produce indoor ventilation recommendations', () => {
      const now = new Date();
      now.setHours(12, 0, 0, 0);

      const points: HourlyForecastPoint[] = [];
      for (let i = 0; i < 4; i++) {
        points.push({
          timestamp: new Date(now.getTime() + i * 3600 * 1000).toISOString(),
          modelled_aqi_estimate: null,
          pm2_5: 18.0,
          pm10: 30.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'CUSTOM_UNKNOWN',
        });
      }

      const unknownForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Unknown Private Provider',
        source_type: 'CUSTOM_UNKNOWN',
        retrieved_at: now.toISOString(),
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: points,
        source_attribution: 'Custom Private Model',
        limitations: [],
      };

      const plan = generateDynamicDailyPlan(unknownForecast, mockPreferences, 'balanced', null, { isUnknownSource: true });
      expect(plan.indoorProtocols.ventilationPermitted).toBe(false);
      expect(plan.indoorProtocols.ventilationStatus).toBe('telemetry_insufficient');
      expect(plan.indoorProtocols.ventilationSafeHours).toHaveLength(0);
      expect(plan.indoorProtocols.ventilationReason).toContain('Unverified telemetry source');
    });

    it('3. Demo mode has no actionable commute, exercise, mask, exposure, or ventilation directives in its cards', () => {
      const demoResponse = getMockForecastResponse('del_anand_vihar', { lat: 28.65, lon: 77.31 });
      const plan = generateDynamicDailyPlan(demoResponse, mockPreferences, 'balanced', null, { isDemo: true });

      for (const slot of plan.itinerary) {
        expect(slot.isBestWindow).toBe(false);
        expect(slot.requiresMask).toBe(false);
        expect(slot.maskType).toBe('none');

        // Check that instructions do NOT give real-world commute, exercise, or transit commands
        expect(slot.recommendedAction).toContain('Demonstration Walkthrough');
        expect(slot.recommendedAction).not.toContain('Move strenuous high-intensity cardiovascular exercise indoors');
        expect(slot.recommendedAction).not.toContain('Favor electric mass transit');

        expect(slot.exposureMitigation).toContain('Simulation Walkthrough');
        expect(slot.sustainableChoice).toContain('Simulation Walkthrough');
      }

      expect(plan.indoorProtocols.ventilationPermitted).toBe(false);
      expect(plan.indoorProtocols.ventilationStatus).toBe('telemetry_insufficient');
      expect(plan.indoorProtocols.ventilationSafeHours).toHaveLength(0);
    });

    it('4. AQI-only telemetry cannot produce unsupported risk tiers or PM2.5-specific recommendations', () => {
      const now = new Date();
      now.setHours(8, 0, 0, 0);

      const points: HourlyForecastPoint[] = [];
      for (let i = 0; i < 4; i++) {
        points.push({
          timestamp: new Date(now.getTime() + i * 3600 * 1000).toISOString(),
          modelled_aqi_estimate: 175, // Elevated AQI, but PM2.5 missing!
          pm2_5: null,
          pm10: null,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        });
      }

      const aqiOnlyForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: now.toISOString(),
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: points,
        source_attribution: 'Test',
        limitations: [],
      };

      const plan = generateDynamicDailyPlan(aqiOnlyForecast, mockPreferences, 'balanced');
      const morningSlot = plan.itinerary.find((s) => s.period === 'morning');

      // Prescriptive risk tiers and mask requirements are strictly suppressed
      expect(morningSlot?.smogRisk).toBe('unavailable');
      expect(morningSlot?.requiresMask).toBe(false);
      expect(morningSlot?.recommendedAction).toContain('Prescriptive exposure tiers and outdoor exercise restrictions require verified fine particulate (PM2.5) telemetry');
      expect(morningSlot?.scientificRationale).toContain('PM2.5 concentrations are unexposed by provider; prescriptive risk directives are suppressed');
    });

    it('5. Sensitive-member wording contains no blanket prohibition on all outdoor exertion', () => {
      const now = new Date();
      now.setHours(8, 0, 0, 0);

      const points: HourlyForecastPoint[] = [];
      for (let i = 0; i < 4; i++) {
        points.push({
          timestamp: new Date(now.getTime() + i * 3600 * 1000).toISOString(),
          modelled_aqi_estimate: null,
          pm2_5: 75.0, // Elevated PM2.5 >= 60
          pm10: 120.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        });
      }

      const elevatedForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: now.toISOString(),
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: points,
        source_attribution: 'Test',
        limitations: [],
      };

      const sensitivePrefs: UserPreferences = {
        ...mockPreferences,
        hasSensitiveMembers: true,
      };

      const plan = generateDynamicDailyPlan(elevatedForecast, sensitivePrefs, 'balanced');
      const allText = JSON.stringify(plan);

      // Must NOT contain blanket prohibition on all outdoor exertion or movement
      expect(allText).not.toContain('avoid all outdoor exertion');
      expect(allText).not.toContain('avoid all outdoor movement');

      // Instead, uses proportionate guidance
      const morningSlot = plan.itinerary.find((s) => s.period === 'morning');
      expect(morningSlot?.recommendedAction).toContain('avoid strenuous outdoor activity');
      expect(morningSlot?.recommendedAction).toContain('When outdoor travel is necessary, use a certified, well-fitted N95 respirator');
    });

    it('8. Safety provenance is not hardcoded to true for invalid or unverified conditions', () => {
      const demoResponse = getMockForecastResponse('del_anand_vihar', { lat: 28.65, lon: 77.31 });

      const now = new Date();
      now.setHours(8, 0, 0, 0);
      const points: HourlyForecastPoint[] = [];
      for (let i = 0; i < 3; i++) {
        points.push({
          timestamp: new Date(now.getTime() + i * 3600 * 1000).toISOString(),
          modelled_aqi_estimate: null,
          pm2_5: 35.0,
          pm10: 60.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        });
      }
      const liveForecast: AirQualityForecastResponse = {
        location: { latitude: 28.65, longitude: 77.31 },
        provider: 'Open-Meteo',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: now.toISOString(),
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: points,
        source_attribution: 'Open-Meteo CAMS',
        limitations: [],
      };

      // Demo must report false
      const demoPlan = generateDynamicDailyPlan(demoResponse, mockPreferences, 'balanced', null, { isDemo: true });
      expect(demoPlan.aiProvenance.deterministicSafetyEnginePassed).toBe(false);
      expect(demoPlan.aiProvenance.validationStatus).toBe('SIMULATED_DEMO');

      // Stale must report false
      const staleForecast: AirQualityForecastResponse = {
        ...liveForecast,
        retrieval_freshness: 'STALE',
      };
      const stalePlan = generateDynamicDailyPlan(staleForecast, mockPreferences, 'balanced', null, { isStale: true });
      expect(stalePlan.aiProvenance.deterministicSafetyEnginePassed).toBe(false);
      expect(stalePlan.aiProvenance.validationStatus).toBe('STALE_DATA');

      // Unknown source must report false
      const unknownForecast: AirQualityForecastResponse = {
        ...liveForecast,
        source_type: 'CUSTOM_UNKNOWN',
      };
      const unknownPlan = generateDynamicDailyPlan(unknownForecast, mockPreferences, 'balanced', null, { isUnknownSource: true });
      expect(unknownPlan.aiProvenance.deterministicSafetyEnginePassed).toBe(false);
      expect(unknownPlan.aiProvenance.validationStatus).toBe('UNVERIFIED_SOURCE');

      // Live verified with valid PM2.5 coverage reports true
      const livePlan = generateDynamicDailyPlan(liveForecast, mockPreferences, 'balanced');
      expect(livePlan.aiProvenance.deterministicSafetyEnginePassed).toBe(true);
      expect(livePlan.aiProvenance.validationStatus).toBe('VERIFIED_PASSED');
    });
  });
});
