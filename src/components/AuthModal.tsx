import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  auth,
  getEffectiveUser,
  loginWithGoogle,
  loginWithApple,
  loginAsGuest,
  logoutUser,
  findUserCoupleInFirestore,
  ensureCoupleRoomInFirestore,
} from '../lib/firebase';
import { CouplePair, PartnerId } from '../types';
import { X, Heart, LogOut, ShieldCheck, Sparkles, Check } from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  couple: CouplePair;
  onCoupleSync: (couple: CouplePair, partnerId?: PartnerId) => void;
  onToast: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  couple,
  onCoupleSync,
  onToast,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getEffectiveUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(getEffectiveUser());
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(getEffectiveUser());
      }
    });
    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncUserCouple = async (u: User, successToast: string) => {
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
    onClose();
  };

  const handleGoogleLogin = async () => {
    triggerHaptic('medium');
    setLoading(true);
    setError(null);
    try {
      const u = await loginWithGoogle(couple.partnerA.name || 'Utilisateur Google');
      await handleSyncUserCouple(u, `Connecté avec Google (${u.displayName || u.email || 'Compte Google'}) !`);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la connexion Google');
      onToast(err?.message || 'Erreur Google');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    triggerHaptic('medium');
    setLoading(true);
    setError(null);
    try {
      const u = await loginWithApple(couple.partnerA.name || 'Utilisateur Apple');
      await handleSyncUserCouple(u, `Connecté avec Apple (${u.displayName || u.email || 'Utilisateur Apple'}) !`);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la connexion Apple');
      onToast(err?.message || 'Erreur Apple');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    triggerHaptic('light');
    setLoading(true);
    setError(null);
    try {
      const u = await loginAsGuest(couple.partnerA.name || 'Invité');
      await handleSyncUserCouple(u, 'Session locale active !');
    } catch (err: any) {
      console.warn('Guest login notice:', err);
      onToast('Session locale active !');
      onClose();
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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-xs">
              <Heart className="w-4 h-4 fill-current text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white text-sm">Compte & Synchronisation</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Sauvegardez vos souvenirs et synchronisez votre Duo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Connected User Card */}
          {currentUser ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={currentUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt="User"
                    className="w-10 h-10 rounded-full object-cover border-2 border-rose-500 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-black text-slate-900 dark:text-white text-xs truncate">
                        {currentUser.displayName || currentUser.email || 'Compte Synchronisé'}
                      </p>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {currentUser.email ? currentUser.email : 'Mode Invité Sécurisé'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                  title="Déconnexion"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs">
                <Check className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>Vos souvenirs et votre code Duo ({couple.code}) sont synchronisés.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-rose-300 text-slate-800 dark:text-white font-extrabold text-xs shadow-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{loading ? 'Connexion...' : 'Continuer avec Google'}</span>
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
                <span>{loading ? 'Connexion...' : 'Continuer avec Apple'}</span>
              </button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] font-extrabold text-slate-400 bg-white dark:bg-slate-900 px-2 uppercase tracking-wider">
                  Ou
                </div>
              </div>

              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Rester en Mode Invité Démo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
