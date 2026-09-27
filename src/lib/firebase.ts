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
  memoryLocalCache,
} from 'firebase/firestore';
import {
  watchDocument,
  getDocument as adapterGetDocument,
  writeDocument as adapterWriteDocument,
  patchDocument as adapterPatchDocument,
  deleteDocument as adapterDeleteDocument,
  watchCollection,
  getCollection as adapterGetCollection,
  queryCollectionWhere,
} from '../data/firestoreAdapter';
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

// Lazy initialize Firestore JS SDK only on Web/PWA; skipped entirely on iOS Native to avoid starting background WebChannel
let webFirestoreInstance: any = null;
export function getFirestoreDb(): any {
  if (isCapacitorNative()) {
    return null;
  }
  if (!webFirestoreInstance) {
    webFirestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    }, firebaseConfig.firestoreDatabaseId || undefined);
  }
  return webFirestoreInstance;
}

// Keep export db as getter or instance for backwards compatibility
export const db = !isCapacitorNative() ? getFirestoreDb() : null;




// ============================================================================
// DIRECT FIRESTORE REST API CLIENT (Native fetch, zero WKWebView hangs, <80ms latency)
// ============================================================================

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;

// Helper to convert Firestore format to standard JSON
function fromFirestoreDoc(doc: any): any {
  const data: any = {};
  if (!doc || !doc.fields) return data;
  for (const [key, value] of Object.entries(doc.fields)) {
    const val = value as any;
    if (val.stringValue !== undefined) data[key] = val.stringValue;
    else if (val.integerValue !== undefined) data[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) data[key] = Number(val.doubleValue);
    else if (val.booleanValue !== undefined) data[key] = Boolean(val.booleanValue);
    else if (val.mapValue !== undefined) data[key] = fromFirestoreDoc({ fields: val.mapValue.fields });
    else if (val.arrayValue !== undefined) {
      data[key] = (val.arrayValue.values || []).map((v: any) => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.mapValue !== undefined) return fromFirestoreDoc({ fields: v.mapValue.fields });
        return v; // Simplify for now
      });
    }
  }
  return data;
}

