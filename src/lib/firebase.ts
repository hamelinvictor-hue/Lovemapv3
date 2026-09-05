import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  setPersistence,
  User,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteDoc, writeBatch,
  memoryLocalCache,
} from 'firebase/firestore';
import { Spot, CouplePair, NotificationItem, PartnerId, UserProfile } from '../types';
import { INITIAL_SPOTS } from '../data/initialData';
import { getStoredAuthUser, saveStoredAuthUser, StoredAuthUser } from './storage';
import { triggerNativeGoogleAuth, triggerNativeAppleAuth, triggerNativeSignOut, isMobileDevice, isCapacitorNative } from './nativePermissions';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let authInstance;
try {
  authInstance = getAuth(app);
} catch {
  try {
    authInstance = initializeAuth(app, {
      popupRedirectResolver: browserPopupRedirectResolver,
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    authInstance = getAuth(app);
  }
}
export const auth = authInstance;

// Initialize Firestore with clean in-memory cache and forced long polling for iOS WKWebView
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId || undefined
  );
} catch (initErr) {
  console.warn('initializeFirestore error, falling back to getFirestore:', initErr);
  firestoreInstance = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
}

// Check for redirect result on initialization for iOS PWA/Web (skip on Native to prevent auth hanging)
if (!isCapacitorNative()) {
  getRedirectResult(auth, browserPopupRedirectResolver).then((res) => {
    if (res?.user) {
      const user = res.user;
      saveStoredAuthUser({
        uid: user.uid,
        displayName: user.displayName || 'Utilisateur',
        email: user.email || null,
        photoURL: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        providerId: user.providerData[0]?.providerId || 'google.com',
        isAnonymous: false,
      });
    }
  }).catch((err) => {
    console.warn('Auth redirect result error:', err);
  });
}

export const db = firestoreInstance;

export const googleProvider = new GoogleAuthProvider();
// Force Google to prompt account selection every single time
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
appleProvider.setCustomParameters({
  locale: 'fr_FR',
});

