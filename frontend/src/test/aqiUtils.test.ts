import { describe, it, expect } from 'vitest';
import { getAQIMetadata, determineTelemetryProvenance } from '../utils/aqiUtils';

describe('India NAQI Categorization & Accessibility Utilities', () => {
  it('maps Good category correctly for AQI 0-50', () => {
    const meta = getAQIMetadata(35);
    expect(meta.category).toBe('Good');
    expect(meta.range).toBe('0 - 50');
    expect(meta.hexCode).toBe('#16A34A');
    expect(meta.nonColorLabel).toContain('Good');
  });

  it('maps Satisfactory category correctly for AQI 51-100', () => {
    const meta = getAQIMetadata(80);
    expect(meta.category).toBe('Satisfactory');
    expect(meta.range).toBe('51 - 100');
    expect(meta.hexCode).toBe('#65A30D');
    expect(meta.nonColorLabel).toContain('Satisfactory');
  });

  it('maps Moderate category correctly for AQI 101-200 with accessible dark text', () => {
    const meta = getAQIMetadata(150);
    expect(meta.category).toBe('Moderate');
    expect(meta.range).toBe('101 - 200');
    expect(meta.hexCode).toBe('#CA8A04');
    expect(meta.textClass).toBe('text-slate-900'); // WCAG AA high-contrast dark text
  });

  it('maps Poor category correctly for AQI 201-300', () => {
    const meta = getAQIMetadata(250);
    expect(meta.category).toBe('Poor');
    expect(meta.range).toBe('201 - 300');
    expect(meta.hexCode).toBe('#EA580C');
  });

  it('maps Very Poor category correctly for AQI 301-400', () => {
    const meta = getAQIMetadata(368);
    expect(meta.category).toBe('Very Poor');
    expect(meta.range).toBe('301 - 400');
    expect(meta.hexCode).toBe('#DC2626');
  });

  it('maps Severe category correctly for AQI 401-500', () => {
    const meta = getAQIMetadata(450);
    expect(meta.category).toBe('Severe');
    expect(meta.range).toBe('401 - 500');
    expect(meta.hexCode).toBe('#7F1D1D');
  });

  it('provides a distinct non-color icon for every category to meet WCAG 1.4.1', () => {
    const aqiValues = [25, 75, 150, 250, 350, 450];
    const icons = aqiValues.map(val => getAQIMetadata(val).icon);
    const uniqueIcons = new Set(icons);
    expect(uniqueIcons.size).toBe(6);
  });

  it('rejects negative, non-finite, and out-of-range AQI values with Unavailable category', () => {
    expect(getAQIMetadata(-1).category).toBe('Unavailable');
    expect(getAQIMetadata(-50).category).toBe('Unavailable');
    expect(getAQIMetadata(NaN).category).toBe('Unavailable');
    expect(getAQIMetadata(Infinity).category).toBe('Unavailable');
    expect(getAQIMetadata(-Infinity).category).toBe('Unavailable');
    expect(getAQIMetadata(501).category).toBe('Unavailable');
    expect(getAQIMetadata(999).category).toBe('Unavailable');
    expect(getAQIMetadata(null).category).toBe('Unavailable');
    expect(getAQIMetadata(undefined).category).toBe('Unavailable');
  });

  describe('determineTelemetryProvenance Freshness Classification', () => {
    it('returns Demo tag when isLive is false', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'SIMULATED_DEMO',
          qualityStatus: 'SIMULATED_SCENARIO',
          recordedAt: '2026-11-29T14:00:00Z',
          indexSystem: 'Demo'
        },
        false
      );
      expect(res.tag).toBe('Demo');
      expect(res.isStale).toBe(false);
    });

    it('classifies fresh modelled telemetry when retrieval and forecast validity are valid', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'MODELLED_FORECAST',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          forecastValidity: 'CURRENT_PERIOD',
          modelRunFreshness: 'UNAVAILABLE',
          indexSystem: 'Open-Meteo'
        },
        true
      );
      expect(res.tag).toBe('Modelled');
      expect(res.isStale).toBe(false);
    });

    it('classifies stale modelled telemetry when retrievalFreshness is STALE', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'MODELLED_FORECAST',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: '2026-11-29T10:00:00Z',
          retrievalFreshness: 'STALE',
          forecastValidity: 'CURRENT_PERIOD',
          indexSystem: 'Open-Meteo'
        },
        true
      );
      expect(res.tag).toBe('Stale Modelled');
      expect(res.isStale).toBe(true);
    });

    it('classifies stale modelled telemetry when forecastValidity is HISTORICAL_PERIOD', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          forecastValidity: 'HISTORICAL_PERIOD',
          indexSystem: 'Open-Meteo'
        },
        true
      );
      expect(res.tag).toBe('Stale Modelled');
      expect(res.isStale).toBe(true);
    });

    it('classifies stale modelled telemetry when modelRunFreshness is STALE', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'MODELLED_FORECAST',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          forecastValidity: 'CURRENT_PERIOD',
          modelRunFreshness: 'STALE',
          indexSystem: 'Open-Meteo'
        },
        true
      );
      expect(res.tag).toBe('Stale Modelled');
      expect(res.isStale).toBe(true);
    });

    it('treats missing freshness metadata on modelled data as stale', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'MODELLED_FORECAST',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: '2026-11-29T14:00:00Z',
          indexSystem: 'Open-Meteo'
        },
        true
      );
      expect(res.tag).toBe('Stale Modelled');
      expect(res.isStale).toBe(true);
    });

    it('classifies fresh physical sensor observation', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T14:00:00Z',
          observationFreshness: 'FRESH',
          retrievalFreshness: 'FRESH',
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Live Sensor');
      expect(res.isStale).toBe(false);
    });

    it('classifies stale physical sensor observation', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T08:00:00Z',
          observationFreshness: 'STALE',
          retrievalFreshness: 'FRESH',
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Stale Sensor');
      expect(res.isStale).toBe(true);
    });

    it('classifies physical observation with FRESH observation freshness but missing retrieval freshness as Stale Sensor', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T14:00:00Z',
          observationFreshness: 'FRESH',
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Stale Sensor');
      expect(res.isStale).toBe(true);
    });

    it('classifies physical observation with RECENT observation freshness but missing retrieval freshness as Stale Sensor', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T13:00:00Z',
          observationFreshness: 'RECENT',
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Stale Sensor');
      expect(res.isStale).toBe(true);
    });

    it('classifies physical observation with INVALID retrieval freshness as Stale Sensor', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T14:00:00Z',
          observationFreshness: 'FRESH',
          retrievalFreshness: 'INVALID',
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Stale Sensor');
      expect(res.isStale).toBe(true);
    });

    it('classifies physical observation with unknown retrieval freshness value as Stale Sensor', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T14:00:00Z',
          observationFreshness: 'FRESH',
          retrievalFreshness: 'UNRECOGNIZED_TIER' as any,
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Stale Sensor');
      expect(res.isStale).toBe(true);
    });

    it('classifies unrecognized data source conservatively as Unverified Telemetry', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'UNKNOWN_EXTERNAL_FEED' as any,
          qualityStatus: 'UNAVAILABLE',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          indexSystem: 'Custom Unknown Feed'
        },
        true
      );
      expect(res.tag).toBe('Unverified');
      expect(res.isStale).toBe(true);
      expect(res.statusLabel).toBe('Unverified Telemetry');
    });

    it('classifies fresh physical sensor when both observation and retrieval are RECENT', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T13:00:00Z',
          observationFreshness: 'RECENT',
          retrievalFreshness: 'RECENT',
          indexSystem: 'OpenAQ'
        },
        true
      );
      expect(res.tag).toBe('Live Sensor');
      expect(res.isStale).toBe(false);
    });

    it('classifies telemetry with isVerified === false as Unverified Telemetry', () => {
      const res = determineTelemetryProvenance(
        {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: '2026-11-29T14:00:00Z',
          retrievalFreshness: 'FRESH',
          forecastValidity: 'CURRENT_PERIOD',
          isVerified: false,
          indexSystem: 'Open-Meteo'
        },
        true
      );
      expect(res.tag).toBe('Unverified');
      expect(res.isStale).toBe(true);
      expect(res.statusLabel).toBe('Unverified Telemetry');
    });
  });
});
