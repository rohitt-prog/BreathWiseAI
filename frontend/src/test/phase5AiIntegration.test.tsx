/**
 * Tests for Phase 5: Google Gemini AI Intelligence Engine, Deterministic Safety, and UI Integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { apiClient, DEFAULT_DEMO_INSIGHTS } from '../services/apiClient';
import { AIInsightResponse } from '../types/ai';

// Mock apiClient methods
vi.mock('../services/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiClient')>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      resolveAirQualityData: vi.fn(),
      fetchAIInsights: vi.fn()
    }
  };
});

describe('Phase 5 — Google Gemini AI Intelligence & Deterministic Safety Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0
        }
      }
    });
    vi.clearAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders Google Gemini Synthesized badge and dynamic action cards when status is GENERATED', async () => {
    const mockAIResponse: AIInsightResponse = {
      location: { latitude: 28.65, longitude: 77.25, name: 'Delhi Central' },
      activity_context: 'GENERAL',
      status: 'GENERATED',
      model_id: 'gemini-2.5-flash',
      prompt_version: 'v1.0.0',
      generated_at: new Date().toISOString(),
      summary: 'Atmospheric boundary layer stagnation promotes localized fine particulate accumulation.',
      explanation: 'Open-Meteo CAMS models indicate elevated PM2.5 under shallow mixing.',
      supporting_factors: ['Elevated PM2.5 (85 µg/m³)', 'Low boundary layer (230m)'],
      recommended_actions: [
        {
          action_id: 'ACT-PROTECT-N95-STREET',
          category: 'PERSONAL_PROTECTION',
          priority: 'HIGH',
          title: 'Wear a certified N95 or FFP2 respirator for outdoor street transit',
          rationale: 'Filters fine sub-micron combustion aerosols effectively.',
          evidence_ids: ['EVID-PM25']
        },
        {
          action_id: 'ACT-VENT-PURIFY-HEPA',
          category: 'INDOOR_AIR',
          priority: 'HIGH',
          title: 'Operate mechanical HEPA air filtration continuously in recirculating mode',
          rationale: 'Maintains clean indoor air without creating ozone.',
          evidence_ids: ['EVID-PM25']
        }
      ],
      evidence_context: {
        'EVID-PM25': {
          evidence_id: 'EVID-PM25',
          parameter: 'Fine Particulates',
          value: '85.0',
          unit: 'µg/m³',
          classification: 'MODELLED_FORECAST',
          freshness: 'FRESH',
          context_note: 'CAMS model'
        }
      },
      source_classification: 'MODELLED_FORECAST',
      quality_status: 'MODELLED_APPROXIMATION',
      retrieval_freshness: 'FRESH',
      limitations: ['Regional ~40km resolution']
    };

    vi.mocked(apiClient.fetchAIInsights).mockResolvedValue(mockAIResponse);

    renderDashboard();

    // 1. Verify AI badge displays Gemini status
    await waitFor(() => {
      expect(screen.getByText(/Google Gemini Synthesized/i)).toBeInTheDocument();
    });

    // 2. Verify plain-language summary renders
    expect(
      screen.getByText(/Atmospheric boundary layer stagnation promotes localized fine particulate accumulation/i)
    ).toBeInTheDocument();

    // 3. Verify dynamic recommended actions are rendered
    expect(
      screen.getByText('Wear a certified N95 or FFP2 respirator for outdoor street transit')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Operate mechanical HEPA air filtration continuously in recirculating mode')
    ).toBeInTheDocument();

    // 4. Verify supporting evidence pill is rendered
    expect(screen.getAllByText('EVID-PM25').length).toBeGreaterThan(0);

    // 5. Verify obsolete hardcoded text does NOT leak
    expect(screen.queryByText(/Switch motorized commute to Delhi Metro/i)).not.toBeInTheDocument();
  });

  it('renders Deterministic Rule Engine badge when Gemini API key is unconfigured', async () => {
    const mockFallbackResponse: AIInsightResponse = {
      location: { latitude: 28.65, longitude: 77.25, name: 'Delhi Central' },
      activity_context: 'GENERAL',
      status: 'FALLBACK_NO_API_KEY',
      model_id: null,
      prompt_version: 'v1.0.0',
      generated_at: new Date().toISOString(),
      summary: 'Guidance generated via deterministic rule engine.',
      explanation: 'Google Gemini API key is not configured; deterministic safety rules remain active.',
      supporting_factors: ['Deterministic safety baseline'],
      recommended_actions: [
        {
          action_id: 'ACT-VENT-SEAL-TEMPORARY',
          category: 'VENTILATION',
          priority: 'HIGH',
          title: 'Temporarily close external windows during peak ambient particulate stagnation',
          rationale: 'Prevents rapid particulate infiltration while maintaining indoor HEPA circulation.',
          evidence_ids: ['EVID-PM25']
        }
      ],
      evidence_context: {},
      source_classification: 'MODELLED_FORECAST',
      quality_status: 'MODELLED_APPROXIMATION',
      retrieval_freshness: 'FRESH',
      limitations: ['Deterministic rules fallback']
    };

    vi.mocked(apiClient.fetchAIInsights).mockResolvedValue(mockFallbackResponse);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Deterministic Rule Engine \(No Gemini Key\)/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText('Temporarily close external windows during peak ambient particulate stagnation')
    ).toBeInTheDocument();
  });

  it('renders Deterministic Safety Override badge when model or validation error occurs', async () => {
    const mockOverrideResponse: AIInsightResponse = {
      location: { latitude: 28.65, longitude: 77.25, name: 'Delhi Central' },
      activity_context: 'GENERAL',
      status: 'FALLBACK_VALIDATION_ERROR',
      model_id: 'gemini-2.5-flash',
      prompt_version: 'v1.0.0',
      generated_at: new Date().toISOString(),
      summary: 'AI response failed safety boundary validation; returning verified deterministic recommendations.',
      explanation: 'Deterministic safety rules have overridden the output.',
      supporting_factors: ['Safety override active'],
      recommended_actions: [
        {
          action_id: 'ACT-INDOOR-SOURCE-CONTROL',
          category: 'INDOOR_AIR',
          priority: 'MEDIUM',
          title: 'Eliminate indoor combustion sources and operate kitchen exhaust range hoods',
          rationale: 'Cooking emissions and incense produce intense localized particulate spikes.',
          evidence_ids: []
        }
      ],
      evidence_context: {},
      source_classification: 'MODELLED_FORECAST',
      quality_status: 'MODELLED_APPROXIMATION',
      retrieval_freshness: 'FRESH',
      limitations: ['Deterministic safety override']
    };

    vi.mocked(apiClient.fetchAIInsights).mockResolvedValue(mockOverrideResponse);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Deterministic Safety Override/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText('Eliminate indoor combustion sources and operate kitchen exhaust range hoods')
    ).toBeInTheDocument();
  });

  it('renders Curated Demo Guidance when backend is offline', async () => {
    vi.mocked(apiClient.fetchAIInsights).mockResolvedValue(DEFAULT_DEMO_INSIGHTS);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Curated Demo Guidance \(Backend Offline\)/i)).toBeInTheDocument();
    });
  });
});