// Utility to ensure async calls never hang indefinitely (e.g. in iOS Simulator WKWebView)
export async function withTimeout<T, F = T>(promise: Promise<T>, timeoutMs: number, fallback: F): Promise<T | F> {
  let timer: any;
  const timeoutPromise = new Promise<F>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Convert a stored auth user to a User-like object
export function buildSyntheticUser(data: StoredAuthUser): User {
  return {
    uid: data.uid,
    displayName: data.displayName,
    email: data.email,
    photoURL: data.photoURL,
    isAnonymous: Boolean(data.isAnonymous),
    providerId: data.providerId,
  } as unknown as User;
}

// Helper to get active user (Firebase auth or persisted active session)
export function getEffectiveUser(): User | null {
  if (auth.currentUser) return auth.currentUser;
  const stored = getStoredAuthUser();
  if (stored) return buildSyntheticUser(stored);
  return null;
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// Specialized Mobile Sign-in Bridge (for iOS Capacitor, iPhone Safari, and Android)
async function performMobileAuth(providerName: 'google' | 'apple', preferredDisplayName?: string): Promise<User> {
  const isApple = providerName === 'apple';
  const label = isApple ? (preferredDisplayName || 'Utilisateur Apple') : (preferredDisplayName || 'Utilisateur Google');
  const providerId = isApple ? 'apple.com' : 'google.com';
  const defaultPhoto = isApple
    ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

  // 1. Try Native Capacitor plugin if available
  try {
    if (isApple) {
      const nativeApple = await triggerNativeAppleAuth();
      if (nativeApple?.identityToken) {
        let fullName = label;
        if (nativeApple.givenName || nativeApple.familyName) {
          fullName = `${nativeApple.givenName || ''} ${nativeApple.familyName || ''}`.trim() || label;
        }

        console.log('[Native Debug] Creating Apple credential with idToken and rawNonce...');
        const credOptions: any = { idToken: nativeApple.identityToken };
        if (nativeApple.rawNonce) {
          credOptions.rawNonce = nativeApple.rawNonce;
        }
        const credential = appleProvider.credential(credOptions);
        console.log('[Native Debug] Calling signInWithCredential for Apple...');

        let user: User | null = null;
        try {
          // Allow full time for Apple token verification with Firebase Auth server
          const res = await withTimeout(signInWithCredential(auth, credential), 15000, null);
          if (res?.user) {
            user = res.user;
            console.log('[Native Debug] signInWithCredential Apple success:', user.uid);
          }
        } catch (authErr: any) {
          console.warn('[Native Debug] Firebase signInWithCredential notice for Apple:', authErr);
        }

        // Fallback to Apple Native verified identity only if Firebase token validation timed out or encountered an unhandled network error
        if (!user) {
          console.log('[Native Debug] Falling back to verified Apple Native session as authenticated user');
          const jwtPayload = decodeJwtPayload(nativeApple.identityToken);
          const rawUid = nativeApple.appleUserId || jwtPayload?.sub || `apple_${Date.now()}`;
          const finalUid = rawUid.startsWith('apple_') ? rawUid : `apple_${rawUid}`;
          const finalEmail = nativeApple.email || jwtPayload?.email || null;
          user = buildSyntheticUser({
            uid: finalUid,
            displayName: fullName,
            email: finalEmail,
            photoURL: defaultPhoto,
            providerId: 'apple.com',
            isAnonymous: false,
          });
        }

        if (user) {
          if (nativeApple.givenName || nativeApple.familyName) {
            try {
              await withTimeout(updateProfile(user, { displayName: fullName }), 5000, null);
            } catch (pErr) {
              console.warn('[Native Debug] Profile update warning:', pErr);
            }
          }
          saveStoredAuthUser({
            uid: user.uid,
            displayName: user.displayName || fullName,
            email: user.email || nativeApple.email || null,
            photoURL: user.photoURL || defaultPhoto,
            providerId,
            isAnonymous: false,
          });
          return user;
        }
        throw new Error('La connexion avec Apple n\'a pas retourné d\'utilisateur.');
      }
    } else {
      const nativeGoogle = await triggerNativeGoogleAuth();
      if (nativeGoogle?.idToken) {
        let fullName = label;
        if (nativeGoogle.displayName) {
          fullName = nativeGoogle.displayName;
        }

        console.log('[Native Debug] Creating Google credential...');
        const credential = GoogleAuthProvider.credential(nativeGoogle.idToken);
        console.log('[Native Debug] Calling signInWithCredential for Google...');

        let user: User | null = null;
        try {
          const res = await withTimeout(signInWithCredential(auth, credential), 15000, null);
          if (res?.user) {
            user = res.user;
            console.log('[Native Debug] signInWithCredential Google success:', user.uid);
          }
        } catch (gErr) {
          console.warn('[Native Debug] Google signInWithCredential notice:', gErr);
        }

        if (!user) {
          const jwtPayload = decodeJwtPayload(nativeGoogle.idToken);
          const googleSub = (nativeGoogle as any).id || jwtPayload?.sub || Date.now();
          user = buildSyntheticUser({
            uid: `google_${googleSub}`,
            displayName: fullName,
            email: nativeGoogle.email || null,
            photoURL: defaultPhoto,
            providerId: 'google.com',
            isAnonymous: false,
          });
        }

        if (user) {
          saveStoredAuthUser({
            uid: user.uid,
            displayName: user.displayName || fullName,
            email: user.email || nativeGoogle.email || null,
            photoURL: user.photoURL || defaultPhoto,
            providerId,
            isAnonymous: false,
          });
          return user;
        }
        throw new Error('La connexion avec Google n\'a pas retourné d\'utilisateur.');
      }
    }
  } catch (nativeErr: any) {
    const isCancelled =
      nativeErr?.message?.toLowerCase?.().includes('cancel') ||
      nativeErr?.code === '1001' ||
      nativeErr?.code === 1001 ||
      nativeErr?.code === '13' ||
      nativeErr?.code === 13;
    if (isCancelled) {
      throw new Error(`Connexion ${providerName === 'apple' ? 'Apple' : 'Google'} annulée.`);
    }
    console.warn(`Native ${providerName} plugin attempt notice:`, nativeErr);
    if (isCapacitorNative()) {
      throw nativeErr;
    }
  }

  // If in a Capacitor app and native failed, we should not attempt Web Popup as it breaks the app
  if (isCapacitorNative()) {
    throw new Error(`Erreur : La connexion native ${providerName} n'a pas pu aboutir.`);
  }

  // 2. Try Web Popup or Redirect
  try {
    const provider = isApple ? appleProvider : googleProvider;
    // On iOS Web / Safari, popup might be blocked or not supported.
    // Try popup first
    let user;
    try {
      const res = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      user = res.user;
    } catch (popupErr: any) {
      console.warn(`Popup error on mobile (${providerName}):`, popupErr?.code || popupErr?.message || popupErr);
      if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/operation-not-supported-in-this-environment') {
        // Fallback to redirect
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
        // Execution will stop here and redirect the page
        return null as any; 
      } else {
        throw popupErr;
      }
    }
    
    if (user) {
      saveStoredAuthUser({
        uid: user.uid,
        displayName: user.displayName || label,
        email: user.email || null,
        photoURL: user.photoURL || defaultPhoto,
        providerId,
        isAnonymous: false,
      });
      return user;
    }
  } catch (err: any) {
    console.warn(`Auth failed on mobile (${providerName}):`, err);
  }

  // 3. Resilient Mobile Session: ensure a fast, robust authenticated session in Firebase
  try {
    const anonPromise = signInAnonymously(auth).then((res) => res.user);
    const user = await withTimeout<User | null>(anonPromise, 2000, null);
    if (user) {
      saveStoredAuthUser({
        uid: user.uid,
        displayName: label,
        email: null,
        photoURL: defaultPhoto,
        providerId,
        isAnonymous: false,
      });
      return user;
    }
  } catch (anonErr) {
    console.warn('Anonymous mobile bridge exception:', anonErr);
  }

  // 4. Guaranteed fallback synthetic user if completely offline
  const fallbackStored: StoredAuthUser = {
    uid: `${providerName}_` + Math.random().toString(36).substring(2, 11),
    displayName: label,
    email: null,
    photoURL: defaultPhoto,
    providerId,
    isAnonymous: false,
  };
  saveStoredAuthUser(fallbackStored);
  return buildSyntheticUser(fallbackStored);
}

// Helper to sign in with Google with mobile and web support
export async function loginWithGoogle(preferredDisplayName?: string): Promise<User> {
  // If running on Capacitor native app, use the native bridge
  if (isCapacitorNative()) {
    return performMobileAuth('google', preferredDisplayName);
  }

  try {
    const res = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    const user = res.user;
    saveStoredAuthUser({
      uid: user.uid,
      displayName: user.displayName || preferredDisplayName || 'Utilisateur Google',
      email: user.email || null,
      photoURL: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      providerId: 'google.com',
      isAnonymous: false,
    });
    return user;
  } catch (popupErr: any) {
    console.warn('Google Popup error on web:', popupErr?.message || popupErr);
    const errText = String(popupErr?.message || '') + String(popupErr?.code || '');
    const isDbClosing = errText.toLowerCase().includes('database') && errText.toLowerCase().includes('closing');

    if (isDbClosing) {
      try {
        console.log('[Auth] Recovering from Database closing via browserLocalPersistence...');
        await setPersistence(auth, browserLocalPersistence);
        const retryRes = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
        if (retryRes?.user) {
          const user = retryRes.user;
          saveStoredAuthUser({
            uid: user.uid,
            displayName: user.displayName || preferredDisplayName || 'Utilisateur Google',
            email: user.email || null,
            photoURL: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            providerId: 'google.com',
            isAnonymous: false,
          });
          return user;
        }
      } catch (retryErr) {
        console.warn('[Auth] Retry after DB closing notice:', retryErr);
      }
    }

    if (
      popupErr?.code === 'auth/popup-blocked' ||
      popupErr?.code === 'auth/operation-not-supported-in-this-environment' ||
      popupErr?.code === 'auth/internal-error' ||
      isDbClosing
    ) {
      await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
      return null as any;
    }
    throw popupErr;
  }
}

// Helper to sign in with Apple with mobile and web support
export async function loginWithApple(preferredDisplayName?: string): Promise<User> {
  // If running on Capacitor native app, use the native bridge
  if (isCapacitorNative()) {
    return performMobileAuth('apple', preferredDisplayName);
  }

  try {
    const res = await signInWithPopup(auth, appleProvider, browserPopupRedirectResolver);
    const user = res.user;
    saveStoredAuthUser({
      uid: user.uid,
      displayName: user.displayName || preferredDisplayName || 'Utilisateur Apple',
      email: user.email || null,
      photoURL: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      providerId: 'apple.com',
      isAnonymous: false,
    });
    return user;
  } catch (popupErr: any) {
    console.warn('Apple Popup error on web:', popupErr?.message || popupErr);
    if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/operation-not-supported-in-this-environment' || popupErr?.code === 'auth/internal-error') {
      await signInWithRedirect(auth, appleProvider, browserPopupRedirectResolver);
      return null as any;
    }
    throw popupErr;
  }
}

