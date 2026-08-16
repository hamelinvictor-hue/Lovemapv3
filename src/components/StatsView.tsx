import React, { useState, useEffect } from 'react';
import { Spot, CouplePair, AppMode } from '../types';
import { calculateGlobalCriteriaStats } from '../lib/storage';
import { RATING_CRITERIA } from '../data/initialData';
import { Icon } from './Icon';
import { Heart, Star, TrendingUp, Flower2 } from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface StatsViewProps {
  spots: Spot[];
  couple: CouplePair;
  onSelectSpot: (spot: Spot) => void;
  appMode?: AppMode;
}

export const StatsView: React.FC<StatsViewProps> = ({ spots, couple, onSelectSpot, appMode = 'duo' }) => {
  const [statsMode, setStatsMode] = useState<AppMode>(appMode);

  useEffect(() => {
    setStatsMode(appMode);
  }, [appMode]);

  const isSolo = statsMode === 'solo';

  // Filter spots depending on stats mode (Solo vs Duo)
  const modeSpots = spots.filter((s) => (isSolo ? s.isSolo : !s.isSolo));
  const validatedSpots = modeSpots.filter((s) => s.status === 'validated' || (s.overallScore !== undefined && s.overallScore > 0));
  const globalStats = calculateGlobalCriteriaStats(modeSpots);

  const totalOverallScore = validatedSpots.reduce((acc, s) => acc + (s.overallScore || 0), 0);
  const globalOverallAverage = validatedSpots.length > 0 ? Math.round((totalOverallScore / validatedSpots.length) * 10) / 10 : 0;
  const topSpots = [...validatedSpots].sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

  return (
    <div className="w-full flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 pb-48 sm:pb-56 text-slate-900 dark:text-slate-100 max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Mode Filter Selector */}
      <div className="flex items-center justify-between gap-3 p-1.5 rounded-2xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
        <button
          onClick={() => {
            triggerHaptic('selection');
            setStatsMode('duo');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            !isSolo
              ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Heart className="w-4 h-4 fill-current" />
          <span>Statistiques Duo Partagées</span>
        </button>
        <button
          onClick={() => {
            triggerHaptic('selection');
            setStatsMode('solo');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            isSolo
              ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Flower2 className="w-4 h-4" />
          <span>Statistiques Jardin Secret (Solo)</span>
        </button>
      </div>

      {/* Title Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            {isSolo ? (
              <>
                <span className="text-emerald-600">🌿</span>
                <span>Bilan Jardin Secret (Solo)</span>
              </>
            ) : (
              <>
                <span className="text-rose-500">💖</span>
                <span>Bilan & Statistiques Duo</span>
              </>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            {isSolo
              ? "Synthèse de vos lieux personnels enregistrés en toute confidentialité"
              : `Synthèse des moments enregistrés ensemble par ${couple.partnerA.name} et ${couple.partnerB.name}`}
          </p>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
            {isSolo ? 'Spots Secret' : 'Spots Validés'}
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white flex items-baseline gap-1">
            <span>{validatedSpots.length}</span>
            <span className="text-xs text-slate-400 font-normal">/ {modeSpots.length}</span>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border shadow-2xs space-y-1 transition-colors ${
          isSolo
            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900/50'
            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
        }`}>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Note Globale</span>
          <div className="text-2xl font-black text-amber-500 dark:text-amber-400 flex items-baseline gap-1">
            <span>{globalOverallAverage}</span>
            <span className="text-xs text-slate-400 font-normal">/ 10</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Photos & Médias</span>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 flex items-baseline gap-1">
            <span>{modeSpots.reduce((acc, s) => acc + (s.photos?.length || (s.photoUrl ? 1 : 0)), 0)}</span>
          </div>
        </div>
      </div>

      {/* Criteria Global Stats */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <TrendingUp className={`w-4 h-4 ${isSolo ? 'text-emerald-500' : 'text-rose-500'}`} />
              <span>Notes Moyennes par Critère ({isSolo ? 'Jardin Secret' : 'Duo'})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Évaluation des critères de vos lieux enregistrés
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {RATING_CRITERIA.map((crit) => {
            const stat = globalStats.find((s) => s.key === crit.key);
            const score = stat ? stat.averageScore : 0;
            return (
              <div key={crit.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="text-sm">{crit.emoji}</span>
                    <span>{crit.label}</span>
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{score.toFixed(1)} / 10</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isSolo ? 'bg-emerald-600' : 'bg-slate-900 dark:bg-rose-500'}`}
                    style={{ width: `${(score / 10) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Spots Leaderboard */}
      <div className="space-y-3">
        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          <span>Top Meilleures Expériences ({isSolo ? 'Jardin Secret' : 'Duo'})</span>
        </h3>

        {topSpots.length > 0 ? (
          <div className="space-y-2">
            {topSpots.slice(0, 5).map((spot, idx) => (
              <div
                key={spot.id}
                onClick={() => {
                  triggerHaptic('light');
                  onSelectSpot(spot);
                }}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-2xs flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-black flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{spot.title}</h4>
                    <p className="text-[11px] text-slate-400 font-medium">{spot.address}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-extrabold text-xs text-slate-900 dark:text-white">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>{spot.overallScore?.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isSolo ? 'Aucun spot solo enregistré dans votre Jardin Secret pour le moment.' : 'Aucun spot validé à deux pour le moment.'}
            </p>
          </div>
        )}
      </div>

      {/* Dedicated bottom spacing so floating navbar never covers content */}
      <div className="h-20 sm:h-24 shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
};
