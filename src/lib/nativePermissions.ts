import { Capacitor, registerPlugin } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AppReview } from '@capawesome/capacitor-app-review';
import { App } from '@capacitor/app';
import { AppTrackingTransparency } from 'capacitor-app-tracking-transparency';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

// Register plugins dynamically via @capacitor/core so Vite build succeeds everywhere
const Geolocation = registerPlugin<any>('Geolocation');
export const AppleSignIn = registerPlugin<any>('AppleSignIn');

export enum SignInScope {
  Email = 'EMAIL',
  FullName = 'FULL_NAME',
}

/**
 * Bridge for Capacitor Native iOS / Android plugins with clean dynamic fallback
 * Allows native iOS Apple dialogs and native SDK auth when running in Xcode / iPhone,
 * while maintaining 100% functionality on web.
 */

export const isCapacitorNative = (): boolean => {
  if (typeof window === 'undefined') return false;
  // Strictly check Capacitor.isNativePlatform()
  if (typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function') {
    return Capacitor.isNativePlatform();
  }
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function') {
    return cap.isNativePlatform();
  }
  return false;
};

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /android/i.test(ua);
  return isCapacitorNative() || isIos || isAndroid;
};

export const isNativePlatform = (): boolean => {
  return isMobileDevice();
};
export const requestNativeGeolocation = triggerNativeGeolocation;
export const requestNativeNotification = triggerNativeNotification;

/**
 * Native App Tracking Transparency (ATT) permission request on iOS
 */
export async function triggerNativeAppTracking(): Promise<'authorized' | 'denied'> {
  if (!isCapacitorNative()) {
    return 'authorized';
  }

  const cap = (window as any).Capacitor;
  try {
    if (AppTrackingTransparency) {
      const attInstance = new (AppTrackingTransparency as any)();
      if (typeof attInstance.requestPermission === 'function') {
        const res = await attInstance.requestPermission();
        return res?.status === 'authorized' ? 'authorized' : 'denied';
      }
    }
  } catch (e) {
    console.warn('Native AppTrackingTransparency class instance error:', e);
  }

  try {
    if (cap?.Plugins?.AppTrackingTransparency?.requestPermission) {
      const res = await cap.Plugins.AppTrackingTransparency.requestPermission();
      return res?.status === 'authorized' || res?.value?.status === 'authorized' ? 'authorized' : 'denied';
    }
  } catch (e) {
    console.warn('Native AppTrackingTransparency plugin call fallback:', e);
  }
  return 'authorized';
}

/**
 * Safely blur any active focused text input element to avoid iOS RTIInputSystemClient keyboard session crashes
 */
function dismissActiveKeyboard(): void {
  if (typeof document !== 'undefined' && document.activeElement) {
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && typeof activeEl.blur === 'function') {
      activeEl.blur();
    }
  }
}

/**
 * Native System Confirmation Dialog (replaces web modal popups on mobile iOS/Android)
 */
export async function showNativeConfirm(title: string, message: string, okButtonTitle = 'Confirmer', cancelButtonTitle = 'Annuler'): Promise<boolean> {
  dismissActiveKeyboard();
  
  const cap = (window as any).Capacitor;
  if (isCapacitorNative() && cap?.Plugins?.Dialog) {
    try {
      const res = await cap.Plugins.Dialog.confirm({
        title,
        message,
        okButtonTitle,
        cancelButtonTitle,
      });
      return !!res.value;
    } catch (e) {
      console.warn('Native Dialog plugin error:', e);
    }
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return true;
}

/**
 * Check if Geolocation permission is already granted without prompting system dialog
 */
export async function checkNativeLocationPermission(): Promise<boolean> {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.Plugins?.Geolocation?.checkPermissions) {
      const res = await cap.Plugins.Geolocation.checkPermissions();
      if (res?.location === 'granted' || res?.coarseLocation === 'granted') {
        return true;
      }
      return false;
    }

    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions?.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return perm.state === 'granted';
      } catch {
        return false;
      }
    }
  } catch (err) {
    console.warn('checkNativeLocationPermission check notice:', err);
  }
  return false;
}

