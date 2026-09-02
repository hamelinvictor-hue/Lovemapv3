import React from 'react';
import { Navigation, MapPin, CheckCircle2, Shield } from 'lucide-react';
import { saveHasSeenLocationPrompt } from '../lib/storage';
import { triggerNativeGeolocation } from '../lib/nativePermissions';

interface LocationPermissionModalProps {
  isOpen: boolean;
  onClose: (allowLocation: boolean) => void;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleAllow = async () => {
    saveHasSeenLocationPrompt(true);
    const granted = await triggerNativeGeolocation();
    onClose(granted);
  };

  const handleSkip = () => {
    saveHasSeenLocationPrompt(true);
    onClose(false);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 overflow-hidden text-slate-900 dark:text-white space-y-5">
        
        {/* Header Icon */}
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner">
            <Navigation className="w-8 h-8 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-[11px] font-bold uppercase tracking-wider">
            Carte & Géolocalisation
          </span>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Positionner vos lieux sur la carte
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
            Pour afficher votre position en direct et ajouter facilement des spots autour de vous, LoveMap a besoin d'accéder à votre géolocalisation.
          </p>
        </div>

        {/* Feature Points */}
        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Repérage précis de vos souvenirs sur la carte</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Votre position GPS n'est jamais vendue ni publique</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={handleAllow}
            className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <CheckCircle2 className="w-4.5 h-4.5" />
            <span>Activer la géolocalisation GPS</span>
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <span>Saisir les lieux manuellement (Plus tard)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
