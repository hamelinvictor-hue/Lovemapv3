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

export async function serverGetCouple(code: string): Promise<CouplePair | null> {
  try {
    const url = getBackendApiUrl(`/api/couples/${encodeURIComponent(code)}`);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.couple || null;
  } catch {
    return null;
  }
}

export async function serverSaveCouple(code: string, couple: any): Promise<boolean> {
  try {
    const url = getBackendApiUrl(`/api/couples/${encodeURIComponent(code)}`);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(couple),
    });
    return true;
  } catch {
    return false;
  }
}

export async function serverJoinCouple(
  code: string,
  partnerName: string,
  avatarUrl?: string,
  userUid?: string,
  userEmail?: string
): Promise<CouplePair | null> {
  try {
    const url = getBackendApiUrl(`/api/couples/${encodeURIComponent(code)}/join`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerName, avatarUrl, userUid, userEmail }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.couple || null;
  } catch {
    return null;
  }
}

export async function restGetCoupleDoc(code: string): Promise<CouplePair | null> {
  // 1. Try Firestore REST directly
  try {
    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/couples/${encodeURIComponent(code)}?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return decodeFirestoreRestDoc(json) as CouplePair;
  } catch (e) {
    console.warn('[REST Firestore] restGetCoupleDoc error:', e);
    return null;
  }
}

export async function restSetCoupleDoc(code: string, data: Record<string, any>): Promise<CouplePair | null> {
  try {
    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const fields = Object.keys(data);
    const mask = fields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/couples/${encodeURIComponent(code)}?${mask}&key=${firebaseConfig.apiKey}`;

    const encodedFields: Record<string, any> = {};
    for (const f of fields) {
      if (data[f] !== undefined) {
        encodedFields[f] = encodeFirestoreRestValue(data[f]);
      }
    }

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodedFields })
    });

    if (!res.ok) return null;
    const json = await res.json();
    return decodeFirestoreRestDoc(json) as CouplePair;
  } catch (e) {
    console.warn('[REST Firestore] restSetCoupleDoc error:', e);
    return null;
  }
}

export async function restPatchCoupleDoc(code: string, data: Record<string, any>, fieldsToUpdate: string[]): Promise<CouplePair | null> {
  try {
    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const mask = fieldsToUpdate.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/couples/${encodeURIComponent(code)}?${mask}&key=${firebaseConfig.apiKey}`;
    
    const fields: Record<string, any> = {};
    for (const f of fieldsToUpdate) {
      if (data[f] !== undefined) {
        fields[f] = encodeFirestoreRestValue(data[f]);
      }
    }

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[REST Firestore] restPatchCoupleDoc HTTP fail:', res.status, errText);
      return null;
    }
    const json = await res.json();
    return decodeFirestoreRestDoc(json) as CouplePair;
  } catch (e) {
    console.warn('[REST Firestore] restPatchCoupleDoc exception:', e);
    return null;
  }
}

export async function restGetSpots(code: string): Promise<Spot[]> {
  try {
    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/couples/${encodeURIComponent(code)}/spots?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.documents) return [];
    return json.documents.map((doc: any) => decodeFirestoreRestDoc(doc) as Spot);
  } catch (e) {
    return [];
  }
}

export async function restGetNotifications(code: string): Promise<NotificationItem[]> {
  try {
    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/couples/${encodeURIComponent(code)}/notifications?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.documents) return [];
    return json.documents.map((doc: any) => decodeFirestoreRestDoc(doc) as NotificationItem);
  } catch (e) {
    return [];
  }
}

