import { describe, it, expect } from 'vitest';
import {
  isValidPollutant,
  getEducationalCommuteModes,
  getExposureDeterminants,
  evaluateCommuteAlternatives,
} from '../utils/alternativesUtils';
import { CurrentAirQualityData } from '../types/airQuality';

function createTestTelemetry(overrides: Partial<CurrentAirQualityData> = {}): CurrentAirQualityData {
  return {
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Station',
      coordinates: { lat: 28.65, lon: 77.31 }
    },
    aqi: 220,
    category: 'Poor',
    dominantPollutant: 'PM2.5',
    healthAdvisory: {
      summary: 'Poor air quality.',
      maskRecommendation: 'Wear N95 respirator.',
      outdoorActivityLevel: 'Limit outdoor exertion.'
    },
    forecast: [],
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'Fine Particulates',
        concentration: 75.0,
        unit: 'µg/m³',
        subIndex: 220,
        category: 'Poor',
      },
      'PM10': {
        code: 'PM10',
        name: 'Coarse Particulates',
        concentration: 120.0,
        unit: 'µg/m³',
        subIndex: 120,
        category: 'Moderate',
      },
    },
    provenance: {
      dataSource: 'OPEN_METEO_MODELLED',
      qualityStatus: 'MODELLED_APPROXIMATION',
      recordedAt: new Date().toISOString(),
      retrievalFreshness: 'FRESH',
      modelRunFreshness: 'RECENT',
      forecastValidity: 'CURRENT_PERIOD',
      indexSystem: 'Indian NAQI',
      sourceAttribution: 'Open-Meteo Regional CAMS Model',
    },
    weather: {
      temperatureC: 22,
      relativeHumidity: 60,
      windSpeedKmh: 12,
      windDirectionDegrees: 180,
      windDirectionCardinal: 'S',
      boundaryLayerHeightMeters: 650,
      stagnationRisk: 'Low',
      dispersionConditions: 'Favorable',
      stagnationDescription: 'Good vertical mixing',
    },
    ...overrides,
  };
}

