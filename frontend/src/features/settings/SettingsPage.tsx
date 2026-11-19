import React, { useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { isFirebaseConfigured } from '../../services/firebase';
import { mapFirestoreError } from '../../services/userService';
import { PersonaType } from '../../types/user';
import { 
  User, 
  Users, 
  Briefcase, 
  Check, 
  Clock,
  Radio,
  Sparkles,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import clsx from 'clsx';

export const SettingsPage: React.FC = () => {
  const { userPreferences, updatePreferences, setPersona, telemetryMode, setTelemetryMode } = useAppStore();
  const { user, savePreferencesToCloud } = useAuthStore();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const personas: Array<{ type: PersonaType; title: string; desc: string; icon: any }> = [
    { type: 'student', title: 'Student / Young Professional', desc: 'Commutes to campus/office, active transport, transit sensitive.', icon: User },
    { type: 'family', title: 'Family Household', desc: 'Prioritizes indoor bedroom safety, kids, and elder health.', icon: Users },
    { type: 'outdoor_worker', title: 'Outdoor / Field Worker', desc: 'Extended outdoor ambient exposure; maximum PPE emphasis.', icon: Briefcase },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveStatus === 'saving') return; // Prevent duplicate submissions

    if (!user) {
      // Guest mode: preferences persist in local session, zero Firestore writes
      setSaveStatus('success');
      setFeedbackMessage(null);
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
      return;
    }

    // Authenticated user: persist to Firestore
    setSaveStatus('saving');
    setFeedbackMessage(null);

    try {
      if (!isFirebaseConfigured()) {
        // Fallback when Firebase credentials are not configured in this environment
        setSaveStatus('success');
        setFeedbackMessage('Cloud sync unconfigured in this environment. Preferences saved locally.');
        setTimeout(() => {
          setSaveStatus('idle');
          setFeedbackMessage(null);
        }, 4000);
        return;
      }

      await savePreferencesToCloud();

      setSaveStatus('success');
      setFeedbackMessage(null);
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (err: unknown) {
      setSaveStatus('error');
      const safeError = mapFirestoreError(err);
      setFeedbackMessage(safeError);
      setTimeout(() => {
        setSaveStatus('idle');
        setFeedbackMessage(null);
      }, 5000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
      
      {/* Page Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
          Personalization & Lifestyle Context
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          BreatheWise AI tailors daily action plans and safety thresholds without collecting private medical records.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Lifestyle Persona Selection */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Primary Lifestyle Persona
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {personas.map((p) => {
              const Icon = p.icon;
              const isSelected = userPreferences.personaType === p.type;

              return (
                <button
                  type="button"
                  key={p.type}
                  onClick={() => setPersona(p.type)}
                  className={clsx(
                    'p-4 rounded-xl border text-left flex flex-col justify-between space-y-3 transition-all',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-500'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className={clsx(
                      'p-2 rounded-lg',
                      isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{p.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{p.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Vulnerability Context (Privacy-Preserving) */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Household Vulnerability Guardrails
            </h2>
            <Badge variant="neutral" size="sm">Privacy First</Badge>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={userPreferences.hasSensitiveMembers}
              onChange={(e) => updatePreferences({ hasSensitiveMembers: e.target.checked })}
              className="mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-slate-900 dark:text-white block">
                Sensitive household member present
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-xs">
                Check this if your household includes children under 5, elderly adults, or individuals with chronic respiratory/cardiovascular sensitivities. This lowers the smog safety threshold for outdoor activities. (We do not ask for or store medical diagnoses).
              </span>
            </div>
          </label>
        </section>

        {/* Commute Routine */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Daily Commute Schedule
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Morning Departure Time
              </label>
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <Clock className="w-4 h-4 text-slate-400" />
                <input
                  type="time"
                  value={userPreferences.commuteTimes.morningDeparture}
                  onChange={(e) => updatePreferences({
                    commuteTimes: { ...userPreferences.commuteTimes, morningDeparture: e.target.value }
                  })}
                  className="bg-transparent text-slate-900 dark:text-white focus:outline-none w-full"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Evening Return Time
              </label>
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <Clock className="w-4 h-4 text-slate-400" />
                <input
                  type="time"
                  value={userPreferences.commuteTimes.eveningReturn}
                  onChange={(e) => updatePreferences({
                    commuteTimes: { ...userPreferences.commuteTimes, eveningReturn: e.target.value }
                  })}
                  className="bg-transparent text-slate-900 dark:text-white focus:outline-none w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* System Operating Mode Selection */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              System Operating Mode
            </h2>
            <Badge variant={telemetryMode === 'live' ? 'success' : 'warning'} size="sm">
              {telemetryMode === 'live' ? 'Live Telemetry' : 'Simulated Demo'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select how BreatheWise AI acquires environmental telemetry across Dashboard, Planner, Indoor Air, and Alternatives.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTelemetryMode('live')}
              data-testid="settings-mode-live"
              className={clsx(
                'p-4 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all',
                telemetryMode === 'live'
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
              )}
            >
              <div className="flex items-center justify-between">
                <div className={clsx(
                  'p-2 rounded-lg',
                  telemetryMode === 'live' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                )}>
                  <Radio className="w-4 h-4" />
                </div>
                {telemetryMode === 'live' && <Check className="w-4 h-4 text-emerald-600" />}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Live Telemetry Mode</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Fetches verified real-time Open-Meteo CAMS atmospheric model and weather observations.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTelemetryMode('demo')}
              data-testid="settings-mode-demo"
              className={clsx(
                'p-4 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all',
                telemetryMode === 'demo'
                  ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 ring-1 ring-amber-500'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
              )}
            >
              <div className="flex items-center justify-between">
                <div className={clsx(
                  'p-2 rounded-lg',
                  telemetryMode === 'demo' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                )}>
                  <Sparkles className="w-4 h-4" />
                </div>
                {telemetryMode === 'demo' && <Check className="w-4 h-4 text-amber-600" />}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Simulated Demonstration Mode</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Uses curated synthetic scenarios for illustrative UI exploration. Actionable health directives are withheld.
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Save Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs">
            {saveStatus === 'saving' ? (
              <span className="text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1.5" data-testid="save-saving-indicator">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                Saving preferences...
              </span>
            ) : saveStatus === 'success' ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5" data-testid="save-success-indicator">
                  <Check className="w-4 h-4" />
                  Preferences saved successfully!
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {user
                    ? (feedbackMessage ? `• ${feedbackMessage}` : '• Synced with your BreatheWise cloud account')
                    : '• (Guest Mode: Persisted in local session)'}
                </span>
              </div>
            ) : saveStatus === 'error' ? (
              <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5" data-testid="save-error-indicator">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Failed to sync with cloud: {feedbackMessage || 'Please try again.'}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                {user ? 'Settings synced with your BreatheWise cloud account' : 'Settings persist in local session storage (Guest Mode)'}
              </span>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={saveStatus === 'saving'}
            data-testid="save-preferences-button"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </form>
    </div>
  );
};
