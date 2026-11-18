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
              <p className="font-semibold text-slate-900 dark:text-white">1. Environmental Telemetry Ingest & Provenance</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Multi-source telemetry pipeline: Open-Meteo CAMS provides numerical atmospheric chemistry forecasts (~40km grid), OpenAQ v3 integrates certified physical ground monitors when configured with an API key, and official CPCB CAAQMS ingestion remains pending authorized portal credentials. Telemetry is verified for temporal freshness and strictly classified as physical observation or numerical model prediction without converting regional model indices into Indian NAQI.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">2. Deterministic Safety Engine Supremacy</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Deterministic rules run prior to generative synthesis to enforce authoritative health boundaries. Ozone generators are strictly prohibited. External window closure during particulate stagnation is balanced against indoor VOC/cooking accumulation and mechanical HEPA filtration. Strenuous outdoor cardiovascular exercise is differentiated from casual low-intensity walking, and personal pollution exposure is strictly distinguished from vehicle emissions.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Cpu className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">3. Google Gemini Structured Synthesis & Verification</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Google Gemini synthesizes plain-language explanations constrained by Pydantic structured schemas. Every recommendation is constrained to the deterministic allowlist and must cite verified telemetry evidence IDs. If the API is unconfigured, times out, or fails post-generation semantic validation, the system automatically engages safe deterministic fallback recommendations.
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