describe('alternativesUtils', () => {
  describe('isValidPollutant', () => {
    it('accepts positive finite numbers and zero', () => {
      expect(isValidPollutant(25.5)).toBe(true);
      expect(isValidPollutant(0)).toBe(true);
      expect(isValidPollutant(500)).toBe(true);
    });

    it('rejects null, undefined, NaN, Infinity, and negative values', () => {
      expect(isValidPollutant(null)).toBe(false);
      expect(isValidPollutant(undefined)).toBe(false);
      expect(isValidPollutant(NaN)).toBe(false);
      expect(isValidPollutant(Infinity)).toBe(false);
      expect(isValidPollutant(-Infinity)).toBe(false);
      expect(isValidPollutant(-1)).toBe(false);
      expect(isValidPollutant(-45.2)).toBe(false);
      expect(isValidPollutant('75')).toBe(false);
    });
  });

  describe('getEducationalCommuteModes', () => {
    it('suppresses condition-dependent verdicts and guidance when telemetry is unverified', () => {
      const modes = getEducationalCommuteModes(85.0, false);
      expect(modes.length).toBeGreaterThanOrEqual(6);
      modes.forEach((m) => {
        expect(m.liveVerdict).toBeNull();
        expect(m.liveGuidance).toBeNull();
      });
    });

    it('suppresses live verdicts when PM2.5 is null even if live is true', () => {
      const modes = getEducationalCommuteModes(null, true);
      modes.forEach((m) => {
        expect(m.liveVerdict).toBeNull();
        expect(m.liveGuidance).toBeNull();
      });
    });

    it('provides evidence-supported verdicts for elevated PM2.5 (>= 60 µg/m³)', () => {
      const modes = getEducationalCommuteModes(75.0, true);
      const metro = modes.find((m) => m.mode === 'metro')!;
      const bike = modes.find((m) => m.mode === 'bicycle')!;
      const twoWheeler = modes.find((m) => m.mode === 'two_wheeler')!;

      expect(metro.liveVerdict).toBe('Enclosed Transit Option');
      expect(metro.liveGuidance).toContain('Enclosed rail transit provides separation');
      expect(bike.liveVerdict).toBe('High Respiratory Inhalation Risk');
      expect(bike.liveGuidance).toContain('higher physical exertion along traffic corridors increases inhaled air volume');
      expect(twoWheeler.liveVerdict).toBe('Unbuffered Roadside Exposure');
    });

    it('provides active-viable verdicts for clean ambient PM2.5 (< 30 µg/m³)', () => {
      const modes = getEducationalCommuteModes(18.0, true);
      const bike = modes.find((m) => m.mode === 'bicycle')!;
      expect(bike.liveVerdict).toBe('Active Commute Viable');
      expect(bike.liveGuidance).toContain('Active commuting is generally viable');
      expect(bike.liveVerdict).not.toContain('Recommended Active Travel');
      expect(bike.liveGuidance).not.toContain('Clean ambient conditions');
      expect(bike.liveGuidance).not.toContain('Minimal pollution exposure risk');
    });

    it('never contains fixed universal exposure multipliers as verified scientific claims', () => {
      const modes = getEducationalCommuteModes(75.0, true);
      modes.forEach((m) => {
        expect(m.exposureFactors).not.toMatch(/\b0\.[0-9]+x\b/i);
        expect(m.exposureFactors).not.toMatch(/\bexactly\s+[0-9]+\s*%/i);
      });
    });

    it('never claims that cycling in traffic reduces personal exposure', () => {
      const modes = getEducationalCommuteModes(75.0, true);
      modes.forEach((m) => {
        expect(m.exposureFactors).not.toMatch(/cycling in traffic reduces your exposure/i);
        expect(m.environmentalImpact).not.toMatch(/sustainable commute reduces your inhaled pollution/i);
      });
    });
  });

  describe('getExposureDeterminants', () => {
    it('returns comprehensive microenvironmental determinants', () => {
      const factors = getExposureDeterminants();
      expect(factors.length).toBeGreaterThanOrEqual(5);
      expect(factors.some((f) => /proximity to traffic/i.test(f))).toBe(true);
      expect(factors.some((f) => /vehicle enclosure & recirculation/i.test(f))).toBe(true);
      expect(factors.some((f) => /physical exertion & breathing volume/i.test(f))).toBe(true);
      expect(factors.some((f) => /travel duration/i.test(f))).toBe(true);
      expect(factors.some((f) => /cabin air filtration/i.test(f))).toBe(true);
    });
  });

  describe('evaluateCommuteAlternatives', () => {
    it('fails closed to TELEMETRY INSUFFICIENT when observation is stale', () => {
      const data = createTestTelemetry({
        provenance: {
          dataSource: 'OPENAQ_V3',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: new Date().toISOString(),
          observedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          observationFreshness: 'STALE',
          retrievalFreshness: 'STALE',
          indexSystem: 'Indian NAQI',
          sourceAttribution: 'OpenAQ Physical Sensor',
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('stale or expired');
      result.modes.forEach((m) => {
        expect(m.liveVerdict).toBeNull();
      });
    });

    it('fails closed to TELEMETRY INSUFFICIENT when telemetry is simulated demo', () => {
      const data = createTestTelemetry(
        {
          provenance: {
            dataSource: 'SIMULATED_DEMO',
            qualityStatus: 'SIMULATED_SCENARIO',
            recordedAt: new Date().toISOString(),
            retrievalFreshness: 'FRESH',
            indexSystem: 'Indian NAQI',
            sourceAttribution: 'Curated Demonstration Scenario',
          },
        }
      );

      const result = evaluateCommuteAlternatives(data, false);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('simulated demonstration mode');
    });

    it('fails closed to TELEMETRY INSUFFICIENT when source is unverified/unknown', () => {
      const data = createTestTelemetry({
        provenance: {
          dataSource: 'UNVERIFIED_CUSTOM_FEED',
          qualityStatus: 'UNAVAILABLE',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'FRESH',
          indexSystem: 'Custom',
          sourceAttribution: 'Third Party Stream',
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.isLiveVerified).toBe(false);
      expect(result.explanation).toContain('unverified');
    });

    it('fails closed to TELEMETRY INSUFFICIENT when PM2.5 concentration is missing', () => {
      const data = createTestTelemetry({
        pollutants: {
          PM10: {
            code: 'PM10',
            name: 'Coarse Particulates',
            concentration: 120.0,
            unit: 'µg/m³',
            subIndex: 120,
            category: 'Moderate',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.pm25Concentration).toBeNull();
      expect(result.explanation).toContain('PM2.5) concentration is unavailable');
    });

    it('fails closed to TELEMETRY INSUFFICIENT when PM2.5 concentration is negative or non-finite', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: -15.0,
            unit: 'µg/m³',
            subIndex: null,
            category: null,
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.pm25Concentration).toBeNull();
    });

    it('evaluates to PRIORITIZE ENCLOSED TRANSIT when verified PM2.5 >= 60 µg/m³', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 85.0,
            unit: 'µg/m³',
            subIndex: 250,
            category: 'Poor',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('elevated_exposure_risk');
      expect(result.verdictTitle).toBe('PRIORITIZE ENCLOSED TRANSIT');
      expect(result.isLiveVerified).toBe(true);
      expect(result.explanation).toContain('Prioritize enclosed transit');
    });

    it('evaluates to ACTIVE & MASS TRANSIT VIABLE when verified PM2.5 < 30 µg/m³', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 20.0,
            unit: 'µg/m³',
            subIndex: 40,
            category: 'Good',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('conditional_active_viable');
      expect(result.verdictTitle).toBe('ACTIVE & MASS TRANSIT VIABLE');
      expect(result.isLiveVerified).toBe(true);
    });

    it('evaluates to SELECTIVE COMMUTE PLANNING when verified PM2.5 is between 30 and 60 µg/m³', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 45.0,
            unit: 'µg/m³',
            subIndex: 110,
            category: 'Moderate',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('moderate_exposure_risk');
      expect(result.verdictTitle).toBe('SELECTIVE COMMUTE PLANNING');
      expect(result.isLiveVerified).toBe(true);
    });

    it('outdoor disclosure explicitly clarifies telemetry is ambient station data, not in-cabin or route IoT', () => {
      const data = createTestTelemetry();
      const result = evaluateCommuteAlternatives(data, true);
      expect(result.outdoorDisclosure).toContain('outdoor ambient air quality');
      expect(result.outdoorDisclosure).toContain('does not measure private in-cabin vehicle air');
    });
  });

  describe('Regression: Data Correctness (Independent PM10 & PM2.5 Extraction)', () => {
    it('PM2.5 and PM10 independently return their own concentrations', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 55.4,
            unit: 'µg/m³',
            subIndex: 110,
            category: 'Moderate',
          },
          'PM10': {
            code: 'PM10',
            name: 'Coarse Particulates',
            concentration: 132.8,
            unit: 'µg/m³',
            subIndex: 125,
            category: 'Moderate',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.pm25Concentration).toBe(55.4);
      expect(result.pm10Concentration).toBe(132.8);
      expect(result.pm10Concentration).not.toBe(result.pm25Concentration);
    });

    it('PM10 never duplicates PM2.5 merely because PM2.5 is present', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 85.0,
            unit: 'µg/m³',
            subIndex: 250,
            category: 'Poor',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.pm25Concentration).toBe(85.0);
      expect(result.pm10Concentration).toBeNull();
    });

    it('missing PM10 remains null while valid PM2.5 is preserved', () => {
      const data = createTestTelemetry();
      delete (data.pollutants as Record<string, any>)['PM10'];
      data.pollutants['PM2.5'] = {
        code: 'PM2.5',
        name: 'Fine Particulates',
        concentration: 25.0,
        unit: 'µg/m³',
        subIndex: 50,
        category: 'Good',
      };

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.pm25Concentration).toBe(25.0);
      expect(result.pm10Concentration).toBeNull();
      expect(result.status).toBe('conditional_active_viable');
    });

    it('invalid PM10 values (negative, NaN, non-finite) remain null while PM2.5 is preserved', () => {
      const testCases = [-10.5, NaN, Infinity, -Infinity];

      testCases.forEach((invalidVal) => {
        const data = createTestTelemetry({
          pollutants: {
            'PM2.5': {
              code: 'PM2.5',
              name: 'Fine Particulates',
              concentration: 40.0,
              unit: 'µg/m³',
              subIndex: 90,
              category: 'Satisfactory',
            },
            'PM10': {
              code: 'PM10',
              name: 'Coarse Particulates',
              concentration: invalidVal as any,
              unit: 'µg/m³',
              subIndex: null,
              category: null,
            },
          },
        });

        const result = evaluateCommuteAlternatives(data, true);
        expect(result.pm25Concentration).toBe(40.0);
        expect(result.pm10Concentration).toBeNull();
      });
    });

    it('missing PM2.5 fails closed to telemetry_insufficient even if PM10 is valid', () => {
      const data = createTestTelemetry({
        pollutants: {
          'PM10': {
            code: 'PM10',
            name: 'Coarse Particulates',
            concentration: 120.0,
            unit: 'µg/m³',
            subIndex: 120,
            category: 'Moderate',
          },
        },
      });

      const result = evaluateCommuteAlternatives(data, true);
      expect(result.status).toBe('telemetry_insufficient');
      expect(result.pm25Concentration).toBeNull();
      expect(result.pm10Concentration).toBe(120.0);
      expect(result.verdictTitle).toBe('TELEMETRY INSUFFICIENT');
    });
  });

  describe('Regression: Content Integrity & Scientific Qualification', () => {
    it('contains no unsupported numerical ventilation multipliers (e.g. 2x to 5x)', () => {
      const modes = getEducationalCommuteModes(75.0, true);
      const determinants = getExposureDeterminants();

      modes.forEach((mode) => {
        expect(mode.exposureFactors).not.toMatch(/2x\s*(?:to|–|-)\s*5x/i);
        expect(mode.liveGuidance || '').not.toMatch(/2x\s*(?:to|–|-)\s*5x/i);
        expect(mode.exposureFactors).not.toMatch(/\b[2-5]x\b/i);
      });

      determinants.forEach((d) => {
        expect(d).not.toMatch(/2x\s*(?:to|–|-)\s*5x/i);
        expect(d).not.toMatch(/\b[2-5]x\b/i);
      });
    });

    it('contains no unsupported roadside distance claims (e.g. 10 to 50 meters)', () => {
      const modes = getEducationalCommuteModes(75.0, true);
      const determinants = getExposureDeterminants();

      modes.forEach((mode) => {
        expect(mode.exposureFactors).not.toMatch(/10\s*(?:to|–|-)\s*50\s*(?:meters|m)/i);
      });

      determinants.forEach((d) => {
        expect(d).not.toMatch(/10\s*(?:to|–|-)\s*50\s*(?:meters|m)/i);
      });
    });

    it('contains no guaranteed vehicle or metro filtration claims or filtrationBuffer ratings', () => {
      const modes = getEducationalCommuteModes(75.0, true);

      modes.forEach((mode) => {
        expect((mode as any).filtrationBuffer).toBeUndefined();
        expect(mode.exposureFactors).not.toMatch(/guaranteed filtration/i);
        expect(mode.exposureFactors).not.toMatch(/complete physical barrier/i);
        expect(mode.exposureFactors).not.toMatch(/guarantees protection/i);
      });
    });

    it('low PM2.5 guidance uses non-definitive, non-alarmist proportionate wording', () => {
      const modes = getEducationalCommuteModes(20.0, true);
      const result = evaluateCommuteAlternatives(
        createTestTelemetry({
          pollutants: {
            'PM2.5': {
              code: 'PM2.5',
              name: 'Fine Particulates',
              concentration: 20.0,
              unit: 'µg/m³',
              subIndex: 40,
              category: 'Good',
            },
          },
        }),
        true
      );

      // Low PM2.5 explanation acknowledges route conditions without claiming route is safe
      expect(result.explanation).not.toMatch(/safe route/i);
      expect(result.explanation).not.toMatch(/clean ambient conditions/i);
      expect(result.explanation).not.toMatch(/minimal pollution exposure risk/i);
      expect(result.explanation).toContain('Active commuting (cycling, walking) and mass transit options are viable');
      expect(result.explanation).toContain('regional station data does not measure microscale roadside exhaust');

      // Mode verdicts
      const bike = modes.find((m) => m.mode === 'bicycle')!;
      expect(bike.liveVerdict).toBe('Active Commute Viable');
      expect(bike.liveVerdict).not.toBe('Recommended Active Travel');
      expect(bike.liveGuidance).toContain('Personal exposure along specific routes still depends on immediate traffic density');
    });

    it('qualifies all emissions comparisons as broad illustrative categories', () => {
      const modes = getEducationalCommuteModes(50.0, true);

      modes.forEach((mode) => {
        expect(mode.environmentalImpact).toContain('Illustrative Category:');
      });
    });
  });
});