export async function restFindUserCouples(uid?: string, email?: string): Promise<CouplePair[]> {
  const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents:runQuery?key=${firebaseConfig.apiKey}`;
  const found: CouplePair[] = [];

  const runQueryFilter = async (fieldPath: string, op: string, val: string) => {
    try {
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'couples' }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op,
              value: { stringValue: val }
            }
          },
          limit: 5
        }
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const json = await res.json();
        for (const item of json) {
          if (item?.document) {
            const decoded = decodeFirestoreRestDoc(item.document) as CouplePair;
            if (decoded && decoded.code && decoded.code !== 'LOVE-NEW') {
              found.push(decoded);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[REST Firestore] runQueryFilter error for', fieldPath, e);
    }
  };

  const queries: Promise<void>[] = [];
  if (uid) {
    queries.push(runQueryFilter('memberUids', 'ARRAY_CONTAINS', uid));
    queries.push(runQueryFilter('ownerUid', 'EQUAL', uid));
    queries.push(runQueryFilter('partnerAUid', 'EQUAL', uid));
    queries.push(runQueryFilter('partnerBUid', 'EQUAL', uid));
  }
  if (email) {
    queries.push(runQueryFilter('ownerEmail', 'EQUAL', email));
    queries.push(runQueryFilter('partnerBEmail', 'EQUAL', email));
  }

  await withTimeout(Promise.all(queries), 4500, null);
  return found;
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

        console.log('[Native Debug] Creating Apple credential with idToken and rawNonce...');
        const credOptions: any = { idToken: nativeApple.identityToken };
        if (nativeApple.rawNonce) {
          credOptions.rawNonce = nativeApple.rawNonce;
        }
        const credential = appleProvider.credential(credOptions);
        console.log('[Native Debug] Calling signInWithCredential for Apple...');

        let user: User | null = null;
        try {
          // Fast timeout (2500ms): if Firebase Auth server or WebChannel is slow in WKWebView, immediately fall back to verified native Apple token
          const res = await withTimeout(signInWithCredential(auth, credential), 2500, null);
          if (res?.user) {
            user = res.user;
            console.log('[Native Debug] signInWithCredential Apple success:', user.uid);
          }
        } catch (authErr: any) {
          console.warn('[Native Debug] Firebase signInWithCredential notice for Apple:', authErr);
        }

        // Fast fallback to Apple Native verified identity from token payload
        if (!user) {
          console.log('[Native Debug] Using verified Apple Native session as authenticated user');
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
            updateProfile(user, { displayName: fullName }).catch(() => {});
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
          const res = await withTimeout(signInWithCredential(auth, credential), 2500, null);
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
        const saved = localStorage.getItem('lovemap_couple_data');
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
  serverSaveCouple(cleanCode, coupleWithCleanCode).catch(() => {});

  try {
    const user = await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);

    // 2. Fast check via REST/SDK
    let existingDoc: CouplePair | null = null;
    try {
      existingDoc = await withTimeout(restGetCoupleDoc(cleanCode), 2500, null);
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
      restSetCoupleDoc(cleanCode, {
        ...newRoom,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});

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

        restPatchCoupleDoc(cleanCode, {
          memberUids: updatedMembers,
          partnerAUid: partnerId === 'partner_a' ? user.uid : (data as any).partnerAUid || null,
          partnerBUid: partnerId === 'partner_b' ? user.uid : (data as any).partnerBUid || null,
          updatedAt: new Date().toISOString(),
        }, ['memberUids', 'partnerAUid', 'partnerBUid', 'updatedAt']).catch(() => {});

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
  };

  // Sync to high-availability server store immediately
  serverSaveCouple(code, newCouple).catch(() => {});

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

  // Direct REST write immediately
  restSetCoupleDoc(code, {
    ...coupleData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).catch(() => {});

  // Background non-blocking SDK write
  setDoc(coupleRef, coupleData).catch(() => {});

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

  // 0. Primary High-Availability Engine: Server Join (Instant, zero quota error)
  try {
    const serverJoined = await serverJoinCouple(
      code,
      partnerName,
      avatarUrl,
      user.uid,
      user.email || ''
    );
    if (serverJoined) {
      console.log('[joinCouple] Successfully paired via High-Availability Server Engine:', serverJoined.code);
      const cleanMatchedCode = serverJoined.code || rawClean;
      
      try {
        const coupleRef = doc(db, 'couples', cleanMatchedCode);
        setDoc(coupleRef, serverJoined, { merge: true }).catch(() => {});
      } catch {}

      // Ensure Firestore REST is updated for clients strictly polling Firestore
      const memberUids = (serverJoined as any).memberUids || [user.uid];
      restPatchCoupleDoc(cleanMatchedCode, {
        partnerB: serverJoined.partnerB,
        partnerBUid: user.uid,
        partnerBEmail: user.email || '',
        memberUids,
        isCodeUsed: true,
        updatedAt: new Date().toISOString(),
      }, ['partnerB', 'partnerBUid', 'partnerBEmail', 'memberUids', 'isCodeUsed', 'updatedAt']).catch(() => {});

      return serverJoined;
    }
  } catch (sErr) {
    console.warn('[joinCouple] Server join notice:', sErr);
  }

  const candidates = getCoupleCodeCandidates(code);
  let coupleRef: any = null;
  let snapData: any = null;
  let matchedDocId: string = candidates[0] || rawClean;

  // 1. Concurrent Lookup: Try SDK getDoc AND instant REST API fetch concurrently
  const restPromises = candidates.map(cand => restGetCoupleDoc(cand));
  const sdkPromises = candidates.map(cand => {
    const ref = doc(db, 'couples', cand);
    return getDoc(ref).then(s => ({ ref, s })).catch(() => null);
  });

  try {
    const [sdkResults, restResults] = await Promise.all([
      withTimeout(Promise.all(sdkPromises), 5000, null),
      withTimeout(Promise.all(restPromises), 5000, null),
    ]);

    // Check REST results first
    if (Array.isArray(restResults)) {
      for (const rDoc of restResults) {
        if (rDoc && rDoc.code && rDoc.code !== 'LOVE-NEW') {
          snapData = rDoc;
          matchedDocId = rDoc.code || (rDoc as any).id || matchedDocId;
          coupleRef = doc(db, 'couples', matchedDocId);
          break;
        }
      }
    }

    // Check SDK results if REST didn't already find it
    if (!snapData && Array.isArray(sdkResults)) {
      for (const res of sdkResults) {
        if (res && res.s && res.s.exists() && res.s.id !== 'LOVE-NEW') {
          coupleRef = res.ref;
          snapData = res.s.data();
          matchedDocId = res.s.id;
          break;
        }
      }
    }
  } catch (err) {
    console.warn('[joinCouple] Error during fast candidate lookup:', err);
  }

  // 2. Query path if direct lookup didn't match
  if (!snapData) {
    try {
      const qSnap = await withTimeout(
        getDocs(query(collection(db, 'couples'), where('code', 'in', candidates))),
        5000,
        null
      );
      if (qSnap && !qSnap.empty) {
        const found = qSnap.docs.find(d => d.id !== 'LOVE-NEW');
        if (found) {
          coupleRef = found.ref;
          snapData = found.data();
          matchedDocId = found.id;
        }
      }
    } catch (qErr) {
      console.warn('Targeted query for couple code notice:', qErr);
    }
  }

  if (!snapData) {
    throw new Error(`Code de couple "${code.trim().toUpperCase()}" introuvable. Vérifiez que votre partenaire vous a bien partagé son code (ex: LM-XXXX-XXXX).`);
  }

  const existingData = snapData as CouplePair & {
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
  
  if (user.email && (user.email === existingData.ownerEmail || user.email === existingData.partnerAEmail)) {
    const updatePayload = {
      partnerAUid: user.uid,
      memberUids,
      updatedAt: serverTimestamp(),
    };

    try {
      if (coupleRef) {
        await withTimeout(setDoc(coupleRef, updatePayload, { merge: true }), 4000, null);
      }
    } catch (e) {
      console.warn('[joinCouple] SDK setDoc partnerA notice, applying REST patch:', e);
    }
    await restPatchCoupleDoc(matchedDocId, {
      partnerAUid: user.uid,
      memberUids,
      updatedAt: new Date().toISOString(),
    }, ['partnerAUid', 'memberUids', 'updatedAt']);

    serverSaveCouple(matchedDocId, existingData).catch(() => {});
    return existingData;
  }

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

  const bUpdatePayload = {
    partnerB,
    partnerBUid: user.uid,
    partnerBEmail: user.email || '',
    memberUids,
    isCodeUsed: true,
    updatedAt: serverTimestamp(),
  };

  serverSaveCouple(matchedDocId, updatedCouple).catch(() => {});

  restPatchCoupleDoc(matchedDocId, {
    partnerB,
    partnerBUid: user.uid,
    partnerBEmail: user.email || '',
    memberUids,
    isCodeUsed: true,
    updatedAt: new Date().toISOString(),
  }, ['partnerB', 'partnerBUid', 'partnerBEmail', 'memberUids', 'isCodeUsed', 'updatedAt']).catch(() => {});

  if (coupleRef) {
    setDoc(coupleRef, bUpdatePayload, { merge: true }).catch((err) => {
      console.warn('[joinCouple] SDK setDoc async notice:', err);
    });
  }

  return updatedCouple;
}

// Search Firestore to automatically restore an existing user's couple room upon re-login
export async function findUserCoupleInFirestore(
  user: User
): Promise<{ couple: CouplePair; partnerId: PartnerId } | null> {
  if (!user || !user.uid) return null;

  // 1. Check high-availability server store first
  try {
    const sUrl = getBackendApiUrl(`/api/couples/find-user/${user.uid}?email=${encodeURIComponent(user.email || '')}`);
    const sRes = await fetch(sUrl);
    if (sRes.ok) {
      const sData = await sRes.json();
      if (sData?.couple) {
        return { couple: sData.couple as CouplePair, partnerId: sData.partnerId as PartnerId };
      }
    }
  } catch {}

  try {
    const couplesRef = collection(db, 'couples');
    
    const queries: Promise<any>[] = [
      getDocs(query(couplesRef, where('memberUids', 'array-contains', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('ownerUid', '==', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('partnerAUid', '==', user.uid))).catch(() => null),
      getDocs(query(couplesRef, where('partnerBUid', '==', user.uid))).catch(() => null),
    ];

    if (user.email) {
      queries.push(getDocs(query(couplesRef, where('ownerEmail', '==', user.email))).catch(() => null));
    }

    const restSearchPromise = restFindUserCouples(user.uid, user.email || undefined).catch(() => []);

    const [sdkResults, restCouples] = await Promise.all([
      withTimeout(Promise.all(queries), 5000, null),
      withTimeout(restSearchPromise, 5000, []),
    ]);

    if (Array.isArray(restCouples) && restCouples.length > 0) {
      const docData = restCouples[0];
      let partnerId: PartnerId = 'partner_a';
      if ((docData as any).partnerBUid === user.uid || (user.email && (docData as any).partnerBEmail === user.email)) {
        partnerId = 'partner_b';
      }
      return { couple: docData, partnerId };
    }

    if (sdkResults) {
      for (const snap of sdkResults) {
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
    }

    return null;
  } catch (err: any) {
    console.warn('Notice querying user couple from Firestore:', err);
    return null;
  }
}

// Update couple configuration (e.g. names, pin, anniversary)
export async function updateCoupleInFirestore(code: string, updated: CouplePair) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();

  // Sync to server store
  serverSaveCouple(cleanCode, updated).catch(() => {});

  const couplePayload = {
    anniversaryDate: updated.anniversaryDate || new Date().toISOString().split('T')[0],
    secretPin: updated.secretPin || '1234',
    isPinLocked: updated.isPinLocked || false,
    partnerA: updated.partnerA,
    partnerB: updated.partnerB,
    status: updated.status || 'active',
    brokenBy: updated.brokenBy || null,
  };

  restPatchCoupleDoc(cleanCode, couplePayload, Object.keys(couplePayload)).catch((err) => {
    console.warn('[updateCoupleInFirestore] REST patch notice:', err);
  });

  try {
    await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);
    await withTimeout(
      setDoc(
        coupleRef,
        cleanFirestoreData({
          ...couplePayload,
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

// Save device APNs / Push token for a partner in Firestore
export async function savePushTokenToFirestore(code: string, partnerId: PartnerId, token: string) {
  if (!code || !token) return;
  const cleanCode = code.trim().toUpperCase();
  const partnerKey = partnerId === 'partner_a' ? 'partnerA.pushToken' : 'partnerB.pushToken';
  
  // REST patch
  restPatchCoupleDoc(cleanCode, { [partnerKey]: token }, [partnerKey]).catch(() => {});

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
  restPatchCoupleDoc(cleanCode, brokenPayload, Object.keys(brokenPayload)).catch(console.warn);

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

// Subscribe to couple data real-time changes (Hybrid: SDK onSnapshot + fast REST polling fallback for iOS)
export function subscribeToCouple(code: string, callback: (couple: CouplePair | null) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  let isSubActive = true;
  let lastCoupleJson = '';

  const handleCoupleUpdate = (coupleData: CouplePair | null) => {
    if (!isSubActive || !coupleData) return;
    const currentJson = JSON.stringify({
      status: coupleData.status,
      brokenBy: coupleData.brokenBy,
      pA: coupleData.partnerA,
      pB: coupleData.partnerB,
      anniv: coupleData.anniversaryDate,
      pin: coupleData.secretPin,
      locked: coupleData.isPinLocked,
    });
    if (currentJson !== lastCoupleJson) {
      lastCoupleJson = currentJson;
      callback(coupleData);
    }
  };

  // 1. Immediate Server fetch for instant initial data
  restGetCoupleDoc(cleanCode).then((serverDoc) => {
    if (serverDoc && isSubActive) {
      handleCoupleUpdate(serverDoc);
    }
  }).catch(() => {});

  // 2. Standard Firestore onSnapshot listener
  const coupleRef = doc(db, 'couples', cleanCode);
  const unsubSnapshot = onSnapshot(coupleRef, (docSnap) => {
    if (docSnap.exists()) {
      handleCoupleUpdate(docSnap.data() as CouplePair);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Notice listening to couple:', err);
  });

  // 3. Fast Server / REST Polling Fallback to guarantee updates on iOS WKWebView
  // Interval polling removed to prevent Firebase quota / Rate Exceeded errors.
  // We rely exclusively on onSnapshot and visibilitychange events now.
  
  // 4. Also poll immediately when window / app regains focus or visibility
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && isSubActive) {
      restGetCoupleDoc(cleanCode).then((serverDoc) => {
        if (serverDoc && isSubActive) {
          handleCoupleUpdate(serverDoc);
        }
      }).catch(() => {});
    }
  };
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleVisibilityChange);

  return () => {
    isSubActive = false;

    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleVisibilityChange);
    try {
      unsubSnapshot();
    } catch {
      // Ignore
    }
  };
}

// Save spot to Firestore (Saves to both couple.spots array via REST and subcollection via SDK)
export async function saveSpotToFirestore(code: string, spot: Spot) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();

  // 0. High-availability Server Engine sync
  try {
    const sUrl = getBackendApiUrl(`/api/couples/${encodeURIComponent(cleanCode)}/spots`);
    fetch(sUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spot),
    }).catch(() => {});
  } catch {}

  // 1. Update spot in couple document spots array via instant REST API
  try {
    const existingCouple = await restGetCoupleDoc(cleanCode);
    const existingSpots: Spot[] = Array.isArray(existingCouple?.spots)
      ? [...existingCouple!.spots]
      : getStoredSpots();
    
    const index = existingSpots.findIndex(s => s.id === spot.id);
    if (index >= 0) {
      existingSpots[index] = spot;
    } else {
      existingSpots.unshift(spot);
    }

    restPatchCoupleDoc(cleanCode, { spots: existingSpots }, ['spots']).catch((e) => {
      console.warn('[saveSpotToFirestore] REST patch spots notice:', e);
    });
  } catch (err) {
    console.warn('[saveSpotToFirestore] REST spots sync error:', err);
  }

  // 2. Concurrently write to Firestore subcollection via SDK
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

// Delete spot from Firestore (Deletes from both couple.spots array and subcollection)
export async function deleteSpotFromFirestore(code: string, spotId: string) {
  if (!code || !spotId) return;
  const cleanCode = code.trim().toUpperCase();

  // 0. High-availability Server Engine sync
  try {
    const sUrl = getBackendApiUrl(`/api/couples/${encodeURIComponent(cleanCode)}/spots/${encodeURIComponent(spotId)}`);
    fetch(sUrl, { method: 'DELETE' }).catch(() => {});
  } catch {}

  // 1. Remove from couple document spots array via instant REST API
  try {
    const existingCouple = await restGetCoupleDoc(cleanCode);
    if (existingCouple && Array.isArray(existingCouple.spots)) {
      const remainingSpots = existingCouple.spots.filter(s => s.id !== spotId);
      restPatchCoupleDoc(cleanCode, { spots: remainingSpots }, ['spots']).catch(console.warn);
    }
  } catch (e) {
    console.warn('[deleteSpotFromFirestore] REST delete spot error:', e);
  }

  // 2. Delete from subcollection via SDK
  try {
    await ensureGuestUser();
    const spotRef = doc(db, 'couples', cleanCode, 'spots', spotId);
    await withTimeout(deleteDoc(spotRef), 3000, null);
  } catch (err) {
    console.warn('Notice deleting spot from Firestore:', err);
  }
}

// Subscribe to spots real-time changes (Hybrid: SDK onSnapshot + REST couple.spots polling for iOS)
export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  let isSubActive = true;
  let lastSpotsSignature = '';

  const handleSpotsUpdate = (spotsList: Spot[]) => {
    if (!isSubActive || !Array.isArray(spotsList)) return;
    const sorted = [...spotsList].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const signature = JSON.stringify(sorted.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      ratings: s.ratings,
      isSolo: s.isSolo,
      categoryId: s.categoryId,
      createdAt: s.createdAt,
    })));

    if (signature !== lastSpotsSignature) {
      lastSpotsSignature = signature;
      callback(sorted);
    }
  };

  // 1. Immediate REST check on mount
  restGetSpots(cleanCode).then((spots) => {
    if (isSubActive && spots.length > 0) {
      handleSpotsUpdate(spots);
    }
  }).catch(() => {});

  // 2. Standard SDK onSnapshot listener on subcollection
  const spotsCol = collection(db, 'couples', cleanCode, 'spots');
  const unsubSnapshot = onSnapshot(
    spotsCol,
    (snapshot) => {
      const spotsList: Spot[] = [];
      snapshot.forEach((docSnap) => {
        spotsList.push(docSnap.data() as Spot);
      });
      if (spotsList.length > 0) {
        handleSpotsUpdate(spotsList);
      }
    },
    (err) => {
      console.warn('Notice subscribing to spots:', err);
    }
  );

  // 3. Fast Server / REST Polling Fallback
  // Interval polling removed to prevent rate limits.
  
  // 4. Also poll immediately when window/app regains focus or visibility
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && isSubActive) {
      restGetSpots(cleanCode).then((spots) => {
        if (isSubActive && spots.length > 0) {
          handleSpotsUpdate(spots);
        }
      }).catch(() => {});
    }
  };
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleVisibilityChange);

  return () => {
    isSubActive = false;

    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleVisibilityChange);
    try {
      unsubSnapshot();
    } catch {
      // Ignore
    }
  };
}

// Save notification to Firestore (Saves to both couple.notifications array via REST and subcollection via SDK)
export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();

  // 0. High-availability Server Engine sync
  try {
    const sUrl = getBackendApiUrl(`/api/couples/${encodeURIComponent(cleanCode)}/notifications`);
    fetch(sUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notif),
    }).catch(() => {});
  } catch {}

  // 1. Update notification in couple document notifications array via instant REST API
  try {
    const existingCouple = await restGetCoupleDoc(cleanCode);
    const existingNotifs: NotificationItem[] = Array.isArray(existingCouple?.notifications)
      ? [...existingCouple!.notifications]
      : getStoredNotifications();

    const index = existingNotifs.findIndex(n => n.id === notif.id);
    if (index >= 0) {
      existingNotifs[index] = notif;
    } else {
      existingNotifs.unshift(notif);
    }
    // Keep max 50 recent notifications
    const trimmedNotifs = existingNotifs.slice(0, 50);

    restPatchCoupleDoc(cleanCode, { notifications: trimmedNotifs }, ['notifications']).catch(console.warn);
  } catch (err) {
    console.warn('[saveNotificationToFirestore] REST notifications sync error:', err);
  }

  // 2. Concurrently save to subcollection via SDK
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

  // 3. Dispatch external Push Notification to partner's device (Apple APNs / OneSignal)
  try {
    const pushEndpoint = getBackendApiUrl('/api/push/send');
    fetch(pushEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cleanCode,
        senderPartnerId: notif.senderId,
        title: notif.title,
        message: notif.message,
        spotId: notif.spotId,
        type: notif.type,
      }),
    }).catch((pushErr) => {
      console.warn('[saveNotificationToFirestore] Notice dispatching external push:', pushErr);
    });
  } catch (pushErr) {
    // Non-blocking
  }
}

// Subscribe to notifications real-time changes (Hybrid: SDK onSnapshot + REST couple.notifications polling for iOS)
export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  let isSubActive = true;
  let lastNotifsSignature = '';

  const handleNotifsUpdate = (notifsList: NotificationItem[]) => {
    if (!isSubActive || !Array.isArray(notifsList)) return;
    const sorted = [...notifsList].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    const signature = JSON.stringify(sorted.map(n => ({
      id: n.id,
      title: n.title,
      isRead: n.isRead,
      timestamp: n.timestamp,
    })));

    if (signature !== lastNotifsSignature) {
      lastNotifsSignature = signature;
      callback(sorted);
    }
  };

  // 1. Immediate REST check on mount
  restGetNotifications(cleanCode).then((notifs) => {
    if (isSubActive && notifs.length > 0) {
      handleNotifsUpdate(notifs);
    }
  }).catch(() => {});

  // 2. Standard SDK onSnapshot listener on subcollection
  const notifsCol = collection(db, 'couples', cleanCode, 'notifications');
  const unsubSnapshot = onSnapshot(
    notifsCol,
    (snapshot) => {
      const list: NotificationItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as NotificationItem);
      });
      if (list.length > 0) {
        handleNotifsUpdate(list);
      }
    },
    (err) => {
      console.warn('Notice subscribing to notifications:', err);
    }
  );

  // 3. Fast Server / REST Polling Fallback
  // Interval polling removed to prevent rate limits.
  
  // 4. Also poll immediately when window/app regains focus or visibility
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && isSubActive) {
      restGetNotifications(cleanCode).then((notifs) => {
        if (isSubActive && notifs.length > 0) {
          handleNotifsUpdate(notifs);
        }
      }).catch(() => {});
    }
  };
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleVisibilityChange);

  return () => {
    isSubActive = false;

    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleVisibilityChange);
    try {
      unsubSnapshot();
    } catch {
      // Ignore
    }
  };
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
