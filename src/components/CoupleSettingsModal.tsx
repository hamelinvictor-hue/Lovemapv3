import React, { useState, useEffect, useRef } from 'react';
import { CouplePair, PartnerId, AppMode } from '../types';
import { auth, getEffectiveUser } from '../lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { triggerHaptic, triggerHeartBurst } from '../lib/feedback';
import { compressImageFile } from '../lib/imageCompressor';
import { getDuoPremiumState } from '../lib/subscription';
import { useTranslation } from '../i18n/LanguageContext';
import { isMobileDevice, showNativeConfirm } from '../lib/nativePermissions';
import {
  X,
  Heart,
  Lock,
  Copy,
  Check,
  User,
  Shield,
  Camera,
  LogOut,
  UserX,
  AlertTriangle,
  Cloud,
  CheckCircle2,
  KeyRound,
  HeartOff,
  ArrowRight,
  Star,
  Sparkles,
  FileText,
  Crown,
  Moon,
  Sun,
} from 'lucide-react';

interface CoupleSettingsModalProps {
  couple: CouplePair;
  activePartnerId: PartnerId;
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth: () => void;
  onUpdateCouple: (updated: CouplePair) => void;
  onResetData?: () => void;
  appMode?: AppMode;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
  onJoinDuoCode?: (code: string) => Promise<void>;
  onBreakCouple?: () => void;
  onOpenRateApp?: () => void;
  onOpenLegalPrivacy?: () => void;
  onOpenPremiumModal?: (reason?: string) => void;
  onOpenOnboarding?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  authUser?: FirebaseUser | null;
}

