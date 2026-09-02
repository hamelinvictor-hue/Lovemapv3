import React from 'react';
import { Compass, Sparkles, MapPin, CheckCircle2, Navigation } from 'lucide-react';
import { saveHasSeenLocationPrompt, saveLocationPermissionStatus } from '../lib/storage';
import { triggerNativeGeolocation } from '../lib/nativePermissions';

interface LocationPermissionModalProps {
  isOpen: boolean;
  onClose: (permissionGranted: boolean) => void;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleAllow = async () => {
    saveHasSeenLocationPrompt(true);
    const granted = await triggerNativeGeolocation();
    saveLocationPermissionStatus(granted ? 'granted' : 'denied');
    onClose(granted);
  };

  const handleDeny = () => {
    saveHasSeenLocationPrompt(true);
    saveLocationPermissionStatus('denied');
    onClose(false);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 overflow-hidden text-slate-900 dark:text-white space-y-5">
        
        {/* Header Icon Badge with Apple/Google Style */}
        <div className="flex items-center justify-center pt-1">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/25">
              <Navigation className="w-8 h-8 animate-pulse" />
            </div>
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-[10px] font-black shadow-md border-2 border-white dark:border-slate-900">
              ✓
            </div>
          </div>
        </div>

        {/* Title and System Description */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200/60 dark:border-blue-900/60 text-blue-600 dark:text-blue-300 text-[11px] font-bold">
            <Compass className="w-3 h-3" />
            <span>Position GPS Requise</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
            « LoveMap » souhaite accéder à votre position
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
            Nous avons besoin de votre position exacte pour vous centrer sur la carte et faciliter l'ajout de vos lieux.
          </p>
        </div>

        {/* Action Buttons styled like iOS / Modern OS Dialog */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleAllow}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <CheckCircle2 className="w-4.5 h-4.5 text-blue-200" />
            <span>Autoriser l'accès GPS</span>
          </button>
          <button
            type="button"
            onClick={handleDeny}
            className="w-full py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <span>Ne pas autoriser</span>
          </button>
        </div>
      </div>
    </div>
  );
};