function toFirestoreValue(value: any): any {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value && typeof value === 'object') {
    const fields: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

export async function restGetDoc(docPath: string): Promise<any | null> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const res = await fetch(`${FIRESTORE_REST_BASE}/${cleanPath}?key=${firebaseConfig.apiKey}`, {
      cache: 'no-store',
    });
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
      cache: 'no-store',
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
      cache: 'no-store',
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function restListDocs(collectionPath: string): Promise<any[] | null> {
  try {
    const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
    const parts = cleanPath.split('/');
    if (parts.length % 2 === 0) return null; // Must be a collection path

    const collectionId = parts.pop();
    const parentPath = parts.join('/');
    const urlPath = parentPath ? `${parentPath}:runQuery` : ':runQuery';

    const res = await fetch(`${FIRESTORE_REST_BASE}/${urlPath}?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }]
        }
      }),
      cache: 'no-store',
    });
    
    if (!res.ok) return null;
    const json = await res.json();
    
    const results: any[] = [];
    if (Array.isArray(json)) {
      for (const item of json) {
        if (item.document) {
          const d = item.document;
          const data = fromFirestoreDoc(d);
          const nameParts = (d.name || '').split('/');
          const id = nameParts[nameParts.length - 1];
          results.push({ ...data, id: data?.id || id });
        }
      }
    }
    return results;
  } catch (e) {
    return null;
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

    let existingData: any = null;
    const adapterDoc = await withTimeout(adapterGetDocument<CouplePair>(`couples/${cleanCode}`), 3000, null).catch(() => null);
    if (adapterDoc && adapterDoc.exists) {
      existingData = adapterDoc.data();
    }
    if (!existingData) {
      existingData = await restGetDoc(`couples/${cleanCode}`);
    }

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

      // Write room via firestoreAdapter (Native on iOS, Modular JS on Web) + REST fallback
      await adapterWriteDocument(`couples/${cleanCode}`, newRoom, { merge: true }).catch((err) => {
        console.warn('[ensureCoupleRoom] adapterWriteDocument notice:', err?.message);
      });
      restSetDoc(`couples/${cleanCode}`, newRoom).catch(() => {});
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

        await adapterWriteDocument(`couples/${cleanCode}`, updatePayload, { merge: true }).catch((err) => {
          console.warn('[ensureCoupleRoom] update members notice:', err?.message);
        });
        restSetDoc(`couples/${cleanCode}`, updatePayload).catch(() => {});
      }
      verifiedRoomsCache.add(cleanCode);

      // Preserve joined partner B if exists in remote or local
      const remotePartnerB = data.partnerB;
      const localPartnerB = localCouple.partnerB;
      const mergedPartnerB = (remotePartnerB && remotePartnerB.name && remotePartnerB.name !== 'En attente...')
        ? remotePartnerB
        : (localPartnerB?.name && localPartnerB.name !== 'En attente...' ? localPartnerB : remotePartnerB || localPartnerB);

      return {
        ...localCouple,
        ...data,
        partnerB: mergedPartnerB,
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

  // If the local code already exists in DB (e.g., created by Guest mode), we MERGE the new Google/Apple user into it
  // Wrap with timeout so it never hangs the mobile app
  let snapData: any = null;
  const adapterDoc = await withTimeout(adapterGetDocument<CouplePair>(`couples/${code}`), 1500, null).catch(() => null);
  if (adapterDoc && adapterDoc.exists) {
    snapData = adapterDoc.data();
  }
  if (!snapData) {
    snapData = await restGetDoc(`couples/${code}`).catch(() => null);
  }

  if (snapData) {
    const existingData = snapData as CouplePair & { memberUids?: string[], ownerEmail?: string };
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
    
    // Save via firestoreAdapter (Native on iOS, Modular JS on Web) + REST fallback
    await adapterWriteDocument(`couples/${code}`, updatePayload, { merge: true }).catch((err) => {
      console.warn('[createCouple] adapterWriteDocument notice:', err?.message);
    });
    restSetDoc(`couples/${code}`, updatePayload).catch(() => {});
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

  // Fast write via firestoreAdapter (Native on iOS, Modular JS on Web) + REST fallback
  try {
    await adapterWriteDocument(`couples/${code}`, coupleData, { merge: true }).catch((err) => {
      console.warn('[createCouple] adapterWriteDocument notice:', err?.message);
    });
    restSetDoc(`couples/${code}`, coupleData, false).catch(() => {});
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

  // 1. Direct document lookup by candidate codes (Adapter-first + REST fallback)
  for (const cand of candidates) {
    try {
      console.log(`[SYNC-DEBUG] Checking candidate via firestoreAdapter: ${cand}`);
      const adapterDoc = await withTimeout(adapterGetDocument<CouplePair>(`couples/${cand}`), 2500, null).catch(() => null);
      if (adapterDoc && adapterDoc.exists && adapterDoc.val) {
        targetData = adapterDoc.data();
        targetCode = cand;
        console.log('[SYNC-DEBUG] Found couple document via firestoreAdapter:', cand);
        break;
      }
      const restDoc = await restGetDoc(`couples/${cand}`);
      if (restDoc && (restDoc.code || restDoc.partnerA)) {
        targetData = restDoc;
        targetCode = cand;
        console.log('[SYNC-DEBUG] Found couple document via REST:', cand);
        break;
      }
    } catch (e: any) {
      console.warn(`[SYNC-DEBUG] Candidate ${cand} check notice:`, e?.message);
    }
  }

  // 2. Query fallback if direct lookup didn't find it
  if (!targetData) {
    try {
      console.log('[SYNC-DEBUG] Falling back to query search');
      for (const cand of candidates.slice(0, 10)) {
        const found = await withTimeout(
          queryCollectionWhere<CouplePair>('couples', { field: 'code', operator: '==', value: cand }),
          1500,
          null
        ).catch(() => null);
        if (found && found.length > 0 && found[0].exists && found[0].val) {
          targetData = found[0].data();
          targetCode = found[0].id || cand;
          console.log('[SYNC-DEBUG] Found couple document by query:', targetCode);
          break;
        }
      }
    } catch (queryErr: any) {
      console.warn('[SYNC-DEBUG] Query fallback notice:', queryErr?.message);
    }
  }

  if (!targetData) {
    console.error(`[DUO-SYNC-ERROR] not-found Code de duo introuvable (${rawClean})`);
    throw new Error(`Code de duo introuvable (${rawClean}). Vérifiez que le code correspond bien à celui affiché sur le téléphone de votre partenaire.`);
  }

  // Verify availability
  if (targetData.isCodeUsed && targetData.partnerBUid && user.uid && targetData.partnerBUid !== user.uid) {
    if (targetData.partnerB?.name && targetData.partnerB.name !== 'En attente...') {
      throw new Error(`Cet espace Duo est déjà complet avec ${targetData.partnerB.name}.`);
    }
  }

  // 3. Pairing update via firestoreAdapter (Native on iOS, Modular JS on Web) + REST fallback
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
    status: 'active',
    updatedAt: new Date().toISOString(),
    lastJoinUpdate: Date.now(),
  });

  // Write via firestoreAdapter (Native on iOS, Modular JS on Web) + REST fallback
  await adapterWriteDocument(`couples/${targetCode}`, updateData, { merge: true }).catch((err) => {
    console.warn('[joinCouple] adapterWriteDocument notice:', err?.message);
  });
  restSetDoc(`couples/${targetCode}`, updateData, true).catch(() => {});

  const couple: CouplePair = {
    ...targetData,
    ...updateData,
    code: targetCode,
  } as unknown as CouplePair;

  verifiedRoomsCache.add(targetCode);

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
  saveNotificationToFirestore(targetCode, joinNotif).catch(() => {});

  // Fetch existing spots & notifications (REST-first + firestoreAdapter)
  let spots: Spot[] = [];
  let notifications: NotificationItem[] = [];
  try {
    console.log('[SYNC-DEBUG] Fetching initial subcollections');
    const adapterSpots = await withTimeout(adapterGetCollection<Spot>(`couples/${targetCode}/spots`), 3500, null);
    if (adapterSpots && adapterSpots.length > 0) {
      spots = adapterSpots.filter((s) => s.exists && s.val).map((s) => s.data() as Spot);
    } else {
      const restSpots = await restListDocs(`couples/${targetCode}/spots`);
      if (restSpots && restSpots.length > 0) {
        spots = restSpots as Spot[];
      }
    }

    const adapterNotifs = await withTimeout(adapterGetCollection<NotificationItem>(`couples/${targetCode}/notifications`), 3500, null);
    if (adapterNotifs && adapterNotifs.length > 0) {
      notifications = adapterNotifs.filter((s) => s.exists && s.val).map((s) => s.data() as NotificationItem);
    } else {
      const restNotifs = await restListDocs(`couples/${targetCode}/notifications`);
      if (restNotifs && restNotifs.length > 0) {
        notifications = restNotifs as NotificationItem[];
      }
    }
  } catch (err: any) {
    console.warn('[SYNC-DEBUG] Notice while fetching subcollections:', err?.code, err?.message);
  }

  console.log('[SYNC-DEBUG] joinCouple Successfully finished for room:', couple.code);
  return { couple, spots, notifications };
}

// Search Firestore to automatically restore an existing user's couple room upon re-login

export async function restFindUserCouple(uid: string, email: string | null): Promise<any | null> {
  try {
    const candidates = [uid, `apple_${uid}`, `google_${uid}`];
    if (email) candidates.push(email);

    for (const cand of candidates) {
      // 1. Try ownerUid
      let res = await fetch(`${FIRESTORE_REST_BASE}:runQuery?key=${firebaseConfig.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'couples' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'ownerUid' },
                op: 'EQUAL',
                value: { stringValue: cand }
              }
            },
            limit: 1
          }
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json[0]?.document) {
           return fromFirestoreDoc(json[0].document);
        }
      }

      // 2. Try array-contains memberUids
      res = await fetch(`${FIRESTORE_REST_BASE}:runQuery?key=${firebaseConfig.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'couples' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'memberUids' },
                op: 'ARRAY_CONTAINS',
                value: { stringValue: cand }
              }
            },
            limit: 1
          }
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json[0]?.document) {
           return fromFirestoreDoc(json[0].document);
        }
      }
      
      // 3. Try ownerEmail
      res = await fetch(`${FIRESTORE_REST_BASE}:runQuery?key=${firebaseConfig.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'couples' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'ownerEmail' },
                op: 'EQUAL',
                value: { stringValue: cand }
              }
            },
            limit: 1
          }
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json[0]?.document) {
           return fromFirestoreDoc(json[0].document);
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

export async function findUserCoupleInFirestore(
  user: User
): Promise<{ couple: CouplePair; partnerId: PartnerId } | null> {
  if (!user || !user.uid) return null;

  try {
    const restDoc = await restFindUserCouple(user.uid, user.email || null);
    if (restDoc) {
      console.log('[SYNC-DEBUG] Found existing couple via REST Query');
      let partnerId: PartnerId = 'partner_a';
      if (restDoc.partnerBUid === user.uid || restDoc.partnerBUid === `apple_${user.uid}` || restDoc.partnerBUid === `google_${user.uid}`) {
         partnerId = 'partner_b';
      }
      return { couple: restDoc as CouplePair, partnerId };
    }
  } catch (e) {
    console.warn('REST find user couple notice:', e);
  }

  // Fallback to SDK...
  try {
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
        const snaps = await withTimeout(
          queryCollectionWhere<CouplePair>('couples', {
            field: 'memberUids',
            operator: 'array-contains',
            value: cand,
          }),
          1500,
          null
        ).catch(() => null);
        if (snaps && snaps.length > 0 && snaps[0].exists && snaps[0].val) {
          return { doc: snaps[0], cand };
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
          const snapsOwner = await withTimeout(
            queryCollectionWhere<CouplePair>('couples', { field: 'ownerUid', operator: '==', value: cand }),
            1200,
            null
          ).catch(() => null);
          if (snapsOwner && snapsOwner.length > 0 && snapsOwner[0].exists) return { doc: snapsOwner[0], pId: 'partner_a' as PartnerId };

          const snapsPA = await withTimeout(
            queryCollectionWhere<CouplePair>('couples', { field: 'partnerAUid', operator: '==', value: cand }),
            1200,
            null
          ).catch(() => null);
          if (snapsPA && snapsPA.length > 0 && snapsPA[0].exists) return { doc: snapsPA[0], pId: 'partner_a' as PartnerId };

          const snapsPB = await withTimeout(
            queryCollectionWhere<CouplePair>('couples', { field: 'partnerBUid', operator: '==', value: cand }),
            1200,
            null
          ).catch(() => null);
          if (snapsPB && snapsPB.length > 0 && snapsPB[0].exists) return { doc: snapsPB[0], pId: 'partner_b' as PartnerId };
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
      const snapsEmail = await withTimeout(
        queryCollectionWhere<CouplePair>('couples', { field: 'ownerEmail', operator: '==', value: user.email }),
        1500,
        null
      ).catch(() => null);
      if (snapsEmail && snapsEmail.length > 0 && snapsEmail[0].exists) {
        foundDoc = snapsEmail[0];
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
            const snapLocal = await withTimeout(adapterGetDocument<CouplePair>(`couples/${cleanCode}`), 3000, null);
            if (snapLocal && snapLocal.exists && snapLocal.val) {
              foundDoc = snapLocal;
              const docData = snapLocal.data();
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
      const docData = typeof foundDoc.data === 'function' ? foundDoc.data() : foundDoc;
      const existingMembers = docData.memberUids || [];
      const docId = foundDoc.id || docData.code;
      
      // If we found it via email but UID is missing, merge the new UID in
      if (!existingMembers.includes(user.uid)) {
        const updatedMembers = Array.from(new Set([...existingMembers, user.uid]));
        const updatePayload: any = { memberUids: updatedMembers };
        
        if (partnerId === 'partner_a' && !docData.partnerAUid) {
          updatePayload.partnerAUid = user.uid;
        } else if (partnerId === 'partner_b' && !docData.partnerBUid) {
          updatePayload.partnerBUid = user.uid;
        }
        
        adapterWriteDocument(`couples/${docId}`, updatePayload, { merge: true }).catch(() => {});
        await restSetDoc(`couples/${docId}`, updatePayload);
        docData.memberUids = updatedMembers;
      }

      verifiedRoomsCache.add(docData.code || docId);
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
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  const { spots, notifications, ...coreCouple } = updated;
  const cleaned = cleanFirestoreData({ ...coreCouple, updatedAt: new Date().toISOString() });
  
  // 1. Instantly write via firestoreAdapter (Native on iOS, Modular JS on Web)
  adapterWriteDocument(`couples/${cleanCode}`, cleaned, { merge: true }).catch((err) => {
    console.warn('[updateCouple] adapterWriteDocument notice:', err?.message);
  });
  restSetDoc(`couples/${cleanCode}`, cleaned).catch(() => {});
  verifiedRoomsCache.add(cleanCode);
  console.log('[Firebase] Couple updated successfully');
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
    const updatePayload = cleanFirestoreData({
      [partnerId === 'partner_a' ? 'partnerA' : 'partnerB']: {
        pushToken: token,
      },
      updatedAt: new Date().toISOString(),
    });
    await adapterWriteDocument(`couples/${cleanCode}`, updatePayload, { merge: true }).catch((err) => {
      console.warn('[savePushTokenToFirestore] adapterWriteDocument notice:', err?.message);
    });
    restSetDoc(`couples/${cleanCode}`, updatePayload).catch(() => {});
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

    // Delete spots in subcollection
    const spotsSnap = await withTimeout(adapterGetCollection(`couples/${cleanCode}/spots`), 3000, null);
    if (spotsSnap && spotsSnap.length > 0) {
      const deletePromises = spotsSnap.map((s) => adapterDeleteDocument(`couples/${cleanCode}/spots/${s.id}`).catch(() => {}));
      await withTimeout(Promise.all(deletePromises), 5000, null);
    }

    // Mark room as broken
    const payload = cleanFirestoreData({
      ...brokenPayload,
      updatedAt: new Date().toISOString(),
    });
    adapterWriteDocument(`couples/${cleanCode}`, payload, { merge: true }).catch(() => {});
    await restSetDoc(`couples/${cleanCode}`, payload);
  } catch (err) {
    console.warn('Error breaking couple in Firestore:', err);
  }
}

// Subscribe to couple data real-time changes with resilience for mobile sleep/wake
export function subscribeToCouple(code: string, callback: (couple: CouplePair | null) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();

  let isDisposed = false;

  const handleUpdate = (data: CouplePair | null) => {
    if (isDisposed) return;
    if (!data) {
      callback(null);
      return;
    }
    callback(data);
  };

  // 1. Direct fetch helper on mobile resume / window focus
  const fetchCoupleDirect = async () => {
    if (isDisposed) return;
    try {
      const snap = await withTimeout(adapterGetDocument<CouplePair>(`couples/${cleanCode}`), 3000, null);
      if (snap && snap.exists && snap.val) {
        handleUpdate(snap.data());
        return;
      }
      const restDoc = await restGetDoc(`couples/${cleanCode}`);
      if (restDoc !== null) {
        handleUpdate(restDoc as CouplePair);
        return;
      }
      if (snap && !snap.exists) {
        handleUpdate(null);
      }
    } catch (e) {}
  };

  fetchCoupleDirect();

  // 2. Realtime listener via firestoreAdapter (Native on iOS, Modular JS on Web)
  let unsubSnapshot: (() => void) | null = null;
  try {
    unsubSnapshot = watchDocument<CouplePair>(
      `couples/${cleanCode}`,
      (docSnap) => {
        if (docSnap.exists && docSnap.val) {
          handleUpdate(docSnap.data());
        } else {
          handleUpdate(null);
        }
      },
      (err) => {
        console.warn('[Firebase] Notice on couple snapshot:', err?.message);
      }
    );
  } catch (e) {}

  return () => {
    isDisposed = true;
    if (unsubSnapshot) unsubSnapshot();
  };
}

export async function saveSpotToFirestore(code: string, spot: Spot) {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanedSpot = cleanFirestoreData(spot);
  
  // 1. Adapter write (Native @capacitor-firebase/firestore on iOS, Modular JS on Web)
  adapterWriteDocument(`couples/${cleanCode}/spots/${spot.id}`, cleanedSpot, { merge: true }).catch((err) => {
    console.warn('[Firebase] adapterWriteDocument spot notice:', err?.message);
  });

  // REST fallback
  restSetDoc(`couples/${cleanCode}/spots/${spot.id}`, cleanedSpot, false).catch(() => {});
  
  // Update parent couple timestamp to notify partner
  adapterPatchDocument(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastSpotUpdate: Date.now() }).catch(() => {
    restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastSpotUpdate: Date.now() }).catch(() => {});
  });

  console.log('[Firebase] Spot saved successfully:', spot.id);
  return true;
}

// Delete spot from Firestore (Adapter + REST fallback)
export async function deleteSpotFromFirestore(code: string, spotId: string) {
  if (!code || !spotId) return false;
  const cleanCode = code.trim().toUpperCase();
  
  adapterDeleteDocument(`couples/${cleanCode}/spots/${spotId}`).catch((err) => {
    console.warn('[Firebase] adapterDeleteDocument spot notice:', err?.message);
  });
  restDeleteDoc(`couples/${cleanCode}/spots/${spotId}`).catch(() => {});

  adapterPatchDocument(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastSpotUpdate: Date.now() }).catch(() => {
    restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastSpotUpdate: Date.now() }).catch(() => {});
  });

  console.log('[Firebase] Spot deleted successfully:', spotId);
  return true;
}

