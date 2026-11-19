import { describe, it, expect } from 'vitest';
import {
  evaluateIndoorVentilation,
  getPurifierGuidance,
  getSourceControlProtocols,
  isValidPollutant
} from '../utils/indoorUtils';
import { CurrentAirQualityData } from '../types/airQuality';

const createTestTelemetry = (overrides: Partial<CurrentAirQualityData> = {}): CurrentAirQualityData => {
  const base: CurrentAirQualityData = {
    aqi: 180,
    category: 'Moderate',
    dominantPollutant: 'PM2.5',
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Station',
      coordinates: { lat: 28.65, lon: 77.31 }
    },
    provenance: {
      dataSource: 'OPEN_METEO_MODELLED',
      qualityStatus: 'MODELLED_APPROXIMATION',
      recordedAt: '2026-11-29T14:00:00Z',
      forecastTimestamp: '2026-11-29T14:00:00Z',
      observedAt: null,
      retrievalFreshness: 'FRESH',
      forecastValidity: 'CURRENT_PERIOD',
      modelRunFreshness: 'UNAVAILABLE',
      indexSystem: 'Indian NAQI',
      sourceAttribution: 'Open-Meteo CAMS'
    },
    healthAdvisory: {
      summary: 'Moderate air quality.',
      maskRecommendation: 'Wear N95 if sensitive.',
      outdoorActivityLevel: 'Reduce intense outdoor exertion.'
    },
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'Fine Particulates',
        concentration: 45.0,
        unit: 'µg/m³',
        subIndex: 180,
        category: 'Moderate'
      },
      'PM10': {
        code: 'PM10',
        name: 'Coarse Particulates',
        concentration: 90.0,
        unit: 'µg/m³',
        subIndex: 120,
        category: 'Satisfactory'
      }
    },
    weather: {
      temperatureC: 22,
      relativeHumidity: 50,
      windSpeedKmh: 8,
      windDirectionDegrees: 270,
      windDirectionCardinal: 'W',
      boundaryLayerHeightMeters: 400,
      stagnationRisk: 'Low',
      dispersionConditions: 'Favorable',
      stagnationDescription: 'Good mixing.'
    },
    forecast: []
  };

  return {
    ...base,
    ...overrides,
    provenance: {
      ...base.provenance,
      ...(overrides.provenance || {})
    },
    pollutants: overrides.pollutants !== undefined ? overrides.pollutants : base.pollutants,
    weather: {
      ...base.weather,
      ...(overrides.weather || {})
    }
  };
};

