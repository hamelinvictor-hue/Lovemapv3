import React, { useState, useEffect, useRef } from 'react';
import { Spot, PartnerId, CouplePair, NotificationItem, CriteriaKey, AppMode, UserProfile } from './types';
import {
  getStoredSpots,
  saveSpots,
  getStoredCouple,
  saveCouple,
  getStoredNotifications,
  saveNotifications,
  getActivePartner,
  setActivePartner,
  getStoredAppMode,
  saveAppMode,
  getStoredTheme,
  saveTheme,
  getHasCompletedOnboarding,
  saveHasCompletedOnboarding,
  clearUserSessionStorage,
  ThemeMode,
  computeSpotScores,
  getAppLaunchCount,
  incrementAppLaunchCount,
  getAttConsent,
  saveAttConsent,
  getHasSeenLocationPrompt,
  saveHasSeenLocationPrompt,
  getHasSeenNotificationPrompt,
  getHasSentTrialUrgencyNotification,
  saveHasSentTrialUrgencyNotification,
  getHasRatedApp,
  saveHasRatedApp,
  getHasPromptedFirstSpotRating,
  saveHasPromptedFirstSpotRating,
} from './lib/storage';
import {
  subscribeToCouple,
  subscribeToSpots,
  subscribeToNotifications,
  saveSpotToFirestore,
  deleteSpotFromFirestore,
  saveNotificationToFirestore,
  updateCoupleInFirestore,
  logoutFromFirebase,
  auth,
  findUserCoupleInFirestore,
  deleteUserAccountInFirestore,
  breakCoupleInFirestore,
  generateCoupleCode,
  createCoupleInFirestore,
  joinCoupleInFirestore,
  ensureGuestUser,
  ensureCoupleRoomInFirestore,
  purgeAllFirestoreData,
} from './lib/firebase';
import {
  getDuoPremiumState,
  hasTrialOfferStarted,
  isTrialOfferActive,
  getTrialOfferRemainingSeconds,
} from './lib/subscription';
import { ensureSubscriberInRevenueCat } from './lib/revenuecatClient';
import { triggerHaptic } from './lib/feedback';
import { INITIAL_SPOTS, INITIAL_NOTIFICATIONS, INITIAL_COUPLE } from './data/initialData';

import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { MapView } from './components/MapView';
import { AddSpotModal } from './components/AddSpotModal';
import { ValidateSpotModal } from './components/ValidateSpotModal';
import { QuestionnaireModal } from './components/QuestionnaireModal';
import { SpotDetailSheet } from './components/SpotDetailSheet';
import { StatsView } from './components/StatsView';
import { NotificationsView } from './components/NotificationsView';
import { CoupleSettingsModal } from './components/CoupleSettingsModal';
import { PinLockModal } from './components/PinLockModal';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { DuoCodeModal } from './components/DuoCodeModal';
import { DuoView } from './components/DuoView';
import { DuoPremiumModal } from './components/DuoPremiumModal';
import { MobileFrame } from './components/MobileFrame';
import { AppTrackingModal } from './components/AppTrackingModal';

import { NotificationPermissionModal } from './components/NotificationPermissionModal';
import { StoreRatingModal } from './components/StoreRatingModal';
import { LegalPrivacyModal } from './components/LegalPrivacyModal';
import { isNativePlatform, requestNativeGeolocation } from './lib/nativePermissions';
import { Heart, Sparkles, CheckCircle2, Bell, Smartphone, KeyRound, HeartOff, AlertTriangle } from 'lucide-react';

