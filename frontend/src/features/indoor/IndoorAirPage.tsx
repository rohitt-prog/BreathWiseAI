import React from 'react';
import { MOCK_DAILY_PLAN, MOCK_AIR_QUALITY_DATA } from '../../services/mockData';
import { useAppStore } from '../../stores/useAppStore';
import { 
  Home, 
  AlertOctagon, 
  Sparkles, 
  XCircle, 
  Check 
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';

export const IndoorAirPage: React.FC = () => {
  const { currentLocationId } = useAppStore();
  const aqData = MOCK_AIR_QUALITY_DATA[currentLocationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar'];
  const indoor = MOCK_DAILY_PLAN.indoorProtocols;

  return (
    <div className="space-y-6 sm:space-y-8">
      
      {/* Page Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Indoor Air Quality Assistant
            </h1>
            <Badge variant="info" icon={Home} size="sm">
              Residential Defense
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Defending residential air during outdoor toxic smog episodes (Current Outdoor AQI: {aqData.aqi})
          </p>
        </div>

        {/* Master Ventilation Verdict */}
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-950 dark:text-red-200">
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider block">Natural Ventilation Status</span>
            <span className="text-xs font-semibold">SEAL WINDOWS — PROHIBITED</span>
          </div>
        </div>
      </div>

      {/* Critical Safety Rule: Banned Ozone Generators */}
      <section className="p-5 sm:p-6 rounded-2xl bg-red-950/20 border-2 border-red-600/70 text-red-950 dark:text-red-100 space-y-2 shadow-sm">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm sm:text-base">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          <span>STRICT AIR SAFETY DIRECTIVE: Ozone Air Cleaners Banned</span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {indoor.bannedPracticesWarning}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          * BreatheWise AI adheres strictly to Central Pollution Control Board and US EPA guidelines. Only mechanical HEPA filtration and activated carbon absorption are safe for occupied residential spaces.
        </p>
      </section>

      {/* Room-by-Room Optimization Protocols */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Living Room */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Living Room / Hall</h3>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Primary Hub</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Purifier Setting:</span>
              <p>Set fan speed to <strong>Medium-High continuous recirculation</strong>. Position 1 meter away from walls.</p>
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Infiltration Defense:</span>
              <p>Keep balcony and entrance doors firmly closed. Do not open windows even for a few minutes.</p>
            </div>
          </div>
        </div>

        {/* Kitchen */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Kitchen & Cooking</h3>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Combustion Zone</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Exhaust Extraction:</span>
              <p>Run electric chimney hood on maximum during cooking. Keep the kitchen door closed to hallway.</p>
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Avoid Indoor Particulates:</span>
              <p>Avoid high-heat tadka frying without active exhaust. Do not burn coal or charcoal indoors under any circumstances.</p>
            </div>
          </div>
        </div>

        {/* Bedroom */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Bedroom & Sleep</h3>
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">Recovery Sanctuary</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Night Protocol:</span>
              <p>Transfer portable air purifier to bedroom 45 minutes before sleep to drop PM2.5 below 25 µg/m³.</p>
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Floor Mopping:</span>
              <p>Wet mop the bedroom floor before bedtime to sequester fine settled dust particles.</p>
            </div>
          </div>
        </div>
      </section>

      {/* DIY & Non-Electrical Risk Reduction Checklist */}
      <section className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            Low-Cost DIY Mitigation Techniques (Non-Electrical)
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Essential protocols for households without centralized HVAC or multi-room HEPA purifiers:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {indoor.diyMitigationTips.map((tip, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
            >
              <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-snug">
                {tip}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
