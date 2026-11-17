import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Wind, 
  ShieldCheck, 
  ArrowRight, 
  Home, 
  Layers, 
  Activity, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';

export const LandingPage: React.FC = () => {
  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8">
      
      {/* Hero Section */}
      <section className="text-center max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-semibold">
          <Wind className="w-4 h-4 text-emerald-600" />
          <span>PromptWars Virtual — Challenge 6: Urban Air Quality Assistant</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
          Breathe smarter. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
            Live healthier.
          </span>
        </h1>

        <p className="text-base sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          The GenAI-powered urban air quality assistant that converts official CPCB environmental telemetry into personalized daily routines, indoor air protection, and low-emission choices.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link to="/dashboard">
            <Button size="lg" icon={ArrowRight} iconPosition="right">
              Explore Live Intelligence
            </Button>
          </Link>
          <Link to="/planner">
            <Button variant="outline" size="lg">
              Personalized Daily Planner
            </Button>
          </Link>
        </div>

        {/* Core Product Philosophy Flow */}
        <div className="pt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
          <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">Environmental Data</span>
          <span>→</span>
          <span className="px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">Intelligence</span>
          <span>→</span>
          <span className="px-3 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300">Action</span>
          <span>→</span>
          <span className="px-3 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300">Impact</span>
        </div>
      </section>

      {/* Feature Pillar Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Verified CPCB Data</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Direct tracking of India's official 8-pollutant NAQI framework. Never fabricated or guessed from incomplete sensors.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/80 text-teal-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Exposure vs Emissions</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Distinguishes personal lung protection from carbon emission cuts so you never bike through toxic smog without an N95 mask.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/80 text-sky-600 flex items-center justify-center">
            <Home className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Indoor Air Assistant</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Safe ventilation schedules, HEPA purifier placement, and DIY damp mopping tactics with zero hazardous ozone generators.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Deterministic Safety</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Google Gemini bounded by deterministic safety engines. Hard rules override unsafe suggestions before they reach your screen.
          </p>
        </div>
      </section>

      {/* Comparison: Why BreatheWise is Not Another AQI Dashboard */}
      <section className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 text-white space-y-8 shadow-xl">
        <div className="max-w-2xl space-y-2">
          <Badge variant="custom" customClass="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            Beyond Generic Monitoring
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Designed for Action, Not Just Anxiety
          </h2>
          <p className="text-sm text-slate-300">
            Most weather apps only show a scary red number. BreatheWise AI gives you a defensive playbook for your day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>Generic AQI Apps</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-2">
              <li>✕ Only displays static numerical charts.</li>
              <li>✕ Recommends "cycling to reduce emissions" even when AQI is 400.</li>
              <li>✕ Lacks indoor air optimization and safe ventilation windows.</li>
              <li>✕ Obscures data provenance and mixes European AQI with Indian NAQI.</li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>BreatheWise AI</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-2">
              <li>✓ Hourly itinerary synchronized with inversion layers.</li>
              <li>✓ Identifies Delhi Metro as achieving low emissions AND low personal exposure.</li>
              <li>✓ Room-by-room ventilation windows and purifier recirculation mode.</li>
              <li>✓ Total provenance transparency: CPCB ground truth vs Open-Meteo forecasts.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