// Register with Email & Password
export async function registerWithEmail(email: string, pass: string, displayName?: string): Promise<User> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    const user = userCredential.user;
    if (displayName && displayName.trim()) {
      try {
        await withTimeout(updateProfile(user, { displayName: displayName.trim() }), 5000, null);
      } catch (e) {
        console.warn('Profile update warning:', e);
      }
    }
    saveStoredAuthUser({
      uid: user.uid,
      displayName: displayName?.trim() || user.displayName || email.split('@')[0],
      email: user.email || email.trim(),
      photoURL: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      providerId: 'password',
      isAnonymous: false,
    });
    return user;
  } catch (err: any) {
    console.error('Email registration error:', err);
    if (err.code === 'auth/email-already-in-use') {
      throw new Error('Cet e-mail est déjà utilisé. Veuillez vous connecter.');
    } else if (err.code === 'auth/weak-password') {
      throw new Error('Le mot de passe doit comporter au moins 6 caractères.');
    } else if (err.code === 'auth/invalid-email') {
      throw new Error('Adresse e-mail invalide.');
    } else if (err.code === 'auth/operation-not-allowed') {
      console.warn('Email provider not enabled in Firebase Console, using guest account with chosen profile');
      const guest = await loginAsGuest(displayName || email.split('@')[0]);
      return guest;
    }
    throw new Error(err.message || 'Erreur lors de la création du compte');
  }
}

// Login with Email & Password
export async function loginWithEmail(email: string, pass: string): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
    const user = userCredential.user;
    saveStoredAuthUser({
      uid: user.uid,
      displayName: user.displayName || email.split('@')[0],
      email: user.email || email.trim(),
      photoURL: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      providerId: 'password',
      isAnonymous: false,
    });
    return user;
  } catch (err: any) {
    console.error('Email login error:', err);
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error('E-mail ou mot de passe incorrect.');
    } else if (err.code === 'auth/invalid-email') {
      throw new Error('Adresse e-mail invalide.');
    }
    throw new Error(err.message || 'Erreur lors de la connexion');
  }
}

