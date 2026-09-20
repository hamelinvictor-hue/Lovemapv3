import { Capacitor, registerPlugin } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase';

// Dynamic import / plugin registration to ensure robust compatibility
const FirebaseMessaging = registerPlugin<any>('FirebaseMessaging');

let tokenListenerHandle: PluginListenerHandle | null = null;
let currentActiveUid: string | null = null;
let currentRegisteredToken: string | null = null;

/**
 * Checks current notification permission state
 */
export async function checkNotificationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform() && FirebaseMessaging && typeof FirebaseMessaging.checkPermissions === 'function') {
      const res = await FirebaseMessaging.checkPermissions();
      return res?.receive === 'granted';
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
  } catch (err) {
    console.warn('[FCM] Error checking permissions:', err);
  }
  return false;
}

/**
 * Requests push notification permission explicitly triggered by user action
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform() && FirebaseMessaging && typeof FirebaseMessaging.requestPermissions === 'function') {
      const res = await FirebaseMessaging.requestPermissions();
      return res?.receive === 'granted';
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
  } catch (err) {
    console.warn('[FCM] Error requesting notification permission:', err);
  }
  return false;
}

/**
 * Obtains current FCM token and registers it in users/{uid}.fcmTokens array
 * Handles multi-device by appending via arrayUnion.
 */
export async function registerFcmToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  currentActiveUid = uid;

  try {
    let token: string | null = null;

    if (Capacitor.isNativePlatform() && FirebaseMessaging && typeof FirebaseMessaging.getToken === 'function') {
      const tokenResult = await FirebaseMessaging.getToken();
      token = tokenResult?.token || null;
    }

    if (!token) {
      console.log('[FCM] No token available on this platform/device');
      return null;
    }

    currentRegisteredToken = token;
    await saveTokenToUserDoc(uid, token);
    await setupTokenRotationListener(uid);

    console.log('[FCM] Token successfully registered for user:', uid);
    return token;
  } catch (err: any) {
    console.warn('[FCM] Error registering FCM token:', err?.message || err);
    return null;
  }
}

/**
 * Persists token in Firestore users/{uid}.fcmTokens as an array for multi-device support
 */
async function saveTokenToUserDoc(uid: string, token: string): Promise<void> {
  if (!uid || !token) return;

  try {
    if (Capacitor.isNativePlatform()) {
      // Use @capacitor-firebase/firestore native plugin
      const userDoc = await FirebaseFirestore.getDocument<{ fcmTokens?: string[] }>({
        reference: `users/${uid}`,
      });

      const existingTokens: string[] = userDoc.snapshot.data?.fcmTokens || [];
      if (!existingTokens.includes(token)) {
        await FirebaseFirestore.updateDocument({
          reference: `users/${uid}`,
          data: {
            fcmTokens: [...existingTokens, token],
            updatedAt: new Date().toISOString(),
          },
        });
      }
    } else {
      // Modular Web Firestore SDK
      const db = getFirestoreDb();
      if (db) {
        const userRef = doc(db, `users/${uid}`);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(token),
            updatedAt: new Date().toISOString(),
          });
        } else {
          await setDoc(userRef, {
            fcmTokens: [token],
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }
    }
  } catch (err: any) {
    console.warn('[FCM] Failed to persist token in Firestore:', err?.message || err);
  }
}

/**
 * Sets up listener for tokenReceived events (FCM token rotation)
 */
export async function setupTokenRotationListener(uid: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !FirebaseMessaging || typeof FirebaseMessaging.addListener !== 'function') {
    return;
  }

  // Remove previous listener if exists
  if (tokenListenerHandle) {
    try {
      await tokenListenerHandle.remove();
    } catch {}
    tokenListenerHandle = null;
  }

  currentActiveUid = uid;

  try {
    tokenListenerHandle = await FirebaseMessaging.addListener('tokenReceived', async (event: { token: string }) => {
      const newToken = event?.token;
      if (!newToken || !currentActiveUid) return;

      console.log('[FCM] Token rotation event received. Updating user tokens...');
      const oldToken = currentRegisteredToken;
      currentRegisteredToken = newToken;

      // 1. Remove old token if present
      if (oldToken && oldToken !== newToken) {
        await removeFcmTokenFromUser(currentActiveUid, oldToken).catch(console.warn);
      }

      // 2. Add new token
      await saveTokenToUserDoc(currentActiveUid, newToken);
    });
    console.log('[FCM] Token rotation listener attached for user:', uid);
  } catch (err: any) {
    console.warn('[FCM] Error attaching token rotation listener:', err?.message || err);
  }
}

/**
 * Removes a specific token from users/{uid}.fcmTokens
 */
export async function removeFcmTokenFromUser(uid: string, token: string): Promise<void> {
  if (!uid || !token) return;

  try {
    if (Capacitor.isNativePlatform()) {
      const userDoc = await FirebaseFirestore.getDocument<{ fcmTokens?: string[] }>({
        reference: `users/${uid}`,
      });

      const existingTokens: string[] = userDoc.snapshot.data?.fcmTokens || [];
      const updatedTokens = existingTokens.filter((t) => t !== token);

      await FirebaseFirestore.updateDocument({
        reference: `users/${uid}`,
        data: {
          fcmTokens: updatedTokens,
          updatedAt: new Date().toISOString(),
        },
      });
    } else {
      const db = getFirestoreDb();
      if (db) {
        const userRef = doc(db, `users/${uid}`);
        await updateDoc(userRef, {
          fcmTokens: arrayRemove(token),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    console.log('[FCM] Token removed from user document:', uid);
  } catch (err: any) {
    console.warn('[FCM] Error removing token from Firestore:', err?.message || err);
  }
}

/**
 * Teardown helper for FCM:
 * 1. Detaches rotation listener
 * 2. Deletes token from native FCM SDK (deleteToken)
 * 3. Removes current token from users/{uid}.fcmTokens in Firestore
 * MUST be executed BEFORE signOut().
 */
export async function unregisterFcmTokenOnSignOut(uid: string | null): Promise<void> {
  const targetUid = uid || currentActiveUid;

  // 1. Remove token listener
  if (tokenListenerHandle) {
    try {
      await tokenListenerHandle.remove();
      console.log('[FCM] Token listener handle removed');
    } catch {}
    tokenListenerHandle = null;
  }

  const tokenToRemove = currentRegisteredToken;

  // 2. Remove token from Firestore
  if (targetUid && tokenToRemove) {
    try {
      await removeFcmTokenFromUser(targetUid, tokenToRemove);
    } catch (err) {
      console.warn('[FCM] Failed to remove token from Firestore during teardown:', err);
    }
  }

  // 3. Delete token in native plugin
  if (Capacitor.isNativePlatform() && FirebaseMessaging && typeof FirebaseMessaging.deleteToken === 'function') {
    try {
      await FirebaseMessaging.deleteToken();
      console.log('[FCM] FirebaseMessaging.deleteToken() completed');
    } catch (err) {
      console.warn('[FCM] FirebaseMessaging.deleteToken notice:', err);
    }
  }

  currentActiveUid = null;
  currentRegisteredToken = null;
}