export const CoupleSettingsModal: React.FC<CoupleSettingsModalProps> = ({
  couple,
  activePartnerId,
  isOpen,
  onClose,
  onOpenAuth,
  onUpdateCouple,
  onResetData,
  appMode = 'duo',
  onLogout,
  onDeleteAccount,
  onJoinDuoCode,
  onBreakCouple,
  onOpenRateApp,
  onOpenLegalPrivacy,
  onOpenPremiumModal,
  onOpenOnboarding,
  theme = 'dark',
  onToggleTheme,
  authUser,
}) => {
  const { t } = useTranslation();
  const isSolo = appMode === 'solo';
  const isPartnerA = activePartnerId === 'partner_a';
  const isPaired = couple.partnerB.name !== 'En attente...' && couple.status !== 'broken';
  const premiumState = getDuoPremiumState(couple, activePartnerId);

  // Reactive tracking of user connection to prevent showing sync cards when already authenticated
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(() => authUser || auth.currentUser || getEffectiveUser());

  useEffect(() => {
    if (authUser) {
      setCurrentUser(authUser);
    }
  }, [authUser]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u && !u.isAnonymous) {
        setCurrentUser(u);
      } else {
        const eff = getEffectiveUser();
        setCurrentUser(eff && !eff.isAnonymous ? eff : null);
      }
    });
    return () => unsub();
  }, []);

  const isUserConnected = Boolean(
    (authUser && !authUser.isAnonymous) ||
    (currentUser && !currentUser.isAnonymous) ||
    (auth.currentUser && !auth.currentUser.isAnonymous) ||
    (getEffectiveUser() && !getEffectiveUser()?.isAnonymous)
  );

  const [partnerAName, setPartnerAName] = useState(couple.partnerA.name);
  const [partnerAAvatar, setPartnerAAvatar] = useState(couple.partnerA.avatar || '');
  const [partnerBName, setPartnerBName] = useState(couple.partnerB.name);
  const [partnerBAvatar, setPartnerBAvatar] = useState(couple.partnerB.avatar || '');
  const [anniversaryDate, setAnniversaryDate] = useState(couple.anniversaryDate);
  const [secretPin, setSecretPin] = useState(couple.secretPin || '1234');
  const [isPinLocked, setIsPinLocked] = useState(couple.isPinLocked || false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Join Code Input state
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  // Custom Confirmation Modals State
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBreakConfirm, setShowBreakConfirm] = useState(false);

  // Keep a ref of latest form values so closing or unmounting always saves cleanly
  const formStateRef = useRef({
    partnerAName,
    partnerAAvatar,
    partnerBName,
    partnerBAvatar,
    anniversaryDate,
    secretPin,
    isPinLocked,
  });

  useEffect(() => {
    formStateRef.current = {
      partnerAName,
      partnerAAvatar,
      partnerBName,
      partnerBAvatar,
      anniversaryDate,
      secretPin,
      isPinLocked,
    };
  }, [partnerAName, partnerAAvatar, partnerBName, partnerBAvatar, anniversaryDate, secretPin, isPinLocked]);

  // Keep a ref of current couple to avoid stale closures
  const coupleRef = useRef(couple);
  useEffect(() => {
    coupleRef.current = couple;
  }, [couple]);

  // Sync state ONLY when modal transitions from closed to open (never overwrite while user is typing)
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setPartnerAName(couple.partnerA.name);
      setPartnerAAvatar(couple.partnerA.avatar || '');
      setPartnerBName(couple.partnerB.name);
      setPartnerBAvatar(couple.partnerB.avatar || '');
      setAnniversaryDate(couple.anniversaryDate);
      setSecretPin(couple.secretPin || '1234');
      setIsPinLocked(couple.isPinLocked || false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Save changes automatically when unmounting if modal was open
  useEffect(() => {
    return () => {
      if (prevIsOpenRef.current) {
        const c = coupleRef.current;
        const s = formStateRef.current;
        onUpdateCouple({
          ...c,
          anniversaryDate: s.anniversaryDate,
          secretPin: s.secretPin,
          isPinLocked: s.isPinLocked,
          partnerA: {
            ...c.partnerA,
            name: s.partnerAName.trim() || c.partnerA.name || 'Partenaire 1',
            avatar: s.partnerAAvatar.trim() || c.partnerA.avatar,
          },
          partnerB: {
            ...c.partnerB,
            name: s.partnerBName.trim() || c.partnerB.name || 'Partenaire 2',
            avatar: s.partnerBAvatar.trim() || c.partnerB.avatar,
          },
        });
      }
    };
  }, []);

  if (!isOpen) return null;

  const saveUpdatedCouple = (
    newAName: string,
    newAAvatar: string,
    newBName: string,
    newBAvatar: string,
    newPin: string,
    newLocked: boolean
  ) => {
    const c = coupleRef.current;
    onUpdateCouple({
      ...c,
      anniversaryDate,
      secretPin: newPin,
      isPinLocked: newLocked,
      partnerA: {
        ...c.partnerA,
        name: newAName.trim() || c.partnerA.name || 'Partenaire 1',
        avatar: newAAvatar.trim() || c.partnerA.avatar,
      },
      partnerB: {
        ...c.partnerB,
        name: newBName.trim() || c.partnerB.name || 'Partenaire 2',
        avatar: newBAvatar.trim() || c.partnerB.avatar,
      },
    });
  };

  const handleTriggerLogout = async () => {
    triggerHaptic('medium');
    setShowLogoutConfirm(true);
  };

  const handleTriggerDeleteAccount = async () => {
    triggerHaptic('heavy');
    setShowDeleteConfirm(true);
  };

  const handleTriggerBreakCouple = async () => {
    triggerHaptic('heavy');
    setShowBreakConfirm(true);
  };

  const handleCloseModal = () => {
    saveUpdatedCouple(partnerAName, partnerAAvatar, partnerBName, partnerBAvatar, secretPin, isPinLocked);
    onClose();
  };

  const handleCopyCode = () => {
    triggerHaptic('medium');
    triggerHeartBurst(0.5, 0.5);
    navigator.clipboard.writeText(couple.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl text-white flex items-center justify-center ${isSolo ? 'bg-emerald-600' : 'bg-slate-900 dark:bg-rose-600'}`}>
              <Heart className="w-4 h-4 fill-current text-rose-300" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 dark:text-white text-sm">
                {t.settings.modalTitle}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {t.settings.modalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Cloud Account Connection Card (Only shown if NOT logged in) */}
          {!isUserConnected && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/40 dark:to-amber-950/40 border border-rose-200 dark:border-rose-900/50 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">{t.settings.cloudSyncTitle}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
                    {t.settings.cloudSyncSub}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenAuth();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-98"
              >
                {t.settings.cloudSyncBtn}
              </button>
            </div>
          )}

          {/* Couple Code & Connection Section (Only shown when NOT YET paired) */}
          {!isSolo && !isPaired && (
            <div className="p-4.5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-extrabold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" /> {t.duo.codeCardTitle}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {t.duo.partnerStatusWaiting}
                </span>
              </div>

              {/* Your Code to Share */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  {t.duo.codeCardTitle}
                </label>
                <div className="flex items-center justify-between bg-white/10 p-2.5 rounded-xl border border-white/10">
                  <span className="font-mono text-sm font-black text-rose-300 tracking-widest">{couple.code}</span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? t.common.copied : t.duo.copyCode}</span>
                  </button>
                </div>
              </div>

              {/* Join Code Input Form */}
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <label className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider block">
                  {t.duo.enterCode}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => {
                      setJoinCodeInput(e.target.value.toUpperCase());
                      setJoinCodeError(null);
                    }}
                    placeholder="Ex: LM-X89K-P3Q7"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-white uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    disabled={!joinCodeInput.trim() || isJoiningCode}
                    onClick={async () => {
                      if (!joinCodeInput.trim() || !onJoinDuoCode) return;
                      setIsJoiningCode(true);
                      setJoinCodeError(null);
                      try {
                        await onJoinDuoCode(joinCodeInput.trim());
                        setJoinCodeInput('');
                      } catch (err: any) {
                        setJoinCodeError(err?.message || 'Code introuvable ou erreur de synchronisation.');
                      } finally {
                        setIsJoiningCode(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-extrabold text-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {isJoiningCode ? t.common.loading : t.common.confirm}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {joinCodeError && (
                  <p className="text-[11px] font-bold text-rose-400 bg-rose-950/60 p-2 rounded-lg border border-rose-900/50">
                    ⚠️ {joinCodeError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Profile Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <span>{t.settings.profileSection} ({isPartnerA ? couple.partnerA.name : couple.partnerB.name})</span>
            </h3>

            {/* Avatar & Name Editor */}
            {isPartnerA ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-4">
                <label className="relative group cursor-pointer inline-block shrink-0" title={t.settings.clickPhotoChange}>
                  <img
                    src={partnerAAvatar || couple.partnerA.avatar}
                    alt={partnerAName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-rose-500 shadow-sm transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xs border-2 border-white dark:border-slate-900">
                    <Camera className="w-3 h-3" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const compressedUrl = await compressImageFile(file, 600, 0.8);
                          setPartnerAAvatar(compressedUrl);
                        } catch (err) {
                          console.error('Error compressing avatar:', err);
                        }
                      }
                    }}
                    className="hidden"
                  />
                </label>

                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.yourName}
                  </label>
                  <input
                    type="text"
                    value={partnerAName}
                    onChange={(e) => setPartnerAName(e.target.value)}
                    placeholder={t.settings.namePlaceholder}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    {t.settings.clickPhotoChange}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-4">
                <label className="relative group cursor-pointer inline-block shrink-0" title={t.settings.clickPhotoChange}>
                  <img
                    src={partnerBAvatar || couple.partnerB.avatar}
                    alt={partnerBName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-rose-500 shadow-sm transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xs border-2 border-white dark:border-slate-900">
                    <Camera className="w-3 h-3" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const compressedUrl = await compressImageFile(file, 600, 0.8);
                          setPartnerBAvatar(compressedUrl);
                        } catch (err) {
                          console.error('Error compressing avatar:', err);
                        }
                      }
                    }}
                    className="hidden"
                  />
                </label>

                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.yourName}
                  </label>
                  <input
                    type="text"
                    value={partnerBName}
                    onChange={(e) => setPartnerBName(e.target.value)}
                    placeholder={t.settings.namePlaceholder}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    {t.settings.clickPhotoChange}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Apparence & Theme Toggle Section */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                {theme === 'dark' ? <Moon className="w-4 h-4 text-purple-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span>Apparence</span>
              </h3>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {theme === 'dark' ? 'Mode Sombre actif' : 'Mode Clair actif'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (theme !== 'dark') onToggleTheme?.();
                }}
                className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-purple-950/40 border-purple-500/80 text-purple-300 ring-2 ring-purple-500/30 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-slate-950 text-purple-400 flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4 fill-current" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black leading-tight">Nuit (Sombre)</p>
                  <p className="text-[9px] opacity-75">Par défaut</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (theme !== 'light') onToggleTheme?.();
                }}
                className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-amber-50 border-amber-500/80 text-amber-900 ring-2 ring-amber-500/30 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Sun className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black leading-tight">Jour (Clair)</p>
                  <p className="text-[9px] opacity-75">Lumineux</p>
                </div>
              </button>
            </div>
          </div>

          {/* Security PIN Section */}
          <div className={`space-y-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl transition-all ${
            !premiumState.isPremium
              ? 'bg-amber-50/30 dark:bg-amber-950/20 border border-dashed border-amber-300/80 dark:border-amber-800/60'
              : 'bg-slate-50/50 dark:bg-slate-800/30'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>{t.settings.pinSecuritySection}</span>
              </h3>
              {premiumState.isPremium && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" /> {t.settings.pinIncluded}
                </span>
              )}
            </div>

            {!premiumState.isPremium ? (
              <div
                onClick={() => {
                  triggerHaptic('double');
                  onOpenPremiumModal?.(t.settings.pinLockedPrompt);
                }}
                className="cursor-pointer group pt-1"
              >
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15 border border-amber-400/50 flex items-center justify-between gap-2 shadow-2xs group-hover:border-amber-500 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Crown className="w-4 h-4 fill-white" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                        {t.settings.pinLockedPrompt}
                      </p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                        {t.settings.pinLockedSub}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 text-white font-extrabold text-[10px] uppercase shadow-xs shrink-0 whitespace-nowrap">
                    {t.settings.unlockPin}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" /> {t.settings.pinCodeLabel}
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={secretPin}
                    onChange={(e) => setSecretPin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 cursor-pointer hover:border-amber-400 transition-colors">
                  <input
                    type="checkbox"
                    checked={isPinLocked}
                    onChange={(e) => setIsPinLocked(e.target.checked)}
                    className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {t.settings.pinToggleLabel}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                      {t.settings.pinToggleSub}
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Rate App & Legal Section */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              <span>{t.settings.rateAndLegalSection}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenRateApp?.();
                }}
                className="p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
              >
                <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                <span>{t.settings.rateApp}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenLegalPrivacy?.();
                }}
                className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>{t.settings.legalPrivacy}</span>
              </button>
            </div>
          </div>

          {/* Account Actions: Logout & Delete Account */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-500" />
              <span>{t.settings.accountManagement}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Déconnexion */}
              <button
                type="button"
                onClick={handleTriggerLogout}
                className="p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
              >
                <LogOut className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{t.settings.logout}</span>
              </button>

              {/* Supprimer Compte */}
              <button
                type="button"
                onClick={handleTriggerDeleteAccount}
                className="p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
              >
                <UserX className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{t.settings.deleteAccount}</span>
              </button>
            </div>
          </div>

          {/* Primary Save & Close button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                handleCloseModal();
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 hover:from-rose-600 hover:to-pink-600 text-white font-black text-sm shadow-lg shadow-rose-500/25 transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-2"
            >
              <Heart className="w-4 h-4 fill-white" />
              <span>{t.common.save} & {t.common.close}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
              <LogOut className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                {t.settings.logoutConfirmTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-2 leading-relaxed">
                {t.settings.logoutConfirmMsg}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  console.log('[Native Debug] Logout confirm clicked');
                  setShowLogoutConfirm(false);
                  onClose();
                  onLogout?.();
                }}
                className="w-full py-3 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-lg shadow-amber-600/30 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.settings.logoutConfirmBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                {t.settings.deleteConfirmTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-2 leading-relaxed">
                {t.settings.deleteConfirmMsg}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  console.log('[Native Debug] Delete confirm clicked');
                  setShowDeleteConfirm(false);
                  onClose();
                  if (onDeleteAccount) {
                    onDeleteAccount();
                  } else if (onResetData) {
                    onResetData();
                  }
                }}
                className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <UserX className="w-4 h-4" />
                <span>{t.settings.deleteConfirmBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dissolve / Leave Duo Confirmation Modal */}
      {showBreakConfirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-sm">
              <HeartOff className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                {t.settings.breakDuoConfirmTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-2 leading-relaxed">
                {t.settings.breakDuoConfirmMsg}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBreakConfirm(false);
                  onBreakCouple?.();
                }}
                className="w-full py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-lg shadow-red-600/30 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <HeartOff className="w-4 h-4" />
                <span>{t.settings.breakDuoConfirmBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBreakConfirm(false)}
                className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
