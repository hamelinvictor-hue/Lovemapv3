/**
 * Native Device Permissions Bridge for iOS (Capacitor / WebKit) and Web
 * Triggers official native OS dialogs when running on iOS / Android
 */

export const isNativePlatform = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
  const isIosUserAgent = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isCapacitor || (isIosUserAgent && !(window as any).MSStream);
};

export async function requestNativeGeolocation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      resolve(false);
    }
  });
}

export async function requestNativeNotification(): Promise<boolean> {
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