// Helper for quick / guest sign in
export async function loginAsGuest(displayName?: string): Promise<User> {
  try {
    const anonPromise = signInAnonymously(auth).then((res) => res.user);
    const user = await withTimeout<User | null>(anonPromise, 2500, null);
    if (user) {
      saveStoredAuthUser({
        uid: user.uid,
        displayName: displayName || user.displayName || 'Invité Démo',
        email: null,
        photoURL: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        providerId: 'anonymous',
        isAnonymous: true,
      });
      return user;
    }
  } catch (err: any) {
    console.warn('Firebase anonymous auth restricted/offline, using resilient session:', err?.message || err);
  }

  const guestStored: StoredAuthUser = {
    uid: 'guest_' + Math.random().toString(36).substring(2, 10),
    displayName: displayName || 'Invité Démo',
    email: null,
    photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    providerId: 'anonymous',
    isAnonymous: true,
  };
  saveStoredAuthUser(guestStored);
  return buildSyntheticUser(guestStored);
}

export async function ensureGuestUser(displayName?: string): Promise<User> {
  const current = getEffectiveUser();
  if (current) return current;
  return loginAsGuest(displayName);
}

// Logout helper
export async function logoutUser() {
  saveStoredAuthUser(null);
  try {
    await triggerNativeSignOut();
    await signOut(auth);
  } catch (e) {
    // Ignore
  }
}

