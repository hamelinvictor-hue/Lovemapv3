import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CouplePair, PartnerId } from '../types';
import {
  getDuoPremiumState,
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  getTrialOfferRemainingSeconds,
  isTrialOfferActive,
  isTrialOfferExpired,
  startTrialOfferCountdown,
  hasTrialOfferStarted,
  formatTrialCountdown,
} from '../lib/subscription';
import { subscribeViaRevenueCat, revokeViaRevenueCat } from '../lib/revenuecatClient';
import {
  purchaseSubscriptionPlan,
  restorePurchasesFromStore,
  loadCurrentOfferings,
} from '../lib/purchases';
import type { PurchasesOffering } from '@revenuecat/purchases-capacitor';
import { triggerConfetti, triggerHaptic } from '../lib/feedback';
import {
  X,
  Crown,
  CheckCircle2,
  Sparkles,
  Heart,
  ShieldCheck,
  Zap,
  Gift,
  Check,
  ArrowRight,
  Clock,
  Camera,
  Music2,
  Pencil,
  Lock,
  RotateCcw,
} from 'lucide-react';

interface DuoPremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  couple: CouplePair;
  activePartnerId: PartnerId;
  onUpdateCoupleSubscription: (
    subscriberPartnerId: PartnerId,
    plan: 'monthly' | 'annual',
    active: boolean
  ) => void;
  reasonMessage?: string;
  isFirstSpotPaywall?: boolean;
  onOpenLegalPrivacy?: () => void;
}

