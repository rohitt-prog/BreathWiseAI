import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PollutantGrid } from '../components/visualization/PollutantGrid';
import { MOCK_AIR_QUALITY_DATA } from '../services/mockData';

describe('PollutantGrid Component', () => {
  const pollutants = MOCK_AIR_QUALITY_DATA['del_anand_vihar'].pollutants;

  it('renders all 8 official Indian NAQI pollutants', () => {
    render(<PollutantGrid pollutants={pollutants} />);
    
    expect(screen.getByText('PM2.5')).toBeInTheDocument();
    expect(screen.getByText('PM10')).toBeInTheDocument();
    expect(screen.getByText('NO2')).toBeInTheDocument();
    expect(screen.getByText('SO2')).toBeInTheDocument();
    expect(screen.getByText('CO')).toBeInTheDocument();
    expect(screen.getByText('O3')).toBeInTheDocument();
    expect(screen.getByText('NH3')).toBeInTheDocument();
    expect(screen.getByText('Pb')).toBeInTheDocument();
  });

  it('renders the explicit illustrative sub-index disclosure required by C3', () => {
    render(<PollutantGrid pollutants={pollutants} />);
    expect(
      screen.getByText(/Illustrative pollutant sub-indices\. Official CPCB calculation integration pending\./i)
    ).toBeInTheDocument();
  });

  it('renders sub-index values and concentration units correctly', () => {
    render(<PollutantGrid pollutants={pollutants} />);
    expect(screen.getByText('218.4')).toBeInTheDocument();
    expect(screen.getAllByText('µg/m³').length).toBeGreaterThan(0);
  });
});