/**
 * Native Geolocation permission request and Apple iOS trigger
 */
export async function triggerNativeGeolocation(): Promise<boolean> {
  const cap = (window as any).Capacitor;
  console.log('[Native Debug] triggerNativeGeolocation called.');
  try {
    if (Geolocation && typeof Geolocation.requestPermissions === 'function') {
      const res = await Geolocation.requestPermissions();
      console.log('[Native Debug] Geolocation.requestPermissions result:', res);
      if (res?.location === 'granted' || res?.coarseLocation === 'granted') {
        return true;
      }
    }
  } catch (e) {
    console.warn('[Native Debug] Geolocation.requestPermissions plugin error:', e);
  }

  if (cap?.Plugins?.Geolocation) {
    try {
      console.log('[Native Debug] Calling cap.Plugins.Geolocation.requestPermissions()...');
      const res = await cap.Plugins.Geolocation.requestPermissions();
      console.log('[Native Debug] cap.Plugins.Geolocation.requestPermissions() result:', res);
      if (res?.location === 'granted' || res?.coarseLocation === 'granted' || res?.results?.location === 'granted') {
        return true;
      }
    } catch (e) {
      console.warn('[Native Debug] Native Geolocation plugin requestPermissions error:', e);
    }
  }

  return new Promise((resolve) => {
    console.log('[Native Debug] Falling back to getCurrentPosition...');
    const fallbackTimeout = setTimeout(() => {
      console.warn('[Native Debug] Geolocation request timed out!');
      resolve(false);
    }, 12000);

    const geoService = (Geolocation && typeof Geolocation.getCurrentPosition === 'function') ? Geolocation : cap?.Plugins?.Geolocation;
    if (geoService) {
      geoService.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      })
        .then((pos: any) => {
          clearTimeout(fallbackTimeout);
          console.log('[Native Debug] Geolocation.getCurrentPosition resolved:', pos);
          resolve(true);
        })
        .catch((err: any) => {
          console.warn('[Native Debug] Geolocation.getCurrentPosition error:', err);
          if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                clearTimeout(fallbackTimeout);
                console.log('[Native Debug] navigator.geolocation fallback resolved:', pos);
                resolve(true);
              },
              (err2) => {
                clearTimeout(fallbackTimeout);
                console.warn('[Native Debug] navigator.geolocation fallback error:', err2);
                resolve(false);
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          } else {
            clearTimeout(fallbackTimeout);
            resolve(false);
          }
        });
      return;
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(fallbackTimeout);
          console.log('[Native Debug] navigator.geolocation resolved:', pos);
          resolve(true);
        },
        (err) => {
          clearTimeout(fallbackTimeout);
          console.warn('[Native Debug] navigator.geolocation error:', err);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      clearTimeout(fallbackTimeout);
      console.log('[Native Debug] Geolocation API not available.');
      resolve(false);
    }
  });
}

/**
 * Get accurate real-time GPS position from Apple iOS / Android native SDK or WebKit
 */
export async function getNativeCurrentPosition(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.Plugins?.Geolocation) {
      try {
        const pos = await cap.Plugins.Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 5000,
        });
        if (pos?.coords?.latitude && pos?.coords?.longitude) {
          return {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 15,
          };
        }
      } catch (e) {
        console.warn('Capacitor Geolocation getCurrentPosition notice:', e);
      }
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      return new Promise((resolve) => {
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (pos?.coords) {
                resolve({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy || 15,
                });
              } else {
                resolve(null);
              }
            },
            (err) => {
              console.warn('Navigator Geolocation notice:', err);
              resolve(null);
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
          );
        } catch {
          resolve(null);
        }
      });
    }
  } catch (err) {
    console.warn('getNativeCurrentPosition general notice:', err);
  }

  return null;
}

/**
 * Watch continuous real-time GPS position across Apple native & web
 */