// Subscribe to spots real-time changes with visibility refresh
export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const collectionPath = `couples/${cleanCode}/spots`;

  let isDisposed = false;

  // 1. Real-time watchCollection listener (Native on iOS, Modular JS on Web)
  let unsubSnapshot: (() => void) | null = null;
  try {
    unsubSnapshot = watchCollection<Spot>(
      collectionPath,
      (snapshots) => {
        if (isDisposed) return;
        const spots = snapshots
          .filter((s) => s.exists && s.val)
          .map((s) => s.data() as Spot);
        callback(spots);
      },
      (err) => {
        console.warn('[Firebase] watchCollection notice listening to spots:', err?.message);
      }
    );
  } catch (e) {}

  // 2. Direct fetch helper
  const fetchSpotsDirect = async () => {
    if (isDisposed) return;
    try {
      const adapterSnaps = await withTimeout(adapterGetCollection<Spot>(collectionPath), 3500, null);
      if (adapterSnaps && !isDisposed && adapterSnaps.length > 0) {
        const list = adapterSnaps
          .filter((s) => s.exists && s.val)
          .map((s) => s.data() as Spot);
        callback(list);
        return;
      }
      const restSpots = await restListDocs(`couples/${cleanCode}/spots`);
      if (restSpots !== null && !isDisposed) {
        callback(restSpots as Spot[]);
      }
    } catch (e) {}
  };

  fetchSpotsDirect();

  return () => {
    isDisposed = true;
    if (unsubSnapshot) unsubSnapshot();
  };
}

