import React from 'react';
import { Map, Settings, Bell, BarChart3, Heart } from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';
import { useTranslation } from '../i18n/LanguageContext';

export type TabType = 'map' | 'add' | 'notifs' | 'stats' | 'couple';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  unreadCount: number;
  pendingValidationCount: number;
  onOpenSettings: () => void;
  theme?: 'dark' | 'light';
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  unreadCount,
  pendingValidationCount,
  onOpenSettings,
  theme = 'dark',
}) => {
  const { t } = useTranslation();

  const handleTabClick = (tab: TabType) => {
    triggerHaptic('light');
    onSelectTab(tab);
  };

  const handleSettingsClick = () => {
    triggerHaptic('medium');
    onOpenSettings();
  };

  return (
    <nav
      className="fixed left-0 right-0 z-[2000] px-3 sm:px-6 pointer-events-none transition-all"
      style={{
        bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="max-w-md mx-auto pointer-events-auto bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-white backdrop-blur-xl border border-slate-200/80 dark:border-white/10 rounded-full px-2 py-1.5 sm:px-3 sm:py-2 shadow-2xl shadow-slate-950/15 dark:shadow-slate-950/60 flex items-center justify-between transition-colors duration-300">
        {/* Map Tab */}
        <button
          onClick={() => handleTabClick('map')}
          className={`flex flex-col items-center justify-center py-1 px-1.5 sm:px-3 rounded-full transition-all cursor-pointer select-none ${
            activeTab === 'map'
              ? 'text-rose-600 dark:text-rose-400 font-bold scale-105'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Map className="w-4 h-4 sm:w-4.5 sm:h-4.5 mb-0.5" />
          <span className="text-[9px] sm:text-[10px] whitespace-nowrap">{t.navigation.map}</span>
        </button>

        {/* Bilan & Stats Tab */}
        <button
          onClick={() => handleTabClick('stats')}
          className={`flex flex-col items-center justify-center py-1 px-1.5 sm:px-3 rounded-full transition-all cursor-pointer select-none ${
            activeTab === 'stats'
              ? 'text-rose-600 dark:text-rose-400 font-bold scale-105'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4 sm:w-4.5 sm:h-4.5 mb-0.5" />
          <span className="text-[9px] sm:text-[10px] whitespace-nowrap">{t.navigation.stats}</span>
        </button>

        {/* CENTER LOGO / MON ESPACE BUTTON */}
        <button
          onClick={handleSettingsClick}
          className="relative -mt-5 group flex flex-col items-center cursor-pointer transition-all hover:scale-105 active:scale-95 shrink-0 select-none px-1"
          title={t.header.profileSettings}
        >
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-500 p-0.5 shadow-lg shadow-rose-500/30 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-950 flex items-center justify-center group-hover:bg-transparent transition-colors shadow-xs">
              <Heart className="w-5 h-5 text-rose-500 dark:text-rose-400 fill-current group-hover:text-white transition-colors" />
            </div>
          </div>
          <span className="text-[8px] sm:text-[9px] font-black text-rose-600 dark:text-rose-300 tracking-wider uppercase mt-0.5 whitespace-nowrap">
            {t.header.profileSettings}
          </span>
        </button>

        {/* Notifications Tab */}
        <button
          onClick={() => handleTabClick('notifs')}
          className={`relative flex flex-col items-center justify-center py-1 px-1.5 sm:px-3 rounded-full transition-all cursor-pointer select-none ${
            activeTab === 'notifs'
              ? 'text-rose-600 dark:text-rose-400 font-bold scale-105'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5 mb-0.5" />
          <span className="text-[9px] sm:text-[10px] whitespace-nowrap">{t.navigation.notifications}</span>
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900 animate-ping" />
          )}
        </button>

        {/* Couple & Duo Tab */}
        <button
          onClick={() => handleTabClick('couple')}
          className={`relative flex flex-col items-center justify-center py-1 px-1.5 sm:px-3 rounded-full transition-all cursor-pointer select-none ${
            activeTab === 'couple'
              ? 'text-rose-600 dark:text-rose-400 font-bold scale-105'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Heart className="w-4 h-4 sm:w-4.5 sm:h-4.5 mb-0.5" />
          <span className="text-[9px] sm:text-[10px] whitespace-nowrap">{t.navigation.duo}</span>
          {pendingValidationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 px-1 py-0.2 bg-amber-500 text-white text-[8px] sm:text-[9px] font-black rounded-full">
              {pendingValidationCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
};

