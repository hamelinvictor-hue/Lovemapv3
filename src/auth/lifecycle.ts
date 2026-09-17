import { Capacitor, registerPlugin } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { clearFirestorePersistence } from '../data/firestoreAdapter';

// Dynamic registration of Capacitor plugins to ensure safe compilation across web and native
const Preferences = registerPlugin<any>('Preferences');
const FirebaseAuthentication = registerPlugin<any>('FirebaseAuthentication');
const OneSignalPlugin = registerPlugin<any>('OneSignal');

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
 * 2. OneSignal.logout() -> Disassociate device from the user
 * 3. FirebaseAuthentication.signOut() -> Sign out from native Firebase & Web Auth
 * 4. FirebaseFirestore.clearPersistence() -> Wipe local cache (MUST happen after listeners are removed)
 * 5. Purge localStorage and Preferences -> Flush local device key-value storage
 * 6. Reset React root state -> Clean in-memory state
 */
export async function fullTeardown(callbacks?: ResetStateCallbacks): Promise<void> {
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

  // 2. OneSignal.logout()
  try {
    if (typeof window !== 'undefined' && (window as any).OneSignal && typeof (window as any).OneSignal.logout === 'function') {
      await (window as any).OneSignal.logout();
    } else if (Capacitor.isNativePlatform() && OneSignalPlugin && typeof OneSignalPlugin.logout === 'function') {
      await OneSignalPlugin.logout();
    }
    console.log('  ✅ [2/6] OneSignal.logout() completed');
  } catch (err: any) {
    console.warn('  ⚠️ [2/6] Notice on OneSignal.logout:', err?.message || err);
  }

  // 3. FirebaseAuthentication.signOut() (Native + Web SDK fallback)
  try {
    if (Capacitor.isNativePlatform() && FirebaseAuthentication && typeof FirebaseAuthentication.signOut === 'function') {
      await FirebaseAuthentication.signOut();
    }
    await signOut(auth);
    console.log('  ✅ [3/6] FirebaseAuthentication.signOut() completed');
  } catch (err: any) {
    console.warn('  ⚠️ [3/6] Notice on FirebaseAuthentication.signOut:', err?.message || err);
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

/**
 * Connects OneSignal user login exclusively using the UID returned by FirebaseAuthentication.getCurrentUser()
 */
export async function syncOneSignalUser(uid: string | null): Promise<void> {
  if (!uid) return;

  try {
    let currentAuthUid: string = uid;

    if (Capacitor.isNativePlatform() && FirebaseAuthentication && typeof FirebaseAuthentication.getCurrentUser === 'function') {
      const nativeUser = await FirebaseAuthentication.getCurrentUser();
      if (nativeUser?.user?.uid) {
        currentAuthUid = nativeUser.user.uid;
      }
    }

    if (typeof window !== 'undefined' && (window as any).OneSignal && typeof (window as any).OneSignal.login === 'function') {
      await (window as any).OneSignal.login(currentAuthUid);
      console.log('🔔 [lifecycle] OneSignal.login(uid) called for:', currentAuthUid);
    } else if (Capacitor.isNativePlatform() && OneSignalPlugin && typeof OneSignalPlugin.login === 'function') {
      await OneSignalPlugin.login({ externalId: currentAuthUid });
      console.log('🔔 [lifecycle] OneSignalPlugin.login called for:', currentAuthUid);
    }
  } catch (err: any) {
    console.warn('🔔 [lifecycle] Notice syncing OneSignal user:', err?.message || err);
  }
}
