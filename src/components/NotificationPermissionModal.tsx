import React from 'react';
import { Bell, Sparkles, Heart, Shield, CheckCircle2 } from 'lucide-react';
import { saveHasSeenNotificationPrompt, saveStoredNotificationPermission } from '../lib/storage';
import { triggerNativeNotification } from '../lib/nativePermissions';

interface NotificationPermissionModalProps {
  isOpen: boolean;
  onClose: (permissionGranted: boolean) => void;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleAllow = async () => {
    saveHasSeenNotificationPrompt(true);
    const granted = await triggerNativeNotification();
    saveStoredNotificationPermission(granted ? 'granted' : 'denied');
    onClose(granted);
  };

  const handleDeny = () => {
    saveHasSeenNotificationPrompt(true);
    saveStoredNotificationPermission('denied');
    onClose(false);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 overflow-y-auto my-auto max-h-[94vh] text-slate-900 dark:text-white space-y-4 sm:space-y-5">
        
        {/* Header Icon Badge with Apple/Google Style */}
        <div className="flex items-center justify-center pt-1">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 via-rose-600 to-amber-500 flex items-center justify-center text-white shadow-xl shadow-rose-500/25">
              <Bell className="w-8 h-8 animate-bounce" />
            </div>
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black shadow-md border-2 border-white dark:border-slate-900">
              1
            </div>
          </div>
        </div>

        {/* Title and System Description */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/70 border border-rose-200/60 dark:border-rose-900/60 text-rose-600 dark:text-rose-300 text-[11px] font-bold">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Alertes & Synchronisation Duo</span>
          </div>

          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
            « LoveMap » souhaite vous envoyer des notifications
          </h2>

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
            Recevez en temps réel les nouveaux lieux enregistrés par votre partenaire et l'alerte de fin de vos offres exclusives.
          </p>
        </div>

        {/* Value Points */}
        <div className="space-y-2.5 bg-slate-50/90 dark:bg-slate-800/60 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2.5">
            <Heart className="w-4 h-4 text-rose-500 shrink-0 fill-rose-500/20" />
            <span>Notification instantanée quand votre Duo ajoute un souvenir</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>0 spam • Modifiable à tout moment dans vos réglages</span>
          </div>
        </div>

        {/* Action Buttons styled like iOS / Modern OS Dialog */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleAllow}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <CheckCircle2 className="w-4.5 h-4.5 text-amber-200" />
            <span>Autoriser les notifications</span>
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