describe('Indoor Utilities (indoorUtils.ts)', () => {
  describe('isValidPollutant', () => {
    it('accepts finite non-negative numbers', () => {
      expect(isValidPollutant(0)).toBe(true);
      expect(isValidPollutant(45.5)).toBe(true);
      expect(isValidPollutant(250)).toBe(true);
    });

    it('rejects null, undefined, NaN, Infinity, negative numbers, and strings', () => {
      expect(isValidPollutant(null)).toBe(false);
      expect(isValidPollutant(undefined)).toBe(false);
      expect(isValidPollutant(NaN)).toBe(false);
      expect(isValidPollutant(Infinity)).toBe(false);
      expect(isValidPollutant(-Infinity)).toBe(false);
      expect(isValidPollutant(-5.0)).toBe(false);
      expect(isValidPollutant('45.0')).toBe(false);
      expect(isValidPollutant({})).toBe(false);
    });
  });

  describe('evaluateIndoorVentilation', () => {
    it('1. Fails closed to telemetry_insufficient when telemetry is stale', () => {
      const data = createTestTelemetry({
        provenance: {
          dataSource: 'OPENAQ_V3',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T10:00:00Z',
          observedAt: '2026-11-29T10:00:00Z',
          observationFreshness: 'STALE',
          retrievalFreshness: 'STALE',
          indexSystem: 'Indian NAQI'
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('stale or expired');
      expect(result.safeVentilationHours).toHaveLength(0);
    });

    it('2. Fails closed to telemetry_insufficient in simulated demo mode', () => {
      const data = createTestTelemetry({
        provenance: {
          dataSource: 'SIMULATED_DEMO',
          qualityStatus: 'SIMULATED_SCENARIO',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          indexSystem: 'Indian NAQI'
        }
      });
      const result = evaluateIndoorVentilation(data, false);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('simulated demonstration mode');
    });

    it('3. Fails closed to telemetry_insufficient when data source is unverified/unknown', () => {
      const data = createTestTelemetry({
        provenance: {
          dataSource: 'CUSTOM_UNKNOWN_PROVIDER',
          qualityStatus: 'UNAVAILABLE',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          indexSystem: 'Unknown'
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('unverified');
    });

    it('4. Fails closed to telemetry_insufficient when PM2.5 is missing', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM10': {
            code: 'PM10',
            name: 'Coarse Particulates',
            concentration: 80.0,
            unit: 'µg/m³',
            subIndex: 80,
            category: 'Satisfactory'
          }
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('PM2.5) concentration is unavailable');
    });

    it('5. Fails closed to telemetry_insufficient when PM2.5 is invalid numeric value', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: NaN,
            unit: 'µg/m³',
            subIndex: null,
            category: null
          }
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.pm25Concentration).toBeNull();
    });

    it('6. Evaluates to restricted (LIMIT OUTDOOR AIR INFILTRATION) when PM2.5 >= 60 µg/m³', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 95.0,
            unit: 'µg/m³',
            subIndex: 250,
            category: 'Poor'
          }
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('restricted');
      expect(result.verdictTitle).toBe('LIMIT OUTDOOR AIR INFILTRATION');
      expect(result.isLiveVerified).toBe(true);
      expect(result.explanation).toContain('PM2.5 ≥ 60 µg/m³');
      expect(result.explanation).toContain('keep exterior windows and balcony doors closed to limit particulate infiltration');
      expect(result.explanation).toContain('HEPA filtration in recirculation mode');
    });

    it('7. Evaluates to conditional_favorable when PM2.5 < 30 µg/m³ and non-stagnant', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 22.0,
            unit: 'µg/m³',
            subIndex: 40,
            category: 'Good'
          }
        },
        weather: {
          temperatureC: 25,
          relativeHumidity: 45,
          windSpeedKmh: 12,
          windDirectionDegrees: 280,
          windDirectionCardinal: 'W',
          boundaryLayerHeightMeters: 600,
          stagnationRisk: 'Low',
          dispersionConditions: 'Favorable',
          stagnationDescription: 'Good mixing'
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('conditional_favorable');
      expect(result.verdictTitle).toBe('CONDITIONAL VENTILATION CONSIDERATION');
      expect(result.isLiveVerified).toBe(true);
      expect(result.explanation).toContain('low (< 30 µg/m³)');
      expect(result.explanation).toContain('low outdoor PM2.5 alone does not guarantee good indoor air quality');
      expect(result.explanation).toContain('Do not open windows automatically');
    });

    it('8. Evaluates to selective when PM2.5 is in [30, 60) µg/m³', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 42.0,
            unit: 'µg/m³',
            subIndex: 140,
            category: 'Moderate'
          }
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('selective');
      expect(result.verdictTitle).toBe('SELECTIVE AIRING CONSIDERATION');
      expect(result.isLiveVerified).toBe(true);
      expect(result.explanation).toContain('moderate (30–60 µg/m³)');
      expect(result.explanation).toContain('Brief, controlled cross-ventilation');
    });

    it('9. Evaluates to selective even with PM2.5 < 30 µg/m³ if atmospheric dispersion is stagnant', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 25.0,
            unit: 'µg/m³',
            subIndex: 45,
            category: 'Good'
          }
        },
        weather: {
          temperatureC: 18,
          relativeHumidity: 75,
          windSpeedKmh: 3,
          windDirectionDegrees: 270,
          windDirectionCardinal: 'W',
          boundaryLayerHeightMeters: 180,
          stagnationRisk: 'Elevated',
          dispersionConditions: 'Potentially Unfavorable',
          stagnationDescription: 'Severe morning temperature inversion'
        }
      });
      const result = evaluateIndoorVentilation(data, true);
      expect(result.status).toBe('selective');
      expect(result.verdictTitle).toBe('SELECTIVE AIRING CONSIDERATION');
    });

    it('10. Outdoor disclosure explicitly clarifies ambient data is not an indoor sensor', () => {
      const data = createTestTelemetry();
      const result = evaluateIndoorVentilation(data, true);
      expect(result.outdoorDisclosure).toContain('outdoor ambient air quality');
      expect(result.outdoorDisclosure).toContain('does not measure private indoor rooms or fabricate indoor IoT sensor readings');
    });
  });

  describe('getPurifierGuidance', () => {
    it('suppresses condition-dependent purifier mode when telemetry is unverified and provides neutral educational advice', () => {
      const guidance = getPurifierGuidance(85.0, false);
      expect(guidance.isConditionDependent).toBe(false);
      expect(guidance.mode).toBeNull();
      expect(guidance.operationalAdvice).toContain('HEPA Filtration & Air Cleaning Principles');
      expect(guidance.operationalAdvice).toContain('Real-time condition-dependent operating directives, modes, and window adjustments are withheld');
      expect(guidance.operationalAdvice).not.toMatch(/running continuously/i);
      expect(guidance.operationalAdvice).not.toMatch(/keep exterior windows.*closed/i);
      expect(guidance.effectivenessFactors.length).toBeGreaterThanOrEqual(4);

      // Proves no operating directives to continuously run or keep windows/doors closed
      expect(guidance.effectivenessFactors.some(f => /running continuously/i.test(f))).toBe(false);
      expect(guidance.effectivenessFactors.some(f => /keep exterior windows and doors closed/i.test(f))).toBe(false);

      // Proves factors explain room sizing/CADR, airflow, placement, enclosure dynamics, and filter maintenance
      expect(guidance.effectivenessFactors.some(f => /Room Sizing & CADR/i.test(f))).toBe(true);
      expect(guidance.effectivenessFactors.some(f => /Airflow Dynamics/i.test(f))).toBe(true);
      expect(guidance.effectivenessFactors.some(f => /Device Placement/i.test(f))).toBe(true);
      expect(guidance.effectivenessFactors.some(f => /Filter Care/i.test(f))).toBe(true);
    });

    it('suppresses condition-dependent purifier mode when PM2.5 is null', () => {
      const guidance = getPurifierGuidance(null, true);
      expect(guidance.isConditionDependent).toBe(false);
      expect(guidance.mode).toBeNull();
    });

    it('provides continuous recirculation mode for verified elevated PM2.5', () => {
      const guidance = getPurifierGuidance(85.0, true);
      expect(guidance.isConditionDependent).toBe(true);
      expect(guidance.mode).toContain('Continuous Recirculation (Elevated Ambient Smog)');
      expect(guidance.operationalAdvice).toContain('Operate mechanical HEPA air filtration continuously in recirculation mode');
      expect(guidance.effectivenessFactors.length).toBeGreaterThanOrEqual(4);
      expect(guidance.ozoneWarning).toContain('STRICT SAFETY DIRECTIVE: Never use ozone generators');
    });

    it('provides baseline mode for verified standard maintenance', () => {
      const guidance = getPurifierGuidance(25.0, true);
      expect(guidance.isConditionDependent).toBe(true);
      expect(guidance.mode).toContain('Baseline Recirculation');
      expect(guidance.operationalAdvice).toContain('pre-filter');
    });

    it('never suggests ozone generators or uncertified ionizers as safe', () => {
      const guidance = getPurifierGuidance(120.0, true);
      expect(guidance.ozoneWarning).toContain('Ozone is an acute pulmonary irritant');
      expect(guidance.ozoneWarning).toContain('Only mechanical HEPA filtration and activated carbon absorption are safe');
    });
  });

  describe('getSourceControlProtocols', () => {
    it('returns practical, non-prescriptive source control protocols', () => {
      const tips = getSourceControlProtocols();
      expect(tips.length).toBeGreaterThanOrEqual(4);

      const kitchenTip = tips.find((t) => t.category.includes('Kitchen'));
      expect(kitchenTip).toBeDefined();
      expect(kitchenTip?.rationale).toContain('nitrogen dioxide (NO2)');
      expect(kitchenTip?.rationale).toContain('Electric and induction cooktops');

      const dustTip = tips.find((t) => t.category.includes('Dust'));
      expect(dustTip).toBeDefined();
      expect(dustTip?.guidance).toContain('damp mops');

      const smokeTip = tips.find((t) => t.category.includes('Tobacco'));
      expect(smokeTip).toBeDefined();
      expect(smokeTip?.guidance).toContain('smoke-free');

      const combustionTip = tips.find((t) => t.category.includes('Combustion'));
      expect(combustionTip).toBeDefined();
      expect(combustionTip?.guidance).toContain('incense sticks');
    });
  });
});
