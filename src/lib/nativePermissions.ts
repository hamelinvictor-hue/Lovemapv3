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
export async function triggerNativeGoogleAuth(): Promise<{ idToken: string } | null> {
  const cap = (window as any).Capacitor;
  if (isCapacitorNative() && (window as any).GoogleAuth) {
    try {
      const googleUser = await (window as any).GoogleAuth.signIn();
      if (googleUser?.authentication?.idToken) {
        return { idToken: googleUser.authentication.idToken };
      }
    } catch (e) {
      console.warn('Native GoogleAuth plugin error:', e);
    }
  }
  return null;
}

/**
 * Native Apple Sign In via Capacitor plugin if present
 */
export async function triggerNativeAppleAuth(): Promise<{ identityToken: string; nonce?: string } | null> {
  const cap = (window as any).Capacitor;
  if (isCapacitorNative() && cap?.Plugins?.SignInWithApple) {
    try {
      const res = await cap.Plugins.SignInWithApple.authorize({
        clientId: 'com.lovemap.duo',
        redirectURI: 'https://gen-lang-client-0158057859.firebaseapp.com/__/auth/handler',
        scopes: 'email name',
      });
      if (res?.response?.identityToken) {
        return {
          identityToken: res.response.identityToken,
          nonce: res.response.nonce,
        };
      }
    } catch (e) {
      console.warn('Native SignInWithApple plugin error:', e);
    }
  }
  return null;
}
