import React from 'react';
import { PartnerId, CouplePair, AppMode } from '../types';
import { ThemeMode } from '../lib/storage';
import { Smartphone, Heart, Flower2, Lock } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { triggerHaptic } from '../lib/feedback';

interface HeaderProps {
  couple: CouplePair;
  activePartnerId: PartnerId;
  onSwitchPartner: (id: PartnerId) => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenDuoTab: () => void;
  onOpenAuth: () => void;
  isMobileFrame: boolean;
  onToggleMobileFrame: () => void;
  onLockApp: () => void;
  appMode: AppMode;
  onToggleAppMode: (mode: AppMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  couple,
  activePartnerId,
  onOpenSettings,
  onOpenDuoTab,
  isMobileFrame,
  onToggleMobileFrame,
  appMode,
  onToggleAppMode,
}) => {
  const { t } = useTranslation();
  const partnerA = couple?.partnerA || {
    id: 'partner_a',
    name: 'Partenaire 1',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    role: 'Partenaire 1',
  };
  const partnerB = couple?.partnerB || {
    id: 'partner_b',
    name: 'En attente...',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };
  const activeUser = activePartnerId === 'partner_a' ? partnerA : partnerB;
  const isSolo = appMode === 'solo';

  return (
    <header
      className="sticky top-0 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-4 pb-2 transition-all shadow-2xs"
      style={{
        paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',
      }}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto gap-2">
        {/* Left Section: Fusion Avatars & Duo Names */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {/* Fusion Duo Avatars */}
          <button
            onClick={() => {
              triggerHaptic('heartbeat');
              onOpenDuoTab();
            }}
            className="relative shrink-0 flex items-center group cursor-pointer focus:outline-none"
            title={t.header.duoSpace}
          >
            {isSolo ? (
              <div className="relative">
                <img
                  src={activeUser.avatar}
                  alt={activeUser.name}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-sm transition-transform group-hover:scale-105"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 text-[9px]">
                  <Flower2 className="w-2.5 h-2.5" />
                </span>
              </div>
            ) : (
              <div className="relative flex items-center">
                {/* Partner A avatar */}
                <img
                  src={partnerA.avatar}
                  alt={partnerA.name}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-900 shadow-sm z-10 transition-transform group-hover:scale-105"
                />
                {/* Partner B avatar */}
                <img
                  src={partnerB.avatar}
                  alt={partnerB.name}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-900 shadow-sm -ml-3 z-0 transition-transform group-hover:scale-105"
                />
                {/* Fusion Heart Badge */}
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-20 w-4 h-4 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-2xs">
                  <Heart className="w-2.5 h-2.5 fill-current text-white animate-pulse" />
                </span>
              </div>
            )}
          </button>

          {/* Duo Partner Names always displayed */}
          <div className="min-w-0 flex flex-col justify-center">
            <div
              onClick={() => {
                triggerHaptic('heartbeat');
                onOpenDuoTab();
              }}
              className="flex items-center gap-1.5 flex-wrap cursor-pointer hover:opacity-85 transition-opacity"
              title={t.header.duoSpace}
            >
              {isSolo ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm tracking-tight">
                    {activeUser.name}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    {t.header.soloMode}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm tracking-tight truncate max-w-[70px] sm:max-w-[120px]">
                    {partnerA.name}
                  </span>
                  <Heart className="w-3 h-3 text-rose-500 fill-rose-500 shrink-0 animate-pulse mx-0.5" />
                  <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm tracking-tight truncate max-w-[70px] sm:max-w-[120px]">
                    {partnerB.name}
                  </span>
                </div>
              )}
            </div>

            {isSolo && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold leading-none mt-0.5">
                {t.header.soloMode}
              </p>
            )}
          </div>
        </div>

        {/* Center/Right: Quick Mode Switcher & Tools */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quick Duo <-> Secret Switcher Pill */}
          <div className="inline-flex p-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <button
              onClick={() => {
                triggerHaptic('selection');
                onToggleAppMode('duo');
              }}
              className={`px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                !isSolo
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t.header.duoMode}
            >
              <Heart className="w-3 h-3 fill-current" />
              <span>Duo</span>
            </button>
            <button
              onClick={() => {
                triggerHaptic('selection');
                onToggleAppMode('solo');
              }}
              className={`px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                isSolo
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t.header.soloMode}
            >
              <Lock className="w-2.5 h-2.5" />
              <span>Solo</span>
            </button>
          </div>

          {/* Mobile frame toggle for desktop */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onToggleMobileFrame();
            }}
            className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all shadow-2xs cursor-pointer ${
              isMobileFrame
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-rose-600 dark:border-rose-600'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            }`}
            title="Mobile Frame"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{isMobileFrame ? 'Desktop' : 'Mobile'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

