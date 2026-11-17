import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndoorAirPage } from '../features/indoor/IndoorAirPage';

describe('Indoor Air Quality Assistant (Correction C5)', () => {
  it('displays conditional ventilation guidance based on ambient air category', () => {
    render(<IndoorAirPage />);
    
    // In current mock scenario (Anand Vihar AQI 368: Very Poor category), outdoor air infiltration must be restricted
    expect(screen.getByText('RESTRICT OUTDOOR AIR INFILTRATION')).toBeInTheDocument();
    expect(screen.getByText(/Household Ventilation Framework: Outdoor Levels vs\. Indoor Sources/i)).toBeInTheDocument();
  });

  it('explains keeping windows closed during Very Poor and Severe conditions while managing indoor pollutants', () => {
    render(<IndoorAirPage />);
    
    // Check dynamic guidance for Very Poor/Severe category
    expect(
      screen.getByText(/Households should generally keep exterior windows closed to limit particulate infiltration, while also managing indoor-generated pollutants through appropriate kitchen exhaust and indoor filtration in recirculation mode/i)
    ).toBeInTheDocument();

    // Check framework statement
    expect(
      screen.getByText(/Any ventilation decision must consider immediate outdoor conditions and indoor air needs/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Do not automatically recommend opening windows based solely on an AQI number/i)
    ).toBeInTheDocument();
  });

  it('prominently features the strict directive against ozone generators in occupied spaces', () => {
    render(<IndoorAirPage />);
    
    expect(
      screen.getByText(/STRICT AIR SAFETY DIRECTIVE: Ozone Air Cleaners Banned/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Never use ozone generators or ionizing air cleaners in occupied rooms/i)
    ).toBeInTheDocument();
  });

  it('accurately distinguishes gas combustion from electric cooking emissions and advises exhaust', () => {
    render(<IndoorAirPage />);
    
    expect(screen.getByText(/Kitchen & Cooking/i)).toBeInTheDocument();
    expect(screen.getByText('Gas cooking')).toBeInTheDocument();
    expect(screen.getByText(/produces combustion-related byproducts, including nitrogen dioxide/i)).toBeInTheDocument();
    expect(screen.getByText('Electric and induction cooktops')).toBeInTheDocument();
    expect(screen.getByText(/do not produce combustion-related NO2/i)).toBeInTheDocument();
    expect(screen.getByText(/Always operate an active kitchen chimney hood or external exhaust fan during cooking/i)).toBeInTheDocument();
  });

  it('provides manufacturer-aligned pre-filter maintenance guidance without arbitrary universal intervals', () => {
    render(<IndoorAirPage />);
    
    expect(
      screen.getByText(/Check, clean, or maintain pre-filters according to the manufacturer's instructions/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/During severe pollution periods, inspect filters more frequently/i)
    ).toBeInTheDocument();
  });

  it('renders all six official Indian NAQI categories in the ventilation decision table with conditional language and no unconditional permission', () => {
    render(<IndoorAirPage />);
    
    // Verify all six official Indian NAQI categories and exact ranges
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('0–50')).toBeInTheDocument();
    expect(screen.getByText('Satisfactory')).toBeInTheDocument();
    expect(screen.getByText('51–100')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('101–200')).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.getByText('201–300')).toBeInTheDocument();
    expect(screen.getAllByText('Very Poor').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('301–400')).toBeInTheDocument();
    expect(screen.getByText('Severe')).toBeInTheDocument();
    expect(screen.getByText('401–500')).toBeInTheDocument();

    // Verify unconditional "permitted" phrasing is absent
    expect(screen.queryByText(/natural ventilation permitted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cross-ventilation permitted/i)).not.toBeInTheDocument();

    // Verify conditional framework is reinforced
    expect(screen.getByText(/low aqi alone does not mandate opening windows/i)).toBeInTheDocument();
  });
});