export function watchNativePosition(
  onSuccess: (coords: { latitude: number; longitude: number; accuracy: number }) => void,
  onError?: (error: any) => void
): () => void {
  try {
    const cap = (window as any).Capacitor;
    let watchId: any = null;
    let cancelled = false;

    if (cap?.Plugins?.Geolocation) {
      try {
        const watchPromise = cap.Plugins.Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
          (pos: any, err: any) => {
            if (cancelled) return;
            if (pos?.coords?.latitude && pos?.coords?.longitude) {
              onSuccess({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy || 15,
              });
            } else if (err && onError) {
              onError(err);
            }
          }
        );

        if (watchPromise && typeof watchPromise.then === 'function') {
          watchPromise
            .then((id: any) => {
              if (cancelled) {
                if (id) cap.Plugins.Geolocation.clearWatch({ id }).catch(() => {});
              } else {
                watchId = id;
              }
            })
            .catch((err: any) => {
              if (onError) onError(err);
            });
        }
      } catch (err) {
        console.warn('Capacitor watchPosition call notice:', err);
      }

      return () => {
        cancelled = true;
        if (watchId && cap?.Plugins?.Geolocation) {
          cap.Plugins.Geolocation.clearWatch({ id: watchId }).catch(() => {});
        }
      };
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        const navWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (pos?.coords?.latitude && pos?.coords?.longitude) {
              onSuccess({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy || 15,
              });
            }
          },
          (err) => {
            if (onError) onError(err);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );

        return () => {
          try {
            navigator.geolocation.clearWatch(navWatchId);
          } catch {}
        };
      } catch (err) {
        console.warn('Navigator watchPosition notice:', err);
      }
    }
  } catch (err) {
    console.warn('watchNativePosition global notice:', err);
  }

  return () => {};
}

/**
 * Native Apple iOS Store Review dialog (SKStoreReviewController)
 * On iPhone / Capacitor native, prompts the real system App Store rating dialog.
 * On Web, does nothing (popup is suppressed completely).
 */
export async function triggerNativeStoreReview(): Promise<boolean> {
  if (!isCapacitorNative()) {
    // Supprimé sur le web : aucune popup !
    return false;
  }

  try {
    if (Capacitor.isPluginAvailable('AppReview') && AppReview && typeof AppReview.requestReview === 'function') {
      await AppReview.requestReview();
      console.log('[Native] SKStoreReviewController.requestReview() triggered successfully.');
      return true;
    }
  } catch (e) {
    console.warn('Native AppReview.requestReview error:', e);
  }

  const cap = (window as any).Capacitor;
  try {
    if (cap?.Plugins?.AppReview?.requestReview) {
      await cap.Plugins.AppReview.requestReview();
      return true;
    }
  } catch (e) {
    console.warn('Capacitor AppReview plugin fallback error:', e);
  }

  return false;
}

/**
 * Native Push / Local Notification permission request
 */
export async function triggerNativeNotification(): Promise<boolean> {
  let granted = false;

  // 1. Native iOS / Android Push & Local Notifications (Never execute on web)
  if (isCapacitorNative()) {
    // 1a. Request LocalNotifications permission (critical for iOS UNUserNotificationCenter local alerts)
    try {
      if (Capacitor.isPluginAvailable('LocalNotifications') && LocalNotifications && typeof LocalNotifications.requestPermissions === 'function') {
        const res = await LocalNotifications.requestPermissions();
        if (res?.display === 'granted') {
          granted = true;
        }
      }
    } catch (e) {
      console.warn('LocalNotifications.requestPermissions plugin error:', e);
    }

    // 1b. Request FirebaseMessaging permission
    try {
      if (Capacitor.isPluginAvailable('FirebaseMessaging') && FirebaseMessaging && typeof FirebaseMessaging.requestPermissions === 'function') {
        const res = await FirebaseMessaging.requestPermissions();
        if (res?.receive === 'granted') {
          granted = true;
        }
      }
    } catch (e) {
      console.warn('FirebaseMessaging.requestPermissions plugin error:', e);
    }

    return granted;
  }

  // 2. Web Notification permission request (Browser / PWA fallback)
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const status = await Notification.requestPermission();
      if (status === 'granted') granted = true;
    } catch {
      // Ignored
    }
  }

  return granted;
}

