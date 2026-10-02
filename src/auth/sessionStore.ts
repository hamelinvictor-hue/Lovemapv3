import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { FirebaseAuthentication, type User as CapAuthUser } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { FirebaseFunctions } from '@capacitor-firebase/functions';
import { signOut, type User as FbUser } from 'firebase/auth';
import { doc, getDocFromServer, getDoc } from 'firebase/firestore';
import { auth, getFirestoreDb, clearVerifiedRoomsCache } from '../lib/firebase';
import { clearFirestorePersistence, getDocument as adapterGetDocument } from '../data/firestoreAdapter';
import { unregisterFcmTokenOnSignOut } from '../lib/fcmManager';
import { UserProfile, CouplePair } from '../types';

export type SessionState = 'checking' | 'signedOut' | 'needsProfile' | 'ready' | 'error';

export interface SessionData {
  state: SessionState;
  user: CapAuthUser | FbUser | null;
  userProfile: UserProfile | null;
  error?: string | null;
  authMessage?: string | null;
  activeTab?: 'login' | 'register';
  isSigningIn?: boolean;
}

// État initial de la session
let currentSession: SessionData = {
  state: 'checking',
  user: null,
  userProfile: null,
  error: null,
  authMessage: null,
  activeTab: 'login',
  isSigningIn: false,
};

// Abonnés pour React useSyncExternalStore
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

function subscribeSession(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSessionSnapshot(): SessionData {
  return currentSession;
}

/**
 * Journalise chaque transition selon la règle : [Session] ancien état → nouvel état (raison)
 */
function transitionTo(newState: SessionState, reason: string, updates: Partial<SessionData> = {}) {
  const oldState = currentSession.state;
  console.log(`[Session] ${oldState} → ${newState} (${reason})`);
  currentSession = {
    ...currentSession,
    ...updates,
    state: newState,
  };
  notifySubscribers();
}

// Callback enregistré par App.tsx pour réinitialiser les états locaux en mémoire
let resetAppStateCallback: (() => void) | null = null;
export function registerResetAppStateCallback(cb: () => void) {
  resetAppStateCallback = cb;
}

// Flag indiquant qu'un flux signIn explicite est en cours (pour bloquer l'écouteur authStateChange)
let isSigningIn = false;

// Mémorisation de l'intention avant l'ouverture de la fenêtre native
let memorizedIntent: 'create' | 'login' = 'login';

// Écouteur authStateChange enregistré une seule fois
let authStateListenerRegistered = false;

function ensureAuthStateListener() {
  if (authStateListenerRegistered) return;
  authStateListenerRegistered = true;

  try {
    FirebaseAuthentication.addListener('authStateChange', async (change) => {
      // Règle : L'écouteur authStateChange ne doit pas changer d'état pendant qu'un signIn est en cours.
      if (isSigningIn) {
        console.log('[Session] authStateChange ignoré car un signIn est en cours.');
        return;
      }

      if (currentSession.state === 'checking') {
        return;
      }

      const user = change?.user || null;
      if (!user) {
        if (currentSession.state !== 'signedOut') {
          transitionTo('signedOut', 'déconnexion détectée par authStateChange', {
            user: null,
            userProfile: null,
          });
        }
      } else {
        // Utilisateur connecté détecté hors signIn actif
        if (currentSession.state === 'signedOut') {
          const profile = await readUserProfileFromServer(user.uid);
          if (profile && (profile.displayName || profile.accountCreated)) {
            transitionTo('ready', 'utilisateur reconnecté avec profil détecté par authStateChange', {
              user,
              userProfile: profile,
            });
          } else {
            transitionTo('needsProfile', 'utilisateur connecté sans profil détecté par authStateChange', {
              user,
              userProfile: null,
            });
          }
        }
      }
    }).catch((e) => {
      console.warn('[Session] Notice enregistrement écouteur authStateChange:', e);
    });
  } catch (e) {
    console.warn('[Session] Notice configuration listener:', e);
  }
}

/**
 * Lit le document users/{uid} directement depuis le serveur Firestore
 */
export async function readUserProfileFromServer(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await FirebaseFirestore.getDocument<UserProfile>({ reference: `users/${uid}` });
      const snap = res?.snapshot;
      if (snap && snap.data && typeof snap.data === 'object' && Object.keys(snap.data).length > 0) {
        return snap.data as UserProfile;
      }
      return null;
    } else {
      const db = getFirestoreDb();
      if (db) {
        try {
          const snap = await getDocFromServer(doc(db, `users/${uid}`));
          if (snap.exists()) {
            return snap.data() as UserProfile;
          }
          return null;
        } catch {
          const snap = await getDoc(doc(db, `users/${uid}`));
          if (snap.exists()) {
            return snap.data() as UserProfile;
          }
          return null;
        }
      }
      const snap = await adapterGetDocument<UserProfile>(`users/${uid}`);
      if (snap && snap.exists && snap.val) {
        return snap.val;
      }
      return null;
    }
  } catch (err: any) {
    console.warn(`[Session] Lecture users/${uid} notice:`, err?.message || err);
    return null;
  }
}

