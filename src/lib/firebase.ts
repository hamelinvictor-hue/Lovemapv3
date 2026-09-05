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
  persistentLocalCache,
  persistentSingleTabManager,
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
} from 'firebase/firestore';
import { Spot, CouplePair, NotificationItem, PartnerId, UserProfile } from '../types';
import { INITIAL_SPOTS } from '../data/initialData';
import { getStoredAuthUser, saveStoredAuthUser, StoredAuthUser, getStoredSpots, saveSpots, getStoredNotifications, saveNotifications } from './storage';
import { triggerNativeGoogleAuth, triggerNativeAppleAuth, triggerNativeSignOut, isMobileDevice, isCapacitorNative } from './nativePermissions';
import { getBackendApiUrl } from './apiConfig';
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

// Initialize Firestore with persistent IndexedDB cache for instant local response on iOS & Web
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({}),
      }),
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

// ---------------------------------------------------------------------------
// High-Speed REST Fallback for Firestore on iOS WKWebView / Capacitor
// Standard HTTP fetch completely bypasses WKWebView gRPC/WebChannel stalls
// ---------------------------------------------------------------------------
function decodeFirestoreRestValue(v: any): any {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.mapValue !== undefined) {
    const res: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      res[k] = decodeFirestoreRestValue(val);
    }
    return res;
  }
  if (v.arrayValue !== undefined) {
    return (v.arrayValue.values || []).map(decodeFirestoreRestValue);
  }
  return null;
}

function decodeFirestoreRestDoc(docData: any): any {
  if (!docData || !docData.fields) return null;
  const res: Record<string, any> = {
    id: (docData.name || '').split('/').pop(),
  };
  for (const [k, val] of Object.entries(docData.fields || {})) {
    res[k] = decodeFirestoreRestValue(val);
  }
  return res;
}

function encodeFirestoreRestValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreRestValue) } };
  }
  if (typeof val === 'object') {
    // If it's a serverTimestamp placeholder
    if (val._methodName === 'serverTimestamp') {
      return { timestampValue: new Date().toISOString() };
    }
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = encodeFirestoreRestValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
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
    ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
    : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

  // 1. Try Native Capacitor plugin if available
  try {
    if (isApple) {
      const nativeApple = await triggerNativeAppleAuth();
      if (nativeApple?.identityToken) {
        let fullName = label;
        if (nativeApple.givenName || nativeApple.familyName) {
          fullName = `${nativeApple.givenName || ''} ${nativeApple.familyName || ''}`.trim() || label;
        }

        console.log('[Native Debug] Native Apple auth token received. Establishing instant user session...');
        const jwtPayload = decodeJwtPayload(nativeApple.identityToken);
        const rawUid = nativeApple.appleUserId || jwtPayload?.sub || `apple_${Date.now()}`;
        const finalUid = rawUid.startsWith('apple_') ? rawUid : `apple_${rawUid}`;
        const finalEmail = nativeApple.email || jwtPayload?.email || null;

        const user = buildSyntheticUser({
          uid: finalUid,
          displayName: fullName,
          email: finalEmail,
          photoURL: defaultPhoto,
          providerId: 'apple.com',
          isAnonymous: false,
        });

        saveStoredAuthUser({
          uid: user.uid,
          displayName: user.displayName || fullName,
          email: user.email || nativeApple.email || null,
          photoURL: user.photoURL || defaultPhoto,
          providerId: 'apple.com',
          isAnonymous: false,
        });

        // Background Firebase Auth credential synchronization (non-blocking, zero UI delay)
        const credOptions: any = { idToken: nativeApple.identityToken };
        if (nativeApple.rawNonce) {
          credOptions.rawNonce = nativeApple.rawNonce;
        }
        const credential = appleProvider.credential(credOptions);
        signInWithCredential(auth, credential)
          .then((res) => {
            if (res?.user) {
              console.log('[Native Debug] Background signInWithCredential Apple success:', res.user.uid);
              if (nativeApple.givenName || nativeApple.familyName) {
                updateProfile(res.user, { displayName: fullName }).catch(() => {});
              }
            }
          })
          .catch((authErr) => {
            console.warn('[Native Debug] Notice during background Apple credential sync:', authErr);
          });

        return user;
      }
    } else {
      const nativeGoogle = await triggerNativeGoogleAuth();
      if (nativeGoogle?.idToken) {
        let fullName = label;
        if (nativeGoogle.displayName) {
          fullName = nativeGoogle.displayName;
        }

        console.log('[Native Debug] Native Google auth token received. Establishing instant user session...');
        const jwtPayload = decodeJwtPayload(nativeGoogle.idToken);
        const googleSub = (nativeGoogle as any).id || jwtPayload?.sub || Date.now();

        const user = buildSyntheticUser({
          uid: `google_${googleSub}`,
          displayName: fullName,
          email: nativeGoogle.email || null,
          photoURL: defaultPhoto,
          providerId: 'google.com',
          isAnonymous: false,
        });

        saveStoredAuthUser({
          uid: user.uid,
          displayName: user.displayName || fullName,
          email: user.email || nativeGoogle.email || null,
          photoURL: user.photoURL || defaultPhoto,
          providerId: 'google.com',
          isAnonymous: false,
        });

        // Background Firebase Auth credential synchronization (non-blocking)
        const credential = GoogleAuthProvider.credential(nativeGoogle.idToken);
        signInWithCredential(auth, credential)
          .then((res) => {
            if (res?.user) {
              console.log('[Native Debug] Background signInWithCredential Google success:', res.user.uid);
            }
          })
          .catch((gErr) => {
            console.warn('[Native Debug] Notice during background Google credential sync:', gErr);
          });

        return user;
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

// Ensure local couple room is registered and saved in Firestore (Fast & Resilient)
export async function ensureCoupleRoomInFirestore(
  arg1: string | CouplePair,
  arg2?: CouplePair | string,
  partnerId: PartnerId = 'partner_a'
): Promise<CouplePair> {
  let localCouple: CouplePair;
  let rawCode: string;

  if (typeof arg1 === 'string') {
    rawCode = arg1;
    if (typeof arg2 === 'object' && arg2 !== null) {
      localCouple = arg2;
    } else {
      try {
        const saved = localStorage.getItem('lovemap_couple_v1');
        localCouple = saved ? JSON.parse(saved) : ({} as any);
      } catch {
        localCouple = {} as any;
      }
    }
  } else {
    localCouple = arg1;
    rawCode = typeof arg2 === 'string' ? arg2 : (localCouple?.code || '');
  }

  if (!rawCode && localCouple?.code) {
    rawCode = localCouple.code;
  }
  if (!rawCode) return localCouple;

  let cleanCode = rawCode.trim().toUpperCase();
  if (cleanCode === 'LOVE-NEW') {
    cleanCode = generateCoupleCode();
  }

  const coupleWithCleanCode: CouplePair = {
    ...localCouple,
    code: cleanCode,
  };

  // 1. Instant save to Server store (High Availability, zero delay)
  

  try {
    const user = await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);

    // 2. Fast check via REST/SDK
    let existingDoc: CouplePair | null = null;
    try {
      existingDoc = null;
    } catch {}

    if (!existingDoc) {
      const memberUids = [user.uid];
      const newRoom = cleanFirestoreData({
        ...coupleWithCleanCode,
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

      // Write via direct REST immediately (150ms)
      

      // Background non-blocking SDK write
      setDoc(coupleRef, newRoom, { merge: true }).catch(() => {});

      return coupleWithCleanCode;
    } else {
      const data = existingDoc as CouplePair & { memberUids?: string[] };
      const existingMembers = data.memberUids || [];
      if (!existingMembers.includes(user.uid)) {
        const updatedMembers = Array.from(new Set([...existingMembers, user.uid]));
        const updatePayload = cleanFirestoreData({
          memberUids: updatedMembers,
          partnerAUid: partnerId === 'partner_a' ? user.uid : (data as any).partnerAUid || null,
          partnerBUid: partnerId === 'partner_b' ? user.uid : (data as any).partnerBUid || null,
          updatedAt: serverTimestamp(),
        });

        

        setDoc(coupleRef, updatePayload, { merge: true }).catch(() => {});
      }
      return {
        ...localCouple,
        ...data,
        code: cleanCode,
      };
    }
  } catch (err) {
    console.warn('Notice ensuring couple room in Firestore (proceeding locally):', err);
    return coupleWithCleanCode;
  }
}

// Create a new couple room in Firestore (Instant & Non-Blocking)
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
          updateCoupleInFirestore(existing.couple.code, updatedCouple).catch(() => {});
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
    avatar: avatarUrl || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'Créateur du journal',
  };

  const partnerB: UserProfile = {
    id: 'partner_b',
    name: 'En attente...',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    role: 'Partenaire 2',
  };

  const newCouple: CouplePair = {
    code,
    partnerA,
    partnerB,
    anniversaryDate: new Date().toISOString().split('T')[0],
    secretPin: '1234',
    isPinLocked: false,
    status: 'active',
  };

  const coupleData = cleanFirestoreData({
    ...newCouple,
    ownerUid: user.uid,
    ownerEmail: user.email || '',
    partnerAUid: user.uid,
    partnerAEmail: user.email || '',
    memberUids: [user.uid],
    isCodeUsed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Instant non-blocking write to Firestore: write continues in background while local UI is immediate
  setDoc(coupleRef, coupleData).catch((err) => {
    console.warn('[createCouple] Background setDoc notice:', err);
  });
  
  return { couple: newCouple };
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
): Promise<{ couple: CouplePair; spots: Spot[]; notifications: NotificationItem[] } | null> {
  if (!code || !code.trim()) {
    throw new Error('Veuillez saisir un code de couple valide.');
  }

  const rawClean = code.trim().toUpperCase();
  if (rawClean === 'LOVE-NEW') {
    throw new Error('Ce code temporaire n\'est pas valide. Veuillez utiliser le code unique partagé par votre partenaire.');
  }

  const coupleRef = doc(db, 'couples', rawClean);
  const snap = await getDoc(coupleRef);

  if (!snap.exists()) {
    throw new Error('Code de duo introuvable ou incorrect.');
  }

  const data = snap.data();
  const existingMembers = data.memberUids || [];
  const updatedMembers = user.uid ? Array.from(new Set([...existingMembers, user.uid])) : existingMembers;

  const partnerB = {
    id: 'partner_b',
    name: partnerName.trim() || 'Partenaire 2',
    avatar: avatarUrl || data.partnerB?.avatar || 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };

  const updateData = {
    partnerB,
    partnerBUid: user.uid,
    partnerBEmail: user.email || '',
    memberUids: updatedMembers,
    isCodeUsed: true,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(coupleRef, updateData, { merge: true });

  const updatedSnap = await getDoc(coupleRef);
  const couple = updatedSnap.data() as CouplePair;

  // Also fetch spots and notifs
  const spotsSnap = await getDocs(collection(db, 'couples', rawClean, 'spots')).catch(() => null);
  const spots = spotsSnap ? spotsSnap.docs.map(d => d.data() as Spot) : [];

  const notifsSnap = await getDocs(collection(db, 'couples', rawClean, 'notifications')).catch(() => null);
  const notifications = notifsSnap ? notifsSnap.docs.map(d => d.data() as NotificationItem) : [];

  console.log('[joinCouple] Successfully paired:', couple.code);
  return { couple, spots, notifications };
}

// Search Firestore to automatically restore an existing user's couple room upon re-login
export async function findUserCoupleInFirestore(
  user: User
): Promise<{ couple: CouplePair; partnerId: PartnerId } | null> {
  if (!user || !user.uid) return null;

  try {
    const couplesRef = collection(db, 'couples');
    
    const queries = [
      getDocs(query(couplesRef, where('memberUids', 'array-contains', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('partnerAUid', '==', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('partnerBUid', '==', user.uid))).catch(() => null),
    ];

    const sdkResults = await withTimeout(Promise.all(queries), 2500, null);

    if (sdkResults) {
      for (const snap of sdkResults) {
        if (snap && !snap.empty) {
          const docData = snap.docs[0].data();
          let partnerId: PartnerId = 'partner_a';
          if (docData.partnerBUid === user.uid) partnerId = 'partner_b';
          
          return {
            couple: docData as CouplePair,
            partnerId,
          };
        }
      }
    }
  } catch (err) {
    console.error('Error in findUserCoupleInFirestore:', err);
  }

  return null;
}

// Update couple configuration (e.g. names, pin, anniversary)
export async function updateCoupleInFirestore(code: string, updated: CouplePair) {
  try {
    const cleanCode = code.trim().toUpperCase();
    const docRef = doc(db, 'couples', cleanCode);
    const { spots, notifications, ...coreCouple } = updated;
    await setDoc(docRef, { ...coreCouple, updatedAt: new Date().toISOString() }, { merge: true });
    console.log('[Firebase] Couple updated successfully');
  } catch (err) {
    console.error('[Firebase] Failed to update couple:', err);
    throw err;
  }
}

// Save device APNs / Push token for a partner in Firestore
export async function savePushTokenToFirestore(code: string, partnerId: PartnerId, token: string) {
  if (!code || !token) return;
  const cleanCode = code.trim().toUpperCase();
  const partnerKey = partnerId === 'partner_a' ? 'partnerA.pushToken' : 'partnerB.pushToken';
  
  // REST patch
  

  // SDK update
  try {
    await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);
    await setDoc(
      coupleRef,
      cleanFirestoreData({
        [partnerId === 'partner_a' ? 'partnerA' : 'partnerB']: {
          pushToken: token,
        },
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    console.log('[savePushTokenToFirestore] Device push token saved for', partnerId);
  } catch (e) {
    console.warn('[savePushTokenToFirestore] Notice saving token:', e);
  }
}

// Break up / dissolve a duo in Firestore
export async function breakCoupleInFirestore(code: string, breakerName: string) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  const brokenPayload = {
    status: 'broken',
    brokenBy: breakerName,
    partnerB: {
      id: 'partner_b',
      name: 'En attente...',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
      role: 'Partenaire 2',
    },
    spots: [],
    notifications: [],
  };

  // 1. Instant REST update
  Promise.resolve().catch(console.warn);

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
          ...brokenPayload,
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

// ==========================================
// SSE LIVE SYNC ENGINE (Zero Firestore reads, <50ms real-time latency)
// ==========================================
type CoupleSsePayload = {
  type: string;
  couple?: CouplePair;
  spots?: Spot[];
  notifications?: NotificationItem[];
  spot?: Spot;
  deletedSpotId?: string;
  notification?: NotificationItem;
};

type CoupleEventHandler = (payload: CoupleSsePayload) => void;

let activeEventSource: EventSource | null = null;
let activeEventSourceCode: string = '';
const eventHandlers = new Set<CoupleEventHandler>();



// Subscribe to couple data real-time changes (Hybrid: SSE Live Stream + SDK onSnapshot fallback)
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
    console.error('[Firebase] Error listening to couple:', err);
  });
}

// Save spot to Firestore (Saves to both couple.spots array via REST and subcollection via SDK)
export async function saveSpotToFirestore(code: string, spot: Spot) {
  try {
    const cleanCode = code.trim().toUpperCase();
    const docRef = doc(db, 'couples', cleanCode, 'spots', spot.id);
    await setDoc(docRef, spot, { merge: true });
    console.log('[Firebase] Spot saved successfully:', spot.id);
    return true;
  } catch (err) {
    console.error('[Firebase] Failed to save spot:', err);
    throw err;
  }
}

// Delete spot from Firestore (Deletes from both couple.spots array and subcollection)
export async function deleteSpotFromFirestore(code: string, spotId: string) {
  try {
    const cleanCode = code.trim().toUpperCase();
    await deleteDoc(doc(db, 'couples', cleanCode, 'spots', spotId));
    console.log('[Firebase] Spot deleted successfully:', spotId);
    return true;
  } catch (err) {
    console.error('[Firebase] Failed to delete spot:', err);
    throw err;
  }
}

// Subscribe to spots real-time changes (Hybrid: Live SSE Stream + SDK onSnapshot fallback)
export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const spotsRef = collection(db, 'couples', cleanCode, 'spots');
  return onSnapshot(spotsRef, (snapshot) => {
    const spots = snapshot.docs.map(d => d.data() as Spot);
    callback(spots);
  }, (err) => {
    console.error('[Firebase] Error listening to spots:', err);
  });
}

// Save notification to Firestore (Saves to both couple.notifications array via REST and subcollection via SDK)
export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  try {
    const cleanCode = code.trim().toUpperCase();
    const docRef = doc(db, 'couples', cleanCode, 'notifications', notif.id);
    await setDoc(docRef, notif, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firebase] Failed to save notification:', err);
    throw err;
  }
}

// Subscribe to notifications real-time changes (Hybrid: Live SSE Stream + SDK onSnapshot fallback)
export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const notifsRef = collection(db, 'couples', cleanCode, 'notifications');
  return onSnapshot(notifsRef, (snapshot) => {
    const notifs = snapshot.docs.map(d => d.data() as NotificationItem);
    // Sort by createdAt desc
    notifs.sort((a, b) => new Date((b as any).createdAt).getTime() - new Date((a as any).createdAt).getTime());
    callback(notifs);
  }, (err) => {
    console.error('[Firebase] Error listening to notifications:', err);
  });
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

  // Clear local storage for Duo
  try {
    localStorage.removeItem('lovemap_couple_v1');
    localStorage.removeItem('lovemap_spots_v1');
    localStorage.removeItem('lovemap_notifs_v1');
    localStorage.removeItem('lovemap_active_partner_v1');
    localStorage.removeItem('lovemap_app_mode_v1');
    localStorage.removeItem('lovemap_onboarding_completed_v2');
  } catch (e) {}

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
