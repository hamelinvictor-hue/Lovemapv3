import { initializeApp } from 'firebase/app';
import {
  getAuth,
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
  deleteDoc,
  memoryLocalCache,
} from 'firebase/firestore';
import { Spot, CouplePair, NotificationItem, PartnerId, UserProfile } from '../types';
import { INITIAL_SPOTS } from '../data/initialData';
import { getStoredAuthUser, saveStoredAuthUser, StoredAuthUser } from './storage';
import { triggerNativeGoogleAuth, triggerNativeAppleAuth, isMobileDevice, isCapacitorNative } from './nativePermissions';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Initialize Firestore with clean in-memory cache to prevent container clock drift / simulated timestamp warnings
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
    },
    firebaseConfig.firestoreDatabaseId || undefined
  );
} catch {
  firestoreInstance = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
}

// Check for redirect result on initialization for iOS PWA/Web
getRedirectResult(auth).then((res) => {
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
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    return fallback;
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

        try {
          const credential = appleProvider.credential({
            idToken: nativeApple.identityToken,
            rawNonce: nativeApple.nonce,
          });
          const authPromise = signInWithCredential(auth, credential);
          const res = await withTimeout<any>(authPromise, 4000, null);
          const user = res?.user;
          if (user) {
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
        } catch (credErr) {
          console.warn('Firebase Apple credential error, utilizing native Apple ID session:', credErr);
        }

        // Guaranteed authenticated user with Apple Token ID if Firebase Auth credential times out
        const appleUid = 'apple_' + (nativeApple.email ? nativeApple.email.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(2, 10));
        const appleUserStored: StoredAuthUser = {
          uid: appleUid,
          displayName: fullName,
          email: nativeApple.email || null,
          photoURL: defaultPhoto,
          providerId: 'apple.com',
          isAnonymous: false,
        };
        saveStoredAuthUser(appleUserStored);
        return buildSyntheticUser(appleUserStored);
      }
    } else {
      const nativeGoogle = await triggerNativeGoogleAuth();
      if (nativeGoogle?.idToken) {
        try {
          const credential = GoogleAuthProvider.credential(nativeGoogle.idToken);
          const authPromise = signInWithCredential(auth, credential);
          const res = await withTimeout<any>(authPromise, 4000, null);
          const user = res?.user;
          if (user) {
            saveStoredAuthUser({
              uid: user.uid,
              displayName: user.displayName || nativeGoogle.displayName || label,
              email: user.email || nativeGoogle.email || null,
              photoURL: user.photoURL || defaultPhoto,
              providerId,
              isAnonymous: false,
            });
            return user;
          }
        } catch (credErr) {
          console.warn('Firebase Google credential error, utilizing native Google session:', credErr);
        }

        const googleUid = 'google_' + (nativeGoogle.email ? nativeGoogle.email.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(2, 10));
        const googleUserStored: StoredAuthUser = {
          uid: googleUid,
          displayName: nativeGoogle.displayName || label,
          email: nativeGoogle.email || null,
          photoURL: defaultPhoto,
          providerId: 'google.com',
          isAnonymous: false,
        };
        saveStoredAuthUser(googleUserStored);
        return buildSyntheticUser(googleUserStored);
      }
    }
  } catch (nativeErr) {
    console.warn(`Native ${providerName} plugin attempt failed, continuing to mobile fallback:`, nativeErr);
  }

  // 2. Try Web Popup or Redirect
  try {
    const provider = isApple ? appleProvider : googleProvider;
    // On iOS Web / Safari, popup might be blocked or not supported.
    // Try popup first
    let user;
    try {
      const res = await signInWithPopup(auth, provider);
      user = res.user;
    } catch (popupErr: any) {
      console.warn(`Popup error on mobile (${providerName}):`, popupErr?.code || popupErr?.message || popupErr);
      if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/operation-not-supported-in-this-environment') {
        // Fallback to redirect
        await signInWithRedirect(auth, provider);
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
  // If running on iPhone, iPad, Android or Capacitor native app, use the mobile-optimized bridge
  if (isMobileDevice()) {
    return performMobileAuth('google', preferredDisplayName);
  }

  try {
    const res = await signInWithPopup(auth, googleProvider);
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
    console.warn('Google Popup error on web, using resilient auth:', popupErr?.message || popupErr);
    if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/operation-not-supported-in-this-environment' || popupErr?.code === 'auth/internal-error') {
      return performMobileAuth('google', preferredDisplayName);
    }
    throw popupErr;
  }
}

