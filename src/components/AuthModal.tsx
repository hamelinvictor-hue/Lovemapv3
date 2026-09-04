import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  auth,
  getEffectiveUser,
  loginWithGoogle,
  loginWithApple,
  logoutUser,
  findUserCoupleInFirestore,
  ensureCoupleRoomInFirestore,
  joinCoupleInFirestore,
} from '../lib/firebase';
import { CouplePair, PartnerId } from '../types';
import {
  X,
  Heart,
  LogOut,
  ShieldCheck,
  Sparkles,
  Check,
  User as UserIcon,
  UserPlus,
  LogIn,
  KeyRound,
  Compass,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  couple: CouplePair;
  onCoupleSync: (couple: CouplePair, partnerId?: PartnerId) => void;
  onToast: (msg: string) => void;
  initialMode?: 'login' | 'register';
  canClose?: boolean;
  onOpenOnboarding?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  couple,
  onCoupleSync,
  onToast,
  initialMode = 'login',
  canClose = true,
  onOpenOnboarding,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getEffectiveUser());
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Registration profile options
  const [displayName, setDisplayName] = useState('');
  const [hasPartnerCode, setHasPartnerCode] = useState(false);
  const [partnerCode, setPartnerCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      const eff = getEffectiveUser();
      setCurrentUser(eff && !eff.isAnonymous ? eff : null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        setCurrentUser(user);
      } else {
        const eff = getEffectiveUser();
        setCurrentUser(eff && !eff.isAnonymous ? eff : null);
      }
    });
    return () => unsubscribe();
  }, [isOpen]);

  const isRealUser = Boolean(currentUser && !currentUser.isAnonymous);

  // If already authenticated with a real account, do not show this popup
  useEffect(() => {
    if (isOpen && isRealUser && !loading) {
      onClose();
    }
  }, [isOpen, isRealUser, loading, onClose]);

  if (!isOpen || (isRealUser && !loading)) return null;

  const handleSyncUserCouple = async (u: User, successToast: string) => {
    try {
      setCurrentUser(u);
      let existing = null;
      try {
        existing = await findUserCoupleInFirestore(u);
      } catch (e) {
        console.warn('Firestore lookup notice:', e);
      }
      if (existing) {
        onCoupleSync(existing.couple, existing.partnerId);
        onToast(`Espace duo (${existing.couple.code}) restauré 💖`);
      } else {
        try {
          const synced = await ensureCoupleRoomInFirestore(couple.code, couple, 'partner_a');
          onCoupleSync(synced, 'partner_a');
        } catch (e) {
          onCoupleSync(couple, 'partner_a');
        }
        onToast(successToast);
      }
    } finally {
      onClose();
    }
  };

  const handleGoogleLogin = async () => {
    triggerHaptic('medium');
    setLoading(true);
    setError(null);
    try {
      const preferredName = displayName.trim() || couple.partnerA.name || 'Utilisateur Google';
      const u = await loginWithGoogle(preferredName);

      // If user is in register mode and provided a partner code to join
      if (mode === 'register' && hasPartnerCode && partnerCode.trim()) {
        try {
          const joined = await joinCoupleInFirestore(
            u,
            partnerCode.trim().toUpperCase(),
            displayName.trim() || u.displayName || 'Partenaire',
            u.photoURL || couple.partnerA.avatar
          );
          if (joined) {
            onCoupleSync(joined, 'partner_b');
            onToast(`💖 Espace Duo (${joined.code}) rejoint avec succès !`);
            onClose();
            return;
          }
        } catch (joinErr: any) {
          console.warn('Join couple error on Google login:', joinErr);
          setError(joinErr?.message || 'Code Duo introuvable ou déjà complet.');
          return;
        }
      }

      await handleSyncUserCouple(u, `Connecté avec Google (${u.displayName || u.email || 'Compte Google'}) !`);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Connexion annulée par l\'utilisateur.');
      } else {
        setError(err?.message || 'Erreur lors de la connexion Google');
        onToast(err?.message || 'Erreur Google');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    triggerHaptic('medium');
    setLoading(true);
    setError(null);
    try {
      const preferredName = displayName.trim() || couple.partnerA.name || 'Utilisateur Apple';
      const u = await loginWithApple(preferredName);

      // If user is in register mode and provided a partner code to join
      if (mode === 'register' && hasPartnerCode && partnerCode.trim()) {
        try {
          const joined = await joinCoupleInFirestore(
            u,
            partnerCode.trim().toUpperCase(),
            displayName.trim() || u.displayName || 'Partenaire',
            u.photoURL || couple.partnerA.avatar
          );
          if (joined) {
            onCoupleSync(joined, 'partner_b');
            onToast(`💖 Espace Duo (${joined.code}) rejoint avec succès !`);
            onClose();
            return;
          }
        } catch (joinErr: any) {
          console.warn('Join couple error on Apple login:', joinErr);
          setError(joinErr?.message || 'Code Duo introuvable ou déjà complet.');
          return;
        }
      }

      await handleSyncUserCouple(u, `Connecté avec Apple (${u.displayName || u.email || 'Utilisateur Apple'}) !`);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Connexion annulée par l\'utilisateur.');
      } else {
        setError(err?.message || 'Erreur lors de la connexion Apple');
        onToast(err?.message || 'Erreur Apple');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    triggerHaptic('selection');
    await logoutUser();
    setCurrentUser(null);
    onToast('Déconnecté.');
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && canClose) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xl animate-fade-in overflow-y-auto"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-xs">
              <Heart className="w-4 h-4 fill-current text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white text-sm">
                {loading
                  ? 'Connexion sécurisée'
                  : mode === 'register'
                  ? 'Créer un compte'
                  : 'Se connecter'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {loading
                  ? 'Vérification en cours...'
                  : mode === 'register'
                  ? 'Démarrez votre carte secrète avec Google ou Apple'
                  : 'Retrouvez votre espace couple et vos souvenirs'}
              </p>
            </div>
          </div>

          {/* Close button ONLY when canClose is true and not loading */}
          {canClose && !loading ? (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
              <Shield className="w-3 h-3 text-amber-500" />
              <span>Authentification requise</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Transition Screen */}
          {loading ? (
            <div className="py-10 px-4 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-rose-100 dark:border-rose-950 border-t-rose-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Heart className="w-6 h-6 text-rose-500 fill-rose-500 animate-pulse" />
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Connexion sécurisée en cours...
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Synchronisation de votre espace Duo et de vos lieux secrets
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode Toggle Tabs: Se connecter vs Créer un compte */}
              <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Créer un compte</span>
                </button>
              </div>

              {/* Informative description */}
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-center px-2">
                {mode === 'login'
                  ? 'Connectez-vous via Google ou Apple pour retrouver votre espace Duo et synchroniser vos lieux secrets en toute sécurité.'
                  : 'Créez votre compte en 1 clic avec Google ou Apple pour lancer votre carte secrète ou rejoindre votre partenaire.'}
              </p>

              {/* Register-specific options (Prénom & Code Duo) */}
              {mode === 'register' && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 animate-fade-in">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-rose-500" />
                      <span>Votre prénom (optionnel)</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex : Camille"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setHasPartnerCode(!hasPartnerCode)}
                      className="text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-rose-500" />
                      <span>{hasPartnerCode ? 'Masquer le code partenaire' : "J'ai un code Duo partenaire à rejoindre"}</span>
                    </button>

                    {hasPartnerCode && (
                      <div className="mt-2 space-y-1 animate-fade-in">
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                          Code Duo reçu de votre partenaire
                        </label>
                        <input
                          type="text"
                          value={partnerCode}
                          onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                          placeholder="Ex: LM-ABCD-1234"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold uppercase text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 100% Mandatory Google & Apple Auth Buttons */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200/90 dark:border-slate-700 hover:border-rose-400 dark:hover:border-rose-600 text-slate-800 dark:text-white font-extrabold text-xs shadow-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 disabled:opacity-50"
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
                  onClick={handleAppleLogin}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 disabled:opacity-50"
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

              {/* Guided Onboarding Link if in Register Mode */}
              {mode === 'register' && onOpenOnboarding && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenOnboarding();
                    }}
                    className="w-full py-2.5 px-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Compass className="w-4 h-4 text-rose-500" />
                    <span>Lancer la visite guidée (Premier lancement)</span>
                  </button>
                </div>
              )}

              {/* Footer Switch between Login and Register */}
              <div className="pt-2 text-center">
                {mode === 'login' ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pas encore de compte ?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMode('register');
                        setError(null);
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
                        setError(null);
                      }}
                      className="font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Se connecter
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