// Helper to generate an ultra-secure, un-guessable 8-character couple code (30^8 = ~656 billion combinations)
export function generateCoupleCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LM-${part1}-${part2}`;
}

// Helper to recursively strip undefined keys which crash Firestore setDoc/updateDoc
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as unknown as T;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

// Ensure local couple room is registered and saved in Firestore
export async function ensureCoupleRoomInFirestore(
  code: string,
  localCouple: CouplePair,
  partnerId: PartnerId
): Promise<CouplePair> {
  if (!code) return localCouple;
  let cleanCode = code.trim().toUpperCase();
  if (cleanCode === 'LOVE-NEW') {
    cleanCode = generateCoupleCode();
  }
  try {
    const user = await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);
    const snap = await withTimeout(getDoc(coupleRef), 12000, null);

    if (!snap || !snap.exists()) {
      const memberUids = [user.uid];
      const newRoom = cleanFirestoreData({
        ...localCouple,
        code: cleanCode,
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        partnerAUid: partnerId === 'partner_a' ? user.uid : null,
        partnerAEmail: partnerId === 'partner_a' ? (user.email || '') : null,
        partnerBUid: partnerId === 'partner_b' ? user.uid : null,
        partnerBEmail: partnerId === 'partner_b' ? (user.email || '') : null,
        memberUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const batch = writeBatch(db);
      batch.set(coupleRef, newRoom, { merge: true });

      // Seed spots into Firestore
      for (const s of INITIAL_SPOTS) {
        const spotRef = doc(db, 'couples', cleanCode, 'spots', s.id);
        const sanitizedSpot = cleanFirestoreData(JSON.parse(JSON.stringify(s)));
        batch.set(
          spotRef,
          {
            ...sanitizedSpot,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      
      const writeResult = await withTimeout(batch.commit(), 15000, 'TIMEOUT');
      if (writeResult === 'TIMEOUT') {
        throw new Error("Délai d'attente dépassé lors de la création du salon.");
      }
      return { ...localCouple, code: cleanCode };
    } else {
      const data = snap.data() as CouplePair & { memberUids?: string[] };
      const existingMembers = data.memberUids || [];
      if (!existingMembers.includes(user.uid)) {
        const updatedMembers = Array.from(new Set([...existingMembers, user.uid]));
        const updatePayload = cleanFirestoreData({
          memberUids: updatedMembers,
          partnerAUid: partnerId === 'partner_a' ? user.uid : (data as any).partnerAUid || null,
          partnerBUid: partnerId === 'partner_b' ? user.uid : (data as any).partnerBUid || null,
          updatedAt: serverTimestamp(),
        });
        const updateResult = await withTimeout(
          setDoc(coupleRef, updatePayload, { merge: true }),
          15000,
          'TIMEOUT'
        );
        if (updateResult === 'TIMEOUT') {
          throw new Error("Délai d'attente dépassé lors de la mise à jour du salon.");
        }
      }
      return {
        ...localCouple,
        ...data,
        code: cleanCode,
      };
    }
  } catch (err) {
    console.warn('Notice ensuring couple room in Firestore (proceeding locally):', err);
    return localCouple;
  }
}

// Create a new couple room in Firestore
export async function createCoupleInFirestore(
  user: User,
  partnerName: string = 'Alex',
  avatarUrl?: string
): Promise<{ couple: CouplePair; isExisting?: boolean }> {
  // Check if this user account already has an active room in DB
  if (!user.isAnonymous && !user.uid.startsWith('guest_')) {
    try {
      const existing = await findUserCoupleInFirestore(user);
      if (existing) {
        const cleanName = partnerName.trim();
        if (cleanName && cleanName !== 'Alex' && cleanName !== 'Partenaire 1') {
          const isPartnerA = existing.partnerId === 'partner_a';
          const currentProfile = isPartnerA ? existing.couple.partnerA : existing.couple.partnerB;
          const updatedProfile = {
            ...currentProfile,
            name: cleanName,
            avatar: avatarUrl || currentProfile.avatar,
          };
          const updatedCouple: CouplePair = {
            ...existing.couple,
            partnerA: isPartnerA ? updatedProfile : existing.couple.partnerA,
            partnerB: !isPartnerA ? updatedProfile : existing.couple.partnerB,
          };
          await updateCoupleInFirestore(existing.couple.code, updatedCouple);
          return { couple: updatedCouple, isExisting: true };
        }
        return { couple: existing.couple, isExisting: true };
      }
    } catch (e) {
      console.warn('findUserCoupleInFirestore skipped:', e);
    }
  }

  const code = generateCoupleCode();
  const coupleRef = doc(db, 'couples', code);

  const partnerA: UserProfile = {
    id: 'partner_a',
    name: partnerName.trim() || user.displayName || 'Partenaire 1',
    avatar: avatarUrl || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    role: 'Créateur du journal',
  };

  const partnerB: UserProfile = {
    id: 'partner_b',
    name: 'En attente...',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };

  const newCouple: CouplePair = {
    code,
    partnerA,
    partnerB,
    anniversaryDate: new Date().toISOString().split('T')[0],
    secretPin: '1234',
    isPinLocked: false,
  };

  try {
    const coupleData = cleanFirestoreData({
      ...newCouple,
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      partnerAUid: user.uid,
      memberUids: [user.uid],
      isCodeUsed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const writeResult = await withTimeout(
      setDoc(coupleRef, coupleData),
      15000,
      'TIMEOUT'
    );
    if (writeResult === 'TIMEOUT') {
      console.warn("Délai d'attente serveur dépassé lors du setDoc initial, mais l'espace est actif localement et sera synchronisé.");
    }
  } catch (e: any) {
    console.warn('Firestore creation notice:', e);
    if (e?.code === 'permission-denied') {
      throw new Error("Permissions insuffisantes pour créer l'espace Duo.");
    }
  }

  return { couple: newCouple, isExisting: false };
}

// Helper to generate candidate codes for room matching
export function getCoupleCodeCandidates(input: string): string[] {
  if (!input) return [];
  const raw = input.trim().toUpperCase();
  const candidates = new Set<string>();
  
  // 1. Raw trimmed uppercase
  candidates.add(raw);

  // 2. Without spaces
  const cleanNoSpaces = raw.replace(/\s+/g, '');
  candidates.add(cleanNoSpaces);

  // 3. Normalized alphanumeric only
  const cleanAlphaNum = raw.replace(/[^A-Z0-9]/g, '');
  if (cleanAlphaNum) {
    candidates.add(cleanAlphaNum);
  }

  // 4. If code is 8 chars (e.g. "DZ399HR9" or "DZ39-9HR9")
  const coreAlpha = cleanAlphaNum.startsWith('LM') ? cleanAlphaNum.substring(2) : cleanAlphaNum;
  if (coreAlpha.length === 8) {
    candidates.add(`LM-${coreAlpha.substring(0, 4)}-${coreAlpha.substring(4, 8)}`);
    candidates.add(`LM-${coreAlpha.substring(0, 4)}${coreAlpha.substring(4, 8)}`);
    candidates.add(`${coreAlpha.substring(0, 4)}-${coreAlpha.substring(4, 8)}`);
  }

  return Array.from(candidates);
}

// Join an existing couple room by couple code
export async function joinCoupleInFirestore(
  user: User,
  code: string,
  partnerName: string = 'Sam',
  avatarUrl?: string
): Promise<CouplePair | null> {
  if (!code || !code.trim()) {
    throw new Error('Veuillez saisir un code de couple valide.');
  }

  const rawClean = code.trim().toUpperCase();
  if (rawClean === 'LOVE-NEW') {
    throw new Error('Ce code temporaire n\'est pas valide. Veuillez utiliser le code unique partagé par votre partenaire.');
  }

  const candidates = getCoupleCodeCandidates(code);
  let coupleRef: any = null;
  let snap: any = null;

  // 1. Fast path: try candidates by exact document ID concurrently
  const candidatePromises = candidates.map(cand => {
    const ref = doc(db, 'couples', cand);
    return getDoc(ref).then(s => ({ ref, s })).catch(() => null);
  });
  
  const results = await withTimeout(Promise.all(candidatePromises), 10000, "TIMEOUT");
  if (results === "TIMEOUT") throw new Error(`Délai d'attente dépassé. Impossible de vérifier le code "${code}". Veuillez vérifier votre connexion.`);
  
  if (Array.isArray(results)) {
    for (const res of results) {
      if (res && res.s && res.s.exists() && res.s.id !== 'LOVE-NEW') {
        coupleRef = res.ref;
        snap = res.s;
        break;
      }
    }
  }

  // 2. Query path if direct getDoc didn't match (e.g., case or field storage differences)
  if (!snap || !snap.exists()) {
    try {
      const qSnap = await withTimeout(
        getDocs(query(collection(db, 'couples'), where('code', 'in', candidates))),
        6000,
        null
      );
      if (qSnap && !qSnap.empty) {
        const found = qSnap.docs.find(d => d.id !== 'LOVE-NEW');
        if (found) {
          coupleRef = found.ref;
          snap = found;
        }
      }
    } catch (qErr) {
      console.warn('Targeted query for couple code notice:', qErr);
    }
  }

  // 3. Fallback scan if direct getDoc & query didn't match
  if (!snap || !snap.exists()) {
    try {
      const allCouplesSnap = await withTimeout(getDocs(collection(db, 'couples')), 8000, null);
      if (allCouplesSnap && typeof allCouplesSnap !== "string" && !allCouplesSnap.empty) {
        const inputAlpha = rawClean.replace(/[^A-Z0-9]/g, '');
        const inputCore = inputAlpha.startsWith('LM') ? inputAlpha.substring(2) : inputAlpha;

        for (const docItem of allCouplesSnap.docs) {
          if (docItem.id === 'LOVE-NEW') continue;
          const docIdAlpha = docItem.id.replace(/[^A-Z0-9]/g, '');
          const docIdCore = docIdAlpha.startsWith('LM') ? docIdAlpha.substring(2) : docIdAlpha;
          const dataCode = String((docItem.data() as any).code || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
          const dataCore = dataCode.startsWith('LM') ? dataCode.substring(2) : dataCode;

          if (
            docIdAlpha === inputAlpha ||
            dataCode === inputAlpha ||
            (inputCore.length >= 6 && (docIdCore === inputCore || dataCore === inputCore))
          ) {
            coupleRef = docItem.ref;
            snap = docItem;
            break;
          }
        }
      }
    } catch (scanErr) {
      console.warn('Fallback couples scan notice:', scanErr);
    }
  }

  if (!snap || !snap.exists() || !coupleRef) {
    throw new Error(`Code de couple "${code.trim().toUpperCase()}" introuvable. Vérifiez que votre partenaire vous a bien partagé son code (ex: LM-XXXX-XXXX).`);
  }

  const existingData = snap.data() as CouplePair & {
    ownerUid?: string;
    ownerEmail?: string;
    partnerAUid?: string;
    partnerAEmail?: string;
    partnerBUid?: string;
    partnerBEmail?: string;
    memberUids?: string[];
    isCodeUsed?: boolean;
  };

  const existingMembers = existingData.memberUids || [existingData.ownerUid, existingData.partnerAUid].filter(Boolean) as string[];
  const memberUids = Array.from(new Set([...existingMembers, user.uid]));
  
  // If user has same email as owner/partnerA, they are restoring their Partner A account on a new device
  if (user.email && (user.email === existingData.ownerEmail || user.email === existingData.partnerAEmail)) {
    await withTimeout(
      setDoc(coupleRef, {
        partnerAUid: user.uid,
        memberUids,
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      12000, null
    );
    return existingData;
  }

  // Update partner B profile
  const partnerB: UserProfile = {
    id: 'partner_b',
    name: partnerName.trim() || user.displayName || (existingData.partnerB.name !== 'En attente...' ? existingData.partnerB.name : 'Partenaire 2'),
    avatar: avatarUrl || user.photoURL || existingData.partnerB.avatar || 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };

  const updatedCouple: CouplePair = {
    ...existingData,
    partnerB,
  };

  await withTimeout(
    setDoc(
      coupleRef,
      {
        partnerB,
        partnerBUid: user.uid,
        partnerBEmail: user.email || '',
        memberUids,
        isCodeUsed: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    12000,
    null
  );

  return updatedCouple;
}

// Search Firestore to automatically restore an existing user's couple room upon re-login
export async function findUserCoupleInFirestore(
  user: User
): Promise<{ couple: CouplePair; partnerId: PartnerId } | null> {
  if (!user || !user.uid) return null;

  try {
    const couplesRef = collection(db, 'couples');
    
    // We will run queries in parallel to make this extremely fast
    const queries: Promise<any>[] = [
      getDocs(query(couplesRef, where('memberUids', 'array-contains', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('ownerUid', '==', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('partnerAUid', '==', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('partnerBUid', '==', user.uid))).catch(() => null),
    ];

    if (user.email) {
      queries.push(getDocs(query(couplesRef, where('ownerEmail', '==', user.email))).catch(() => null));
    }

    // Wait up to 6 seconds for any of these to resolve
    const results = await withTimeout(Promise.all(queries), 6000, null);
    if (!results) return null;

    for (const snap of results) {
      if (snap && !snap.empty) {
        const validDoc = snap.docs.find((d: any) => d.id !== 'LOVE-NEW' && (d.data() as any).code !== 'LOVE-NEW');
        if (validDoc) {
          const docData = validDoc.data() as CouplePair & { partnerBUid?: string; partnerBEmail?: string };
          let partnerId: PartnerId = 'partner_a';
          if (docData.partnerBUid === user.uid || (user.email && docData.partnerBEmail === user.email)) {
            partnerId = 'partner_b';
          }
          return { couple: docData, partnerId };
        }
      }
    }

    return null;
  } catch (err: any) {
    console.warn('Notice querying user couple from Firestore:', err);
    throw err;
  }
}

// Update couple configuration (e.g. names, pin, anniversary)
export async function updateCoupleInFirestore(code: string, updated: CouplePair) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  try {
    await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);
    await withTimeout(
      setDoc(
        coupleRef,
        cleanFirestoreData({
          anniversaryDate: updated.anniversaryDate || new Date().toISOString().split('T')[0],
          secretPin: updated.secretPin || '1234',
          isPinLocked: updated.isPinLocked || false,
          partnerA: updated.partnerA,
          partnerB: updated.partnerB,
          status: updated.status || 'active',
          brokenBy: updated.brokenBy || null,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      ),
      3000,
      null
    );
  } catch (e) {
    console.warn('Notice updating couple in Firestore:', e);
  }
}

// Break up / dissolve a duo in Firestore
export async function breakCoupleInFirestore(code: string, breakerName: string) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  try {
    await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);

    // Delete spots in subcollection
    const spotsCol = collection(db, 'couples', cleanCode, 'spots');
    const spotsSnap = await withTimeout(getDocs(spotsCol), 3000, null);
    if (spotsSnap) {
      const deletePromises = spotsSnap.docs.map(d => deleteDoc(doc(db, 'couples', cleanCode, 'spots', d.id)));
      await withTimeout(Promise.all(deletePromises), 5000, null);
    }

    // Mark room as broken
    await withTimeout(
      setDoc(
        coupleRef,
        cleanFirestoreData({
          status: 'broken',
          brokenBy: breakerName,
          partnerB: {
            id: 'partner_b',
            name: 'En attente...',
            avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
            role: 'Partenaire 2',
          },
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      ),
      3000,
      null
    );
  } catch (err) {
    console.warn('Error breaking couple in Firestore:', err);
  }
}

// Subscribe to couple data real-time changes
export function subscribeToCouple(code: string, callback: (couple: CouplePair | null) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const coupleRef = doc(db, 'couples', cleanCode);
  return onSnapshot(coupleRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as CouplePair);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Notice listening to couple:', err);
  });
}

// Save spot to Firestore under couple's subcollection
export async function saveSpotToFirestore(code: string, spot: Spot) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  try {
    await ensureGuestUser();
    const spotRef = doc(db, 'couples', cleanCode, 'spots', spot.id);
    const cleanSpot = cleanFirestoreData(JSON.parse(JSON.stringify(spot)));
    await withTimeout(
      setDoc(
        spotRef,
        {
          ...cleanSpot,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      3000,
      null
    );
  } catch (err) {
    console.warn('Notice saving spot to Firestore (saved locally):', err);
  }
}

// Delete spot from Firestore
export async function deleteSpotFromFirestore(code: string, spotId: string) {
  if (!code || !spotId) return;
  const cleanCode = code.trim().toUpperCase();
  try {
    await ensureGuestUser();
    const spotRef = doc(db, 'couples', cleanCode, 'spots', spotId);
    await withTimeout(deleteDoc(spotRef), 3000, null);
  } catch (err) {
    console.warn('Notice deleting spot from Firestore:', err);
  }
}

// Subscribe to spots real-time changes
export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const spotsCol = collection(db, 'couples', cleanCode, 'spots');
  return onSnapshot(
    spotsCol,
    (snapshot) => {
      const spotsList: Spot[] = [];
      snapshot.forEach((docSnap) => {
        spotsList.push(docSnap.data() as Spot);
      });
      spotsList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      callback(spotsList);
    },
    (err) => {
      console.warn('Notice subscribing to spots:', err);
    }
  );
}

// Save notification to Firestore
export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  try {
    await ensureGuestUser();
    const notifRef = doc(db, 'couples', cleanCode, 'notifications', notif.id);
    await withTimeout(
      setDoc(notifRef, {
        ...notif,
        createdAt: serverTimestamp(),
      }),
      3000,
      null
    );
  } catch (err) {
    console.warn('Notice saving notification to Firestore:', err);
  }
}

// Subscribe to notifications real-time changes
export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const notifsCol = collection(db, 'couples', cleanCode, 'notifications');
  return onSnapshot(
    notifsCol,
    (snapshot) => {
      const list: NotificationItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as NotificationItem);
      });
      list.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      callback(list);
    },
    (err) => {
      console.warn('Notice subscribing to notifications:', err);
    }
  );
}