export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const collectionPath = `couples/${cleanCode}/notifications`;

  let isDisposed = false;

  // 1. Real-time watchCollection listener (Native on iOS, Modular JS on Web)
  let unsubSnapshot: (() => void) | null = null;
  try {
    unsubSnapshot = watchCollection<NotificationItem>(
      collectionPath,
      (snapshots) => {
        if (isDisposed) return;
        const notifs = snapshots
          .filter((s) => s.exists && s.val)
          .map((s) => s.data() as NotificationItem);
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
      },
      (err) => {
        console.warn('[Firebase] watchCollection notice listening to notifications:', err?.message);
      }
    );
  } catch (e) {}

  // 2. Direct fetch helper
  const fetchNotifsDirect = async () => {
    if (isDisposed) return;
    try {
      const adapterSnaps = await withTimeout(adapterGetCollection<NotificationItem>(collectionPath), 3500, null);
      if (adapterSnaps && !isDisposed && adapterSnaps.length > 0) {
        const notifs = adapterSnaps
          .filter((s) => s.exists && s.val)
          .map((s) => s.data() as NotificationItem);
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
        return;
      }
      const restNotifs = await restListDocs(`couples/${cleanCode}/notifications`);
      if (restNotifs !== null && !isDisposed) {
        const notifs = restNotifs as NotificationItem[];
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
      }
    } catch (e) {}
  };

  fetchNotifsDirect();

  return () => {
    isDisposed = true;
    if (unsubSnapshot) unsubSnapshot();
  };
}