export const DuoPremiumModal: React.FC<DuoPremiumModalProps> = ({
  isOpen,
  onClose,
  couple,
  activePartnerId,
  onUpdateCoupleSubscription,
  reasonMessage,
  isFirstSpotPaywall = false,
  onOpenLegalPrivacy,
}) => {
  const premiumState = getDuoPremiumState(couple, activePartnerId);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 48h Countdown Timer state
  const [remainingTrialSeconds, setRemainingTrialSeconds] = useState<number>(() =>
    getTrialOfferRemainingSeconds()
  );
  const trialOfferAvailable = remainingTrialSeconds > 0;

  // Paywall Stages: 'trial_7_days' (First spot 7 days), 'trial_14_days' (Downsell 14 days), 'standard' (regular)
  const [stage, setStage] = useState<'trial_7_days' | 'trial_14_days' | 'standard'>(() => {
    if (isFirstSpotPaywall) {
      startTrialOfferCountdown();
      const remaining = getTrialOfferRemainingSeconds();
      if (remaining > 0) return 'trial_7_days';
    }
    return 'standard';
  });

  // Real-time live countdown timer (ticks every second)
  useEffect(() => {
    if (!isOpen) return;

    // Start 48h countdown if opened as first spot paywall
    if (isFirstSpotPaywall && !hasTrialOfferStarted()) {
      startTrialOfferCountdown();
    }

    const tick = () => {
      const remaining = getTrialOfferRemainingSeconds();
      setRemainingTrialSeconds(remaining);
      // When countdown arrives at 0, 7-day and 14-day trial offers immediately disappear!
      if (remaining <= 0) {
        setStage((prev) => (prev !== 'standard' ? 'standard' : prev));
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isFirstSpotPaywall]);

  useEffect(() => {
    if (isOpen) {
      if (isFirstSpotPaywall) {
        startTrialOfferCountdown();
      }
      const remaining = getTrialOfferRemainingSeconds();
      setRemainingTrialSeconds(remaining);
      if (isFirstSpotPaywall && remaining > 0) {
        setStage('trial_7_days');
      } else {
        setStage('standard');
      }
    }
  }, [isOpen, isFirstSpotPaywall]);

  // Load native RevenueCat offerings (with localized Apple StoreKit pricing)
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  useEffect(() => {
    if (isOpen) {
      const appUserId = couple.code || activeUser.name || 'partner_' + activePartnerId;
      loadCurrentOfferings(appUserId).then((offering) => {
        if (offering) setCurrentOffering(offering);
      });
    }
  }, [isOpen, couple.code, activePartnerId]);

  const activeUser = activePartnerId === 'partner_a' ? couple.partnerA : couple.partnerB;
  const partnerUser = activePartnerId === 'partner_a' ? couple.partnerB : couple.partnerA;

  // Handle subscribe with RevenueCat & Native Apple StoreKit integration
  const handleSubscribe = async (trialDaysOverride?: number) => {
    triggerHaptic('medium');
    setIsProcessing(true);

    const appUserId = couple.code || activeUser.name || 'partner_' + activePartnerId;
    
    // Determine trial days:
    let currentTrialDays: number | undefined = undefined;
    if (trialOfferAvailable) {
      if (trialDaysOverride !== undefined) {
        currentTrialDays = trialDaysOverride;
      } else if (stage === 'trial_7_days') {
        currentTrialDays = 7;
      } else if (stage === 'trial_14_days') {
        currentTrialDays = 14;
      } else if (stage === 'standard' && selectedPlan === 'annual') {
        currentTrialDays = 7;
      }
    }

    try {
      const purchaseRes = await purchaseSubscriptionPlan({
        plan: selectedPlan,
        appUserId,
        trialDays: currentTrialDays,
        offering: currentOffering,
      });

      if (purchaseRes.userCancelled) {
        setIsProcessing(false);
        return;
      }
    } catch (err) {
      console.warn('RevenueCat purchase notice:', err);
    }

    onUpdateCoupleSubscription(activePartnerId, selectedPlan, true);
    setIsProcessing(false);
    triggerConfetti(1.0);

    const trialText = currentTrialDays ? `Vos ${currentTrialDays} jours d'essai gratuit sont activés !` : 'Votre Pass Duo Premium est actif !';
    setSuccessMessage(`🎉 Félicitations ! ${trialText} Synchro RevenueCat & Apple validée !`);

    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 2800);
  };

  // Restore Purchases handler (Apple Review requirement)
  const handleRestorePurchases = async () => {
    triggerHaptic('medium');
    setIsProcessing(true);
    const appUserId = couple.code || activeUser.name || 'partner_' + activePartnerId;
    try {
      const res = await restorePurchasesFromStore(appUserId);
      setIsProcessing(false);
      if (res.isPremium) {
        onUpdateCoupleSubscription(activePartnerId, 'annual', true);
        triggerConfetti(0.8);
        setSuccessMessage('🎉 Vos achats précédents ont été restaurés avec succès !');
        setTimeout(() => {
          setSuccessMessage(null);
          onClose();
        }, 2500);
      } else {
        alert(res.error || 'Aucun abonnement actif trouvé à restaurer.');
      }
    } catch {
      setIsProcessing(false);
      alert('Impossible de contacter l\'App Store pour le moment.');
    }
  };

  // Handle Refusal on 7-Day Trial -> Transition to 14-Day Trial Downsell (ONLY in first spot modal)
  const handleDecline7Days = () => {
    triggerHaptic('double');
    if (isFirstSpotPaywall && trialOfferAvailable) {
      setStage('trial_14_days');
    } else {
      onClose();
    }
  };

  // Handle Cancel Subscription
  const handleCancelSubscription = async () => {
    triggerHaptic('light');
    if (
      window.confirm(
        'Êtes-vous sûr de vouloir résilier le Pass Duo Premium ? Vous et votre partenaire repasserez à la version gratuite à la fin de la période.'
      )
    ) {
      const appUserId = couple.code || activeUser.name || 'partner_' + activePartnerId;
      try {
        await revokeViaRevenueCat(appUserId);
      } catch (err) {
        console.warn('RevenueCat revoke error:', err);
      }

      onUpdateCoupleSubscription(
        premiumState.subscriberPartnerId || activePartnerId,
        premiumState.plan || 'monthly',
        false
      );
      triggerHaptic('success');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Fluid backdrop fade */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
            onClick={stage === 'trial_7_days' ? handleDecline7Days : onClose}
          />

          {/* Fluid spring scale & slide modal card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 14 }}
            transition={{ type: 'spring', damping: 27, stiffness: 340 }}
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-amber-300/40 dark:border-amber-900/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[94vh] z-10"
          >
            {/* ==================================================== */}
            {/* STAGE 1: 7-DAY FREE TRIAL PAYWALL (POST-1ST SPOT)   */}
            {/* ==================================================== */}
            {stage === 'trial_7_days' && trialOfferAvailable && !premiumState.isPremium && (
              <motion.div
                key="stage-7-days"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                {/* Unified Royal Gradient Header */}
                <div className="relative bg-gradient-to-br from-amber-500 via-rose-600 to-purple-600 p-6 text-white text-center overflow-hidden shrink-0">
                  <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-white/15 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-32 h-32 bg-rose-400/25 rounded-full blur-2xl pointer-events-none" />

                  <button
                    onClick={handleDecline7Days}
                    type="button"
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer"
                    title="Passer"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex flex-col items-center justify-center gap-2 mb-2">
                    {/* Fused 48H Timer & 7-Day Free Trial Badge */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-amber-300/80 text-white shadow-xl shadow-slate-950/40 backdrop-blur-md">
                      <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                        🔥 7 Jours Gratuits
                      </span>
                      <span className="text-amber-200 text-xs font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                        <span className="text-[11px] text-rose-200 font-medium">Expire dans :</span>
                        <span className="font-mono font-black text-amber-300 tracking-wider">
                          {formatTrialCountdown(remainingTrialSeconds)}
                        </span>
                      </span>
                    </div>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                    7 Jours Gratuits pour votre Histoire 💖
                  </h2>
                  <p className="text-xs text-amber-100/90 font-semibold mt-1.5 max-w-sm mx-auto">
                    Bravo pour votre 1er lieu ! Profitez de 100% du Pass Duo sans débourser 1 centime aujourd'hui.
                  </p>
                </div>

                {/* Content Body */}
                <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-100">
                  {/* Context Reason Pill (if opened for a specific feature) */}
                  {reasonMessage && (
                    <div className="p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{reasonMessage}</span>
                    </div>
                  )}

                  {/* Harmonized Advantage Cards - TITLES ONLY (Sober & Premium) */}
                  <div className="space-y-2">
                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Camera className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Photos HD Illimitées (Jusqu'à 5 par lieu)
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Music2 className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Musique & Bandes Originales de vos Spots
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Pencil className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Modification Illimitée de tous vos Lieux & Notes
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Crown className="w-4 h-4 fill-amber-500/30 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        1 Abonnement = 100% Offert et partagé avec votre Duo
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Lock className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Verrouillage par Code PIN Secret & Confidentialité
                      </span>
                    </div>
                  </div>

                  {/* Harmonized Plan Selection */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                        Formule avec 7 jours d'essai gratuit
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> 0 € Aujourd'hui
                      </span>
                    </div>

                    {/* Annual Plan */}
                    <div
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedPlan('annual');
                      }}
                      className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        selectedPlan === 'annual'
                          ? 'border-amber-500 bg-gradient-to-r from-amber-500/10 to-rose-500/10 shadow-md scale-[1.01]'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div className="absolute -top-3 right-3 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                        🔥 7 Jours Gratuits
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900 dark:text-white uppercase">
                            Pass Annuel (1 An)
                          </span>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-bold">
                          0 € pendant 7 jours, puis 34,99 €/an (~2,91 €/mois)
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                          Résiliable à tout moment en 1 clic sans frais
                        </p>
                      </div>

                      <div className="shrink-0 pl-3">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedPlan === 'annual'
                              ? 'border-amber-500 bg-amber-500 text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {selectedPlan === 'annual' && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                      </div>
                    </div>

                    {/* Monthly Plan */}
                    <div
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedPlan('monthly');
                      }}
                      className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        selectedPlan === 'monthly'
                          ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-black text-slate-900 dark:text-white uppercase">
                          Pass Mensuel (1 Mois)
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                          {MONTHLY_PRICE} / mois • Sans engagement
                        </p>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPlan === 'monthly'
                            ? 'border-amber-500 bg-amber-500 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {selectedPlan === 'monthly' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>

                  {/* Harmonized CTA Buttons */}
                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleSubscribe(7)}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-extrabold text-sm shadow-xl shadow-rose-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <span className="flex items-center gap-2">
                          <Zap className="w-4 h-4 animate-spin" />
                          Activation des 7 jours gratuits...
                        </span>
                      ) : (
                        <>
                          <Crown className="w-5 h-5 text-amber-300 fill-amber-300" />
                          <span>COMMENCER MES 7 JOURS GRATUITS (0 €)</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDecline7Days}
                      className="w-full py-2.5 text-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Non merci, continuer avec la version gratuite
                    </button>

                    <p className="text-[10px] text-center text-slate-400 font-medium flex items-center justify-center gap-1.5 pt-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>App Store, Google Play & RevenueCat • Aucun prélèvement pendant 7j</span>
                    </p>

                    <div className="pt-2 flex items-center justify-center gap-4 text-[10px] text-slate-400">
                      <button
                        type="button"
                        onClick={handleRestorePurchases}
                        className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restaurer les achats</span>
                      </button>
                      {onOpenLegalPrivacy && (
                        <>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={onOpenLegalPrivacy}
                            className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            Conditions & Confidentialité
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ==================================================== */}
            {/* STAGE 2: 14-DAY FREE TRIAL DOWNSELL OFFER (RETENTION) */}
            {/* ==================================================== */}
            {stage === 'trial_14_days' && trialOfferAvailable && !premiumState.isPremium && (
              <motion.div
                key="stage-14-days"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                {/* Downsell Header Banner */}
                <div className="relative bg-gradient-to-br from-amber-500 via-rose-600 to-purple-600 p-6 text-white text-center overflow-hidden shrink-0">
                  <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-amber-400/20 rounded-full blur-2xl pointer-events-none animate-pulse" />
                  <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-32 h-32 bg-rose-400/20 rounded-full blur-2xl pointer-events-none" />

                  <button
                    onClick={onClose}
                    type="button"
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer"
                    title="Fermer"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex flex-col items-center justify-center gap-2 mb-2">
                    {/* Fused 48H Timer & 14-Day Free Trial Badge */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-amber-300/80 text-white shadow-xl shadow-slate-950/40 backdrop-blur-md">
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Gift className="w-3 h-3 fill-slate-950" />
                        Offre 14 Jours Gratuits
                      </span>
                      <span className="text-amber-200 text-xs font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                        <span className="text-[11px] text-rose-200 font-medium">Expire dans :</span>
                        <span className="font-mono font-black text-amber-300 tracking-wider">
                          {formatTrialCountdown(remainingTrialSeconds)}
                        </span>
                      </span>
                    </div>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                    Profitez de 14 JOURS GRATUITS !
                  </h2>
                  <p className="text-xs text-rose-100 font-semibold mt-1.5 max-w-sm mx-auto leading-relaxed">
                    Nous tenons vraiment à votre histoire : <strong>2 semaines entières de Pass Duo 100% gratuit !</strong>
                  </p>
                </div>

                {/* Downsell Content Body */}
                <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-100">
                  {/* Harmonized Advantage Cards - TITLES ONLY (Sober & Premium) */}
                  <div className="space-y-2">
                    <div className="p-3 rounded-2xl bg-amber-500/[0.08] dark:bg-amber-400/[0.08] border border-amber-500/30 dark:border-amber-400/30 flex items-center gap-3.5 shadow-2xs">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 dark:bg-amber-400/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-2xs">
                        <Gift className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-black text-amber-950 dark:text-amber-200 tracking-tight">
                        14 Jours Complets d'Essai Gratuit (0 € aujourd'hui)
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Camera className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Photos HD Illimitées (Jusqu'à 5 par lieu)
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Music2 className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Musique & Bandes Originales de vos Spots
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Pencil className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Modification Illimitée de tous vos Lieux & Notes
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Crown className="w-4 h-4 fill-amber-500/30 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Pass Duo 100% Offert et Synchronisé pour votre Partenaire
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Lock className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                        Verrouillage par Code PIN Secret & Confidentialité
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons for 14 Days */}
                  <div className="space-y-3 pt-1">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleSubscribe(14)}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-black text-sm shadow-xl shadow-rose-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <span className="flex items-center gap-2">
                          <Zap className="w-4 h-4 animate-spin" />
                          Activation des 14 jours gratuits...
                        </span>
                      ) : (
                        <>
                          <Gift className="w-5 h-5 text-amber-300" />
                          <span>PROFITER DES 14 JOURS GRATUITS 🎁 (0 €)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-2.5 text-center text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Non merci, je renonce définitivement aux 14 jours gratuits
                    </button>

                    <p className="text-[10px] text-center text-slate-400 font-medium flex items-center justify-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>App Store, Google Play & RevenueCat • Aucun prélèvement pendant 14j</span>
                    </p>

                    <div className="pt-2 flex items-center justify-center gap-4 text-[10px] text-slate-400">
                      <button
                        type="button"
                        onClick={handleRestorePurchases}
                        className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restaurer les achats</span>
                      </button>
                      {onOpenLegalPrivacy && (
                        <>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={onOpenLegalPrivacy}
                            className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            Conditions & Confidentialité
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ==================================================== */}
            {/* STAGE 3: STANDARD PAYWALL / ACTIVE STATUS VIEW      */}
            {/* ==================================================== */}
            {(stage === 'standard' || !trialOfferAvailable || premiumState.isPremium) && (
              <motion.div
                key="stage-standard"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                {/* Unified Royal Gradient Header */}
                <div className="relative bg-gradient-to-br from-amber-500 via-rose-600 to-purple-600 p-6 text-white text-center overflow-hidden shrink-0">
                  <div className="absolute top-0 right-0 -mr-6 -mt-6 w-28 h-28 bg-white/15 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-28 h-28 bg-rose-400/25 rounded-full blur-2xl pointer-events-none" />

                  <button
                    onClick={onClose}
                    type="button"
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-amber-100 text-xs font-black uppercase tracking-wider mb-2">
                    <Crown className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>Pass Duo Premium 👑</span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Immortalisez vos souvenirs sans limite
                  </h2>
                </div>

                {/* Content Body */}
                <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-100">
                  {/* Active Subscription Banner */}
                  {premiumState.isPremium ? (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 text-slate-900 dark:text-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-sm text-emerald-900 dark:text-emerald-300">
                              Pass Duo Premium Actif
                            </h3>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                              Plan {premiumState.plan === 'annual' ? 'Annuel (34,99 €/an)' : 'Mensuel (4,99 €/mois)'}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-black uppercase">
                          Actif
                        </span>
                      </div>

                      {/* Double Subscribed Reassurance Badge */}
                      {premiumState.bothSubscribed && (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs space-y-1">
                          <p className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                            <Crown className="w-4 h-4 text-amber-500 fill-amber-500" />
                            <span>Double Couverture Duo Active ✨</span>
                          </p>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                            Vous et votre partenaire possédez tous les deux un abonnement actif. Si l'un de vous deux résilie son abonnement, l'autre prend automatiquement le relais !
                          </p>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 text-xs space-y-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                          {premiumState.bothSubscribed ? (
                            <span>
                              Souscrit par <strong className="text-amber-600 dark:text-amber-400">{couple.partnerA.name}</strong> et <strong className="text-amber-600 dark:text-amber-400">{couple.partnerB.name}</strong>.
                            </span>
                          ) : premiumState.isSharedViaDuo ? (
                            <span>
                              Offert par votre partenaire <strong className="text-amber-600 dark:text-amber-400">{premiumState.subscriberName}</strong> grâce au Pass Duo !
                            </span>
                          ) : (
                            <span>
                              Souscrit par <strong className="text-amber-600 dark:text-amber-400">Vous ({activeUser.name})</strong> — Partagé avec {partnerUser.name && partnerUser.name !== 'En attente...' ? partnerUser.name : 'votre partenaire'}.
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Valable jusqu'au : {new Date(premiumState.expiresAt || '').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">Avantages : Photos HD (5), Musique, Cloud</span>
                        {!premiumState.isSharedViaDuo && (
                          <button
                            type="button"
                            onClick={handleCancelSubscription}
                            className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                          >
                            Résilier mon abonnement
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Context Reason Pill */}
                      {reasonMessage && (
                        <div className="p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>{reasonMessage}</span>
                        </div>
                      )}

                      {/* Harmonized Advantages List - TITLES ONLY (Sober & Premium) */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                          Inclus dans le Pass Duo Premium
                        </h3>

                        <div className="space-y-2">
                          <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                              <Pencil className="w-4 h-4 stroke-[2.2]" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                              Modification Illimitée des Lieux & Notes
                            </span>
                          </div>

                          <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                              <Camera className="w-4 h-4 stroke-[2.2]" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                              Jusqu'à 5 Photos HD par Lieu
                            </span>
                          </div>

                          <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                              <Music2 className="w-4 h-4 stroke-[2.2]" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                              Musique & Bandes Originales de vos Spots
                            </span>
                          </div>

                          <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                              <Crown className="w-4 h-4 fill-amber-500/30 stroke-[2.2]" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                              Avantage Duo Partagé : 1 Abonnement inclus pour les 2
                            </span>
                          </div>

                          <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 shadow-2xs hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                              <Lock className="w-4 h-4 stroke-[2.2]" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                              Verrouillage par Code PIN Secret & Confidentialité
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Harmonized Pricing Plan Selector */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Choisissez votre formule
                          </h3>
                          {trialOfferAvailable && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 dark:bg-slate-950 border border-amber-400/60 text-white text-[10px] shadow-sm">
                              <span className="font-bold text-amber-400">🔥 7j Gratuits</span>
                              <span className="text-slate-500">•</span>
                              <Clock className="w-3 h-3 text-rose-400 shrink-0 animate-pulse" />
                              <span className="font-mono font-black text-rose-300">
                                {formatTrialCountdown(remainingTrialSeconds)}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Monthly Plan */}
                          <div
                            onClick={() => {
                              triggerHaptic('light');
                              setSelectedPlan('monthly');
                            }}
                            className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                              selectedPlan === 'monthly'
                                ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 shadow-md'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-900 dark:text-white uppercase">
                                  1 Mois
                                </span>
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                    selectedPlan === 'monthly'
                                      ? 'border-amber-500 bg-amber-500 text-white'
                                      : 'border-slate-300'
                                  }`}
                                >
                                  {selectedPlan === 'monthly' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                Sans engagement
                              </p>
                            </div>

                            <div className="mt-4">
                              <span className="text-lg font-black text-slate-900 dark:text-white">
                                {MONTHLY_PRICE}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium"> / mois</span>
                            </div>
                          </div>

                          {/* Annual Plan (Best Value) */}
                          <div
                            onClick={() => {
                              triggerHaptic('light');
                              setSelectedPlan('annual');
                            }}
                            className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                              selectedPlan === 'annual'
                                ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/20 shadow-md'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                            }`}
                          >
                            {trialOfferAvailable ? (
                              <div className="absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                                🔥 7J GRATUITS
                              </div>
                            ) : (
                              <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-[10px] font-black text-white shadow-sm uppercase tracking-wider">
                                Économisez ~41% 🌟
                              </div>
                            )}

                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-900 dark:text-white uppercase">
                                  1 An {trialOfferAvailable ? '(Essai 7j)' : '(Meilleur Choix)'}
                                </span>
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                    selectedPlan === 'annual'
                                      ? 'border-amber-500 bg-amber-500 text-white'
                                      : 'border-slate-300'
                                  }`}
                                >
                                  {selectedPlan === 'annual' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                {trialOfferAvailable
                                  ? '0 € pendant 7 jours, puis 34,99 €/an'
                                  : 'Soit ~2,91 € / mois'}
                              </p>
                            </div>

                            <div className="mt-4">
                              <span className="text-lg font-black text-slate-900 dark:text-white">
                                {ANNUAL_PRICE}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium"> / an</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Harmonized Action Subscribe Button */}
                      <div className="pt-2 space-y-2">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleSubscribe(trialOfferAvailable && selectedPlan === 'annual' ? 7 : undefined)}
                          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-extrabold text-sm shadow-xl shadow-rose-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <span className="flex items-center gap-2">
                              <Zap className="w-4 h-4 animate-spin" />
                              Activation sécurisée du Pass Duo...
                            </span>
                          ) : (
                            <>
                              <Crown className="w-4.5 h-4.5 text-amber-300" />
                              <span>
                                {trialOfferAvailable && selectedPlan === 'annual'
                                  ? "COMMENCER MES 7 JOURS GRATUITS (0 €)"
                                  : `Activer le Pass Duo Premium (${selectedPlan === 'annual' ? ANNUAL_PRICE : MONTHLY_PRICE})`}
                              </span>
                            </>
                          )}
                        </button>

                        <p className="text-[10px] text-center text-slate-400 font-medium flex items-center justify-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>App Store, Google Play & RevenueCat API</span>
                        </p>

                        <div className="pt-2 flex items-center justify-center gap-4 text-[10px] text-slate-400">
                          <button
                            type="button"
                            onClick={handleRestorePurchases}
                            className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restaurer les achats</span>
                          </button>
                          {onOpenLegalPrivacy && (
                            <>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={onOpenLegalPrivacy}
                                className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                              >
                                Conditions & Confidentialité
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 text-emerald-900 dark:text-emerald-200 text-xs font-bold text-center animate-fade-in m-4">
                {successMessage}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