/**
 * Démarrage de la session
 * Séquence bornée à 10 secondes maximum
 */
export async function initializeSession(): Promise<void> {
  ensureAuthStateListener();

  console.log('[Session] Démarrage de la vérification de la session...');
  if (currentSession.state !== 'checking') {
    transitionTo('checking', 'initialisation au démarrage');
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Délai dépassé (10 secondes) lors de la vérification de la session.'));
    }, 10000);
  });

  const sessionFlowPromise = (async () => {
    // Étape 1 : Vérification du marqueur installId dans Preferences
    console.log('[Session] étape 1 : Vérification du marqueur installId');
    const installIdRes = await Preferences.get({ key: 'installId' }).catch(() => ({ value: null }));
    if (!installIdRes?.value) {
      console.log('[Session] Marqueur installId absent. Déconnexion préventive...');
      try {
        await FirebaseAuthentication.signOut().catch(() => {});
      } catch (e) {}
      try {
        if (auth) await signOut(auth).catch(() => {});
      } catch (e) {}
      const newInstallId =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `inst_${Date.now()}`;
      await Preferences.set({ key: 'installId', value: newInstallId }).catch(() => {});
    }

    // Étape 2 : Lecture de getCurrentUser()
    console.log('[Session] étape 2 : Lecture de getCurrentUser()');
    let currentUser: any = null;
    try {
      const res = await FirebaseAuthentication.getCurrentUser();
      currentUser = res?.user || null;
    } catch (e) {
      currentUser = (auth?.currentUser as any) || null;
    }

    // Étape 3 : Sans utilisateur, passe en signedOut
    if (!currentUser || !currentUser.uid) {
      transitionTo('signedOut', 'aucun utilisateur connecté');
      return;
    }

    // Étape 4 : Avec utilisateur, force getIdToken({ forceRefresh: true })
    console.log('[Session] étape 3 : Rafraîchissement forcé du jeton getIdToken');
    try {
      await FirebaseAuthentication.getIdToken({ forceRefresh: true });
    } catch (tokenErr) {
      console.warn('[Session] Échec rafraîchissement jeton, déconnexion en cours:', tokenErr);
      try {
        await FirebaseAuthentication.signOut().catch(() => {});
      } catch (e) {}
      try {
        if (auth) await signOut(auth).catch(() => {});
      } catch (e) {}
      transitionTo('signedOut', 'échec du rafraîchissement du jeton de sécurité');
      return;
    }

    // Étape 5 : Lecture de users/{uid} depuis le serveur
    console.log('[Session] étape 4 : Lecture de users/{uid} depuis le serveur');
    const profile = await readUserProfileFromServer(currentUser.uid);
    if (profile && (profile.displayName || profile.accountCreated)) {
      transitionTo('ready', 'profil utilisateur trouvé sur le serveur', {
        user: currentUser,
        userProfile: profile,
      });
    } else {
      transitionTo('needsProfile', 'utilisateur connecté sans document users/{uid} sur le serveur', {
        user: currentUser,
        userProfile: null,
      });
    }
  })();

  try {
    await Promise.race([sessionFlowPromise, timeoutPromise]);
  } catch (err: any) {
    console.error('[Session] Erreur globale lors de la vérification:', err);
    transitionTo('error', `échec de la vérification (${err?.message || 'délai dépassé'})`, {
      error: err?.message || 'La vérification de votre session a échoué (délai dépassé).',
    });
  }
}

/**
 * Authentification explicite : Google ou Apple avec intention (create ou login)
 */
