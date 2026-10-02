import React, { useState, useEffect } from 'react';
import { signIn } from '../auth/sessionStore';
import {
  X,
  Heart,
  UserPlus,
  LogIn,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onToast: (msg: string) => void;
  initialMode?: 'login' | 'register';
  bannerMessage?: string | null;
  canClose?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onToast,
  initialMode = 'login',
  bannerMessage = null,
  canClose = false,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (bannerMessage) {
      setLocalError(null);
    }
  }, [bannerMessage]);

  if (!isOpen) return null;

  const handleProviderAuth = async (provider: 'google' | 'apple') => {
    triggerHaptic('medium');
    setLoading(true);
    setLocalError(null);
    try {
      const intent = mode === 'register' ? 'create' : 'login';
      await signIn(provider, intent);
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors de la connexion';
      setLocalError(msg);
      onToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const activeMessage = bannerMessage || localError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all">
        {/* Decorative Top Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500" />

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20 text-white">
                <Heart className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                  {mode === 'login' ? 'Connexion LoveMap' : 'Bienvenue sur LoveMap'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {mode === 'login' ? 'Retrouvez votre duo' : 'Créez votre espace secret'}
                </p>
              </div>
            </div>
            {canClose && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Banner message (Error / Existing account warning / Notification) */}
          {activeMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 font-semibold animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span>{activeMessage}</span>
              </div>
            </div>
          )}

          {/* Tabs: Se connecter vs Créer un compte */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMode('login');
                setLocalError(null);
              }}
              className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Se connecter</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMode('register');
                setLocalError(null);
              }}
              className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Créer un compte</span>
            </button>
          </div>

          {/* Subtext description */}
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-center px-1">
            {mode === 'login'
              ? 'Connectez-vous via Google ou Apple pour retrouver votre espace Duo et synchroniser votre carte.'
              : 'Créez votre compte en un instant avec Google ou Apple pour commencer l’aventure.'}
          </p>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleProviderAuth('google')}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200/90 dark:border-slate-700 hover:border-rose-400 dark:hover:border-rose-600 text-slate-800 dark:text-white font-extrabold text-xs shadow-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>
                {loading
                  ? 'Connexion en cours...'
                  : mode === 'register'
                  ? 'Créer mon compte avec Google'
                  : 'Continuer avec Google'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleProviderAuth('apple')}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 disabled:opacity-50"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.67-.82 1.13-1.96.99-3.11-1 .04-2.22.67-2.93 1.5-.64.74-1.2 1.93-1.05 3.07 1.12.09 2.27-.56 2.99-1.46z" />
              </svg>
              <span>
                {loading
                  ? 'Connexion en cours...'
                  : mode === 'register'
                  ? 'Créer mon compte avec Apple'
                  : 'Continuer avec Apple'}
              </span>
            </button>
          </div>

          {/* Security guarantee */}
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium pt-1">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>Authentification officielle & sécurisée Google & Apple</span>
          </div>

          {/* Footer toggle */}
          <div className="pt-2 text-center border-t border-slate-100 dark:border-slate-800">
            {mode === 'login' ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setMode('register');
                    setLocalError(null);
                  }}
                  className="font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Créer un compte
                </button>
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Déjà un compte ou un duo existant ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setMode('login');
                    setLocalError(null);
                  }}
                  className="font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Se connecter
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
