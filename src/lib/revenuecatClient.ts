import { isCapacitorNative } from './nativePermissions';

export interface RevenueCatStatus {
  status: string;
  configured: boolean;
  provider: string;
  secretKeyPrefix?: string;
}

export async function checkRevenueCatStatus(): Promise<RevenueCatStatus> {
  if (isCapacitorNative()) {
    return { status: 'ok', configured: true, provider: 'RevenueCat Native (StoreKit)' };
  }
  try {
    const res = await fetch('/api/revenuecat/status');
    if (!res.ok) return { status: 'error', configured: false, provider: 'RevenueCat' };
    return await res.json();
  } catch {
    return { status: 'error', configured: false, provider: 'RevenueCat' };
  }
}

export async function ensureSubscriberInRevenueCat(appUserId: string): Promise<boolean> {
  if (!appUserId || isCapacitorNative()) return true;
  try {
    const res = await fetch(`/api/revenuecat/subscribers/${encodeURIComponent(appUserId)}`);
    return res.ok;
  } catch (err) {
    console.warn('RevenueCat subscriber creation sync notice:', err);
    return false;
  }
}

export async function subscribeViaRevenueCat(
  appUserId: string,
  plan: 'monthly' | 'annual',
  trialDays?: number
): Promise<{ success: boolean; error?: string }> {
  // On native iOS, StoreKit via @revenuecat/purchases-capacitor handles this directly.
  if (isCapacitorNative()) {
    return { success: true };
  }
  try {
    const res = await fetch(`/api/revenuecat/subscribers/${encodeURIComponent(appUserId)}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, entitlementId: 'premium', trialDays }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      console.warn('RevenueCat API response info:', data);
      return { success: true };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('RevenueCat web sync notice:', err);
    return { success: true };
  }
}

export async function revokeViaRevenueCat(appUserId: string): Promise<{ success: boolean }> {
  if (isCapacitorNative()) {
    return { success: true };
  }
  try {
    await fetch(`/api/revenuecat/subscribers/${encodeURIComponent(appUserId)}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entitlementId: 'premium' }),
    });
    return { success: true };
  } catch {
    return { success: true };
  }
}