export async function signIn(provider: 'google' | 'apple', intent: 'create' | 'login'): Promise<void> {
  const providerLabel = provider === 'apple' ? 'Apple' : 'Google';
  console.log(`[Session] signIn lancé (${providerLabel}) avec intent: ${intent}`);

  isSigningIn = true;
  memorizedIntent = intent;
  currentSession = {
    ...currentSession,
    isSigningIn: true,
  };
  notifySubscribers();

  try {
    let authUser: any = null;

    if (provider === 'google') {
      const res = await FirebaseAuthentication.signInWithGoogle();
      authUser = res?.user || null;
    } else {
      const res = await FirebaseAuthentication.signInWithApple();
      authUser = res?.user || null;
    }

    if (!authUser || !authUser.uid) {
      const cur = await FirebaseAuthentication.getCurrentUser().catch(() => null);
      authUser = cur?.user || null;
    }

    if (!authUser || !authUser.uid) {
      throw new Error(`Aucun utilisateur renvoyé par ${providerLabel}.`);
    }

    // Après l'authentification, lis users/{uid} depuis le serveur
    console.log(`[Session] Lecture users/${authUser.uid} depuis le serveur après authentification...`);
    const profile = await readUserProfileFromServer(authUser.uid);
    const profileExists = Boolean(profile && (profile.displayName || profile.accountCreated));

    // Règle : Si intent vaut create et que le profil existe :
    // affiche « Un compte existe déjà avec ce compte Google » (ou Apple),
    // déconnecte, puis passe en signedOut avec l'onglet Connexion actif.
    if (memorizedIntent === 'create' && profileExists) {
      console.log(`[Session] Compte existant détecté pour intent create (${providerLabel})`);
      try {
        await FirebaseAuthentication.signOut().catch(() => {});
      } catch (e) {}
      try {
        if (auth) await signOut(auth).catch(() => {});
      } catch (e) {}

      transitionTo('signedOut', `compte existant lors d'une tentative de création (${providerLabel})`, {
        user: null,
        userProfile: null,
        authMessage: `Un compte existe déjà avec ce compte ${providerLabel}`,
        activeTab: 'login',
        error: null,
      });
      return;
    }

    // Règle : Si intent vaut login et que le profil n'existe pas :
    // passe en needsProfile avec le message « Aucun compte trouvé, créons-le ».
    if (memorizedIntent === 'login' && !profileExists) {
      console.log(`[Session] Aucun profil trouvé pour intent login (${providerLabel})`);
      transitionTo('needsProfile', `aucun profil lors de la connexion (${providerLabel})`, {
        user: authUser,
        userProfile: null,
        authMessage: 'Aucun compte trouvé, créons-le',
        error: null,
      });
      return;
    }

    // Nouvelle création de compte réussie sans profil préexistant
    if (memorizedIntent === 'create' && !profileExists) {
      transitionTo('needsProfile', 'nouveau compte sans profil, création de profil requise', {
        user: authUser,
        userProfile: null,
        authMessage: null,
        error: null,
      });
      return;
    }

    // Connexion réussie à un compte existant avec profil
    if (memorizedIntent === 'login' && profileExists) {
      transitionTo('ready', 'connexion réussie avec profil existant', {
        user: authUser,
        userProfile: profile,
        authMessage: null,
        error: null,
      });
      return;
    }
  } catch (err: any) {
    const isCancel =
      err?.message?.toLowerCase().includes('cancel') ||
      err?.message?.toLowerCase().includes('annul') ||
      err?.code === '1001' ||
      err?.code === 1001 ||
      err?.code === '13' ||
      err?.code === 13 ||
      err?.code === 'auth/popup-closed-by-user' ||
      err?.message?.includes('closed-by-user');

    if (isCancel) {
      // Règle : Une annulation par l'utilisateur ramène en signedOut sans message d'erreur.
      transitionTo('signedOut', 'annulation de la connexion par l’utilisateur', {
        user: null,
        userProfile: null,
        error: null,
        authMessage: null,
      });
      return;
    }

    console.error(`[Session] Erreur lors de signIn (${providerLabel}):`, err);
    transitionTo('signedOut', `erreur lors de la connexion (${err?.message || 'Erreur inconnue'})`, {
      user: null,
      userProfile: null,
      error: err?.message || 'Erreur lors de la connexion',
      authMessage: null,
    });
  } finally {
    isSigningIn = false;
    currentSession = {
      ...currentSession,
      isSigningIn: false,
    };
    notifySubscribers();
  }
}

/**
 * Déconnexion complète ordonnée
 * Règle : Chaque étape est dans son propre try/catch. Pas de rechargement de page.
 */