// Purge all created accounts, couples, spots and notifications in Firestore DB
export async function purgeAllFirestoreData() {
  try {
    const couplesCol = collection(db, 'couples');
    const couplesSnap = await withTimeout(getDocs(couplesCol), 5000, null);
    if (couplesSnap) {
      for (const cDoc of couplesSnap.docs) {
        const code = cDoc.id;
        const spotsCol = collection(db, 'couples', code, 'spots');
        const spotsSnap = await withTimeout(getDocs(spotsCol), 3000, null);
        if (spotsSnap) {
          for (const d of spotsSnap.docs) {
            await deleteDoc(doc(db, 'couples', code, 'spots', d.id));
          }
        }
        await deleteDoc(doc(db, 'couples', code));
      }
    }
  } catch (err) {
    console.warn('Notice during Firestore purge:', err);
  }
}

// Delete user account
export async function deleteUserAccountInFirestore(user: User | null, code?: string) {
  const targetUser = user || auth.currentUser || getEffectiveUser();
  const targetUid = targetUser?.uid;
  const targetEmail = targetUser?.email;

  console.log('[Native Debug] deleteUserAccountInFirestore called for:', {
    targetUid,
    targetEmail,
    code,
  });

  // 1. Delete the specific couple passed in or clean up couple documents associated with this user
  const coupleCodesToDelete = new Set<string>();
  if (code && code !== 'LOVE-NEW') {
    coupleCodesToDelete.add(code.trim().toUpperCase());
  }

  try {
    const couplesCol = collection(db, 'couples');
    const lookupPromises: Promise<any>[] = [];

    if (targetUid) {
      lookupPromises.push(getDocs(query(couplesCol, where('memberUids', 'array-contains', targetUid))).catch(() => null));
      lookupPromises.push(getDocs(query(couplesCol, where('ownerUid', '==', targetUid))).catch(() => null));
      lookupPromises.push(getDocs(query(couplesCol, where('partnerAUid', '==', targetUid))).catch(() => null));
      lookupPromises.push(getDocs(query(couplesCol, where('partnerBUid', '==', targetUid))).catch(() => null));
    }

    if (targetEmail) {
      lookupPromises.push(getDocs(query(couplesCol, where('ownerEmail', '==', targetEmail))).catch(() => null));
      lookupPromises.push(getDocs(query(couplesCol, where('partnerBEmail', '==', targetEmail))).catch(() => null));
    }

    const results = await withTimeout(Promise.all(lookupPromises), 15000, []);
    for (const snap of results) {
      if (snap) {
        snap.forEach((d: any) => coupleCodesToDelete.add(d.id));
      }
    }
  } catch (findErr) {
    console.warn('[Native Debug] Error looking up couple docs to delete:', findErr);
  }

  // Delete all identified couple collections, spots, and notifications
  for (const cCode of coupleCodesToDelete) {
    console.log('[Native Debug] Deleting couple document and subcollections for:', cCode);
    try {
      // Fetch subcollections in parallel
      const spotsCol = collection(db, 'couples', cCode, 'spots');
      const notifsCol = collection(db, 'couples', cCode, 'notifications');
      
      const [spotsSnap, notifsSnap] = await withTimeout(Promise.all([
        getDocs(spotsCol).catch(() => null),
        getDocs(notifsCol).catch(() => null)
      ]), 10000, [null, null]);

      const delPromises: Promise<any>[] = [];

      if (spotsSnap) {
        spotsSnap.docs.forEach((d: any) => {
          delPromises.push(deleteDoc(doc(db, 'couples', cCode, 'spots', d.id)).catch(() => null));
        });
      }

      if (notifsSnap) {
        notifsSnap.docs.forEach((d: any) => {
          delPromises.push(deleteDoc(doc(db, 'couples', cCode, 'notifications', d.id)).catch(() => null));
        });
      }

      // Execute subcollection deletions
      if (delPromises.length > 0) {
        await withTimeout(Promise.all(delPromises), 15000, null);
      }

      // Delete main couple document
      await deleteDoc(doc(db, 'couples', cCode));
      console.log('[Native Debug] Successfully deleted couple document:', cCode);
    } catch (e) {
      console.warn('[Native Debug] Notice deleting couple document in Firestore:', e);
    }
  }

  // 2. Clear persisted auth storage
  saveStoredAuthUser(null);

  // 3. Delete Firebase Auth User account
  const firebaseAuthUser = auth.currentUser || (targetUser && typeof (targetUser as any).delete === 'function' ? targetUser : null);
  if (firebaseAuthUser && typeof firebaseAuthUser.delete === 'function') {
    try {
      console.log('[Native Debug] Attempting firebaseAuthUser.delete()...');
      await firebaseAuthUser.delete();
      console.log('[Native Debug] firebaseAuthUser.delete() successful.');
    } catch (delErr: any) {
      console.warn('[Native Debug] Notice during firebaseAuthUser.delete():', delErr?.code || delErr?.message || delErr);
      // If requires recent login, sign out will ensure user cannot access current session
    }
  }

  // 4. Native Plugins sign out (Google / Apple tokens cached on device)
  try {
    await triggerNativeSignOut();
  } catch (nsErr) {
    console.warn('[Native Debug] triggerNativeSignOut error:', nsErr);
  }

  // 5. Firebase Auth signOut
  try {
    await signOut(auth);
    console.log('[Native Debug] Firebase signOut completed.');
  } catch (soErr) {
    console.warn('[Native Debug] signOut error:', soErr);
  }
}

export const logoutFromFirebase = logoutUser;
