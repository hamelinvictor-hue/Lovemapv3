import React from 'react';
import { ShieldCheck, Lock, Eye, FileText, CheckCircle2 } from 'lucide-react';
import { saveAttConsent } from '../lib/storage';
import { useTranslation } from '../i18n/LanguageContext';

interface AppTrackingModalProps {
  isOpen: boolean;
  onClose: (status: 'authorized' | 'denied') => void;
  onOpenLegal: () => void;
}

export const AppTrackingModal: React.FC<AppTrackingModalProps> = ({
  isOpen,
  onClose,
  onOpenLegal,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleConsent = (status: 'authorized' | 'denied') => {
    saveAttConsent(status);
    onClose(status);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 overflow-hidden text-slate-900 dark:text-white space-y-5">
        
        {/* Header Icon */}
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <span className="inline-block px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-[11px] font-bold uppercase tracking-wider">
            {t.att.badge}
          </span>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            {t.att.title}
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
            {t.att.description}
          </p>
        </div>

        {/* Policy Badges */}
        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span><strong>{t.att.dataEncrypted}</strong> {t.att.dataEncryptedDesc}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Eye className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <span><strong>{t.att.anonymity}</strong> {t.att.anonymityDesc}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={() => handleConsent('authorized')}
            className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <CheckCircle2 className="w-4.5 h-4.5" />
            <span>{t.att.allowBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => handleConsent('denied')}
            className="w-full py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            <span>{t.att.denyBtn}</span>
          </button>
        </div>

        {/* Legal Footer Link */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onOpenLegal}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t.att.legalLink}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