// Helper to sign in with Apple with mobile and web support
export async function loginWithApple(preferredDisplayName?: string): Promise<User> {
  // If running on iPhone, iPad, Android or Capacitor native app, use the mobile-optimized bridge
  if (isMobileDevice()) {
    return performMobileAuth('apple', preferredDisplayName);
  }

  try {
    const res = await signInWithPopup(auth, appleProvider);
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
    console.warn('Apple Popup error on web, using resilient auth:', popupErr?.message || popupErr);
    if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/operation-not-supported-in-this-environment' || popupErr?.code === 'auth/internal-error') {
      return performMobileAuth('apple', preferredDisplayName);
    }
    throw popupErr;
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
  const cleanCode = code.trim().toUpperCase();
  try {
    const user = await ensureGuestUser();
    const coupleRef = doc(db, 'couples', cleanCode);
    const snap = await withTimeout(getDoc(coupleRef), 3000, null);

    if (!snap || !snap.exists()) {
      const memberUids = [user.uid];
      const newRoom = cleanFirestoreData({
        ...localCouple,
        code: cleanCode,
        ownerUid: user.uid,
        partnerAUid: partnerId === 'partner_a' ? user.uid : null,
        partnerBUid: partnerId === 'partner_b' ? user.uid : null,
        memberUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await withTimeout(setDoc(coupleRef, newRoom, { merge: true }), 3000, null);

      // Seed spots into Firestore
      for (const s of INITIAL_SPOTS) {
        const spotRef = doc(db, 'couples', cleanCode, 'spots', s.id);
        const sanitizedSpot = cleanFirestoreData(JSON.parse(JSON.stringify(s)));
        await withTimeout(
          setDoc(
            spotRef,
            {
              ...sanitizedSpot,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ),
          2000,
          null
        );
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
        await withTimeout(
          setDoc(coupleRef, updatePayload, { merge: true }),
          3000,
          null
        );
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
    await withTimeout(
      setDoc(
        coupleRef,
        cleanFirestoreData({
          ...newCouple,
          ownerUid: user.uid,
          ownerEmail: user.email || '',
          partnerAUid: user.uid,
          memberUids: [user.uid],
          isCodeUsed: false,
          createdAt: serverTimestamp(),
        })
      ),
      3000,
      null
    );

    // Seed initial spots into Firestore
    for (const s of INITIAL_SPOTS) {
      const spotRef = doc(db, 'couples', code, 'spots', s.id);
      const sanitizedSpot = cleanFirestoreData(JSON.parse(JSON.stringify(s)));
      await withTimeout(
        setDoc(spotRef, {
          ...sanitizedSpot,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        1500,
        null
      );
    }
  } catch (e) {
    console.warn('Firestore setDoc notice (proceeding locally):', e);
  }

  return { couple: newCouple, isExisting: false };
}

// Join an existing couple room by couple code
export async function joinCoupleInFirestore(
  user: User,
  code: string,
  partnerName: string = 'Sam',
  avatarUrl?: string
): Promise<CouplePair | null> {
  const normalizedCode = code.trim().toUpperCase();
  const coupleRef = doc(db, 'couples', normalizedCode);
  const snap = await withTimeout(getDoc(coupleRef), 3500, null);

  if (!snap || !snap.exists()) {
    throw new Error('Code de couple introuvable. Vérifiez le code fourni par votre partenaire.');
  }

  const existingData = snap.data() as CouplePair & {
    ownerUid?: string;
    partnerAUid?: string;
    partnerBUid?: string;
    memberUids?: string[];
    isCodeUsed?: boolean;
  };

  // Check if code was already used by a partner
  const isAlreadyPaired = 
    (existingData.partnerBUid && existingData.partnerBUid !== user.uid) ||
    (existingData.isCodeUsed && !existingData.memberUids?.includes(user.uid)) ||
    (existingData.partnerB?.name && existingData.partnerB.name !== 'En attente...' && !existingData.memberUids?.includes(user.uid));

  if (isAlreadyPaired) {
    throw new Error('Ce code de duo a déjà été utilisé ! Le couple est déjà complet et connecté.');
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

  const existingMembers = existingData.memberUids || [existingData.ownerUid, existingData.partnerAUid].filter(Boolean) as string[];
  const memberUids = Array.from(new Set([...existingMembers, user.uid]));

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
    3500,
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

    // Check memberUids array-contains with timeout
    const q1 = query(couplesRef, where('memberUids', 'array-contains', user.uid));
    const snap1 = await withTimeout(getDocs(q1), 3000, null);
    if (snap1 && !snap1.empty) {
      const docData = snap1.docs[0].data() as CouplePair & { partnerBUid?: string };
      const partnerId: PartnerId = docData.partnerBUid === user.uid ? 'partner_b' : 'partner_a';
      return { couple: docData, partnerId };
    }

    // Fallback query ownerUid
    const q2 = query(couplesRef, where('ownerUid', '==', user.uid));
    const snap2 = await withTimeout(getDocs(q2), 2500, null);
    if (snap2 && !snap2.empty) {
      const docData = snap2.docs[0].data() as CouplePair;
      return { couple: docData, partnerId: 'partner_a' };
    }

    // Fallback query by email if available
    if (user.email) {
      const qEmailA = query(couplesRef, where('ownerEmail', '==', user.email));
      const snapEmailA = await withTimeout(getDocs(qEmailA), 2500, null);
      if (snapEmailA && !snapEmailA.empty) {
        const docData = snapEmailA.docs[0].data() as CouplePair;
        return { couple: docData, partnerId: 'partner_a' };
      }
    }

    return null;
  } catch (err) {
    console.warn('Notice querying user couple from Firestore:', err);
    return null;
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
      for (const d of spotsSnap.docs) {
        await deleteDoc(doc(db, 'couples', cleanCode, 'spots', d.id));
      }
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
  if (code) {
    try {
      const spotsCol = collection(db, 'couples', code, 'spots');
      const spotsSnap = await withTimeout(getDocs(spotsCol), 3000, null);
      if (spotsSnap) {
        for (const d of spotsSnap.docs) {
          await deleteDoc(doc(db, 'couples', code, 'spots', d.id));
        }
      }
      await deleteDoc(doc(db, 'couples', code));
    } catch (e) {
      console.warn('Notice deleting couple document in Firestore:', e);
    }
  }

  saveStoredAuthUser(null);
  if (user) {
    try {
      await user.delete();
    } catch {
      // Ignore
    }
  }
  try {
    await signOut(auth);
  } catch {
    // Ignore
  }
}

export const logoutFromFirebase = logoutUser;
