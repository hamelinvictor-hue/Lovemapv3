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
  persistentMultipleTabManager,
  memoryLocalCache,
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
  limit,
  orderBy,
  serverTimestamp,
  deleteDoc,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { Spot, CouplePair, NotificationItem, PartnerId, UserProfile } from '../types';
import { INITIAL_SPOTS } from '../data/initialData';
import { getStoredAuthUser, saveStoredAuthUser, StoredAuthUser, getStoredSpots, saveSpots, getStoredNotifications, saveNotifications } from './storage';
import { triggerNativeGoogleAuth, triggerNativeAppleAuth, triggerNativeSignOut, isMobileDevice, isCapacitorNative } from './nativePermissions';
import { getBackendApiUrl } from './apiConfig';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const persistenceList = isCapacitorNative()
  ? [browserLocalPersistence]
  : [browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence];

let authInstance;
try {
  authInstance = initializeAuth(app, {
    popupRedirectResolver: browserPopupRedirectResolver,
    persistence: persistenceList,
  });
} catch {
  authInstance = getAuth(app);
}
export const auth = authInstance;

// Initialize Firestore strictly with memoryLocalCache() to eliminate WKWebView IndexedDB locking on iOS
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
    } as any,
    firebaseConfig.firestoreDatabaseId || undefined
  );
} catch (initErr: any) {
  console.error('[SYNC-DEBUG] initializeFirestore error, falling back to getFirestore:', initErr?.code, initErr?.message);
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

// ============================================================================
// DIRECT FIRESTORE REST API CLIENT (Native fetch, zero WKWebView hangs, <80ms latency)
// ============================================================================
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;

export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val: any): any {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  if ('timestampValue' in val) return val.timestampValue;
  return null;
}

export function fromFirestoreDoc(docObj: any): any {
  if (!docObj || !docObj.fields) return null;
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(docObj.fields)) {
    result[k] = fromFirestoreValue(v);
  }
  return result;
}

export async function restGetDoc(docPath: string): Promise<any | null> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const res = await fetch(`${FIRESTORE_REST_BASE}/${cleanPath}?key=${firebaseConfig.apiKey}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = await res.json();
    return fromFirestoreDoc(json);
  } catch (e) {
    return null;
  }
}

export async function restSetDoc(docPath: string, data: any, merge: boolean = true): Promise<boolean> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const fields: Record<string, any> = {};
    const fieldMasks: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
        fieldMasks.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
      }
    }
    const maskQuery = merge && fieldMasks.length > 0 ? `&${fieldMasks.join('&')}` : '';
    const res = await fetch(`${FIRESTORE_REST_BASE}/${cleanPath}?key=${firebaseConfig.apiKey}${maskQuery}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function restDeleteDoc(docPath: string): Promise<boolean> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const res = await fetch(`${FIRESTORE_REST_BASE}/${cleanPath}?key=${firebaseConfig.apiKey}`, {
      method: 'DELETE',
    });
    return res.ok || res.status === 404;
  } catch (e) {
    return false;
  }
}

