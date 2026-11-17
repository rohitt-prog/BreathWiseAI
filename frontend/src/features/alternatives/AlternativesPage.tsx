import React from 'react';
import { MOCK_COMMUTE_COMPARISON } from '../../services/mockData';
import { 
  Compass, 
  ShieldAlert, 
  Leaf, 
  Train, 
  Bike, 
  Bus, 
  Car, 
  Navigation,
  Info 
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import clsx from 'clsx';

export const AlternativesPage: React.FC = () => {

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'metro': return Train;
      case 'bicycle': return Bike;
      case 'bus': return Bus;
      case 'private_car': return Car;
      default: return Navigation;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Sustainable Commute & Exposure Trade-Offs
            </h1>
            <Badge variant="success" icon={Leaf} size="sm">
              Impact Engine
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Balancing environmental carbon abatement against personal respiratory health in severe urban smog
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Illustrative Route: Rohini Sector 16 ➔ Connaught Place (18 km, Simulated Scenario)</span>
        </div>
      </div>

      {/* Critical Core Philosophy Card */}
      <section className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-teal-950/70 via-slate-900 to-slate-950 text-white space-y-3 border border-teal-800/40 shadow-md">
        <h3 className="font-bold text-base text-teal-300 flex items-center gap-2">
          <Compass className="w-5 h-5" />
          <span>The Core Dilemma: Personal Exposure vs. Environmental Emissions</span>
        </h3>
        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          In severe winter smog, a choice that benefits the planet (like riding a bicycle or walking along arterial roads) can severely harm individual health due to rapid alveolar particulate intake. BreatheWise AI resolves this dilemma by identifying transport modes—such as the <strong>Delhi Metro</strong>—that achieve <strong>both low personal exposure and low environmental emissions</strong>.
        </p>
      </section>

      {/* Mode Comparison Table / Grid */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Multi-Modal Commute Matrix (Illustrative Evaluation)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_COMMUTE_COMPARISON.map((item) => {
            const Icon = getModeIcon(item.mode);

            const isBest = item.recommendedVerdict === 'Recommended Best';
            const isHazard = item.recommendedVerdict === 'Hazardous to Lungs';

            return (
              <div
                key={item.mode}
                className={clsx(
                  'p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4',
                  isBest 
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500 shadow-md ring-1 ring-emerald-500/20'
                    : isHazard
                    ? 'bg-red-50/30 dark:bg-red-950/20 border-red-300 dark:border-red-900'
                    : 'bg-white dark:bg-[#131B2E] border-slate-200 dark:border-slate-800 shadow-sm'
                )}
              >
                <div>
                  {/* Mode Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx(
                        'p-2 rounded-xl',
                        isBest ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {item.displayName}
                        </h4>
                        <span className="text-[11px] text-slate-500">Commute Option</span>
                      </div>
                    </div>

                    <span className={clsx(
                      'text-xs font-black px-2.5 py-0.5 rounded-full border',
                      item.emissionScore === 'A+' ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200' :
                      item.emissionScore === 'A' ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200' :
                      item.emissionScore === 'B' ? 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-200' :
                      item.emissionScore === 'C' ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200' :
                      'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200'
                    )}>
                      {item.emissionScore} Emission
                    </span>
                  </div>

                  {/* Dual Scoring */}
                  <div className="my-3 space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                        Environmental Carbon Impact
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{item.emissionText}</p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                        Personal Respiratory Intake
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{item.exposureExplanation}</p>
                    </div>
                  </div>
                </div>

                {/* Verdict Badge */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className={clsx(
                    'text-xs font-bold px-2.5 py-1 rounded-lg border',
                    isBest ? 'bg-emerald-600 text-white border-emerald-600' :
                    isHazard ? 'bg-red-600 text-white border-red-600' :
                    'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  )}>
                    {item.recommendedVerdict}
                  </span>

                  {item.maskRequired && (
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                      N95 Needed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
