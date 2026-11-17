import { describe, it, expect } from 'vitest';
import { getAQIMetadata } from '../utils/aqiUtils';

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
});
