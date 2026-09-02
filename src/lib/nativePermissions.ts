/**
 * Bridge for Capacitor Native iOS / Android plugins with clean dynamic fallback
 * Allows native iOS Apple dialogs and native SDK auth when running in Xcode / iPhone,
 * while maintaining 100% functionality on web.
 */

export const isCapacitorNative = (): boolean => {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
  if (cap.platform === 'ios' || cap.platform === 'android') return true;
  if (cap.isPluginAvailable && (cap.isPluginAvailable('Dialog') || cap.isPluginAvailable('AppTrackingTransparency') || cap.isPluginAvailable('Geolocation'))) return true;
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
  // Dismiss keyboard/active inputs first to ensure iOS text session is not invalidated
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
  // Standard browser confirm fallback
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
  if (cap?.Plugins?.Geolocation) {
    try {
      const res = await cap.Plugins.Geolocation.requestPermissions({
        permissions: ['location', 'coarseLocation'],
      });
      if (res?.location === 'granted' || res?.coarseLocation === 'granted') {
        return true;
      }
    } catch (e) {
      console.warn('Native Geolocation plugin requestPermissions error:', e);
    }
  }

  // Trigger Apple / WebKit native location prompt via getCurrentPosition
  return new Promise((resolve) => {
    if (cap?.Plugins?.Geolocation) {
      cap.Plugins.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })
        .then(() => resolve(true))
        .catch(() => {
          if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              () => resolve(true),
              () => resolve(false),
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
          } else {
            resolve(false);
          }
        });
      return;
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
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
      const googleUser = await googlePlugin.signIn();
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
      const res = await applePlugin.authorize({
        clientId: 'com.lovemap.duo',
        redirectURI: 'https://gen-lang-client-0158057859.firebaseapp.com/__/auth/handler',
        scopes: 'email name',
      });
      
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

/**
 * Native Sign Out to clear cached sessions for Google and Apple
 */
export async function triggerNativeSignOut(): Promise<void> {
  const cap = (window as any).Capacitor;
  
  // Google Sign Out
  const googlePlugin = (window as any).GoogleAuth || cap?.Plugins?.GoogleAuth;
  if (googlePlugin) {
    try {
      await googlePlugin.signOut();
    } catch (e) {
      console.warn('Native GoogleAuth signOut error:', e);
    }
  }
}
