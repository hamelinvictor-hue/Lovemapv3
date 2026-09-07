import { copyToClipboard } from '../lib/clipboard';
import React, { useState } from 'react';
import { CouplePair, PartnerId, AppMode } from '../types';
import { triggerHaptic, triggerHeartBurst } from '../lib/feedback';
import { getDuoPremiumState } from '../lib/subscription';
import {
  Heart,
  Calendar,
  Sparkles,
  Copy,
  Check,
  Settings,
  Smartphone,
  MapPin,
  ShieldCheck,
  UserCheck,
  Flame,
  Star,
  User,
  HeartOff,
  AlertTriangle,
  X,
  KeyRound,
  ArrowRight,
  Crown,
  Moon,
  Sun,
} from 'lucide-react';

interface DuoViewProps {
  couple: CouplePair;
  activePartnerId: PartnerId;
  spotsCount: number;
  onUpdateCouple: (updated: CouplePair) => void;
  onSwitchPartner: (partnerId: PartnerId) => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
  onBreakCouple?: () => void;
  appMode?: AppMode;
  onJoinDuoCode?: (code: string) => Promise<void>;
  onOpenRateApp?: () => void;
  onOpenLegalPrivacy?: () => void;
  onOpenPremiumModal?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const DuoView: React.FC<DuoViewProps> = ({
  couple,
  activePartnerId,
  spotsCount,
  onUpdateCouple,
  onSwitchPartner,
  onOpenSettings,
  onOpenAuth,
  onToast,
  onBreakCouple,
  appMode = 'duo',
  onJoinDuoCode,
  onOpenRateApp,
  onOpenLegalPrivacy,
  onOpenPremiumModal,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [anniversaryInput, setAnniversaryInput] = useState(couple.anniversaryDate || '');
  const [showBreakModal, setShowBreakModal] = useState(false);

  const premiumState = getDuoPremiumState(couple, activePartnerId);

  // Duo Code input state when not paired
  const [duoCodeInput, setDuoCodeInput] = useState('');
  const [isJoiningDuo, setIsJoiningDuo] = useState(false);
  const [duoCodeError, setDuoCodeError] = useState<string | null>(null);

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
  const isPartnerAActive = activePartnerId === 'partner_a';
  const isPaired = (partnerB.name || '') !== 'En attente...' && couple?.status !== 'broken';

  const handleCopyCode = () => {
    triggerHaptic('medium');
    triggerHeartBurst(0.5, 0.5);
    copyToClipboard(couple.code);
    setCopiedCode(true);
    onToast('Code Duo copié dans le presse-papier !');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Calculate days & months together (starts at 1 on the first day)
  const getLoveDuration = () => {
    if (!couple.anniversaryDate) return null;
    const start = new Date(couple.anniversaryDate);
    if (isNaN(start.getTime())) return null;
    const now = new Date();
    const diffTime = Math.max(0, now.getTime() - start.getTime());
    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = totalDays % 30;

    return { totalDays, years, months, days };
  };

  const duration = getLoveDuration();

  const formatAnniversaryFrench = (dateStr?: string) => {
    if (!dateStr) return 'Date non renseignée';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleSaveAnniversary = () => {
    if (!anniversaryInput) return;
    triggerHaptic('success');
    onUpdateCouple({
      ...couple,
      anniversaryDate: anniversaryInput,
    });
    setIsEditingDate(false);
    onToast('Date d\'anniversaire mise à jour 💖');
  };

  return (
    <div className="w-full flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 pb-48 sm:pb-56 text-slate-900 dark:text-slate-100 max-w-2xl mx-auto space-y-5 animate-fade-in">
      {/* Fused Duo Profile & Header Card */}
      <div className="relative overflow-hidden p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        {/* Background glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-500/5 dark:bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Label */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 via-rose-500 to-rose-600 flex items-center justify-center text-white shadow-2xs">
              <Heart className="w-3.5 h-3.5 fill-current" />
            </div>
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
              Espace Duo Complice
            </h2>
          </div>
          <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 text-[10px] font-extrabold rounded-full border border-rose-200/60 dark:border-rose-900/40">
            {isPaired ? "Duo Uni 💖" : `Code: ${couple.code}`}
          </span>
        </div>

        {/* Fused Profiles Row (Partner A + Pulsing Heart + Partner B) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 items-center relative py-1">
          {/* Partner A */}
          <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 relative">
            <img
              src={partnerA.avatar}
              alt={partnerA.name}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-rose-400 dark:border-rose-500 shadow-md mb-1.5"
            />
            <h4 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm leading-tight truncate w-full">
              {partnerA.name}
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
              {partnerA.role || 'Partenaire 1'}
            </p>
          </div>

          {/* Central Pulsing Heart Badge */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center pointer-events-none">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-rose-500 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 ring-4 ring-white dark:ring-slate-900 animate-pulse">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </div>
          </div>

          {/* Partner B */}
          <div className="flex flex-col items-center text-center p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 relative">
            <img
              src={partnerB.avatar}
              alt={partnerB.name}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-indigo-400 dark:border-indigo-500 shadow-md mb-1.5"
            />
            <h4 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm leading-tight truncate w-full">
              {partnerB.name}
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
              {partnerB.role || 'Partenaire 2'}
            </p>
          </div>
        </div>

        {/* Code Duo & Join Section (If not paired) */}
        {!isPaired && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                Mon Code Duo : <span className="font-mono text-rose-600 dark:text-rose-400">{couple.code}</span>
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{copiedCode ? 'Copié' : 'Copier'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 text-left space-y-2">
              <div className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                  Rejoindre le Duo de votre partenaire
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={duoCodeInput}
                  onChange={(e) => {
                    setDuoCodeInput(e.target.value.toUpperCase());
                    setDuoCodeError(null);
                  }}
                  placeholder="Ex: LM-X89K-P3Q7"
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 font-mono text-xs font-black uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <button
                  type="button"
                  disabled={!duoCodeInput.trim() || isJoiningDuo}
                  onClick={async () => {
                    if (!duoCodeInput.trim() || !onJoinDuoCode) return;
                    setIsJoiningDuo(true);
                    setDuoCodeError(null);
                    try {
                      await onJoinDuoCode(duoCodeInput.trim());
                      setDuoCodeInput('');
                    } catch (err: any) {
                      setDuoCodeError(err?.message || 'Code invalide ou introuvable.');
                    } finally {
                      setIsJoiningDuo(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <span>{isJoiningDuo ? 'Connexion...' : 'Rejoindre'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {duoCodeError && (
                <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 p-2 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  ⚠️ {duoCodeError}
                </p>
              )}
            </div>
          </div>
        )}
        {/* Pass Duo Premium Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border border-amber-500/30 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
                <Crown className="w-4 h-4 fill-amber-400" />
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">Pass Duo Premium 👑</h4>
                <p className="text-[10px] text-slate-300 font-medium">
                  {premiumState.isPremium ? 'Actif pour le Duo (Modifications illimitées, Photos HD, Musique, PIN)' : 'Offre Gratuit (1 photo/lieu)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenPremiumModal}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              {premiumState.isPremium ? 'Gérer' : 'Débloquer'}
            </button>
          </div>
          {premiumState.isPremium && premiumState.subscriberName && (
            <p className="text-[10px] text-amber-200/90 font-medium bg-amber-950/60 p-2 rounded-lg border border-amber-800/40">
              ✨ Abonnement souscrit par <strong>{premiumState.subscriberName}</strong> • Partagé dans ce duo !
            </p>
          )}
        </div>
      </div>

      {/* Anniversary & Love Counter Section (Only shown if Duo is connected) */}
      {isPaired && (
        <div className="p-5 rounded-3xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-xl shadow-rose-500/20 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-2xl bg-white/20 backdrop-blur-md">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-black text-sm text-white tracking-tight">Anniversaire du Duo</h3>
                <p className="text-[11px] text-rose-100 font-medium">Lancement de votre histoire</p>
              </div>
            </div>

            <button
              onClick={() => setIsEditingDate(!isEditingDate)}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-extrabold transition-all cursor-pointer"
            >
              {isEditingDate ? 'Annuler' : 'Modifier'}
            </button>
          </div>

          {/* Anniversary Date Display or Picker */}
          {isEditingDate ? (
            <div className="space-y-2 p-3 rounded-2xl bg-black/20 backdrop-blur-md">
              <label className="block text-[11px] font-bold text-rose-100">
                Choisissez votre date d'anniversaire :
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={anniversaryInput}
                  onChange={(e) => setAnniversaryInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-white text-slate-900 font-black text-xs focus:outline-none"
                />
                <button
                  onClick={handleSaveAnniversary}
                  className="px-4 py-2 rounded-xl bg-white text-rose-600 hover:bg-rose-50 font-black text-xs transition-colors cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-between">
                <span className="text-xs font-bold text-rose-100">Date officielle :</span>
                <span className="text-sm font-black text-white tracking-wide">
                  {formatAnniversaryFrench(couple.anniversaryDate)}
                </span>
              </div>

              {duration && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/10">
                    <span className="block text-xl font-black text-white leading-none">
                      {duration.totalDays}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-100 mt-1 block">
                      Jours d'Amour
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/10">
                    <span className="block text-xl font-black text-white leading-none">
                      {duration.years > 0 ? `${duration.years} ans` : `${duration.months} mois`}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-100 mt-1 block">
                      Complicité
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/10">
                    <span className="block text-xl font-black text-white leading-none">
                      {spotsCount}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-100 mt-1 block">
                      Lieux Partagés
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* App Appearance & Theme Quick Switch */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-4 h-4 text-purple-400 fill-purple-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <span>Apparence (Thème)</span>
          </h4>
          <span className="text-[10px] font-bold text-slate-400">
            {theme === 'dark' ? 'Mode Sombre 🌙' : 'Mode Clair ☀️'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (theme !== 'dark') {
                triggerHaptic('light');
                onToggleTheme?.();
              }
            }}
            className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
              theme === 'dark'
                ? 'bg-purple-950/40 border-purple-500/80 text-purple-300 ring-2 ring-purple-500/30 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
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
              if (theme !== 'light') {
                triggerHaptic('light');
                onToggleTheme?.();
              }
            }}
            className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
              theme === 'light'
                ? 'bg-amber-50 border-amber-500/80 text-amber-900 ring-2 ring-amber-500/30 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
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

      {/* App Rating & Legal Section */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          <span>Soutien & Confidentialité</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={() => {
              triggerHaptic('light');
              onOpenRateApp?.();
            }}
            className="p-3 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
          >
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
            <span>Noter l'application</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              onOpenLegalPrivacy?.();
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
          >
            <ShieldCheck className="w-4 h-4 text-rose-500" />
            <span>Mentions Légales & RGPD</span>
          </button>
        </div>
      </div>

      {/* Break Duo / Dissolution Section (Only shown when paired) */}
      {isPaired && (
        <div className="pt-2">
          <button
            onClick={() => {
              triggerHaptic('heavy');
              setShowBreakModal(true);
            }}
            className="w-full py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900/50 text-red-600 dark:text-red-400 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95"
          >
            <HeartOff className="w-4 h-4 text-red-500" />
            <span>Casser / Dissoudre le Duo 💔</span>
          </button>
        </div>
      )}

      {/* Breakup Confirmation Modal */}
      {showBreakModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                Casser le Duo ?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-2 leading-relaxed">
                Êtes-vous sûr(e) de vouloir mettre fin à ce Duo ? Toutes les données et les lieux secrets partagés du Duo seront <strong className="text-red-600 dark:text-red-400 font-extrabold">définitivement supprimés</strong> des deux côtés.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  triggerHaptic('heavy');
                  setShowBreakModal(false);
                  onBreakCouple?.();
                }}
                className="w-full py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-lg shadow-red-600/30 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <HeartOff className="w-4 h-4" />
                <span>Oui, casser le Duo</span>
              </button>

              <button
                onClick={() => setShowBreakModal(false)}
                className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated bottom spacing so floating navbar never covers content */}
      <div className="h-20 sm:h-24 shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
};
