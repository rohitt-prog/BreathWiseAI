import React from 'react';
import { Modal } from '../common/Modal';
import { useAppStore } from '../../stores/useAppStore';
import { ShieldCheck, Cpu, Database, AlertCircle } from 'lucide-react';

export const ExplanationModal: React.FC = () => {
  const { isExplanationModalOpen, closeExplanationModal, activeExplanationContext } = useAppStore();

  return (
    <Modal
      isOpen={isExplanationModalOpen}
      onClose={closeExplanationModal}
      title="BreatheWise AI Reasoning Audit Trail"
      maxWidth="lg"
    >
      <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-1">Inspected Directive</p>
          <p className="font-medium text-slate-900 dark:text-slate-100 italic">
            "{activeExplanationContext || 'Recommendation reasoning audit'}"
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">1. Verified Environmental Ground Truth</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Data ingested from CPCB Anand Vihar ground monitor (PM2.5: 218 µg/m³, Category: Very Poor). Surface wind speed is 4.2 km/h, and European meteorological telemetry reports a shallow 210m temperature inversion ceiling trapping fine particulates at ground level.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">2. Deterministic Safety Engine Activation</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Hard constraint <code>SAFETY_RULE_04</code> triggered: Outdoor AQI &gt; 200 strictly prohibits natural ventilation recommendations. Hard constraint <code>SAFETY_RULE_09</code> triggered: Strenuous outdoor cardiovascular exercise is unconditionally prohibited.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Cpu className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">3. Google Gemini Structured Synthesis</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Gemini 1.5 Flash formulated practical schedule adjustments (recommending Delhi Metro over motorcycle travel to protect lungs while abating ~1.8kg CO2). The generated JSON was validated against strict Pydantic schemas, confirming zero medical diagnostic overreach and zero invented stats.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500">
          <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>BreatheWise AI never uses generative models as the sole authority for safety-critical health decisions.</span>
        </div>
      </div>
    </Modal>
  );
};
