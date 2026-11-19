import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAppStore } from '../stores/useAppStore';

describe('Demo Mode & Provenance Transparency (Corrections C1 & C2)', () => {
  it('renders the persistent demo disclosure banner required by C1', () => {
    useAppStore.setState({ telemetryMode: 'demo' });
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    );

    const banner = screen.getByRole('status', { name: /demo mode notice/i });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(
      'DEMO MODE — Simulated environmental data. Live CPCB and OpenAQ integration is not connected.'
    );
  });

  it('renders the live telemetry disclosure banner when operating in live mode', () => {
    useAppStore.setState({ telemetryMode: 'live' });
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    );

    const banner = screen.getByRole('status', { name: /live telemetry notice/i });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/LIVE TELEMETRY/i);
    expect(banner).toHaveTextContent(/Live CPCB and OpenAQ sensor ingestion is not connected/i);
  });

  it('does not display misleading live verification claims', () => {
    useAppStore.setState({ telemetryMode: 'live' });
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Official CPCB Monitored/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/CPCB Verified Ground Data/i)).not.toBeInTheDocument();
  });
});