export async function logout(): Promise<void> {
  console.log('[Session] Déconnexion demandée...');

  // 1. Arrête les écoutes
  try {
    clearVerifiedRoomsCache();
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.removeAllListeners();
    }
  } catch (e: any) {
    console.warn('[Session] Notice arrêt écoutes:', e?.message || e);
  }

  // 2. Désinscrit les notifications
  try {
    const uid = currentSession.user?.uid || auth?.currentUser?.uid || null;
    await unregisterFcmTokenOnSignOut(uid);
  } catch (e: any) {
    console.warn('[Session] Notice désinscription notifications:', e?.message || e);
  }

  // 3. Appelle FirebaseAuthentication.signOut() puis le signOut du SDK JavaScript s'il est initialisé
  try {
    await FirebaseAuthentication.signOut();
  } catch (e: any) {
    console.warn('[Session] Notice FirebaseAuthentication.signOut:', e?.message || e);
  }
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch (e: any) {
    console.warn('[Session] Notice auth signOut:', e?.message || e);
  }

  // 4. Purge le cache Firestore
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.clearPersistence();
    } else {
      await clearFirestorePersistence();
    }
  } catch (e: any) {
    console.warn('[Session] Notice purge cache Firestore:', e?.message || e);
  }

  // 5. Purge le localStorage et les Preferences (sauf installId)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
    let currentInstallId: string | null = null;
    try {
      const res = await Preferences.get({ key: 'installId' });
      currentInstallId = res?.value || null;
    } catch (e) {}

    await Preferences.clear().catch(() => {});

    if (currentInstallId) {
      await Preferences.set({ key: 'installId', value: currentInstallId }).catch(() => {});
    }
  } catch (e: any) {
    console.warn('[Session] Notice purge stockage local:', e?.message || e);
  }

  // 6. Réinitialise tous les états de l'application
  try {
    if (resetAppStateCallback) {
      resetAppStateCallback();
    }
  } catch (e: any) {
    console.warn('[Session] Notice réinitialisation état application:', e?.message || e);
  }

  // 7. Passe en signedOut
  transitionTo('signedOut', 'déconnexion terminée avec succès', {
    user: null,
    userProfile: null,
    error: null,
    authMessage: null,
    activeTab: 'login',
  });
}

/**
 * Suppression de compte :
 * Règle : deleteAccount() arrête les écoutes, appelle la Cloud Function deleteAccount par callByName
 * en région europe-west1, puis lance logout() seulement en cas de succès.
 * En cas d'échec, affiche le message d'erreur renvoyé par la fonction et reste en ready.
 */
export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
  console.log('[Session] Suppression du compte en cours...');

  // 1. Arrête les écoutes
  try {
    clearVerifiedRoomsCache();
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.removeAllListeners();
    }
  } catch (e: any) {
    console.warn('[Session] Notice arrêt écoutes:', e?.message || e);
  }

  // 2. Appelle la Cloud Function deleteAccount par callByName en région europe-west1
  try {
    console.log('[Session] Appel de la Cloud Function deleteAccount (region: europe-west1)...');
    await FirebaseFunctions.callByName({
      name: 'deleteAccount',
      region: 'europe-west1',
    });
    console.log('[Session] Cloud Function deleteAccount a réussi.');

    // Lance logout() seulement en cas de succès
    await logout();
    return { success: true };
  } catch (err: any) {
    console.error('[Session] Échec de la Cloud Function deleteAccount:', err);
    const errorMsg = err?.message || 'Erreur lors de la suppression de votre compte.';
    // En cas d'échec, affiche le message d'erreur renvoyé par la fonction et reste en ready.
    return { success: false, error: errorMsg };
  }
}

/**
 * Marque le profil comme complété (après saisie dans OnboardingModal)
 */
export function setProfileCompleted(profile: UserProfile, couple?: CouplePair | null): void {
  transitionTo('ready', 'profil utilisateur complété', {
    userProfile: profile,
    authMessage: null,
    error: null,
  });
}

/**
 * Réessayer la vérification de session depuis l'écran d'erreur
 */
export function retrySessionVerification(): void {
  transitionTo('checking', 'nouvelle tentative manuelle de vérification');
  initializeSession();
}

/**
 * Hook React pour observer la session
 */
export function useSession(): SessionData {
  return useSyncExternalStore(subscribeSession, getSessionSnapshot);
}