/**
 * Dispatches an external notification (outside the app):
 * - On iPhone (iOS native via Capacitor): schedules an immediate local notification via Apple UNUserNotificationCenter,
 *   which displays the iOS system banner at the top of the screen, plays a sound, and appears on the lock screen / notification center
 *   even when the user is outside the app.
 * - On Web: uses the browser Notification API / Service Worker if permission is granted.
 */
export async function dispatchExternalSystemNotification(notif: {
  id?: string | number;
  title: string;
  message: string;
  spotId?: string;
  type?: string;
}): Promise<boolean> {
  // Convert any string id to 32-bit positive integer for Capacitor LocalNotifications
  let numericId = 1;
  if (typeof notif.id === 'number') {
    numericId = Math.abs(notif.id) % 2147483647 || 1;
  } else if (notif.id) {
    let hash = 0;
    const str = String(notif.id);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    numericId = Math.abs(hash) % 2147483647 || 1;
  } else {
    numericId = (Date.now() % 2147483647) || 1;
  }

  // 1. Native iOS / Android via Capacitor LocalNotifications
  if (isCapacitorNative() && Capacitor.isPluginAvailable('LocalNotifications')) {
    try {
      if (LocalNotifications && typeof LocalNotifications.schedule === 'function') {
        // Ensure channel exists on Android
        try {
          if (typeof LocalNotifications.createChannel === 'function') {
            await LocalNotifications.createChannel({
              id: 'lovemap_duo',
              name: 'LoveMap Duo',
              description: 'Notifications partagées par votre duo',
              importance: 5,
              visibility: 1,
              vibration: true,
            });
          }
        } catch {
          // Ignored on iOS
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              id: numericId,
              title: notif.title || '💖 LoveMap Duo',
              body: notif.message || 'Votre partenaire a partagé une nouvelle activité !',
              sound: 'beep.wav',
              channelId: 'lovemap_duo',
              extra: {
                spotId: notif.spotId,
                type: notif.type,
                id: notif.id,
              },
              schedule: { at: new Date(Date.now() + 100) },
            },
          ],
        });
        console.log('[Native] System notification banner dispatched outside app:', notif.title);
        return true;
      }
    } catch (err) {
      console.warn('[Native] LocalNotifications.schedule error:', err);
    }
  }

  // 2. Web fallback (Browser / PWA)
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(notif.title || '💖 LoveMap Duo', {
            body: notif.message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: String(notif.id || Date.now()),
            data: {
              spotId: notif.spotId,
              type: notif.type,
              url: '/',
            },
          });
          return true;
        } else {
          new Notification(notif.title || '💖 LoveMap Duo', {
            body: notif.message,
            icon: '/favicon.ico',
            tag: String(notif.id || Date.now()),
          });
          return true;
        }
      }
    } catch (e) {
      console.warn('[Web] System notification dispatch error:', e);
    }
  }

  return false;
}

/**
 * Sets up listeners for native notification taps and push tokens on iPhone
 */