export default function App() {
  const [spots, setSpots] = useState<Spot[]>(() => getStoredSpots());
  const [couple, setCouple] = useState<CouplePair>(() => getStoredCouple());
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => getStoredNotifications());
  const [activePartnerId, setActivePartnerId] = useState<PartnerId>(() => getActivePartner());
  const [appMode, setAppMode] = useState<AppMode>(() => getStoredAppMode());
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [isMobileFrame, setIsMobileFrame] = useState(false);

  // Synchronization refs for real-time background notifications
  const spotsRef = useRef<Spot[]>(spots);
  const notificationsRef = useRef<NotificationItem[]>(notifications);
  const activePartnerIdRef = useRef<PartnerId>(activePartnerId);
  const isInitialNotifSyncRef = useRef<boolean>(true);

  useEffect(() => {
    spotsRef.current = spots;
  }, [spots]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    activePartnerIdRef.current = activePartnerId;
  }, [activePartnerId]);

  // Apply dark mode class to root <html> element and sync with system preference
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  // Match system theme preference changes dynamically
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only switch if user hasn't explicitly set a custom theme in localStorage
      const stored = localStorage.getItem('lovemap_theme_v1');
      if (!stored) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    showToast(nextTheme === 'dark' ? '🌙 Mode Nuit (Cozy Night) activé' : '☀️ Mode Clair activé');
  };

  // Modals state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !getHasCompletedOnboarding());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authModalSource, setAuthModalSource] = useState<'settings' | 'general'>('general');
  const [addCoords, setAddCoords] = useState<{ lat: number; lng: number }>({ lat: 43.2118, lng: 5.5186 });

  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [validationSpot, setValidationSpot] = useState<Spot | null>(null);
  const [questionnaireSpot, setQuestionnaireSpot] = useState<Spot | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(() => Boolean(couple.isPinLocked && getDuoPremiumState(couple, getActivePartner()).isPremium));
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDuoCodeModal, setShowDuoCodeModal] = useState<string | null>(null);
  const [brokenDuoNotice, setBrokenDuoNotice] = useState<string | null>(null);

  // Duo Premium Modal State
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumModalReason, setPremiumModalReason] = useState<string | undefined>(undefined);
  const [isFirstSpotPaywall, setIsFirstSpotPaywall] = useState(false);

  const handleOpenPremiumModal = (reasonMessage?: string, isFirstSpot = false) => {
    setPremiumModalReason(reasonMessage);
    setIsFirstSpotPaywall(isFirstSpot);
    setIsPremiumModalOpen(true);
  };

  const handleUpdateCoupleSubscription = async (
    subscriberPartnerId: PartnerId,
    plan: 'monthly' | 'annual',
    active: boolean
  ) => {
    const isSubscriberA = subscriberPartnerId === 'partner_a';
    const expiresAt = new Date();
    if (plan === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    const subscriberProfile = isSubscriberA ? couple.partnerA : couple.partnerB;
    const updatedProfile: UserProfile = {
      ...subscriberProfile,
      subscription: active
        ? {
            plan,
            purchasedAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
            purchasedByPartnerId: subscriberPartnerId,
            active: true,
          }
        : undefined,
    };

    const updatedCouple: CouplePair = {
      ...couple,
      partnerA: isSubscriberA ? updatedProfile : couple.partnerA,
      partnerB: !isSubscriberA ? updatedProfile : couple.partnerB,
    };

    setCouple(updatedCouple);
    saveCouple(updatedCouple);

    if (couple.code) {
      try {
        await updateCoupleInFirestore(couple.code, updatedCouple);
      } catch (err) {
        console.warn('Error updating subscription in Firestore:', err);
      }
    }

    if (active) {
      showToast(plan === 'monthly' ? '👑 Pass Duo Premium (1 mois) activé !' : '👑 Pass Duo Premium (1 an) activé !');
    } else {
      showToast('Pass Duo Premium résilié.');
    }
  };

  // Legal, Permission & Store Rating Modals (Apple ATT Prompt directly on 1st launch)
  const [isAttModalOpen, setIsAttModalOpen] = useState<boolean>(() => !getAttConsent());
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isStoreRatingOpen, setIsStoreRatingOpen] = useState(false);
  const [ratingTriggerSource, setRatingTriggerSource] = useState<'first_spot' | 'app_launch' | 'manual'>('app_launch');
  const [isLegalPrivacyOpen, setIsLegalPrivacyOpen] = useState(false);

  // App launch counter & ATT prompt on startup
  useEffect(() => {
    const launchCount = incrementAppLaunchCount();

    if (!getAttConsent()) {
      setIsAttModalOpen(true);
    } else {
      // Trigger App Rating on 2nd launch, then every 4 launches thereafter (2, 6, 10, 14...)
      if (!getHasRatedApp()) {
        if (launchCount === 2 || (launchCount > 2 && (launchCount - 2) % 4 === 0)) {
          const rateTimer = setTimeout(() => {
            setRatingTriggerSource('app_launch');
            setIsStoreRatingOpen(true);
          }, 1500);
          return () => clearTimeout(rateTimer);
        }
      }
    }
  }, []);

  // Monitor 48H countdown: when remaining time hits <= 1 hour (3600s), dispatch urgency system notification!
  useEffect(() => {
    const checkTrialUrgency = () => {
      if (!hasTrialOfferStarted() || !isTrialOfferActive()) return;
      const remainingSecs = getTrialOfferRemainingSeconds();

      // If less than or equal to 1 hour (3600 seconds) remaining and notification hasn't been sent yet
      if (remainingSecs > 0 && remainingSecs <= 3600 && !getHasSentTrialUrgencyNotification()) {
        saveHasSentTrialUrgencyNotification(true);

        // 1. Send native browser / OS notification if permission is granted
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const nativeNotif = new Notification('🚨 OFFRE DUO : Plus que 1h pour vos 7 jours gratuits !', {
              body: "Ne manquez pas votre Pass Duo 100% offert. Touchez ici pour activer vos 7 jours avant l'expiration définitive !",
              icon: '/favicon.ico',
              tag: 'trial_urgency_1h',
            });
            nativeNotif.onclick = () => {
              window.focus();
              handleOpenPremiumModal('Offre d\'urgence : Plus que 1 heure pour débloquer vos 7 jours gratuits (0 €) ! ⏳✨');
            };
          } catch (e) {
            console.warn('Native notification dispatch error:', e);
          }
        }

        // 2. Add an in-app priority urgency notification
        const urgencyNotif: NotificationItem = {
          id: `notif-urgency-${Date.now()}`,
          type: 'premium_offer_urgency',
          spotId: '',
          senderId: activePartnerId,
          title: '🚨 DERNIÈRE HEURE : Vos 7 Jours Gratuits expirent !',
          message: "Il ne vous reste plus qu'une heure pour réclamer vos 7 jours d'essai offerts (0 €). Touchez pour en profiter immédiatement !",
          timestamp: "À l'instant",
          isRead: false,
        };

        setNotifications((prev) => [urgencyNotif, ...prev]);
        if (couple.code) {
          saveNotificationToFirestore(couple.code, urgencyNotif).catch(console.error);
        }

        // 3. Floating alert toast
        showToast('🚨 Plus que 1H restante pour vos 7 jours gratuits ! Touchez pour débloquer.');
      }
    };

    checkTrialUrgency();
    const interval = setInterval(checkTrialUrgency, 10000);
    return () => clearInterval(interval);
  }, [couple.code, activePartnerId]);

  const handleCompleteOnboarding = (mode: AppMode, syncedCouple?: CouplePair, partnerId?: PartnerId) => {
    saveHasCompletedOnboarding(true);
    setIsOnboardingOpen(false);
    setAppMode(mode);
    saveAppMode(mode);
    if (syncedCouple) {
      setCouple(syncedCouple);
      saveCouple(syncedCouple);
    }
    if (partnerId) {
      setActivePartnerId(partnerId);
      setActivePartner(partnerId);
    }
    if (mode === 'solo') {
      showToast('🌿 Jardin Secret activé : Vos repères personnels secrets !');
    } else {
      const codeToShow = syncedCouple?.code || couple.code;
      showToast(`💖 Mode Duo activé ! Code couple : ${codeToShow}`);
      // If user created a new couple code during onboarding (or partner_a)
      if (partnerId === 'partner_a' || !syncedCouple) {
        setShowDuoCodeModal(codeToShow);
      }
    }

    // Trigger Notification Permission Prompt after onboarding if not yet seen
    if (!getHasSeenNotificationPrompt()) {
      setTimeout(() => {
        setIsNotificationModalOpen(true);
      }, 600);
    }
  };

  // Toggle App Mode (Duo vs Solo / Jardin Secret)
  const handleToggleAppMode = (mode: AppMode) => {
    setAppMode(mode);
    saveAppMode(mode);
    if (mode === 'solo') {
      showToast('🌿 Jardin Secret activé : Vos repères personnels secrets !');
    } else {
      showToast('💖 Mode Duo activé : Carte partagée du couple !');
    }
  };

  // Auto-restore user's couple room from Firestore upon logging in
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const result = await findUserCoupleInFirestore(user);
        if (result) {
          setCouple(result.couple);
          setActivePartnerId(result.partnerId);
          setActivePartner(result.partnerId);
          saveCouple(result.couple);
          saveHasCompletedOnboarding(true);
          setIsOnboardingOpen(false);
          showToast(`💖 Espace duo restauré pour ${user.displayName || user.email || 'votre compte'} !`);
        }
      }
    });
    return () => unsub();
  }, []);

  // Ensure couple room registration in Firestore & RevenueCat
  useEffect(() => {
    if (couple.code) {
      ensureCoupleRoomInFirestore(couple.code, couple, activePartnerId);
      ensureSubscriberInRevenueCat(couple.code);
    }
  }, [couple.code]);

  // Real-time Firestore Sync listeners for active Couple Code
  useEffect(() => {
    if (!couple.code) return;

    // Listen to couple profile updates
    const unsubCouple = subscribeToCouple(couple.code, (remoteCouple) => {
      if (remoteCouple) {
        if (remoteCouple.status === 'broken' && remoteCouple.brokenBy) {
          setBrokenDuoNotice(remoteCouple.brokenBy);
          setSpots([]);
          setNotifications([]);
          saveSpots([]);
          saveNotifications([]);

          const freshCode = generateCoupleCode();
          const freshCouple: CouplePair = {
            code: freshCode,
            anniversaryDate: new Date().toISOString().split('T')[0],
            secretPin: '1234',
            isPinLocked: false,
            partnerA: {
              id: 'partner_a',
              name: couple.partnerB?.name || 'Moi',
              avatar: couple.partnerB?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              role: 'Partenaire 1',
            },
            partnerB: {
              id: 'partner_b',
              name: 'En attente...',
              avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
              role: 'Partenaire 2',
            },
          };
          setCouple(freshCouple);
          saveCouple(freshCouple);
          return;
        }

        setCouple((prev) => ({
          ...prev,
          ...remoteCouple,
        }));
      }
    });

    // Listen to spots real-time updates
    const unsubSpots = subscribeToSpots(couple.code, (remoteSpots) => {
      if (remoteSpots) {
        setSpots(remoteSpots.map(computeSpotScores));
      }
    });

    // Listen to notifications real-time updates
    const unsubNotifs = subscribeToNotifications(couple.code, (remoteNotifs) => {
      if (remoteNotifs) {
        // Detect newly arrived notifications sent by partner (only after initial load)
        if (!isInitialNotifSyncRef.current) {
          const newPartnerNotifs = remoteNotifs.filter(
            (rn) =>
              !rn.isRead &&
              rn.senderId !== activePartnerIdRef.current &&
              !notificationsRef.current.some((prev) => prev.id === rn.id)
          );

          newPartnerNotifs.forEach((notif) => {
            triggerHaptic('success');

            // Dispatch Native Web Notification on phone / browser
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                const isValidationPrompt = notif.type === 'new_spot_proposed';
                const nativeNotif = new Notification(notif.title || '💖 LoveMap Notification', {
                  body: notif.message || 'Nouveau lieu partagé par votre moitié !',
                  icon: '/favicon.ico',
                  tag: notif.id,
                });

                nativeNotif.onclick = () => {
                  window.focus();
                  const targetSpot = spotsRef.current.find((s) => s.id === notif.spotId);
                  if (targetSpot && isValidationPrompt) {
                    setValidationSpot(targetSpot);
                  } else if (targetSpot) {
                    setSelectedSpot(targetSpot);
                    setActiveTab('map');
                  } else {
                    setActiveTab('notifs');
                  }
                };
              } catch (e) {
                console.warn('Native notification dispatch error:', e);
              }
            }

            // In-app alert preview banner
            showToast(`🔔 ${notif.title} : ${notif.message}`);
          });
        }

        isInitialNotifSyncRef.current = false;
        setNotifications(remoteNotifs);
      }
    });

    return () => {
      unsubCouple();
      unsubSpots();
      unsubNotifs();
    };
  }, [couple.code]);

  // Handle background notification clicks relayed from ServiceWorker
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const handleSwMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'OPEN_SPOT_VALIDATION' && event.data.spotId) {
          const spot = spotsRef.current.find((s) => s.id === event.data.spotId);
          if (spot) {
            setValidationSpot(spot);
          }
        }
      };

      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, []);

  // Sync state to LocalStorage
  useEffect(() => {
    saveSpots(spots);
  }, [spots]);

  useEffect(() => {
    saveCouple(couple);
  }, [couple]);

  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  // Show quick toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Switch Partner Persona Simulator
  const handleSwitchPartner = (newId: PartnerId) => {
    setActivePartnerId(newId);
    setActivePartner(newId);
    const user = newId === 'partner_a' ? couple.partnerA : couple.partnerB;
    showToast(`📱 Vue basculée sur le téléphone de ${user.name}`);
  };

  // Handle placing a new spot at map click coordinates
  const handleAddSpotAtCoords = (lat: number, lng: number) => {
    setAddCoords({ lat, lng });
    setIsAddModalOpen(true);
  };

  // Create new spot draft
  const handleSubmitNewSpot = (newSpotData: Omit<Spot, 'id' | 'createdAt'>) => {
    const spotId = `spot-${Date.now()}`;
    const fullSpot: Spot = {
      ...newSpotData,
      id: spotId,
      createdAt: new Date().toISOString(),
    };

    const computed = computeSpotScores(fullSpot);
    const updatedSpots = [computed, ...spots];
    setSpots(updatedSpots);
    saveSpotToFirestore(couple.code, computed).catch(console.error);

    // If it's a solo spot, handle solo toast
    if (computed.isSolo) {
      showToast(`🌿 Lieu enregistré dans votre Jardin Secret !`);
    } else {
      // Create notification for partner if duo spot
      const creatorUser = activePartnerId === 'partner_a' ? couple.partnerA : couple.partnerB;
      const partnerUser = activePartnerId === 'partner_a' ? couple.partnerB : couple.partnerA;
      const targetPartnerId: PartnerId = activePartnerId === 'partner_a' ? 'partner_b' : 'partner_a';

      const now = new Date();
      const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        type: 'new_spot_proposed',
        spotId,
        senderId: activePartnerId,
        targetPartnerId,
        title: 'Nouveau spot d\'intimité ! 📍',
        message: `${creatorUser.name} a placé un nouveau lieu : "${fullSpot.title}". Validez le spot et répondez au questionnaire !`,
        timestamp: `${dateStr} à ${timeStr}`,
        isRead: false,
      };

      saveNotificationToFirestore(couple.code, newNotif).catch(console.error);
      showToast(`💌 Spot proposé à ${partnerUser.name} !`);
    }

    // Trigger 1st Spot High-Converting Paywall Popup after 5 seconds if not already premium
    const currentPremiumState = getDuoPremiumState(couple, activePartnerId);
    if (spots.length === 0 && !currentPremiumState.isPremium) {
      setTimeout(() => {
        handleOpenPremiumModal(
          "🎉 Bravo pour votre 1er lieu enregistré ! Profitez des 7 jours d'essai gratuit.",
          true
        );
      }, 5000);
    } else if (!getHasRatedApp() && !getHasPromptedFirstSpotRating()) {
      // Trigger Store Rating prompt after recording first spot if paywall not shown
      saveHasPromptedFirstSpotRating(true);
      setTimeout(() => {
        setRatingTriggerSource('first_spot');
        setIsStoreRatingOpen(true);
      }, 5000);
    }
  };

  // Submit Partner Ratings (Questionnaire)
  const handleSubmitRating = (
    spotId: string,
    partnerId: PartnerId,
    scores: Record<CriteriaKey, number>,
    comment?: string
  ) => {
    setSpots((prevSpots) =>
      prevSpots.map((spot) => {
        if (spot.id !== spotId) return spot;

        const updatedRatings = {
          ...spot.ratings,
          [partnerId]: {
            partnerId,
            scores,
            comment,
            submittedAt: new Date().toISOString(),
          },
        };

        const hasA = !!updatedRatings.partner_a;
        const hasB = !!updatedRatings.partner_b;

        // If both partners have completed questionnaires, validate spot!
        const isNowValidated = hasA && hasB;
        const updatedStatus = isNowValidated ? 'validated' : spot.status;

        const updatedSpot: Spot = {
          ...spot,
          ratings: updatedRatings,
          status: updatedStatus,
        };

        const finalSpot = computeSpotScores(updatedSpot);
        saveSpotToFirestore(couple.code, finalSpot).catch(console.error);

        // Generate notifications for partner
        const currentUserName = partnerId === 'partner_a' ? couple.partnerA.name : couple.partnerB.name;
        const targetPartnerId: PartnerId = partnerId === 'partner_a' ? 'partner_b' : 'partner_a';
        const partnerName = partnerId === 'partner_a' ? couple.partnerB.name : couple.partnerA.name;
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        if (isNowValidated) {
          showToast(`💖 Spot "${finalSpot.title}" validé à deux ! Note globale : ${finalSpot.overallScore}/10`);
          const validationNotif: NotificationItem = {
            id: `notif-val-${Date.now()}`,
            type: 'spot_validated',
            spotId: finalSpot.id,
            senderId: partnerId,
            targetPartnerId,
            title: `🎉 Lieu validé à deux ! (${finalSpot.overallScore}/10)`,
            message: `${currentUserName} a complété ses notes pour "${finalSpot.title}". Le lieu est maintenant validé sur votre carte commune !`,
            timestamp: `${dateStr} à ${timeStr}`,
            isRead: false,
          };
          saveNotificationToFirestore(couple.code, validationNotif).catch(console.error);
        } else {
          showToast(`✨ Vos notes ont été enregistrées !`);
          const ratingNotif: NotificationItem = {
            id: `notif-rated-${Date.now()}`,
            type: 'new_spot_proposed',
            spotId: finalSpot.id,
            senderId: partnerId,
            targetPartnerId,
            title: `💌 ${currentUserName} a noté "${finalSpot.title}" !`,
            message: `C'est à votre tour : notez et donnez votre avis sur "${finalSpot.title}" pour valider le lieu ensemble !`,
            timestamp: `${dateStr} à ${timeStr}`,
            isRead: false,
          };
          saveNotificationToFirestore(couple.code, ratingNotif).catch(console.error);
        }

        return finalSpot;
      })
    );
  };

  // Update Couple Pair Handler
  const handleUpdateCouple = (updated: CouplePair) => {
    setCouple(updated);
    saveCouple(updated);
    updateCoupleInFirestore(couple.code, updated).catch(console.error);
  };

  // Decline Spot
  const handleDeclineSpot = (spotId: string) => {
    setSpots((prev) =>
      prev.map((s) => {
        if (s.id === spotId) {
          const updated: Spot = { ...s, status: 'declined' };
          saveSpotToFirestore(couple.code, updated).catch(console.error);
          return updated;
        }
        return s;
      })
    );
    showToast(`Spot refusé/archivé.`);
  };

  // Edit Spot Trigger
  const handleEditSpot = (spot: Spot) => {
    setSelectedSpot(null);
    setEditingSpot(spot);
    setIsAddModalOpen(true);
  };

  // Update existing Spot with notation re-validation logic for Duo mode
  const handleUpdateSpot = (
    spotId: string,
    updatedData: Partial<Spot>,
    scoresChanged: boolean
  ) => {
    setSpots((prevSpots) =>
      prevSpots.map((spot) => {
        if (spot.id !== spotId) return spot;

        let newStatus = spot.status;
        let newRatings = updatedData.ratings || spot.ratings;

        // If Duo spot and ratings were updated by creator -> re-validation required by partner!
        if (!spot.isSolo && scoresChanged) {
          const targetPartnerId: PartnerId = activePartnerId === 'partner_a' ? 'partner_b' : 'partner_a';
          const creatorUser = activePartnerId === 'partner_a' ? couple.partnerA : couple.partnerB;
          const partnerUser = activePartnerId === 'partner_a' ? couple.partnerB : couple.partnerA;

          // Keep creator's updated rating, but reset partner's rating to trigger new validation questionnaire
          newRatings = {
            [activePartnerId]: newRatings[activePartnerId],
          };
          newStatus = 'pending_validation';

          const now = new Date();
          const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
          const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

          const newNotif: NotificationItem = {
            id: `notif-${Date.now()}`,
            type: 'new_spot_proposed',
            spotId,
            senderId: activePartnerId,
            targetPartnerId,
            title: 'Spot modifié & nouvelle notation ! ✏️',
            message: `${creatorUser.name} a modifié les notes du lieu "${updatedData.title || spot.title}". Votre validation est requise !`,
            timestamp: `${dateStr} à ${timeStr}`,
            isRead: false,
          };

          saveNotificationToFirestore(couple.code, newNotif).catch(console.error);
          showToast(`✏️ Notation modifiée ! Re-validation demandée à ${partnerUser.name}.`);
        } else {
          showToast(`✏️ Spot "${updatedData.title || spot.title}" mis à jour !`);
        }

        const merged: Spot = {
          ...spot,
          ...updatedData,
          ratings: newRatings,
          status: newStatus,
        };

        const computed = computeSpotScores(merged);
        saveSpotToFirestore(couple.code, computed).catch(console.error);
        if (selectedSpot && selectedSpot.id === spotId) {
          setSelectedSpot(computed);
        }
        return computed;
      })
    );
  };

  // Delete Spot
  const handleDeleteSpot = (spotId: string) => {
    setSpots((prev) => prev.filter((s) => s.id !== spotId));
    deleteSpotFromFirestore(couple.code, spotId).catch(console.error);
    setSelectedSpot(null);
    showToast(`Spot supprimé.`);
  };

  // Reset sample data
  const handleResetData = () => {
    setSpots(INITIAL_SPOTS.map(computeSpotScores));
    setNotifications(INITIAL_NOTIFICATIONS);
    setCouple(INITIAL_COUPLE);
    showToast(`Données de démo réinitialisées.`);
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await logoutFromFirebase();
    } catch (e) {
      console.error(e);
    }
    // Clear user data while safely preserving system and onboarding state
    clearUserSessionStorage();
    localStorage.clear();
    window.location.reload();
  };

  // Break Duo handler
  const handleBreakCouple = async () => {
    const breakerName = couple[activePartnerId === 'partner_a' ? 'partnerA' : 'partnerB']?.name || 'Votre partenaire';
    const oldCode = couple.code;

    try {
      await breakCoupleInFirestore(oldCode, breakerName);
    } catch (e) {
      console.error('Error breaking duo in Firestore:', e);
    }

    setSpots([]);
    setNotifications([]);
    saveSpots([]);
    saveNotifications([]);

    const newCode = generateCoupleCode();
    const freshCouple: CouplePair = {
      code: newCode,
      anniversaryDate: new Date().toISOString().split('T')[0],
      secretPin: '1234',
      isPinLocked: false,
      partnerA: {
        id: 'partner_a',
        name: breakerName,
        avatar: couple[activePartnerId === 'partner_a' ? 'partnerA' : 'partnerB']?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        role: 'Partenaire 1',
      },
      partnerB: {
        id: 'partner_b',
        name: 'En attente...',
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
        role: 'Partenaire 2',
      },
    };

    setCouple(freshCouple);
    saveCouple(freshCouple);
    setActivePartnerId('partner_a');

    if (auth.currentUser) {
      createCoupleInFirestore(auth.currentUser, breakerName, freshCouple.partnerA.avatar).catch(console.error);
    }

    showToast('Le Duo a été cassé. Toutes les données du duo ont été supprimées des deux côtés. Un nouveau code à partager est prêt.');
  };

  // Join an existing Duo Code
  const handleJoinDuoCode = async (codeToJoin: string) => {
    try {
      const user = await ensureGuestUser();
      const myName = activePartnerId === 'partner_a' ? couple.partnerA.name : couple.partnerB.name;
      const myAvatar = activePartnerId === 'partner_a' ? couple.partnerA.avatar : couple.partnerB.avatar;

      const updatedCouple = await joinCoupleInFirestore(
        user,
        codeToJoin,
        myName || 'Partenaire',
        myAvatar
      );
      if (updatedCouple) {
        setCouple(updatedCouple);
        setActivePartnerId('partner_b');
        setActivePartner('partner_b');
        saveCouple(updatedCouple);
        showToast(`💖 Espace Duo synchronisé avec le code ${updatedCouple.code} !`);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Impossible de rejoindre ce duo. Vérifiez le code.';
      showToast(`❌ ${errMsg}`);
      throw err;
    }
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    const currentUser = auth.currentUser;
    const currentCode = couple.code;
    try {
      await deleteUserAccountInFirestore(currentUser, currentCode);
      await purgeAllFirestoreData();
      await logoutFromFirebase();
    } catch (e) {
      console.error(e);
    }
    clearUserSessionStorage();
    localStorage.clear();
    window.location.reload();
  };

  // Filter notifications meant for the active partner (creators do not receive notifications for their own actions)
  const userNotifications = notifications.filter(
    (n) => (n.targetPartnerId ? n.targetPartnerId === activePartnerId : n.senderId !== activePartnerId)
  );

  // Counts for badges
  const unreadCount = userNotifications.filter((n) => !n.isRead).length;
  const pendingValidationCount = spots.filter(
    (s) => s.status === 'pending_validation' && s.creatorId !== activePartnerId
  ).length;

  const activeUser = (activePartnerId === 'partner_a' ? couple?.partnerA : couple?.partnerB) || {
    name: 'Moi',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  };

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans select-none transition-colors duration-200">
      {/* PIN Security Overlay */}
      <PinLockModal
        correctPin={couple.secretPin || '1234'}
        isLocked={isLocked}
        onUnlock={() => setIsLocked(false)}
      />

      {/* Main Container / Optional Mobile Frame Wrapper */}
      <MobileFrame isMobileFrame={isMobileFrame}>
        {/* Header */}
        <Header
          couple={couple}
          activePartnerId={activePartnerId}
          onSwitchPartner={handleSwitchPartner}
          unreadCount={unreadCount}
          onOpenNotifications={() => setActiveTab('notifs')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenDuoTab={() => setActiveTab('couple')}
          onOpenAuth={() => {
            setAuthModalSource('general');
            setIsAuthOpen(true);
          }}
          isMobileFrame={isMobileFrame}
          onToggleMobileFrame={() => setIsMobileFrame(!isMobileFrame)}
          onLockApp={() => {
            if (getDuoPremiumState(couple, activePartnerId).isPremium) {
              setIsLocked(true);
            } else {
              handleOpenPremiumModal('Passez au Pass Duo Premium pour verrouiller votre application avec un Code PIN 🔒👑');
            }
          }}
          appMode={appMode}
          onToggleAppMode={handleToggleAppMode}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* Floating Toast Notification Banner */}
        {toastMessage && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-900/95 border border-pink-200 dark:border-pink-900/60 text-pink-600 dark:text-pink-400 px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md text-xs font-semibold flex items-center gap-2 animate-bounce">
            <Sparkles className="w-4 h-4 text-pink-500 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Tab Content Router */}
        <main className="relative flex-1 w-full min-h-0 overflow-hidden flex flex-col">
          {activeTab === 'map' && (
            <MapView
              spots={spots}
              activePartnerId={activePartnerId}
              userAvatar={activeUser.avatar}
              userName={activeUser.name}
              onSelectSpot={(spot) => setSelectedSpot(spot)}
              onOpenValidation={(spot) => setValidationSpot(spot)}
              onAddSpotAtCoords={handleAddSpotAtCoords}
              selectedSpotId={selectedSpot?.id}
              appMode={appMode}
              theme={theme}
            />
          )}

          {activeTab === 'stats' && (
            <StatsView
              spots={spots}
              couple={couple}
              appMode={appMode}
              onSelectSpot={(spot) => {
                setSelectedSpot(spot);
                setActiveTab('map');
              }}
            />
          )}

          {activeTab === 'notifs' && (
            <NotificationsView
              notifications={userNotifications}
              spots={spots}
              activePartnerId={activePartnerId}
              couple={couple}
              onOpenPremium={() => handleOpenPremiumModal("Offre d'urgence : Profitez de vos 7 jours gratuits à 0 € ⏳✨")}
              onSelectSpot={(spot) => {
                setSelectedSpot(spot);
                setActiveTab('map');
              }}
              onOpenValidation={(spot) => setValidationSpot(spot)}
              onMarkRead={(id) => {
                setNotifications((prev) =>
                  prev.map((n) => {
                    if (n.id === id && !n.isRead) {
                      const updated = { ...n, isRead: true };
                      saveNotificationToFirestore(couple.code, updated).catch(console.error);
                      return updated;
                    }
                    return n;
                  })
                );
              }}
              onMarkAllRead={() => {
                setNotifications((prev) =>
                  prev.map((n) => {
                    if (!n.isRead) {
                      const updated = { ...n, isRead: true };
                      saveNotificationToFirestore(couple.code, updated).catch(console.error);
                      return updated;
                    }
                    return n;
                  })
                );
              }}
            />
          )}

          {activeTab === 'couple' && (
            <DuoView
              couple={couple}
              activePartnerId={activePartnerId}
              spotsCount={spots.length}
              onUpdateCouple={handleUpdateCouple}
              onSwitchPartner={handleSwitchPartner}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenAuth={() => {
                setAuthModalSource('general');
                setIsAuthOpen(true);
              }}
              onToast={showToast}
              appMode={appMode}
              onBreakCouple={handleBreakCouple}
              onJoinDuoCode={handleJoinDuoCode}
              onOpenRateApp={() => {
                setRatingTriggerSource('manual');
                setIsStoreRatingOpen(true);
              }}
              onOpenLegalPrivacy={() => setIsLegalPrivacyOpen(true)}
              onOpenPremiumModal={() => handleOpenPremiumModal()}
              theme={theme}
              onToggleTheme={handleToggleTheme}
            />
          )}
        </main>

        {/* Bottom Tab Navigation */}
        <Navigation
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab === 'add') {
              setIsAddModalOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          unreadCount={unreadCount}
          pendingValidationCount={pendingValidationCount}
          onOpenSettings={() => setIsSettingsOpen(true)}
          theme={theme}
        />

        {/* Modals & Sheets */}
        <AddSpotModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingSpot(null);
          }}
          initialLat={addCoords.lat}
          initialLng={addCoords.lng}
          activePartnerId={activePartnerId}
          couple={couple}
          onSubmitSpot={handleSubmitNewSpot}
          editingSpot={editingSpot}
          onUpdateSpot={handleUpdateSpot}
          appMode={appMode}
          onOpenPremiumModal={handleOpenPremiumModal}
        />

        {validationSpot && (
          <ValidateSpotModal
            isOpen={!!validationSpot}
            spot={validationSpot}
            activePartnerId={activePartnerId}
            couple={couple}
            onClose={() => setValidationSpot(null)}
            onOpenQuestionnaire={(spot) => {
              setValidationSpot(null);
              setQuestionnaireSpot(spot);
            }}
            onDeclineSpot={handleDeclineSpot}
          />
        )}

        {questionnaireSpot && (
          <QuestionnaireModal
            isOpen={!!questionnaireSpot}
            spot={questionnaireSpot}
            activePartnerId={activePartnerId}
            couple={couple}
            onClose={() => setQuestionnaireSpot(null)}
            onSubmitRating={handleSubmitRating}
          />
        )}

        {selectedSpot && (
          <SpotDetailSheet
            isOpen={!!selectedSpot}
            spot={selectedSpot}
            activePartnerId={activePartnerId}
            couple={couple}
            onClose={() => setSelectedSpot(null)}
            onEditSpot={handleEditSpot}
            onDeleteSpot={handleDeleteSpot}
            onOpenPremiumModal={() => handleOpenPremiumModal()}
            onOpenQuestionnaire={(spot) => {
              setSelectedSpot(null);
              setQuestionnaireSpot(spot);
            }}
          />
        )}

        <CoupleSettingsModal
          isOpen={isSettingsOpen}
          couple={couple}
          activePartnerId={activePartnerId}
          appMode={appMode}
          onClose={() => setIsSettingsOpen(false)}
          onOpenAuth={() => {
            setAuthModalSource('settings');
            setIsAuthOpen(true);
          }}
          onUpdateCouple={(updated) => {
            handleUpdateCouple(updated);
            showToast('Paramètres mis à jour.');
          }}
          onResetData={handleResetData}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          onJoinDuoCode={handleJoinDuoCode}
          onBreakCouple={handleBreakCouple}
          onOpenRateApp={() => {
            setRatingTriggerSource('manual');
            setIsStoreRatingOpen(true);
          }}
          onOpenLegalPrivacy={() => setIsLegalPrivacyOpen(true)}
          onOpenPremiumModal={() => handleOpenPremiumModal()}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        <DuoPremiumModal
          isOpen={isPremiumModalOpen}
          onClose={() => {
            setIsPremiumModalOpen(false);
            setIsFirstSpotPaywall(false);
          }}
          couple={couple}
          activePartnerId={activePartnerId}
          onUpdateCoupleSubscription={handleUpdateCoupleSubscription}
          reasonMessage={premiumModalReason}
          isFirstSpotPaywall={isFirstSpotPaywall}
        />

        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          couple={couple}
          onCoupleSync={(syncedCouple, partnerId) => {
            setCouple(syncedCouple);
            if (partnerId) {
              setActivePartnerId(partnerId);
              setActivePartner(partnerId);
            }
            showToast(`Duo synchronisé avec le code ${syncedCouple.code} ! 💖`);
            if (partnerId === 'partner_a') {
              setShowDuoCodeModal(syncedCouple.code);
            }
          }}
          onToast={showToast}
        />

        <OnboardingModal
          isOpen={isOnboardingOpen}
          initialStep={1}
          onClose={() => setIsOnboardingOpen(false)}
          onComplete={handleCompleteOnboarding}
          onToast={showToast}
        />

        <DuoCodeModal
          isOpen={!!showDuoCodeModal}
          onClose={() => setShowDuoCodeModal(null)}
          code={showDuoCodeModal || couple.code}
          creatorName={activePartnerId === 'partner_a' ? couple.partnerA.name : couple.partnerB.name}
        />

        {/* Broken Duo Popup Modal for Partner */}
        {brokenDuoNotice && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
              <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
                <HeartOff className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                  Fin du Duo 💔
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-2 leading-relaxed">
                  <strong>{brokenDuoNotice}</strong> a mis fin au duo. Tous les lieux secrets, avis et souvenirs partagés ont été définitivement supprimés des deux côtés.
                </p>
              </div>

              <button
                onClick={() => {
                  setBrokenDuoNotice(null);
                  setIsAuthOpen(true);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer active:scale-95"
              >
                Compris (Créer ou rejoindre un nouveau Duo)
              </button>
            </div>
          </div>
        )}
        {/* Legal, Permissions & Rating Modals */}
        <AppTrackingModal
          isOpen={isAttModalOpen}
          onClose={(status) => {
            setIsAttModalOpen(false);
            showToast(status === 'authorized' ? '✅ Préférences de confidentialité enregistrées.' : '🔒 Confidentialité stricte activée.');
          }}
          onOpenLegal={() => {
            setIsAttModalOpen(false);
            setIsLegalPrivacyOpen(true);
          }}
        />



        <NotificationPermissionModal
          isOpen={isNotificationModalOpen}
          onClose={(granted) => {
            setIsNotificationModalOpen(false);
            if (granted) {
              showToast('🔔 Notifications Duo activées avec succès !');
            } else {
              showToast('🔕 Notifications désactivées.');
            }
          }}
        />

        <StoreRatingModal
          isOpen={isStoreRatingOpen}
          onClose={() => setIsStoreRatingOpen(false)}
          onToast={showToast}
          triggerSource={ratingTriggerSource}
        />

        <LegalPrivacyModal
          isOpen={isLegalPrivacyOpen}
          onClose={() => {
            setIsLegalPrivacyOpen(false);
            if (!getAttConsent()) {
              setIsAttModalOpen(true);
            }
          }}
          onOpenDeleteAccount={() => setIsSettingsOpen(true)}
        />
      </MobileFrame>
    </div>
  );
}