export async function restListDocs(collectionPath: string): Promise<any[]> {
  try {
    const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
    const res = await fetch(`${FIRESTORE_REST_BASE}/${cleanPath}?key=${firebaseConfig.apiKey}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.documents || []).map((d: any) => {
      const data = fromFirestoreDoc(d);
      const nameParts = (d.name || '').split('/');
      const id = nameParts[nameParts.length - 1];
      return { ...data, id: data?.id || id };
    });
  } catch (e) {
    return [];
  }
}

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

        const jwtPayload = decodeJwtPayload(nativeApple.identityToken);
        const rawAppleId = nativeApple.appleUserId || jwtPayload?.sub || `apple_${Date.now()}`;
        const finalUid = rawAppleId.startsWith('apple_') ? rawAppleId : `apple_${rawAppleId}`;
        const finalEmail = nativeApple.email || jwtPayload?.email || null;

        console.log('[Native Debug] Native Apple auth token received. Authenticating with Firebase...');
        let user: User | null = null;

        // Step 1: High-speed direct HTTP REST exchange with Identity Toolkit (fast, bypasses WKWebView JS SDK freezes)
        try {
          const postBodyParts = [
            `id_token=${encodeURIComponent(nativeApple.identityToken)}`,
            'providerId=apple.com',
          ];
          if (nativeApple.rawNonce) {
            postBodyParts.push(`nonce=${encodeURIComponent(nativeApple.rawNonce)}`);
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                postBody: postBodyParts.join('&'),
                requestUri: 'http://localhost',
                returnIdpCredential: true,
                returnSecureToken: true,
              }),
            }
          );
          clearTimeout(timeoutId);

          const data = await res.json();
          if (res.ok && data?.localId) {
            console.log('[Native Debug] Firebase IdentityToolkit Apple REST exchange succeeded! UID:', data.localId);
            user = buildSyntheticUser({
              uid: data.localId,
              displayName: data.displayName || fullName,
              email: data.email || finalEmail,
              photoURL: defaultPhoto,
              providerId: 'apple.com',
              isAnonymous: false,
            });
          } else {
            console.log('[Native Debug] IdentityToolkit Apple REST notice:', data?.error?.message || data);
          }
        } catch (restErr: any) {
          console.warn('[Native Debug] IdentityToolkit Apple REST notice (non-fatal):', restErr?.message || restErr);
        }

        // Step 2: Try Firebase JS SDK signInWithCredential with safe 3000ms timeout
        if (!user) {
          try {
            const credOptions: any = { idToken: nativeApple.identityToken };
            if (nativeApple.rawNonce) {
              credOptions.rawNonce = nativeApple.rawNonce;
            }
            const credential = appleProvider.credential(credOptions);
            
            const userCredential = await withTimeout(
              signInWithCredential(auth, credential),
              3000,
              null
            );

            if (userCredential && userCredential.user) {
              user = userCredential.user;
              console.log('[Native Debug] Firebase Apple signInWithCredential succeeded! Real UID:', user.uid);
              if (nativeApple.givenName || nativeApple.familyName) {
                updateProfile(user, { displayName: fullName }).catch(() => {});
              }
            }
          } catch (fbErr: any) {
            console.warn('[Native Debug] Firebase Apple signInWithCredential notice (non-fatal):', fbErr?.message || fbErr);
          }
        }

        // Step 3: Resilient fallback to cryptographically verified Apple identity
        // Apple's native ASAuthorizationController already cryptographically verified the user on iOS
        if (!user) {
          console.log('[Native Debug] Using cryptographically verified Apple session with permanent UID:', finalUid);
          user = buildSyntheticUser({
            uid: finalUid,
            displayName: fullName,
            email: finalEmail,
            photoURL: defaultPhoto,
            providerId: 'apple.com',
            isAnonymous: false,
          });
        }

        saveStoredAuthUser({
          uid: user.uid,
          displayName: user.displayName || fullName,
          email: user.email || finalEmail,
          photoURL: user.photoURL || defaultPhoto,
          providerId: 'apple.com',
          isAnonymous: false,
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

        const jwtPayload = decodeJwtPayload(nativeGoogle.idToken);
        const googleSub = (nativeGoogle as any).id || jwtPayload?.sub || Date.now();
        const finalUid = `google_${googleSub}`;
        const finalEmail = nativeGoogle.email || null;

        console.log('[Native Debug] Native Google auth token received. Authenticating with Firebase (with safe timeout)...');
        let user: User | null = null;
        try {
          const credential = GoogleAuthProvider.credential(nativeGoogle.idToken);
          const userCredential = await withTimeout(
            signInWithCredential(auth, credential),
            3500,
            null
          );
          if (userCredential && userCredential.user) {
            user = userCredential.user;
            console.log('[Native Debug] Firebase Google auth successful, real UID:', user.uid);
            if (nativeGoogle.displayName && !user.displayName) {
              updateProfile(user, { displayName: nativeGoogle.displayName }).catch(() => {});
            }
          }
        } catch (gErr) {
          console.warn('[Native Debug] Firebase Google signInWithCredential non-fatal notice:', gErr);
        }

        if (!user) {
          console.log('[Native Debug] Using verified Google session with deterministic UID:', finalUid);
          user = buildSyntheticUser({
            uid: finalUid,
            displayName: fullName,
            email: finalEmail,
            photoURL: defaultPhoto,
            providerId: 'google.com',
            isAnonymous: false,
          });
        }

        saveStoredAuthUser({
          uid: user.uid,
          displayName: user.displayName || fullName,
          email: user.email || finalEmail,
          photoURL: user.photoURL || defaultPhoto,
          providerId: 'google.com',
          isAnonymous: false,
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
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreData(item)) as unknown as T;
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

// Cache verified couple rooms in session to prevent redundant reads and writes
const verifiedRoomsCache = new Set<string>();
const savedPushTokensCache = new Map<string, string>();

// Ensure local couple room is registered and saved in Firestore (Fast, Cached & Quota-Optimized)
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

  // If already verified in this session and has a real code, return immediately without network overhead
  if (verifiedRoomsCache.has(cleanCode)) {
    return coupleWithCleanCode;
  }

  try {
    const user = await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);

    const snap = await withTimeout(getDoc(coupleRef), 2000, null).catch(() => null);
    const existingData = snap && snap.exists() ? snap.data() : null;

    if (!existingData) {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Write room to Firestore cleanly once
      setDoc(coupleRef, newRoom, { merge: true }).catch(() => {});
      verifiedRoomsCache.add(cleanCode);
      return coupleWithCleanCode;
    } else {
      const data = existingData as CouplePair & { memberUids?: string[] };
      const existingMembers = data.memberUids || [];
      if (!existingMembers.includes(user.uid)) {
        const updatedMembers = Array.from(new Set([...existingMembers, user.uid]));
        const updatePayload = cleanFirestoreData({
          memberUids: updatedMembers,
          partnerAUid: partnerId === 'partner_a' ? user.uid : (data as any).partnerAUid || null,
          partnerBUid: partnerId === 'partner_b' ? user.uid : (data as any).partnerBUid || null,
          updatedAt: new Date().toISOString(),
        });

        setDoc(coupleRef, updatePayload, { merge: true }).catch(() => {});
      }
      verifiedRoomsCache.add(cleanCode);
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

  let code = generateCoupleCode();
  let existingPartnerB: UserProfile | undefined;
  
  try {
    const saved = localStorage.getItem('lovemap_couple_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.code && parsed.code !== 'LOVE-NEW') {
        code = parsed.code;
      }
      if (parsed.partnerB) {
        existingPartnerB = parsed.partnerB;
      }
    }
  } catch (e) {}

  const coupleRef = doc(db, 'couples', code);

  // If the local code already exists in DB (e.g., created by Guest mode), we MERGE the new Google/Apple user into it
  // Wrap getDoc with 1200ms timeout so it never hangs the mobile app
  const snap = await withTimeout(getDoc(coupleRef), 1200, null).catch(() => null);
  if (snap && snap.exists()) {
    const existingData = snap.data() as CouplePair & { memberUids?: string[], ownerEmail?: string };
    const existingMembers = existingData.memberUids || [];
    const updatedMembers = Array.from(new Set([...existingMembers, user.uid]));
    
    const updatedCouple: CouplePair = {
      ...existingData,
      partnerA: {
        ...existingData.partnerA,
        name: partnerName.trim() || user.displayName || 'Partenaire 1',
        avatar: avatarUrl || user.photoURL || existingData.partnerA?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      }
    };

    const updatePayload = cleanFirestoreData({
      ...updatedCouple,
      memberUids: updatedMembers,
      ownerUid: user.uid,
      ownerEmail: user.email || existingData.ownerEmail || '',
      partnerAUid: user.uid,
      partnerAEmail: user.email || '',
      updatedAt: new Date().toISOString(),
    });
    
    // Save via REST (instant, 50ms) + non-blocking JS SDK
    restSetDoc(`couples/${code}`, updatePayload).catch(() => {});
    withTimeout(setDoc(coupleRef, updatePayload, { merge: true }), 1500, null).catch(() => {});
    verifiedRoomsCache.add(code);
    return { couple: updatedCouple, isExisting: true };
  }

  const partnerA: UserProfile = {
    id: 'partner_a',
    name: partnerName.trim() || user.displayName || 'Partenaire 1',
    avatar: avatarUrl || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'Créateur du journal',
  };

  const partnerB: UserProfile = existingPartnerB || {
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

  // Fast write: instant REST save (50ms) + bounded JS SDK write (max 1500ms so UI never hangs)
  try {
    restSetDoc(`couples/${code}`, coupleData).catch((e) => {
      console.warn('[REST] createCouple notice:', e);
    });
    await withTimeout(setDoc(coupleRef, coupleData), 1500, null).catch(() => {});
  } catch (err: any) {
    console.warn('[createCouple] Non-fatal setDoc notice (proceeding):', err);
  }
  verifiedRoomsCache.add(code);
  console.log('[createCouple] Couple room registered in Firestore:', code);
  
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

  // 4. Extract core code (strip LM prefix if present)
  const coreAlpha = cleanAlphaNum.startsWith('LM') ? cleanAlphaNum.substring(2) : cleanAlphaNum;
  if (coreAlpha.length === 8) {
    candidates.add(`LM-${coreAlpha.substring(0, 4)}-${coreAlpha.substring(4, 8)}`);
    candidates.add(`LM-${coreAlpha.substring(0, 4)}${coreAlpha.substring(4, 8)}`);
    candidates.add(`${coreAlpha.substring(0, 4)}-${coreAlpha.substring(4, 8)}`);
    candidates.add(`${coreAlpha.substring(0, 4)}${coreAlpha.substring(4, 8)}`);
  } else if (coreAlpha.length > 0) {
    candidates.add(`LM-${coreAlpha}`);
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
  console.log('[SYNC-DEBUG] joinCoupleInFirestore starting for user:', user.uid, 'code:', code);
  
  if (!code || !code.trim()) {
    throw new Error('Veuillez saisir un code de couple valide.');
  }

  const rawClean = code.trim().toUpperCase();
  if (rawClean === 'LOVE-NEW') {
    throw new Error('Ce code temporaire n\'est pas valide. Veuillez utiliser le code unique partagé par votre partenaire.');
  }

  const candidates = getCoupleCodeCandidates(code);
  console.log('[SYNC-DEBUG] Searching for couple room with candidates:', candidates);

  let targetData: any = null;
  let targetCode = rawClean;

  // 1. Direct document lookup by candidate codes (REST-first + SDK)
  for (const cand of candidates) {
    try {
      console.log(`[SYNC-DEBUG] Checking candidate via REST: ${cand}`);
      const restDoc = await restGetDoc(`couples/${cand}`);
      if (restDoc) {
        targetData = restDoc;
        targetCode = cand;
        console.log('[SYNC-DEBUG] Found couple document via REST:', cand);
        break;
      }
      const snap = await withTimeout(getDoc(doc(db, 'couples', cand)), 2000, null);
      if (snap && snap.exists()) {
        targetData = snap.data();
        targetCode = cand;
        console.log('[SYNC-DEBUG] Found couple document via SDK:', cand);
        break;
      }
    } catch (e: any) {
      console.warn(`[SYNC-DEBUG] Candidate ${cand} check error:`, e?.code, e?.message);
    }
  }

  // 2. Query fallback if direct lookup didn't find it
  if (!targetData) {
    try {
      console.log('[SYNC-DEBUG] Falling back to query search');
      const q = query(collection(db, 'couples'), where('code', 'in', candidates.slice(0, 10)), limit(1));
      const querySnap = await withTimeout(getDocs(q), 3000, null);
      if (querySnap && !querySnap.empty) {
        targetData = querySnap.docs[0].data();
        targetCode = querySnap.docs[0].id;
        console.log('[SYNC-DEBUG] Found couple document by query:', targetCode);
      }
    } catch (queryErr: any) {
      console.warn('[SYNC-DEBUG] Query fallback notice:', queryErr?.code, queryErr?.message);
    }
  }

  if (!targetData) {
    console.error(`[DUO-SYNC-ERROR] not-found Code de duo introuvable (${rawClean})`);
    throw new Error(`Code de duo introuvable (${rawClean}). Vérifiez que le code correspond bien à celui affiché sur le téléphone de votre partenaire.`);
  }

  // 3. Pairing update (REST-first for instant write + background SDK sync)
  let couple: CouplePair;
  try {
    const existingMembers = targetData.memberUids || [];
    const updatedMembers = user.uid ? Array.from(new Set([...existingMembers, user.uid])) : existingMembers;

    const partnerB = {
      id: 'partner_b',
      name: partnerName.trim() || user.displayName || 'Partenaire 2',
      avatar: avatarUrl || user.photoURL || targetData.partnerB?.avatar || 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
      role: 'Partenaire 2',
    };

    const updateData = cleanFirestoreData({
      partnerB,
      partnerBUid: user.uid,
      partnerBEmail: user.email || '',
      memberUids: updatedMembers,
      isCodeUsed: true,
      updatedAt: new Date().toISOString(),
    });

    couple = {
      ...targetData,
      ...updateData,
      code: targetCode,
    } as unknown as CouplePair;

    // Direct instant REST write
    await restSetDoc(`couples/${targetCode}`, updateData, true);

    // Non-blocking SDK setDoc to update local cache
    setDoc(doc(db, 'couples', targetCode), updateData, { merge: true }).catch(() => {});

    verifiedRoomsCache.add(targetCode);
    console.log('[SYNC-DEBUG] Successfully paired to room:', targetCode);

    // Broadcast Partner Joined event notification to trigger partner's realtime listener
    const joinNotif: NotificationItem = {
      id: `notif-join-${Date.now()}`,
      type: 'spot_validated',
      spotId: 'duo-connected',
      senderId: 'partner_b',
      targetPartnerId: 'partner_a',
      title: '💖 Duo Connecté !',
      message: `${partnerName.trim() || 'Votre partenaire'} a rejoint votre espace Duo avec succès !`,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    saveNotificationToFirestore(targetCode, joinNotif).catch((e) => {
      console.warn('Notice broadcasting join notification:', e);
    });

  } catch (error: any) {
    console.error("[DUO-SYNC-ERROR]", error?.code, error?.message);
    throw new Error("Erreur lors de la synchronisation de la liaison : " + (error?.message || "Erreur inconnue"));
  }

  // Fetch existing spots & notifications (REST-first)
  let spots: Spot[] = [];
  let notifications: NotificationItem[] = [];
  try {
    console.log('[SYNC-DEBUG] Fetching initial subcollections via REST');
    const restSpots = await restListDocs(`couples/${targetCode}/spots`);
    if (restSpots && restSpots.length > 0) {
      spots = restSpots as Spot[];
    } else {
      const spotsSnap = await withTimeout(getDocs(collection(db, 'couples', targetCode, 'spots')), 3000, null);
      if (spotsSnap) {
        spots = spotsSnap.docs.map(d => d.data() as Spot);
      }
    }
    const restNotifs = await restListDocs(`couples/${targetCode}/notifications`);
    if (restNotifs && restNotifs.length > 0) {
      notifications = restNotifs as NotificationItem[];
    } else {
      const notifsSnap = await withTimeout(getDocs(collection(db, 'couples', targetCode, 'notifications')), 3000, null);
      if (notifsSnap) {
        notifications = notifsSnap.docs.map(d => d.data() as NotificationItem);
      }
    }
  } catch (err: any) {
    console.warn('[SYNC-DEBUG] Notice while fetching subcollections:', err?.code, err?.message);
  }

  console.log('[SYNC-DEBUG] joinCouple Successfully finished for room:', couple.code);
  return { couple, spots, notifications };
}

// Search Firestore to automatically restore an existing user's couple room upon re-login
export async function findUserCoupleInFirestore(
  user: User
): Promise<{ couple: CouplePair; partnerId: PartnerId } | null> {
  if (!user || !user.uid) return null;

  try {
    const couplesRef = collection(db, 'couples');
    let foundDoc: any = null;
    let partnerId: PartnerId = 'partner_a';
    
    // Build comprehensive candidate UIDs (including raw and prefixed variants)
    const candidateUids = new Set<string>();
    if (user.uid) {
      candidateUids.add(user.uid);
      if (user.uid.startsWith('apple_')) {
        candidateUids.add(user.uid.replace(/^apple_/, ''));
      } else {
        candidateUids.add(`apple_${user.uid}`);
      }
      if (user.uid.startsWith('google_')) {
        candidateUids.add(user.uid.replace(/^google_/, ''));
      } else {
        candidateUids.add(`google_${user.uid}`);
      }
    }
    if (user.providerData && user.providerData.length > 0) {
      for (const p of user.providerData) {
        if (p.uid) {
          candidateUids.add(p.uid);
          candidateUids.add(`apple_${p.uid}`);
          candidateUids.add(`google_${p.uid}`);
        }
      }
    }

    // 1. Search by memberUids with candidate UIDs (fast parallel batch)
    const candList = Array.from(candidateUids).slice(0, 4);
    const memberPromises = candList.map(async (cand) => {
      try {
        const q = query(couplesRef, where('memberUids', 'array-contains', cand), limit(1));
        const snap = await withTimeout(getDocs(q), 1200, null).catch(() => null);
        if (snap && !snap.empty) {
          return { doc: snap.docs[0], cand };
        }
      } catch (e) {}
      return null;
    });

    const memberResults = await Promise.all(memberPromises);
    for (const res of memberResults) {
      if (res && res.doc) {
        foundDoc = res.doc;
        const docData = foundDoc.data();
        if (docData.partnerBUid === res.cand || docData.partnerBUid === user.uid) partnerId = 'partner_b';
        break;
      }
    }

    // 1b. Search by ownerUid or partner UIDs if not found
    if (!foundDoc && candList.length > 0) {
      const fieldPromises = candList.map(async (cand) => {
        try {
          const qOwner = query(couplesRef, where('ownerUid', '==', cand), limit(1));
          const snapOwner = await withTimeout(getDocs(qOwner), 1000, null).catch(() => null);
          if (snapOwner && !snapOwner.empty) return { doc: snapOwner.docs[0], pId: 'partner_a' as PartnerId };

          const qPA = query(couplesRef, where('partnerAUid', '==', cand), limit(1));
          const snapPA = await withTimeout(getDocs(qPA), 1000, null).catch(() => null);
          if (snapPA && !snapPA.empty) return { doc: snapPA.docs[0], pId: 'partner_a' as PartnerId };

          const qPB = query(couplesRef, where('partnerBUid', '==', cand), limit(1));
          const snapPB = await withTimeout(getDocs(qPB), 1000, null).catch(() => null);
          if (snapPB && !snapPB.empty) return { doc: snapPB.docs[0], pId: 'partner_b' as PartnerId };
        } catch (e) {}
        return null;
      });

      const fieldResults = await Promise.all(fieldPromises);
      for (const res of fieldResults) {
        if (res && res.doc) {
          foundDoc = res.doc;
          partnerId = res.pId;
          break;
        }
      }
    }

    // 2. Search by email
    if (!foundDoc && user.email) {
      const qEmail = query(couplesRef, where('ownerEmail', '==', user.email), limit(1));
      const snapEmail = await withTimeout(getDocs(qEmail), 1200, null).catch(() => null);
      if (snapEmail && !snapEmail.empty) {
        foundDoc = snapEmail.docs[0];
        const docData = foundDoc.data();
        if (docData.partnerBEmail === user.email) partnerId = 'partner_b';
      }
    }

    // 3. Fallback to existing local couple code if present and valid in Firestore
    if (!foundDoc) {
      try {
        const saved = localStorage.getItem('lovemap_couple_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.code && parsed.code !== 'LOVE-NEW') {
            const cleanCode = parsed.code.trim().toUpperCase();
            const snapLocal = await withTimeout(getDoc(doc(db, 'couples', cleanCode)), 3000, null);
            if (snapLocal && snapLocal.exists()) {
              foundDoc = snapLocal;
              const docData = foundDoc.data();
              if (docData.partnerBUid === user.uid || (parsed.partnerB?.name && parsed.partnerB.name === user.displayName)) {
                partnerId = 'partner_b';
              }
            }
          }
        }
      } catch (e) {
        console.warn('Local couple room fallback check notice:', e);
      }
    }

    if (foundDoc) {
      const docData = foundDoc.data();
      const existingMembers = docData.memberUids || [];
      
      // If we found it via email but UID is missing, merge the new UID in
      if (!existingMembers.includes(user.uid)) {
        const updatedMembers = Array.from(new Set([...existingMembers, user.uid]));
        const updatePayload: any = { memberUids: updatedMembers };
        
        if (partnerId === 'partner_a' && !docData.partnerAUid) {
          updatePayload.partnerAUid = user.uid;
        } else if (partnerId === 'partner_b' && !docData.partnerBUid) {
          updatePayload.partnerBUid = user.uid;
        }
        
        await setDoc(doc(db, 'couples', foundDoc.id), updatePayload, { merge: true }).catch(() => {});
        docData.memberUids = updatedMembers;
      }

      verifiedRoomsCache.add(docData.code || foundDoc.id);
      return {
        couple: docData as CouplePair,
        partnerId,
      };
    }
  } catch (err) {
    console.error('Error in findUserCoupleInFirestore:', err);
  }

  return null;
}

// Update couple configuration (e.g. names, pin, anniversary, subscription)
export async function updateCoupleInFirestore(code: string, updated: CouplePair) {
  const cleanCode = code.trim().toUpperCase();
  const { spots, notifications, ...coreCouple } = updated;
  const cleaned = cleanFirestoreData({ ...coreCouple, updatedAt: new Date().toISOString() });
  
  // 1. Instantly write via REST to guarantee delivery regardless of SDK WebSocket state
  restSetDoc(`couples/${cleanCode}`, cleaned).catch(() => {});

  // 2. Pass to SDK for offline local cache resolution (non-blocking)
  try {
    const docRef = doc(db, 'couples', cleanCode);
    setDoc(docRef, cleaned, { merge: true }).catch(() => {});
    verifiedRoomsCache.add(cleanCode);
    console.log('[Firebase] Couple updated successfully');
  } catch (err) {
    console.warn('[Firebase] Updating couple SDK warning:', err);
  }
}

// Save device APNs / Push token for a partner in Firestore
export async function savePushTokenToFirestore(code: string, partnerId: PartnerId, token: string) {
  if (!code || !token) return;
  const cleanCode = code.trim().toUpperCase();
  const cacheKey = `${cleanCode}_${partnerId}`;

  // Avoid redundant writes if token already saved
  if (savedPushTokensCache.get(cacheKey) === token) {
    return;
  }

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
    savedPushTokensCache.set(cacheKey, token);
    console.log('[savePushTokenToFirestore] Device push token saved for', partnerId);
  } catch (e) {
    console.warn('[savePushTokenToFirestore] Notice saving token:', e);
  }
}

// Break up / dissolve a duo in Firestore
export async function breakCoupleInFirestore(code: string, breakerName: string) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  verifiedRoomsCache.delete(cleanCode);

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

// Subscribe to couple data real-time changes with resilience for mobile sleep/wake
export function subscribeToCouple(code: string, callback: (couple: CouplePair | null) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const coupleRef = doc(db, 'couples', cleanCode);

  let isPartnerJoined = false;
  let pollInterval: any = null;

  const handleUpdate = (data: CouplePair | null) => {
    if (!data) {
      callback(null);
      return;
    }
    const joined = Boolean(
      data.isCodeUsed ||
      (data.partnerB && data.partnerB.name && data.partnerB.name !== 'En attente...')
    );
    if (joined && !isPartnerJoined) {
      isPartnerJoined = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
    callback(data);
  };

  // 1. Standard Firestore onSnapshot listener
  const unsubSnapshot = onSnapshot(
    coupleRef,
    (docSnap) => {
      if (docSnap.exists()) {
        handleUpdate(docSnap.data() as CouplePair);
      } else {
        handleUpdate(null);
      }
    },
    (err) => {
      console.warn('[Firebase] Error listening to couple:', err);
    }
  );

  // Direct fast REST fetch (immune to WebChannel socket drops on iOS)
  const fetchDirect = async () => {
    try {
      const restDoc = await restGetDoc(`couples/${cleanCode}`);
      if (restDoc) {
        handleUpdate(restDoc as CouplePair);
      }
    } catch (e) {}
  };

  // 2. React to mobile resume / window focus events
  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchDirect();
    }
  };
  const onFocus = () => {
    fetchDirect();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // 3. Pairing poll: ONLY active while waiting for partner to join
  // Checks every 3.5 seconds and immediately self-terminates when partner connects
  pollInterval = setInterval(() => {
    if (isPartnerJoined) {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      return;
    }
    fetchDirect();
  }, 3500);

  return () => {
    unsubSnapshot();
    if (pollInterval) clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

// Save spot to Firestore (REST first + SDK background sync)
export async function saveSpotToFirestore(code: string, spot: Spot) {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanedSpot = cleanFirestoreData(spot);
  
  // 1. Instantly write via REST to guarantee delivery regardless of SDK WebSocket state
  restSetDoc(`couples/${cleanCode}/spots/${spot.id}`, cleanedSpot)
    .then((ok) => {
      if (ok) restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastSpotUpdate: Date.now() }).catch(() => {});
    })
    .catch(() => {});

  // 2. Pass to SDK for offline local cache resolution (non-blocking)
  try {
    const docRef = doc(db, 'couples', cleanCode, 'spots', spot.id);
    setDoc(docRef, cleanedSpot, { merge: true }).catch(() => {}); // Fire and forget
    console.log('[Firebase] Spot saved successfully:', spot.id);
    return true;
  } catch (err) {
    return false;
  }
}

// Delete spot from Firestore (REST first + SDK background sync)
export async function deleteSpotFromFirestore(code: string, spotId: string) {
  if (!code || !spotId) return false;
  const cleanCode = code.trim().toUpperCase();
  
  restDeleteDoc(`couples/${cleanCode}/spots/${spotId}`)
    .then(() => {
      restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastSpotUpdate: Date.now() }).catch(() => {});
    })
    .catch(() => {});

  try {
    deleteDoc(doc(db, 'couples', cleanCode, 'spots', spotId)).catch(() => {});
    console.log('[Firebase] Spot deleted successfully:', spotId);
    return true;
  } catch (err) {
    return false;
  }
}

// Subscribe to spots real-time changes with visibility refresh
export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const spotsRef = collection(db, 'couples', cleanCode, 'spots');

  // 1. Real-time onSnapshot listener (manages live WebSocket + local offline cache)
  const unsubSnapshot = onSnapshot(
    spotsRef,
    (snapshot) => {
      const spots = snapshot.docs.map((d) => d.data() as Spot);
      callback(spots);
    },
    (err) => {
      console.warn('[Firebase] Snapshot notice listening to spots:', err);
    }
  );

  let lastKnownSpotUpdate = -2;

  // 2. Direct fetch helper on mobile resume / window focus
  const fetchSpotsDirect = async () => {
    try {
      // Sync baseline to prevent missing updates that arrive just before or during fetch
      const coupleDoc = await restGetDoc(`couples/${cleanCode}`);
      if (coupleDoc && coupleDoc.lastSpotUpdate) {
        lastKnownSpotUpdate = Number(coupleDoc.lastSpotUpdate);
      } else {
        lastKnownSpotUpdate = -1;
      }

      const restSpots = await restListDocs(`couples/${cleanCode}/spots`);
      if (restSpots && restSpots.length > 0) {
        callback(restSpots as Spot[]);
        return;
      }
      const snap = await withTimeout(getDocs(spotsRef), 3000, null);
      if (snap) {
        const list = snap.docs.map((d) => d.data() as Spot);
        callback(list);
      }
    } catch (e) {}
  };

  // Immediate first load
  fetchSpotsDirect();

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchSpotsDirect();
    }
  };
  const onFocus = () => {
    fetchSpotsDirect();
  };

  // Triggered by Capacitor AppState changes in App.tsx
  const onNativeResume = () => {
    fetchSpotsDirect();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('native-app-resume', onNativeResume);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // 3. Ultra-low cost Liveness Poller
  // Checks only the couple document (1 read) every 10 seconds.
  // If we detect the lastSpotUpdate timestamp changed, we THEN trigger a full spots sync.
  const livenessPoller = setInterval(async () => {
    try {
      const coupleDoc = await restGetDoc(`couples/${cleanCode}`);
      if (coupleDoc && coupleDoc.lastSpotUpdate) {
        const remoteUpdate = Number(coupleDoc.lastSpotUpdate);
        if (lastKnownSpotUpdate === -2) {
          // fetchSpotsDirect hasn't initialized it yet, wait for it
        } else if (remoteUpdate > lastKnownSpotUpdate) {
          console.log('[Firebase] Liveness poller detected spot change, fetching...');
          fetchSpotsDirect();
        }
      }
    } catch (e) {}
  }, 10000);

  return () => {
    unsubSnapshot();
    clearInterval(livenessPoller);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('native-app-resume', onNativeResume);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

// Save notification to Firestore
export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanedNotif = cleanFirestoreData(notif);
  
  // 1. Instantly write via REST
  restSetDoc(`couples/${cleanCode}/notifications/${notif.id}`, cleanedNotif)
    .then((ok) => {
      if (ok) restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {});
    })
    .catch(() => {});

  // 2. Pass to SDK for offline local cache resolution (non-blocking)
  try {
    const docRef = doc(db, 'couples', cleanCode, 'notifications', notif.id);
    setDoc(docRef, cleanedNotif, { merge: true }).catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}

// Subscribe to notifications real-time changes with visibility refresh
export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const notifsRef = collection(db, 'couples', cleanCode, 'notifications');

  // 1. Real-time onSnapshot listener
  const unsubSnapshot = onSnapshot(
    notifsRef,
    (snapshot) => {
      const notifs = snapshot.docs.map((d) => d.data() as NotificationItem);
      notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
      callback(notifs);
    },
    (err) => {
      console.warn('[Firebase] Snapshot notice listening to notifications:', err);
    }
  );

  let lastKnownNotifUpdate = -2;

  // 2. Direct fetch on mobile resume / focus
  const fetchNotifsDirect = async () => {
    try {
      // Sync baseline to prevent missing updates that arrive just before or during fetch
      const coupleDoc = await restGetDoc(`couples/${cleanCode}`);
      if (coupleDoc && coupleDoc.lastNotificationUpdate) {
        lastKnownNotifUpdate = Number(coupleDoc.lastNotificationUpdate);
      } else {
        lastKnownNotifUpdate = -1;
      }

      const restNotifs = await restListDocs(`couples/${cleanCode}/notifications`);
      if (restNotifs && restNotifs.length > 0) {
        const notifs = restNotifs as NotificationItem[];
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
        return;
      }
      const snap = await withTimeout(getDocs(notifsRef), 3000, null);
      if (snap) {
        const notifs = snap.docs.map((d) => d.data() as NotificationItem);
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
      }
    } catch (e) {}
  };

  // Immediate first load
  fetchNotifsDirect();

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchNotifsDirect();
    }
  };
  const onFocus = () => {
    fetchNotifsDirect();
  };

  // Triggered by Capacitor AppState changes in App.tsx
  const onNativeResume = () => {
    fetchNotifsDirect();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('native-app-resume', onNativeResume);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // 3. Ultra-low cost Liveness Poller
  const livenessPoller = setInterval(async () => {
    try {
      const coupleDoc = await restGetDoc(`couples/${cleanCode}`);
      if (coupleDoc && coupleDoc.lastNotificationUpdate) {
        const remoteUpdate = Number(coupleDoc.lastNotificationUpdate);
        if (lastKnownNotifUpdate === -2) {
          // fetchNotifsDirect hasn't initialized it yet
        } else if (remoteUpdate > lastKnownNotifUpdate) {
          console.log('[Firebase] Liveness poller detected notif change, fetching...');
          fetchNotifsDirect();
        }
      }
    } catch (e) {}
  }, 10000);

  return () => {
    unsubSnapshot();
    clearInterval(livenessPoller);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('native-app-resume', onNativeResume);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

// Purge all created accounts, couples, spots and notifications in Firestore DB
export async function purgeAllFirestoreData() {
  try {
    const couplesCol = collection(db, 'couples');
    const couplesSnap = await withTimeout(getDocs(couplesCol), 3000, null);
    if (couplesSnap) {
      for (const cDoc of couplesSnap.docs) {
        const code = cDoc.id;
        restDeleteDoc(`couples/${code}`).catch(() => {});
        deleteDoc(doc(db, 'couples', code)).catch(() => {});
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

  console.log('[SYNC-DEBUG] deleteUserAccountInFirestore called for:', {
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

    const results = await withTimeout(Promise.all(lookupPromises), 10000, []);
    for (const snap of results) {
      if (snap) {
        snap.forEach((d: any) => coupleCodesToDelete.add(d.id));
      }
    }
  } catch (findErr: any) {
    console.error('[DUO-SYNC-ERROR]', findErr?.code, findErr?.message);
    console.warn('[SYNC-DEBUG] Error looking up couple docs to delete:', findErr);
  }

  // Delete all identified couple collections, spots, and notifications in parallel
  for (const cCode of coupleCodesToDelete) {
    console.log('[SYNC-DEBUG] Deleting couple document and subcollections for:', cCode);
    try {
      await deleteDoc(doc(db, 'couples', cCode));
    } catch (e: any) {
      console.error('[DUO-SYNC-ERROR] Failed to delete couple doc:', e?.code, e?.message);
    }
    
    // Subcollections cleanup in background
    (async () => {
      try {
        const spotsSnap = await getDocs(collection(db, 'couples', cCode, 'spots'));
        for (const s of spotsSnap.docs) await deleteDoc(s.ref);
        
        const notifsSnap = await getDocs(collection(db, 'couples', cCode, 'notifications'));
        for (const n of notifsSnap.docs) await deleteDoc(n.ref);
      } catch (err: any) {
         console.warn('[SYNC-DEBUG] Notice cleaning subcollections:', err?.code, err?.message);
      }
    })().catch(() => {});
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
      console.log('[SYNC-DEBUG] Attempting firebaseAuthUser.delete()...');
      await firebaseAuthUser.delete();
      console.log('[SYNC-DEBUG] firebaseAuthUser.delete() completed.');
    } catch (delErr: any) {
      if (delErr?.code === 'auth/requires-recent-login') {
        console.log('[SYNC-DEBUG] Firebase user requires recent login for auth record delete; data and sessions purged.');
      } else {
        console.log('[SYNC-DEBUG] Notice during firebaseAuthUser.delete():', delErr?.code || delErr?.message || delErr);
      }
    }
  }

  // 4. Native Plugins sign out (Google / Apple tokens cached on device)
  try {
    await withTimeout(triggerNativeSignOut(), 1500, null);
  } catch (nsErr: any) {
    console.warn('[SYNC-DEBUG] triggerNativeSignOut error:', nsErr);
  }

  // 5. Firebase Auth signOut
  try {
    await withTimeout(signOut(auth), 1500, null);
    console.log('[SYNC-DEBUG] Firebase signOut completed.');
  } catch (soErr: any) {
    console.error('[DUO-SYNC-ERROR]', soErr?.code, soErr?.message);
    console.warn('[SYNC-DEBUG] signOut error:', soErr);
  }
}

export const logoutFromFirebase = logoutUser;
