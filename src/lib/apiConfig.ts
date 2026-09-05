import { Capacitor } from '@capacitor/core';

// Cloud Run backend URL injected at build / runtime
const REMOTE_BACKEND_URL =
  (import.meta as any).env?.VITE_APP_URL ||
  'https://ais-dev-l2h4gwvk5sry2xkb2k34gk-490310879996.europe-west3.run.app';

/**
 * Returns the correct full API URL whether running in the browser
 * or inside iOS Capacitor native webview (where localhost has no backend).
 */
export function getBackendApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // When running inside native iOS / Android Capacitor shell
  if (Capacitor.isNativePlatform()) {
    return `${REMOTE_BACKEND_URL.replace(/\/$/, '')}${cleanEndpoint}`;
  }

  // On Web / desktop browser, relative paths are routed by Vite or Express reverse proxy
  return cleanEndpoint;
}

export async function sendPushNotification(payload: {
  code: string;
  senderPartnerId: string;
  targetPartnerId?: string;
  title?: string;
  message?: string;
  spotId?: string;
  type?: string;
}) {
  try {
    const url = getBackendApiUrl('/api/push/send');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.warn('[Push] Error sending push notification:', err);
    return null;
  }
}
