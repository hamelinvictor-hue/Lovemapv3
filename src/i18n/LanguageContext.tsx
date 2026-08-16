import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Language, TranslationSchema } from './types';
import { fr } from './fr';
import { en } from './en';

const translations: Record<Language, TranslationSchema> = { fr, en };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: TranslationSchema;
  getCategoryName: (id: string) => string;
  getCriteriaInfo: (key: string) => { label: string; subtitle: string };
  formatDate: (dateStr: string) => string;
  isChangingLanguage: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function getDeviceDefaultLanguage(): Language {
  try {
    const navLangs = navigator.languages || [navigator.language];
    const primary = (
      navLangs[0] ||
      navigator.language ||
      (navigator as unknown as { userLanguage?: string }).userLanguage ||
      'fr'
    ).toLowerCase();

    // French locales (fr, fr-FR, fr-CA, fr-BE, fr-CH, fr-LU, fr-MC, etc.)
    if (primary.startsWith('fr')) {
      return 'fr';
    }

    // Default to English for all other locales
    return 'en';
  } catch {
    return 'fr';
  }
}

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getDeviceDefaultLanguage);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [targetLangName, setTargetLangName] = useState<string>('');

  // Automatically sync with device/browser language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      const detected = getDeviceDefaultLanguage();
      setLanguageState(detected);
    };

    window.addEventListener('languagechange', handleLanguageChange);
    return () => window.removeEventListener('languagechange', handleLanguageChange);
  }, []);

  // Switch language with a clean loading overlay & guaranteed 1 second buffer
  const setLanguage = useCallback(async (newLang: Language) => {
    if (newLang === language) return;

    setIsChangingLanguage(true);
    setTargetLangName(newLang === 'fr' ? 'Français' : 'English');

    try {
      localStorage.setItem('app_language', newLang);
    } catch (err) {
      console.warn('Could not save language preference:', err);
    }

    // Minimum 1.2s delay for seamless re-render in background
    await new Promise((resolve) => setTimeout(resolve, 1200));

    setLanguageState(newLang);

    // Additional small fade-out buffer
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsChangingLanguage(false);
  }, [language]);

  const t = translations[language] || translations.fr;

  const getCategoryName = useCallback((id: string): string => {
    const catMap: Record<string, string> = {
      outdoor: t.categories.outdoor,
      hotel: t.categories.hotel,
      insolite: t.categories.insolite,
      car: t.categories.car,
      beach: t.categories.beach,
      spa: t.categories.spa,
      secret: t.categories.secret,
    };
    return catMap[id] || id;
  }, [t]);

  const getCriteriaInfo = useCallback((key: string): { label: string; subtitle: string } => {
    const critMap: Record<string, { label: string; subtitle: string }> = {
      comfort: t.criteria.comfort,
      thrill: t.criteria.thrill,
      romance: t.criteria.romance,
      intensity: t.criteria.intensity,
      setting: t.criteria.setting,
    };
    return critMap[key] || { label: key, subtitle: '' };
  }, [t]);

  const formatDate = useCallback((dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        getCategoryName,
        getCriteriaInfo,
        formatDate,
        isChangingLanguage,
      }}
    >
      {children}

      {/* Fullscreen smooth loading overlay during manual language switch */}
      {isChangingLanguage && (
        <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl text-white animate-fade-in px-6 select-none pointer-events-auto">
          <div className="relative flex flex-col items-center max-w-sm w-full text-center space-y-5">
            {/* Animated glowing heart badge */}
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center text-3xl shadow-2xl shadow-rose-500/50 animate-pulse">
                ❤️
              </div>
              <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-slate-900 border-2 border-slate-800 flex items-center justify-center text-xs">
                🌐
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black tracking-tight text-white">
                {targetLangName === 'English' ? 'Switching to English...' : 'Passage en Français...'}
              </h3>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                {targetLangName === 'English'
                  ? 'Configuring translations and re-aligning your secret map...'
                  : 'Configuration de la langue et actualisation de votre carte...'}
              </p>
            </div>

            {/* Spinner indicator */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15">
              <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] font-bold tracking-wide text-rose-200">
                {targetLangName === 'English' ? 'Please wait a moment' : 'Veuillez patienter un instant'}
              </span>
            </div>
          </div>
        </div>
      )}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};

export const useLanguage = useTranslation;