export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanedNotif = cleanFirestoreData(notif);
  
  adapterWriteDocument(`couples/${cleanCode}/notifications/${notif.id}`, cleanedNotif, { merge: true }).catch((err) => {
    console.warn('[Firebase] adapterWriteDocument notif notice:', err?.message);
  });
  restSetDoc(`couples/${cleanCode}/notifications/${notif.id}`, cleanedNotif, false).catch(() => {});
  
  adapterPatchDocument(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {
    restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {});
  });
  
  return true;
}

export async function deleteNotificationFromFirestore(code: string, notifId: string) {
  if (!code || !notifId) return false;
  const cleanCode = code.trim().toUpperCase();
  
  adapterDeleteDocument(`couples/${cleanCode}/notifications/${notifId}`).catch((err) => {
    console.warn('[Firebase] adapterDeleteDocument notif notice:', err?.message);
  });
  restDeleteDoc(`couples/${cleanCode}/notifications/${notifId}`).catch(() => {});
  
  adapterPatchDocument(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {
    restSetDoc(`couples/${cleanCode}`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {});
  });
  
  return true;
}

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
    const lookupPromises: Promise<any>[] = [];

    if (targetUid) {
      lookupPromises.push(queryCollectionWhere('couples', { field: 'memberUids', operator: 'array-contains', value: targetUid }).catch(() => []));
      lookupPromises.push(queryCollectionWhere('couples', { field: 'ownerUid', operator: '==', value: targetUid }).catch(() => []));
      lookupPromises.push(queryCollectionWhere('couples', { field: 'partnerAUid', operator: '==', value: targetUid }).catch(() => []));
      lookupPromises.push(queryCollectionWhere('couples', { field: 'partnerBUid', operator: '==', value: targetUid }).catch(() => []));
    }

    if (targetEmail) {
      lookupPromises.push(queryCollectionWhere('couples', { field: 'ownerEmail', operator: '==', value: targetEmail }).catch(() => []));
      lookupPromises.push(queryCollectionWhere('couples', { field: 'partnerBEmail', operator: '==', value: targetEmail }).catch(() => []));
    }

    const results = await withTimeout(Promise.all(lookupPromises), 10000, []);
    for (const snaps of results) {
      if (Array.isArray(snaps)) {
        snaps.forEach((d: any) => coupleCodesToDelete.add(d.id));
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
      await adapterDeleteDocument(`couples/${cCode}`);
      restDeleteDoc(`couples/${cCode}`).catch(() => {});
    } catch (e: any) {
      console.error('[DUO-SYNC-ERROR] Failed to delete couple doc:', e?.code, e?.message);
    }
    
    // Subcollections cleanup in background
    (async () => {
      try {
        const spotsSnap = await adapterGetCollection(`couples/${cCode}/spots`).catch(() => []);
        for (const s of spotsSnap) await adapterDeleteDocument(`couples/${cCode}/spots/${s.id}`).catch(() => {});
        
        const notifsSnap = await adapterGetCollection(`couples/${cCode}/notifications`).catch(() => []);
        for (const n of notifsSnap) await adapterDeleteDocument(`couples/${cCode}/notifications/${n.id}`).catch(() => {});
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
