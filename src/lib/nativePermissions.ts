/**
 * Bridge for Capacitor Native iOS / Android plugins with clean dynamic fallback
 * Allows native iOS Apple dialogs and native SDK auth when running in Xcode / iPhone,
 * while maintaining 100% functionality on web.
 */

export const isCapacitorNative = (): boolean => {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  const isCapNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  return isCapNative;
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
export async function triggerNativeAppTracking(): Promise<boolean> {
  const cap = (window as any).Capacitor;
  if (isCapacitorNative() && cap?.Plugins?.AppTrackingTransparency) {
    try {
      const res = await cap.Plugins.AppTrackingTransparency.requestPermission();
      return res.status === 'authorized';
    } catch (e) {
      console.warn('Native AppTrackingTransparency plugin call fallback:', e);
    }
  }
  return true;
}

/**
 * Native System Confirmation Dialog (replaces web modal popups on mobile iOS/Android)
 */
export async function showNativeConfirm(title: string, message: string, okButtonTitle = 'Confirmer', cancelButtonTitle = 'Annuler'): Promise<boolean> {
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
  // Standard browser confirm fallback
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return true;
}

/**
 * Native Geolocation permission request
 */
export async function triggerNativeGeolocation(): Promise<boolean> {
  const cap = (window as any).Capacitor;
  if (isCapacitorNative() && cap?.Plugins?.Geolocation) {
    try {
      const res = await cap.Plugins.Geolocation.requestPermissions();
      return res.location === 'granted';
    } catch (e) {
      console.warn('Native Geolocation plugin call fallback:', e);
    }
  }

  // Fallback Web Geolocation
  return new Promise((resolve) => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      resolve(false);
    }
  });
}

/**
 * Native Push / Local Notification permission request
 */
export async function triggerNativeNotification(): Promise<boolean> {
  const cap = (window as any).Capacitor;
  if (isCapacitorNative() && cap?.Plugins?.PushNotifications) {
    try {
      const res = await cap.Plugins.PushNotifications.requestPermissions();
      return res.receive === 'granted';
    } catch (e) {
      console.warn('Native PushNotifications plugin call fallback:', e);
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const status = await Notification.requestPermission();
      return status === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Native Google Sign In via Capacitor plugin if present
 */
export async function triggerNativeGoogleAuth(): Promise<{ idToken: string; displayName?: string; email?: string } | null> {
  const cap = (window as any).Capacitor;
  const googlePlugin = (window as any).GoogleAuth || cap?.Plugins?.GoogleAuth;
  if (googlePlugin) {
    try {
      if (typeof googlePlugin.initialize === 'function') {
        try {
          await googlePlugin.initialize();
        } catch (initErr) {
          // Ignore if already initialized
        }
      }
      const googleUser = await Promise.race([
        googlePlugin.signIn(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Google sign-in plugin timeout')), 5000)),
      ]);
      const token = googleUser?.authentication?.idToken || googleUser?.idToken || googleUser?.authentication?.accessToken;
      if (token) {
        return {
          idToken: token,
          displayName: googleUser.name || googleUser.displayName || googleUser.givenName,
          email: googleUser.email,
        };
      }
    } catch (e) {
      console.warn('Native GoogleAuth plugin error/cancelled/timeout:', e);
    }
  }
  return null;
}

/**
 * Native Apple Sign In via Capacitor plugin if present
 */
export async function triggerNativeAppleAuth(): Promise<{ identityToken: string; nonce?: string; givenName?: string; familyName?: string; email?: string } | null> {
  const cap = (window as any).Capacitor;
  const applePlugin = cap?.Plugins?.SignInWithApple || (window as any).SignInWithApple;
  if (applePlugin) {
    try {
      const res = await Promise.race([
        applePlugin.authorize({
          clientId: 'com.lovemap.duo',
          redirectURI: 'https://gen-lang-client-0158057859.firebaseapp.com/__/auth/handler',
          scopes: 'email name',
        }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Apple sign-in plugin timeout')), 10000)),
      ]);
      
      const token = res?.response?.identityToken || res?.identityToken;
      if (token) {
        return {
          identityToken: token,
          nonce: res?.response?.nonce || res?.nonce,
          givenName: res?.response?.givenName || res?.givenName,
          familyName: res?.response?.familyName || res?.familyName,
          email: res?.response?.email || res?.email,
        };
      }
    } catch (e) {
      console.warn('Native SignInWithApple plugin error/cancelled:', e);
    }
  }
  return null;
}
