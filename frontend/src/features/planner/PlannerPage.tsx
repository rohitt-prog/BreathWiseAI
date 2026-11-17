import React, { useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_DAILY_PLAN } from '../../services/mockData';
import { 
  Calendar, 
  ShieldAlert, 
  Clock, 
  HelpCircle, 
  ThumbsUp, 
  ThumbsDown, 
  Check, 
  Sparkles,
  Layers
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import clsx from 'clsx';

export const PlannerPage: React.FC = () => {
  const { openExplanationModal, userPreferences } = useAppStore();
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'helpful' | 'unfeasible'>>({});
  const [policyMode, setPolicyMode] = useState<'balanced' | 'max_exposure'>('balanced');

  const plan = MOCK_DAILY_PLAN;

  const handleFeedback = (slotId: string, rating: 'helpful' | 'unfeasible') => {
    setFeedbackGiven(prev => ({ ...prev, [slotId]: rating }));
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      
      {/* Header & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Personalized Daily Action Planner
            </h1>
            <Badge variant="success" icon={Sparkles} size="sm">
              Gemini + Safety Engine
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5" />
              {plan.date}
            </span>
            <span>•</span>
            <span>Target: {plan.targetLocation.name} (AQI {plan.targetLocation.aqi})</span>
            <span>•</span>
            <span className="capitalize">Persona: {userPreferences.personaType}</span>
            {userPreferences.hasSensitiveMembers && (
              <span className="text-red-600 dark:text-red-400 font-semibold">• High-Vulnerability Guardrails Active</span>
            )}
          </div>
        </div>

        {/* Policy Mode Selector */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setPolicyMode('balanced')}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              policyMode === 'balanced'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Balanced (Exposure & Emissions)
          </button>
          <button
            onClick={() => setPolicyMode('max_exposure')}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              policyMode === 'max_exposure'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Max Personal Protection
          </button>
        </div>
      </div>

      {/* Headline Stance & Trade-off Banner */}
      <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
          <Layers className="w-4 h-4" />
          <span>Daily Strategy & Trade-Off Resolution</span>
        </div>
        <p className="text-sm sm:text-base font-semibold leading-relaxed text-slate-100">
          {plan.headlineAdvice}
        </p>
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {plan.tradeOffAnalysis}
        </div>
      </div>

      {/* Hourly Action Slots */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center justify-between">
          <span>Scheduled Action Directives</span>
          <span className="text-xs font-normal text-slate-500">4 Time Windows Configured</span>
        </h2>

        {plan.itinerary.map((slot) => {
          const rating = feedbackGiven[slot.id];

          return (
            <div
              key={slot.id}
              className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
            >
              {/* Slot Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {slot.activityTitle}
                    </h3>
                    <span className="text-xs text-slate-500">{slot.timeWindow}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider',
                    slot.smogRisk === 'hazardous'
                      ? 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200'
                      : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                  )}>
                    {slot.smogRisk} Smog
                  </span>

                  {slot.requiresMask && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                      <ShieldAlert className="w-3 h-3 text-red-500" />
                      N95 Required
                    </span>
                  )}
                </div>
              </div>

              {/* Action Content Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                
                {/* Exposure Reduction Box */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-wider block">
                    Personal Lung Exposure Protection
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {slot.exposureMitigation}
                  </p>
                </div>

                {/* Sustainable Alternative Box */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-sky-700 dark:text-sky-400 text-xs uppercase tracking-wider block">
                    Community Emission Abatement
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {slot.sustainableChoice}
                  </p>
                </div>
              </div>

              {/* Rationale & Feedback Footer */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2 text-slate-500">
                  <span>Science: {slot.scientificRationale}</span>
                  <button
                    onClick={() => openExplanationModal(`Action Slot [${slot.timeWindow}]: ${slot.activityTitle} — ${slot.recommendedAction}`)}
                    className="p-0.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                    title="Inspect AI reasoning and data source for this directive"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* Recommendation Feedback */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Feasible for you?</span>
                  <button
                    onClick={() => handleFeedback(slot.id, 'helpful')}
                    className={clsx(
                      'p-1.5 rounded-lg border flex items-center gap-1 transition-all text-xs font-semibold',
                      rating === 'helpful'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {rating === 'helpful' ? <Check className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                    <span>Helpful</span>
                  </button>

                  <button
                    onClick={() => handleFeedback(slot.id, 'unfeasible')}
                    className={clsx(
                      'p-1.5 rounded-lg border flex items-center gap-1 transition-all text-xs font-semibold',
                      rating === 'unfeasible'
                        ? 'bg-red-100 text-red-800 border-red-400 dark:bg-red-950 dark:text-red-200'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span>Unfeasible</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
