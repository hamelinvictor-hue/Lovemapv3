import { Capacitor, registerPlugin } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { clearFirestorePersistence } from '../data/firestoreAdapter';
import { unregisterFcmTokenOnSignOut } from '../lib/fcmManager';

import { triggerNativeSignOut } from '../lib/nativePermissions';

// Dynamic registration of Capacitor plugins to ensure safe compilation across web and native
const Preferences = registerPlugin<any>('Preferences');

/**
 * Options to reset React root state during full teardown
 */
export interface ResetStateCallbacks {
  resetState?: () => void;
}

/**
 * Performs a complete, clean, ordered teardown of the local and remote application session.
 * 
 * Order of execution (MANDATORY):
 * 1. FirebaseFirestore.removeAllListeners() -> Terminate all active realtime watchers
 * 2. unregisterFcmTokenOnSignOut() -> Delete FCM token and remove from users/{uid}.fcmTokens BEFORE signOut
 * 3. triggerNativeSignOut() + signOut(auth) -> Sign out from native Google/Apple & Firebase Auth
 * 4. FirebaseFirestore.clearPersistence() -> Wipe local cache (MUST happen after listeners are removed)
 * 5. Purge localStorage and Preferences -> Flush local device key-value storage
 * 6. Reset React root state -> Clean in-memory state
 */
export async function fullTeardown(callbacks?: ResetStateCallbacks, currentUid?: string | null): Promise<void> {
  console.log('🔄 [lifecycle] Starting fullTeardown in strict order...');

  // 1. FirebaseFirestore.removeAllListeners()
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.removeAllListeners();
      console.log('  ✅ [1/6] FirebaseFirestore.removeAllListeners() completed');
    }
  } catch (err: any) {
    console.warn('  ⚠️ [1/6] Notice on FirebaseFirestore.removeAllListeners:', err?.message || err);
  }

  // 2. Unregister FCM token BEFORE signOut
  try {
    const activeUid = currentUid || auth.currentUser?.uid || null;
    await unregisterFcmTokenOnSignOut(activeUid);
    console.log('  ✅ [2/6] FCM token unregistered & removed from Firestore before signOut');
  } catch (err: any) {
    console.warn('  ⚠️ [2/6] Notice on unregisterFcmTokenOnSignOut:', err?.message || err);
  }

  // 3. triggerNativeSignOut() + signOut(auth) (Native + Web SDK)
  try {
    await triggerNativeSignOut().catch(() => {});
    await signOut(auth);
    console.log('  ✅ [3/6] Firebase and Native sign out completed');
  } catch (err: any) {
    console.warn('  ⚠️ [3/6] Notice on sign out:', err?.message || err);
  }

  // 4. FirebaseFirestore.clearPersistence() (Must be after listeners are removed)
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseFirestore.clearPersistence();
    } else {
      await clearFirestorePersistence();
    }
    console.log('  ✅ [4/6] FirebaseFirestore.clearPersistence() completed');
  } catch (err: any) {
    console.warn('  ⚠️ [4/6] Notice on FirebaseFirestore.clearPersistence:', err?.message || err);
  }

  // 5. Purge localStorage and Preferences
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
    if (Capacitor.isNativePlatform() && Preferences && typeof Preferences.clear === 'function') {
      await Preferences.clear();
    }
    console.log('  ✅ [5/6] Purge localStorage & Preferences completed');
  } catch (err: any) {
    console.warn('  ⚠️ [5/6] Notice purging local storage:', err?.message || err);
  }

  // 6. Reset React state
  try {
    if (callbacks?.resetState) {
      callbacks.resetState();
      console.log('  ✅ [6/6] React state reset to initial completed');
    }
  } catch (err: any) {
    console.warn('  ⚠️ [6/6] Notice resetting React state:', err?.message || err);
  }

  console.log('🏁 [lifecycle] fullTeardown successfully finished.');
}
