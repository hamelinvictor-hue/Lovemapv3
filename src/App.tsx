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
  getHasPromptedFirstSpotPaywall,
  saveHasPromptedFirstSpotPaywall,
} from './lib/storage';
import {
  subscribeToCouple,
  subscribeToSpots,
  subscribeToNotifications,
  saveSpotToFirestore,
  deleteSpotFromFirestore,
  saveNotificationToFirestore,
  savePushTokenToFirestore,
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
  getEffectiveUser,
} from './lib/firebase';
import type { User } from 'firebase/auth';
import { getBackendApiUrl } from './lib/apiConfig';
import {
  getDuoPremiumState,
  hasTrialOfferStarted,
  isTrialOfferActive,
  getTrialOfferRemainingSeconds,
} from './lib/subscription';
import { ensureSubscriberInRevenueCat } from './lib/revenuecatClient';
import { initializePurchases, resetPurchasesSession } from './lib/purchases';
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
import { LocationPermissionModal } from './components/LocationPermissionModal';
import { NotificationPermissionModal } from './components/NotificationPermissionModal';
import { LegalPrivacyModal } from './components/LegalPrivacyModal';
import {
  isNativePlatform,
  isCapacitorNative,
  requestNativeGeolocation,
  triggerNativeStoreReview,
  dispatchExternalSystemNotification,
  setupNativeNotificationHandlers,
} from './lib/nativePermissions';
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
  const [authUser, setAuthUser] = useState<User | null>(() => getEffectiveUser());
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !getHasCompletedOnboarding());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isAuthMandatory, setIsAuthMandatory] = useState(false);
  const [authModalSource, setAuthModalSource] = useState<'settings' | 'general'>('general');
  const [addCoords, setAddCoords] = useState<{ lat: number; lng: number }>({ lat: 43.2118, lng: 5.5186 });

  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [validationSpot, setValidationSpot] = useState<Spot | null>(null);
  const [questionnaireSpot, setQuestionnaireSpot] = useState<Spot | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(() => Boolean(couple?.isPinLocked && getDuoPremiumState(couple, getActivePartner()).isPremium));
  const [showDuoCodeModal, setShowDuoCodeModal] = useState<string | null>(null);
  const [brokenDuoNotice, setBrokenDuoNotice] = useState<string | null>(null);

  // Duo Premium Modal State
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumModalReason, setPremiumModalReason] = useState<string | undefined>(undefined);
  const [isFirstSpotPaywall, setIsFirstSpotPaywall] = useState(false);
  const firstSpotPaywallTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    const currentPartnerA = couple?.partnerA || {
      id: 'partner_a',
      name: 'Partenaire 1',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      role: 'Partenaire 1',
    };
    const currentPartnerB = couple?.partnerB || {
      id: 'partner_b',
      name: 'En attente...',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
      role: 'Partenaire 2',
    };

    const subscriberProfile = isSubscriberA ? currentPartnerA : currentPartnerB;
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
      partnerA: isSubscriberA ? updatedProfile : currentPartnerA,
      partnerB: !isSubscriberA ? updatedProfile : currentPartnerB,
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
      // Notify the partner that premium subscription has been activated for the duo!
      const partnerIdToNotify: PartnerId = isSubscriberA ? 'partner_b' : 'partner_a';
      const subscriberName = subscriberProfile.name || (isSubscriberA ? 'Votre partenaire 1' : 'Votre partenaire 2');
      const planLabel = plan === 'monthly' ? '1 mois' : '1 an';
      
      const premiumNotif: NotificationItem = {
        id: `notif-premium-${Date.now()}`,
        type: 'premium_activated',
        spotId: '',
        senderId: subscriberPartnerId,
        targetPartnerId: partnerIdToNotify,
        title: '👑 Pass Duo Premium Activé !',
        message: `${subscriberName} a souscrit au Pass Duo Premium (${planLabel}) ! Vous bénéficiez désormais tous les deux de toutes les fonctionnalités illimitées.`,
        timestamp: 'À l’instant',
        isRead: false,
      };

      const updatedNotifs = [premiumNotif, ...notificationsRef.current];
      setNotifications(updatedNotifs);
      saveNotifications(updatedNotifs);

      if (couple.code) {
        saveNotificationToFirestore(couple.code, premiumNotif).catch((e) => {
          console.warn('Error pushing premium activation notification to Firestore:', e);
        });
      }

      showToast(plan === 'monthly' ? '👑 Pass Duo Premium (1 mois) activé !' : '👑 Pass Duo Premium (1 an) activé !');
    } else {
      showToast('Pass Duo Premium résilié.');
    }
  };

  // Legal, Permission & Store Rating Modals (Apple ATT Prompt directly on 1st launch)
  const [isAttModalOpen, setIsAttModalOpen] = useState<boolean>(() => !getAttConsent());
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isLegalPrivacyOpen, setIsLegalPrivacyOpen] = useState(false);

  // App launch counter & ATT prompt on startup
  useEffect(() => {
    const launchCount = incrementAppLaunchCount();

    if (!getAttConsent()) {
      setIsAttModalOpen(true);
    } else {
      // Trigger App Rating on 2nd launch, then every 4 launches thereafter (2, 6, 10, 14...)
      // Sur iPhone natif : vraie popup système Apple StoreKit officielle !
      // Sur le web : suppression absolue de toute popup !
      if (isCapacitorNative() && !getHasRatedApp()) {
        if (launchCount === 2 || (launchCount > 2 && (launchCount - 2) % 4 === 0)) {
          const rateTimer = setTimeout(() => {
            triggerNativeStoreReview();
            saveHasRatedApp(true);
          }, 2000);
          return () => clearTimeout(rateTimer);
        }
      }
    }
  }, []);

  // Initialize RevenueCat SDK early for native iOS
  useEffect(() => {
    initializePurchases(couple.code || undefined);
  }, [couple.code]);

  // Setup Native iOS Notification click handlers, APNs push registration & app resume sync
  useEffect(() => {
    const cleanup = setupNativeNotificationHandlers({
      onNotificationClick: (data) => {
        if (data?.spotId) {
          const targetSpot = spotsRef.current.find((s) => s.id === data.spotId);
          if (targetSpot && data.type === 'new_spot_proposed') {
            setValidationSpot(targetSpot);
          } else if (targetSpot) {
            setSelectedSpot(targetSpot);
            setActiveTab('map');
          } else {
            setActiveTab('notifs');
          }
        } else {
          setActiveTab('notifs');
        }
      },
      onPushToken: (token) => {
        if (couple?.code && activePartnerId) {
          const cleanCode = couple.code.trim().toUpperCase();
          const targetKey = `${cleanCode}_${activePartnerId}`;

          savePushTokenToFirestore(cleanCode, activePartnerId, token).catch(console.warn);

          // 1. Direct registration with OneSignal REST API (CORS enabled, works seamlessly inside iOS WKWebView)
          fetch('https://onesignal.com/api/v1/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: '6bbd3278-e98f-4ddc-bfe5-a417960d8aac',
              device_type: 0, // 0 = iOS APNs
              identifier: token,
              external_user_id: targetKey,
              language: 'fr',
            }),
          }).catch((e) => console.warn('[OneSignal Direct Player Reg] Notice:', e));

          // 2. Register with server push engine
          fetch(getBackendApiUrl('/api/push/register-token'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: cleanCode,
              partnerId: activePartnerId,
              pushToken: token,
              platform: 'ios',
            }),
          }).catch(console.warn);
        }
      },
      onAppStateChange: (isActive) => {
        if (isActive && couple?.code) {
          console.log('[Native App] Returned to active foreground, sync refreshed');
        }
      },
    });

    return () => {
      cleanup();
    };
  }, [couple.code, activePartnerId]);

  // Trigger location permission prompt
  useEffect(() => {
    if (
      activeTab === 'map' &&
      !isOnboardingOpen &&
      !isAttModalOpen &&
      !isAuthOpen &&
      !showDuoCodeModal &&
      !getHasSeenLocationPrompt()
    ) {
      const locTimer = setTimeout(() => {
        setIsLocationModalOpen(true);
      }, 500);
      return () => clearTimeout(locTimer);
    }
  }, [activeTab, isOnboardingOpen, isAttModalOpen, isAuthOpen, showDuoCodeModal]);

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

  const handleCompleteOnboarding = (mode: AppMode, syncedCouple?: CouplePair, partnerId?: PartnerId, authenticatedUser?: User) => {
    saveHasCompletedOnboarding(true);
    setIsOnboardingOpen(false);
    setIsAuthMandatory(false);
    setIsAuthOpen(false);
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
    const current = authenticatedUser || auth.currentUser || getEffectiveUser();
    if (current && !current.isAnonymous) {
      setAuthUser(current);
      saveStoredAuthUser({
        uid: current.uid,
        displayName: current.displayName || 'Utilisateur',
        email: current.email || null,
        photoURL: current.photoURL || null,
        providerId: current.providerData?.[0]?.providerId || 'apple.com',
        isAnonymous: false,
      });
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
      if (user && !user.isAnonymous) {
        setAuthUser(user);
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
      } else {
        const eff = getEffectiveUser();
        setAuthUser(eff && !eff.isAnonymous ? eff : null);
      }
    });
    return () => unsub();
  }, []);

  // Ensure couple room registration in Firestore & RevenueCat (ONLY after onboarding is completed)
  useEffect(() => {
    if (couple.code && !isOnboardingOpen && getHasCompletedOnboarding()) {
      ensureCoupleRoomInFirestore(couple.code, couple, activePartnerId)
        .then((updatedCouple) => {
          if (updatedCouple.code !== couple.code) {
            setCouple(updatedCouple);
            saveCouple(updatedCouple);
          }
          ensureSubscriberInRevenueCat(updatedCouple.code);
        })
        .catch(console.error);
    }
  }, [couple.code, isOnboardingOpen]);

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
              name: couple?.partnerB?.name || 'Moi',
              avatar: couple?.partnerB?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
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

        setCouple((prev) => {
          const merged = { ...prev, ...remoteCouple };
          // If code is used and partner B has joined, close the share modal
          if (merged.isCodeUsed || (merged.partnerB && merged.partnerB.name !== 'En attente...')) {
            setShowDuoCodeModal(null);
          }
          saveCouple(merged);
          return merged;
        });
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

            // Dispatch System Notification outside the app (Apple UNUserNotificationCenter on iPhone & Web API)
            dispatchExternalSystemNotification({
              id: notif.id,
              title: notif.title || '💖 LoveMap Duo',
              message: notif.message || 'Votre moitié a partagé un lieu ou une note !',
              spotId: notif.spotId,
              type: notif.type,
            });

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

  // Quick toast notifications silenced (removed top popup banner on action)
  const showToast = (_msg: string) => {
    // Suppressed per user request: no intrusive banner at the top of the screen
  };

  // Switch Partner Persona Simulator
  const handleSwitchPartner = (newId: PartnerId) => {
    setActivePartnerId(newId);
    setActivePartner(newId);
    const partnerA = couple?.partnerA || { name: 'Partenaire 1' };
    const partnerB = couple?.partnerB || { name: 'Partenaire 2' };
    const user = newId === 'partner_a' ? partnerA : partnerB;
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
      const partnerA = couple?.partnerA || { name: 'Partenaire 1' };
      const partnerB = couple?.partnerB || { name: 'Partenaire 2' };
      const creatorUser = activePartnerId === 'partner_a' ? partnerA : partnerB;
      const partnerUser = activePartnerId === 'partner_a' ? partnerB : partnerA;
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
        createdAt: new Date().toISOString(),
      };

      saveNotificationToFirestore(couple.code, newNotif).catch(console.error);

      // Trigger Push Notification via backend
      import('./lib/apiConfig').then(({ sendPushNotification }) => {
        sendPushNotification({
          code: couple.code,
          senderPartnerId: activePartnerId,
          targetPartnerId,
          title: newNotif.title,
          message: newNotif.message,
          spotId,
          type: newNotif.type,
        });
      });

      showToast(`💌 Spot proposé à ${partnerUser.name} !`);
    }

    // Trigger 1st Spot High-Converting Paywall Popup after 4.5 seconds if not already premium
    const currentPremiumState = getDuoPremiumState(couple, activePartnerId);
    if (spots.length === 0 && !currentPremiumState.isPremium && !getHasPromptedFirstSpotPaywall()) {
      saveHasPromptedFirstSpotPaywall(true);
      if (firstSpotPaywallTimerRef.current) {
        clearTimeout(firstSpotPaywallTimerRef.current);
      }
      firstSpotPaywallTimerRef.current = setTimeout(() => {
        setIsPremiumModalOpen((alreadyOpen) => {
          if (!alreadyOpen) {
            setPremiumModalReason(
              "🎉 Bravo pour votre 1er lieu enregistré ! Profitez des 7 jours d'essai gratuit."
            );
            setIsFirstSpotPaywall(true);
            return true;
          }
          return alreadyOpen;
        });
      }, 4500);
    } else if (!getHasRatedApp() && !getHasPromptedFirstSpotRating()) {
      // Trigger Store Rating prompt after recording first spot if paywall not shown
      saveHasPromptedFirstSpotRating(true);
      // Sur iPhone natif : vraie popup système Apple StoreKit !
      // Sur le web : suppression de toute popup !
      if (isCapacitorNative()) {
        setTimeout(() => {
          triggerNativeStoreReview();
          saveHasRatedApp(true);
        }, 4000);
      }
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
        const partnerA = couple?.partnerA || { name: 'Partenaire 1' };
        const partnerB = couple?.partnerB || { name: 'Partenaire 2' };
        const currentUserName = partnerId === 'partner_a' ? partnerA.name : partnerB.name;
        const targetPartnerId: PartnerId = partnerId === 'partner_a' ? 'partner_b' : 'partner_a';
        const partnerName = partnerId === 'partner_a' ? partnerB.name : partnerA.name;
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
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: couple.code,
              senderPartnerId: partnerId,
              targetPartnerId,
              title: validationNotif.title,
              message: validationNotif.message,
              spotId: finalSpot.id,
              type: validationNotif.type,
            });
          });
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
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: couple.code,
              senderPartnerId: partnerId,
              targetPartnerId,
              title: ratingNotif.title,
              message: ratingNotif.message,
              spotId: finalSpot.id,
              type: ratingNotif.type,
            });
          });
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
          const partnerA = couple?.partnerA || { name: 'Partenaire 1' };
          const partnerB = couple?.partnerB || { name: 'Partenaire 2' };
          const targetPartnerId: PartnerId = activePartnerId === 'partner_a' ? 'partner_b' : 'partner_a';
          const creatorUser = activePartnerId === 'partner_a' ? partnerA : partnerB;
          const partnerUser = activePartnerId === 'partner_a' ? partnerB : partnerA;

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
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: couple.code,
              senderPartnerId: activePartnerId,
              targetPartnerId: (activePartnerId === "partner_a" ? "partner_b" : "partner_a"),
              title: newNotif.title,
              message: newNotif.message,
              spotId,
              type: newNotif.type,
            });
          });
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
    console.log('[Native Debug] handleLogout triggered');
    // Immediately close settings and open clean Auth / Login popup
    setIsSettingsOpen(false);
    setIsOnboardingOpen(false);
    setIsAuthMandatory(true);
    setAuthModalMode('login');
    setIsAuthOpen(true);
    showToast('Vous avez été déconnecté.');

    // Clear local state
    setAuthUser(null);
    setSpots([]);
    setNotifications([]);
    setCouple(INITIAL_COUPLE);
    setActivePartnerId('partner_a');
    clearUserSessionStorage();

    try {
      console.log('[Native Debug] Calling logoutFromFirebase...');
      await logoutFromFirebase();
      console.log('[Native Debug] logoutFromFirebase completed');
    } catch (e) {
      console.error('[Native Debug] Error in logoutFromFirebase:', e);
    }
    console.log('[Native Debug] handleLogout finished');
  };

  // Break Duo handler
  const handleBreakCouple = async () => {
    const breakerName = couple?.[activePartnerId === 'partner_a' ? 'partnerA' : 'partnerB']?.name || 'Votre partenaire';
    const oldCode = couple?.code;

    try {
      if (oldCode) {
        await breakCoupleInFirestore(oldCode, breakerName);
      }
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
        avatar: couple?.[activePartnerId === 'partner_a' ? 'partnerA' : 'partnerB']?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
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
      const partnerA = couple?.partnerA || { name: 'Partenaire 1', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' };
      const partnerB = couple?.partnerB || { name: 'Partenaire 2', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150' };
      const myName = activePartnerId === 'partner_a' ? partnerA.name : partnerB.name;
      const myAvatar = activePartnerId === 'partner_a' ? partnerA.avatar : partnerB.avatar;

      const synced = await joinCoupleInFirestore(
        user,
        codeToJoin,
        myName || 'Partenaire',
        myAvatar
      );
      if (synced && synced.couple) {
        setCouple(synced.couple);
        if (Array.isArray(synced.spots)) {
          setSpots(synced.spots);
          saveSpots(synced.spots);
        }
        if (Array.isArray(synced.notifications)) {
          setNotifications(synced.notifications);
        }
        setActivePartnerId('partner_b');
        setActivePartner('partner_b');
        saveCouple(synced.couple);
        showToast(`💖 Espace Duo synchronisé avec le code ${synced.couple.code} !`);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Impossible de rejoindre ce duo. Vérifiez le code.';
      showToast(`❌ ${errMsg}`);
      throw err;
    }
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    console.log('[Native Debug] handleDeleteAccount triggered');
    const currentUser = auth.currentUser || getEffectiveUser();
    const currentCode = couple.code;

    // 1. Immediately close settings, reset modals and clear user session
    setIsSettingsOpen(false);
    showToast('Suppression du compte en cours...');

    // Clear local state
    setAuthUser(null);
    setSpots([]);
    setNotifications([]);
    const freshCouple: CouplePair = {
      ...INITIAL_COUPLE,
      code: generateCoupleCode(),
    };
    setCouple(freshCouple);
    setActivePartnerId('partner_a');
    clearUserSessionStorage();

    try {
      console.log('[Native Debug] Calling deleteUserAccountInFirestore...');
      await deleteUserAccountInFirestore(currentUser, currentCode);
      console.log('[Native Debug] Calling resetPurchasesSession...');
      await resetPurchasesSession();
      console.log('[Native Debug] Delete operations completed');
    } catch (e) {
      console.error('[Native Debug] Error deleting account:', e);
    }

    // 2. Open onboarding / auth screen clean
    setIsAuthMandatory(true);
    setAuthModalMode('register');
    setIsAuthOpen(true);
    showToast('Votre compte a été définitivement supprimé.');
    console.log('[Native Debug] handleDeleteAccount finished');
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
            if (authUser && !authUser.isAnonymous) return;
            setIsAuthMandatory(false);
            setAuthModalSource('general');
            setAuthModalMode('login');
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
                if (authUser && !authUser.isAnonymous) return;
                setIsAuthMandatory(false);
                setAuthModalSource('general');
                setAuthModalMode('login');
                setIsAuthOpen(true);
              }}
              onToast={showToast}
              appMode={appMode}
              onBreakCouple={handleBreakCouple}
              onJoinDuoCode={handleJoinDuoCode}
              onOpenRateApp={() => {
                if (isCapacitorNative()) {
                  triggerNativeStoreReview();
                } else {
                  showToast('L’évaluation sur l’App Store est disponible sur l’application iPhone.');
                }
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
          authUser={authUser}
          onClose={() => setIsSettingsOpen(false)}
          onOpenAuth={() => {
            if (authUser && !authUser.isAnonymous) return;
            setIsAuthMandatory(false);
            setAuthModalSource('settings');
            setAuthModalMode('login');
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
            if (isCapacitorNative()) {
              triggerNativeStoreReview();
            } else {
              showToast('L’évaluation sur l’App Store est disponible sur l’application iPhone.');
            }
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
          onOpenLegalPrivacy={() => setIsLegalPrivacyOpen(true)}
        />

        <AuthModal
          isOpen={isAuthOpen}
          canClose={!isAuthMandatory}
          initialMode={authModalMode}
          onClose={() => {
            setIsAuthMandatory(false);
            setIsAuthOpen(false);
          }}
          couple={couple}
          onCoupleSync={(syncedCouple, partnerId) => {
            setIsAuthMandatory(false);
            setIsAuthOpen(false);
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
          onAuthUserChange={setAuthUser}
          onOpenOnboarding={() => {
            setIsAuthOpen(false);
            setIsOnboardingOpen(true);
          }}
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
          code={showDuoCodeModal || couple?.code || ''}
          creatorName={activePartnerId === 'partner_a' ? (couple?.partnerA?.name || 'Partenaire 1') : (couple?.partnerB?.name || 'Partenaire 2')}
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
                  setIsAuthMandatory(true);
                  setAuthModalMode('register');
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



        <LocationPermissionModal
          isOpen={isLocationModalOpen}
          onClose={(allowed) => {
            setIsLocationModalOpen(false);
            if (allowed) {
              showToast('📍 Position GPS activée en direct !');
            } else {
              showToast('🗺️ Saisie manuelle des lieux active.');
            }
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
