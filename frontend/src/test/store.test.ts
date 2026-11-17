import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/useAppStore';

describe('useAppStore Zustand State Management', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentLocationId: 'del_anand_vihar',
      theme: 'light',
      isLocationModalOpen: false,
      isExplanationModalOpen: false,
      activeExplanationContext: null,
    });
  });

  it('updates current location ID', () => {
    useAppStore.getState().setCurrentLocationId('del_connaught_place');
    expect(useAppStore.getState().currentLocationId).toBe('del_connaught_place');
  });

  it('toggles theme between light and dark', () => {
    expect(useAppStore.getState().theme).toBe('light');
    useAppStore.getState().toggleTheme();
    expect(useAppStore.getState().theme).toBe('dark');
    useAppStore.getState().toggleTheme();
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('updates persona and household vulnerability flag', () => {
    useAppStore.getState().setPersona('family');
    expect(useAppStore.getState().userPreferences.personaType).toBe('family');

    useAppStore.getState().updatePreferences({ hasSensitiveMembers: false });
    expect(useAppStore.getState().userPreferences.hasSensitiveMembers).toBe(false);
  });

  it('controls modal dialog states cleanly', () => {
    useAppStore.getState().setLocationModalOpen(true);
    expect(useAppStore.getState().isLocationModalOpen).toBe(true);

    useAppStore.getState().openExplanationModal('Test explanation');
    expect(useAppStore.getState().isExplanationModalOpen).toBe(true);
    expect(useAppStore.getState().activeExplanationContext).toBe('Test explanation');

    useAppStore.getState().closeExplanationModal();
    expect(useAppStore.getState().isExplanationModalOpen).toBe(false);
    expect(useAppStore.getState().activeExplanationContext).toBeNull();
  });
});