export function setupNativeNotificationHandlers(callbacks: {
  onNotificationClick: (data: { spotId?: string; type?: string; id?: string }) => void;
  onPushToken?: (token: string) => void;
  onAppStateChange?: (isActive: boolean) => void;
}): () => void {
  const unsubs: Array<() => void> = [];

  // Strictly disabled on Web - plugins are only invoked on iOS / Android native
  if (!isCapacitorNative()) {
    return () => {};
  }

  // 1. Local notification clicked while app is outside / in background
  try {
    if (Capacitor.isPluginAvailable('LocalNotifications') && LocalNotifications && typeof LocalNotifications.addListener === 'function') {
      const handlePromise = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const extra = action.notification.extra;
        if (extra) {
          callbacks.onNotificationClick(extra);
        }
      });
      unsubs.push(() => {
        handlePromise.then((h: any) => h?.remove?.()).catch(() => {});
      });
    }
  } catch (e) {
    console.warn('Error adding LocalNotifications listener:', e);
  }

  // 2. FCM Push notification clicked by user
  try {
    if (Capacitor.isPluginAvailable('FirebaseMessaging') && FirebaseMessaging && typeof FirebaseMessaging.addListener === 'function') {
      const pushActionPromise = FirebaseMessaging.addListener('notificationActionPerformed', (action: any) => {
        const data = action?.notification?.data;
        if (data) {
          callbacks.onNotificationClick(data);
        }
      });
      unsubs.push(() => {
        pushActionPromise.then((h: any) => h?.remove?.()).catch(() => {});
      });

      // 3. FCM Push Token Registration / Rotation
      const pushRegPromise = FirebaseMessaging.addListener('tokenReceived', (event: any) => {
        if (event?.token && callbacks.onPushToken) {
          callbacks.onPushToken(event.token);
        }
      });
      unsubs.push(() => {
        pushRegPromise.then((h: any) => h?.remove?.()).catch(() => {});
      });

      // 4. In-flight push notification received while app is active
      const pushRecPromise = FirebaseMessaging.addListener('notificationReceived', (notification: any) => {
        console.log('[Native] FCM push notification received in foreground:', notification);
        // Force a data sync because a partner action occurred
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('native-app-resume'));
        }
      });
      unsubs.push(() => {
        pushRecPromise.then((h: any) => h?.remove?.()).catch(() => {});
      });
    }
  } catch (e) {
    console.warn('Error adding FirebaseMessaging listeners:', e);
  }

  // 5. App State Change (detect background / foreground)
  try {
    if (Capacitor.isPluginAvailable('App') && App && typeof App.addListener === 'function') {
      const appStatePromise = App.addListener('appStateChange', (state) => {
        if (callbacks.onAppStateChange) {
          callbacks.onAppStateChange(state.isActive);
        }
      });
      unsubs.push(() => {
        appStatePromise.then((h: any) => h?.remove?.()).catch(() => {});
      });
    }
  } catch (e) {
    console.warn('Error adding App state listener:', e);
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

/**
 * Native Google Sign In via Capacitor plugin (@capawesome/capacitor-google-sign-in)
 */
export async function triggerNativeGoogleAuth(): Promise<{ idToken: string; displayName?: string; email?: string } | null> {
  const cap = (window as any).Capacitor;
  
  const capawesomePlugin = GoogleSignIn || cap?.Plugins?.GoogleSignIn || (window as any).GoogleSignIn;
  if (capawesomePlugin && typeof capawesomePlugin.signIn === 'function') {
    console.log('[Native Debug] Using @capawesome/capacitor-google-sign-in plugin...');
    try {
      if (typeof capawesomePlugin.initialize === 'function') {
        try {
          await capawesomePlugin.initialize({
            scopes: ['profile', 'email'],
          });
        } catch (initErr) {
          console.warn('[Native Debug] GoogleSignIn.initialize() warning:', initErr);
        }
      }

      const authPromise = capawesomePlugin.signIn();
      console.log('[Native Debug] Waiting for capawesomePlugin.signIn()...');
      const res: any = await withTimeoutPromise(
        authPromise,
        20000,
        'Délai de connexion Google dépassé. Veuillez réessayer.'
      );
      console.log('[Native Debug] GoogleSignIn.signIn() completed:', res);
      const token = res?.idToken || res?.authentication?.idToken || res?.accessToken;
      if (token) {
        return {
          idToken: token,
          displayName: res?.user?.displayName || res?.user?.name || res?.user?.givenName,
          email: res?.user?.email,
        };
      }
    } catch (err: any) {
      console.warn('[Native Debug] @capawesome/capacitor-google-sign-in error:', err);
      if (err?.code !== 'UNIMPLEMENTED') {
        throw new Error(err?.message || 'Erreur Google Sign-In Native');
      }
    }
  }

  throw new Error('Le plugin GoogleSignIn n\'est pas installé sur cet appareil.');
}

// Helper to generate a cryptographically random raw nonce
function generateRawNonce(length = 32): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  let result = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

// Helper to compute SHA-256 for Apple authorize request
async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function withTimeoutPromise<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Native Apple Sign In via Capacitor plugin (@capacitor-community/apple-sign-in)
 */
export async function triggerNativeAppleAuth(): Promise<{
  identityToken: string;
  appleUserId?: string;
  rawNonce?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
} | null> {
  const cap = (window as any).Capacitor;
  const applePlugin = AppleSignIn || cap?.Plugins?.AppleSignIn || (window as any).AppleSignIn;
  console.log('[Native Debug] triggerNativeAppleAuth called (@capawesome/capacitor-apple-sign-in). Available:', !!applePlugin);
  
  if (applePlugin && typeof applePlugin.signIn === 'function') {
    try {
      const rawNonce = generateRawNonce(32);
      const hashedNonce = await sha256Hex(rawNonce);
      console.log('[Native Debug] Calling AppleSignIn.signIn() with hashed nonce...');
      
      const authPromise = applePlugin.signIn({
        scopes: [SignInScope.Email, SignInScope.FullName],
        nonce: hashedNonce,
      });

      // Safety timeout: 25 seconds
      const rawRes = await withTimeoutPromise(
        authPromise,
        25000,
        'Délai de connexion Apple dépassé. Veuillez réessayer.'
      );
      const res = rawRes as any;

      console.log('[Native Debug] AppleSignIn.signIn() response received:', !!res);
      
      if (res && res.idToken) {
        return {
          identityToken: res.idToken,
          appleUserId: res.user || undefined,
          rawNonce,
          givenName: res.givenName || undefined,
          familyName: res.familyName || undefined,
          email: res.email || undefined,
        };
      }
      throw new Error('Jeton d\'authentification Apple non reçu.');
    } catch (e: any) {
      const errCode = String(e?.code || "");
      const errMsg = String(e?.message || e?.errorMessage || "");

      if (
        errCode === 'SIGN_IN_CANCELED' ||
        errCode === '1001' ||
        errMsg.includes('cancel') ||
        errMsg.includes('annul') ||
        errMsg.includes('1001')
      ) {
        console.log('[Native Debug] Native AppleSignIn cancelled by user');
        throw new Error('Connexion Apple annulée');
      }

      if (
        errCode === '1000' ||
        errMsg.includes('error 1000') ||
        errMsg.includes('Code=1000') ||
        errMsg.includes('AuthenticationServices.AuthorizationError')
      ) {
        console.warn(
          '[Native Debug] Native AppleSignIn Code 1000 (Compte Apple non connecté sur le simulateur/appareil ou Capability "Sign in with Apple" manquante dans Xcode).',
          e
        );
        throw new Error(
          'Connexion Apple impossible (Code 1000). Sur simulateur, connectez un compte Apple dans Réglages > Connectez-vous à votre iPhone. Sur appareil réel, vérifiez que la capability "Sign in with Apple" est bien active dans Xcode (Signing & Capabilities).'
        );
      }

      console.warn('[Native Debug] Native AppleSignIn error:', e);
      throw e;
    }
  }
  return null;
}

/**
 * Native Sign Out to clear cached sessions for Google and Apple
 */
export async function triggerNativeSignOut(): Promise<void> {
  const cap = (window as any).Capacitor;
  
  const capawesomePlugin = GoogleSignIn || cap?.Plugins?.GoogleSignIn || (window as any).GoogleSignIn;
  if (capawesomePlugin && typeof capawesomePlugin.signOut === 'function') {
    try {
      await capawesomePlugin.signOut();
      console.log('[Native Debug] Native GoogleSignIn.signOut() completed.');
    } catch (e) {
      console.warn('[Native Debug] GoogleSignIn signOut error (ignored):', e);
    }
  }
}

/**
 * Native App Resume listener (Capacitor App state change)
 */
export function onNativeAppResume(callback: () => void): () => void {
  if (!isCapacitorNative()) return () => {};
  try {
    let handle: any = null;
    App.addListener('appStateChange', (state) => {
      if (state && state.isActive) {
        callback();
      }
    }).then((h) => {
      handle = h;
    }).catch(() => {});
    return () => {
      if (handle && typeof handle.remove === 'function') {
        handle.remove();
      }
    };
  } catch (e) {
    return () => {};
  }
}