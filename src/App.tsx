import { getDocument as adapterGetDocument } from './data/firestoreAdapter';
import React, { useState, useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useCoupleRealtime } from './hooks/useCoupleRealtime';
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
  saveStoredAuthUser,
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
  fetchUserProfile,
  deleteMyAccount,
  breakCoupleInFirestore,
  generateCoupleCode,
  createCoupleInFirestore,
  joinCoupleInFirestore,
  ensureGuestUser,
  ensureCoupleRoomInFirestore,
  getEffectiveUser,
  withTimeout,
  checkUserAccountExists,
} from './lib/firebase';
import { deleteUser, type User } from 'firebase/auth';
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
import { fullTeardown } from './auth/lifecycle';
import { registerFcmToken } from './lib/fcmManager';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { getDocument } from './data/firestoreAdapter';

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
  onNativeAppResume,
} from './lib/nativePermissions';
import { Heart, Sparkles, CheckCircle2, Bell, Smartphone, KeyRound, HeartOff, AlertTriangle } from 'lucide-react';

export default function App() {
  const [spots, setSpots] = useState<Spot[]>(() => getStoredSpots());
  const [couple, setCouple] = useState<CouplePair>(INITIAL_COUPLE);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);
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
  const [authUser, setAuthUser] = useState<User | null>(null);
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
  // Capacitor Lifecycle Firestore Listener Refs
  const unsubCoupleRef = useRef<(() => void) | null>(null);
  const unsubSpotsRef = useRef<(() => void) | null>(null);
  const unsubNotifsRef = useRef<(() => void) | null>(null);
  const ensuredRoomCodeRef = useRef<string | null>(null);
  const activeCoupleCodeRef = useRef<string | null>(null);
  const hasReceivedRemoteCoupleRef = useRef(false);

  useEffect(() => {
    if (activeCoupleCodeRef.current !== couple.code) {
      activeCoupleCodeRef.current = couple.code;
      hasReceivedRemoteCoupleRef.current = false;
    }
  }, [couple.code]);


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
    setCouple((prev) => {
      const isSubscriberA = subscriberPartnerId === 'partner_a';
      const expiresAt = new Date();
      if (plan === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      const currentPartnerA = prev?.partnerA || {
        id: 'partner_a',
        name: 'Partenaire 1',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        role: 'Partenaire 1',
      };
      const currentPartnerB = prev?.partnerB || {
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
        ...prev,
        partnerA: isSubscriberA ? updatedProfile : currentPartnerA,
        partnerB: !isSubscriberA ? updatedProfile : currentPartnerB,
      };

      saveCouple(updatedCouple);

      if (updatedCouple.code) {
        updateCoupleInFirestore(updatedCouple.code, updatedCouple).catch((err) => {
          console.warn('Error updating subscription in Firestore:', err);
        });
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

        if (updatedCouple.code) {
          saveNotificationToFirestore(updatedCouple.code, premiumNotif).catch((e) => {
            console.warn('Error pushing premium activation notification to Firestore:', e);
          });
        }
      }

      return updatedCouple;
    });

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

  // Initialize RevenueCat SDK early for native iOS with Firebase User UID
  useEffect(() => {
    const currentUid = authUser?.uid || auth.currentUser?.uid || undefined;
    initializePurchases(currentUid);
  }, [authUser?.uid]);

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
        const currentUid = authUser?.uid || auth.currentUser?.uid;
        if (currentUid) {
          registerFcmToken(currentUid).catch(console.warn);
        }
        if (couple?.code && activePartnerId) {
          const cleanCode = couple.code.trim().toUpperCase();
          savePushTokenToFirestore(cleanCode, activePartnerId, token).catch(console.warn);
        }
      },
      onAppStateChange: (isActive) => {
        if (isActive) {
          console.log('[Native App] Returned to active foreground, dispatching sync event');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('native-app-resume'));
          }
        } else {
          console.log('[Native App] Sent to background, dispatching pause event');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('native-app-pause'));
          }
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
        ensureCoupleRoomInFirestore(codeToShow, syncedCouple || couple, partnerId || activePartnerId).catch(console.error);
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

  // Au démarrage, après la connexion, lis users/{uid} depuis le serveur.
  // Si coupleId est renseigné, vérifie que le couple existe et que l'uid fait partie de ses membres.
  // Sinon, affiche l'écran sans duo. Aucune donnée locale ne doit s'afficher avant cette vérification.
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user && !user.isAnonymous) {
        setAuthUser(user);
        registerFcmToken(user.uid).catch(console.warn);

        try {
          // 1. Lire users/{uid} depuis le serveur Firestore
          const userProfile = await fetchUserProfile(user.uid);
          const userDisplayName = (userProfile?.displayName && userProfile.displayName !== 'Partenaire 1' && userProfile.displayName !== 'Utilisateur Google' && userProfile.displayName !== 'Utilisateur Apple')
            ? userProfile.displayName
            : ((user.displayName && user.displayName !== 'Partenaire 1' && user.displayName !== 'Utilisateur Google' && user.displayName !== 'Utilisateur Apple') ? user.displayName : 'Moi');

          // 2. Si coupleId est renseigné, vérifier que le couple existe et que l'uid fait partie de ses membres
          let verifiedCouple: CouplePair | null = null;
          let partnerId: PartnerId = 'partner_a';

          const targetCoupleId = userProfile?.coupleId;
          if (targetCoupleId) {
            try {
              const snap = await adapterGetDocument<CouplePair>(`couples/${targetCoupleId}`);
              if (snap && snap.exists && snap.val) {
                const cData = snap.data();
                const members = Array.isArray(cData.memberUids) ? cData.memberUids : [];
                if (members.includes(user.uid) && cData.status !== 'broken') {
                  verifiedCouple = cData;
                  partnerId = cData.partnerBUid === user.uid ? 'partner_b' : 'partner_a';
                }
              }
            } catch (e) {
              console.warn('[Session] Notice reading couple doc:', e);
            }
          }

          // Si pas trouvé par coupleId, vérifier par requête memberUids
          if (!verifiedCouple) {
            const result = await findUserCoupleInFirestore(user);
            if (result && result.couple && result.couple.status !== 'broken') {
              const members = Array.isArray(result.couple.memberUids) ? result.couple.memberUids : [];
              if (members.includes(user.uid)) {
                verifiedCouple = result.couple;
                partnerId = result.partnerId;
              }
            }
          }

          if (verifiedCouple) {
            if (partnerId === 'partner_a') {
              verifiedCouple.partnerA = {
                ...verifiedCouple.partnerA,
                name: userDisplayName,
              };
            } else {
              verifiedCouple.partnerB = {
                avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
                ...(verifiedCouple.partnerB || { id: 'partner_b', role: 'Partenaire 2' }),
                name: userDisplayName,
              };
            }
            setCouple(verifiedCouple);
            setActivePartnerId(partnerId);
            setActivePartner(partnerId);
            saveHasCompletedOnboarding(true);
            setIsOnboardingOpen(false);
          } else {
            // Sinon, affiche l'écran sans duo
            const noDuo: CouplePair = {
              ...INITIAL_COUPLE,
              partnerA: {
                ...INITIAL_COUPLE.partnerA,
                name: userDisplayName,
              },
              partnerB: {
                ...INITIAL_COUPLE.partnerB,
                name: 'En attente...',
              },
              isCodeUsed: false,
            };
            setCouple(noDuo);
            setActivePartnerId('partner_a');
          }
        } catch (err) {
          console.error('[Session Verification] Error:', err);
          setCouple(INITIAL_COUPLE);
        } finally {
          setIsVerifyingSession(false);
        }
      } else {
        setAuthUser(null);
        setCouple(INITIAL_COUPLE);
        setIsVerifyingSession(false);
        setIsOnboardingOpen(false);
        setIsAuthMandatory(true);
        setAuthModalMode('login');
        setAuthModalSource('general');
        setIsAuthOpen(true);
      }
    });

    return () => unsub();
  }, []);

  // Ensure couple room registration in Firestore & RevenueCat (ONLY once after onboarding is completed)
  useEffect(() => {
    if (couple.code && !isOnboardingOpen && getHasCompletedOnboarding()) {
      if (ensuredRoomCodeRef.current === couple.code) return;
      ensuredRoomCodeRef.current = couple.code;

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

  // Real-time Firestore Sync Handlers (Unified across iOS Native & Web)
  const handleCoupleRealtimeUpdate = (remoteCouple: CouplePair | null) => {
    // Chez le partenaire, si le couple disparaît : remets l'affichage à l'écran sans duo,
    // sans déconnecter l'utilisateur et sans modifier son pseudo.
    if (!remoteCouple || (remoteCouple.status === 'broken' && remoteCouple.brokenBy)) {
      console.log('[Realtime] Couple supprimé ou rompu sur le serveur. Réinitialisation sans duo.');
      const currentUserName = (activePartnerId === 'partner_a' ? couple?.partnerA?.name : couple?.partnerB?.name) || authUser?.displayName || 'Moi';

      const noDuoCouple: CouplePair = {
        ...INITIAL_COUPLE,
        partnerA: {
          ...INITIAL_COUPLE.partnerA,
          name: currentUserName,
        },
        partnerB: {
          ...INITIAL_COUPLE.partnerB,
          name: 'En attente...',
        },
        isCodeUsed: false,
      };

      setSpots([]);
      setNotifications([]);
      setCouple(noDuoCouple);
      setActivePartnerId('partner_a');

      if (remoteCouple?.brokenBy) {
        setBrokenDuoNotice(remoteCouple.brokenBy);
      }
      return;
    }

    setCouple((prev) => {
      const wasWaiting = !prev.isCodeUsed || !prev.partnerB || prev.partnerB.name === 'En attente...';
      const nowJoined = Boolean(
        remoteCouple.isCodeUsed ||
        (remoteCouple.partnerB && remoteCouple.partnerB.name && remoteCouple.partnerB.name !== 'En attente...')
      );

      if (wasWaiting && nowJoined) {
        triggerHaptic('success');
        const partnerName = remoteCouple.partnerB?.name || 'Votre partenaire';
        showToast(`🎉 ${partnerName} a rejoint votre duo !`);
      }

      return { ...prev, ...remoteCouple };
    });
  };

  const handleSpotsRealtimeUpdate = (remoteSpots: Spot[]) => {
    if (remoteSpots) {
      setSpots(remoteSpots.map(computeSpotScores));
    }
  };

  const handleNotificationsRealtimeUpdate = (remoteNotifs: NotificationItem[]) => {
    if (remoteNotifs) {
      if (!isInitialNotifSyncRef.current) {
        const newPartnerNotifs = remoteNotifs.filter(
          (rn) =>
            !rn.isRead &&
            rn.senderId !== activePartnerIdRef.current &&
            !notificationsRef.current.some((prev) => prev.id === rn.id)
        );
        newPartnerNotifs.forEach((notif) => {
          triggerHaptic('success');
          dispatchExternalSystemNotification({
            id: notif.id,
            title: notif.title || '💖 LoveMap Duo',
            message: notif.message || 'Votre moitié a partagé un lieu ou une note !',
            spotId: notif.spotId,
            type: notif.type,
          });
          showToast(`🔔 ${notif.title} : ${notif.message}`);
        });
      }
      isInitialNotifSyncRef.current = false;
      setNotifications(remoteNotifs);
    }
  };

  // 1. iOS Native Realtime Synchronization (via useCoupleRealtime hook with generation counter)
  useCoupleRealtime({
    coupleCode: couple?.code,
    onCoupleUpdate: handleCoupleRealtimeUpdate,
    onSpotsUpdate: handleSpotsRealtimeUpdate,
    onNotificationsUpdate: handleNotificationsRealtimeUpdate,
  });

  // 2. Web / PWA Realtime Synchronization (Modular JS SDK without background pause issues)
  useEffect(() => {
    if (!couple.code || couple.code.trim().toUpperCase() === 'LOVE-NEW' || isCapacitorNative()) return;
    const unsubCouple = subscribeToCouple(couple.code, handleCoupleRealtimeUpdate);
    const unsubSpots = subscribeToSpots(couple.code, handleSpotsRealtimeUpdate);
    const unsubNotifs = subscribeToNotifications(couple.code, handleNotificationsRealtimeUpdate);

    return () => {
      if (unsubCouple) unsubCouple();
      if (unsubSpots) unsubSpots();
      if (unsubNotifs) unsubNotifs();
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

      // Spot notification and FCM push are created server-side via onSpotCreated trigger
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

        // Score computation is authoritative on server trigger (onSpotUpdated) to avoid concurrent client race conditions
        saveSpotToFirestore(couple.code, updatedSpot).catch(console.error);

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
          showToast(`💖 Spot "${updatedSpot.title}" validé à deux !`);
          const validationNotif: NotificationItem = {
            id: `notif-val-${Date.now()}`,
            type: 'spot_validated',
            spotId: updatedSpot.id,
            senderId: partnerId,
            targetPartnerId,
            title: `🎉 Lieu validé à deux !`,
            message: `${currentUserName} a complété ses notes pour "${updatedSpot.title}". Le lieu est maintenant validé sur votre carte commune !`,
            timestamp: `${dateStr} à ${timeStr}`,
            isRead: false,
          };
          saveNotificationToFirestore(couple.code, validationNotif).catch(console.error);
        } else {
          showToast(`✨ Vos notes ont été enregistrées !`);
          const ratingNotif: NotificationItem = {
            id: `notif-rated-${Date.now()}`,
            type: 'new_spot_proposed',
            spotId: updatedSpot.id,
            senderId: partnerId,
            targetPartnerId,
            title: `💌 ${currentUserName} a noté "${updatedSpot.title}" !`,
            message: `C'est à votre tour : notez et donnez votre avis sur "${updatedSpot.title}" pour valider le lieu ensemble !`,
            timestamp: `${dateStr} à ${timeStr}`,
            isRead: false,
          };
          saveNotificationToFirestore(couple.code, ratingNotif).catch(console.error);
        }

        return updatedSpot;
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

        // Score recalculation is handled server-side by onSpotUpdated trigger
        saveSpotToFirestore(couple.code, merged).catch(console.error);
        if (selectedSpot && selectedSpot.id === spotId) {
          setSelectedSpot(merged);
        }
        return merged;
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
    setIsSettingsOpen(false);
    showToast('Déconnexion en cours...');
    setAuthUser(null);
    setCouple(INITIAL_COUPLE);
    setIsOnboardingOpen(false);
    setIsAuthMandatory(true);
    setAuthModalMode('login');
    setAuthModalSource('general');
    setIsAuthOpen(true);

    await fullTeardown({
      resetState: () => {
        setAuthUser(null);
        setCouple(INITIAL_COUPLE);
        setIsOnboardingOpen(false);
        setIsAuthMandatory(true);
        setAuthModalMode('login');
        setAuthModalSource('general');
        setIsAuthOpen(true);
      },
    });
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

    ensureGuestUser().then(user => {
      createCoupleInFirestore(user, breakerName, freshCouple.partnerA.avatar).catch(console.error);
    });

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
    setIsSettingsOpen(false);
    showToast('Suppression définitive de votre compte en cours...');

    const res = await deleteMyAccount();
    if (res.success) {
      showToast('Votre compte a été définitivement supprimé.');
      setAuthUser(null);
      setCouple(INITIAL_COUPLE);
      setIsOnboardingOpen(false);
      setIsAuthMandatory(true);
      setAuthModalMode('login');
      setAuthModalSource('general');
      setIsAuthOpen(true);

      await fullTeardown({
        resetState: () => {
          setAuthUser(null);
          setCouple(INITIAL_COUPLE);
          setIsOnboardingOpen(false);
          setIsAuthMandatory(true);
          setAuthModalMode('login');
          setAuthModalSource('general');
          setIsAuthOpen(true);
        },
      });
    } else {
      showToast(`❌ ${res.error || 'Erreur lors de la suppression de votre compte.'}`);
    }
  };

  // Filter notifications meant for the active partner (creators do not receive notifications for their own actions)
  const userNotifications = notifications.filter(
    (n) => (n.targetPartnerId ? n.targetPartnerId === activePartnerId : n.senderId !== activePartnerId)
  );

  // Counts for badges
  const unreadCount = userNotifications.filter((n) => !n.isRead).length;
  const isMePartnerA = activePartnerId === 'partner_a';
  const pendingValidationCount = spots.filter((s) => {
    if (s.status !== 'pending_validation' || s.isSolo) return false;
    const isCreator =
      s.creatorId === activePartnerId ||
      (Boolean(couple?.partnerAUid) && isMePartnerA && s.creatorId === couple.partnerAUid) ||
      (Boolean(couple?.partnerBUid) && !isMePartnerA && s.creatorId === couple.partnerBUid);
    return !isCreator;
  }).length;

  const activeUser = (activePartnerId === 'partner_a' ? couple?.partnerA : couple?.partnerB) || {
    name: 'Moi',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  };

  if (isVerifyingSession) {
    return (
      <div className="w-full h-full min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-400">Vérification de votre session...</p>
      </div>
    );
  }

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
          onClose={() => {
            setIsOnboardingOpen(false);
            if (!authUser) {
              setIsAuthMandatory(true);
              setIsAuthOpen(true);
            }
          }}
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
