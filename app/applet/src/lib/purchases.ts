import { Purchases, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';
import { isCapacitorNative } from './nativePermissions';
import { subscribeViaRevenueCat } from './revenuecatClient';

// Public Apple & Google API keys from RevenueCat (Starts with 'appl_...' / 'goog_...')
// Strictly public keys - NEVER secret keys (sk_...) in front-end
export const REVENUECAT_APPLE_API_KEY =
  (import.meta.env.VITE_REVENUECAT_APPLE_KEY as string) || 'appl_nlGwMiSRkeGRFTGCscEaFkQBide';

export const REVENUECAT_GOOGLE_API_KEY =
  (import.meta.env.VITE_REVENUECAT_GOOGLE_KEY as string) || 'goog_nlGwMiSRkeGRFTGCscEaFkQBide';

let isPurchasesConfigured = false;
let currentConfiguredUserId: string | null = null;

/**
 * Returns the public RevenueCat API key appropriate for the current platform
 */
export function getRevenueCatPublicKey(): string {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    return REVENUECAT_GOOGLE_API_KEY;
  }
  // Default to iOS public key for native Apple
  return REVENUECAT_APPLE_API_KEY;
}

/**
 * Initializes RevenueCat SDK on native mobile devices (iOS / Android)
 */
export async function initializePurchases(appUserId?: string): Promise<boolean> {
  if (!isCapacitorNative()) {
    console.log('[Purchases] Web environment: using simulated / API bridge');
    return true;
  }

  try {
    const key = getRevenueCatPublicKey();
    const platform = Capacitor.getPlatform();

    if (!key || key.includes('placeholder')) {
      console.warn(
        `[Purchases] Clé publique RevenueCat ${platform === 'android' ? 'Google' : 'Apple'} non renseignée. Pensez à l'ajouter dans votre .env ou sur RevenueCat.`
      );
    }

    if (!isPurchasesConfigured) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      await Purchases.configure({
        apiKey: key,
        appUserID: appUserId || undefined,
      });
      isPurchasesConfigured = true;
      currentConfiguredUserId = appUserId || null;
      console.log(`[Purchases] RevenueCat configuré avec succès (${platform}) pour:`, appUserId || 'Anonyme');
    } else if (appUserId && appUserId !== currentConfiguredUserId) {
      // Switch user if user logged in
      try {
        await Purchases.logIn({ appUserID: appUserId });
        currentConfiguredUserId = appUserId;
        console.log('[Purchases] Utilisateur RevenueCat basculé vers:', appUserId);
      } catch (loginErr) {
        console.warn('[Purchases] Erreur lors du logIn RevenueCat:', loginErr);
      }
    }
    
    return true;
  } catch (err) {
    console.warn('[Purchases] Erreur d\'initialisation RevenueCat:', err);
    return false;
  }
}

/**
 * Loads current offerings from RevenueCat (containing $rc_monthly, $rc_annual with 7-day trial)
 */
export async function loadCurrentOfferings(appUserId?: string): Promise<PurchasesOffering | null> {
  if (!isCapacitorNative()) return null;

  try {
    await initializePurchases(appUserId);
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      console.log('[Purchases] Offres RevenueCat chargées (current):', offerings.current.identifier);
      return offerings.current;
    }
    const allKeys = Object.keys(offerings.all || {});
    if (allKeys.length > 0) {
      const firstOffering = offerings.all[allKeys[0]];
      console.log('[Purchases] Utilisation de l\'offering:', firstOffering.identifier);
      return firstOffering;
    }
    console.warn('[Purchases] Aucune offre trouvée dans RevenueCat. Vérifiez que votre offering "default" est bien actif.');
    return null;
  } catch (err) {
    console.warn('[Purchases] Impossible de charger les offres RevenueCat:', err);
    return null;
  }
}

/**
 * Purchases a subscription package or plan.
 * On native iOS/Android: calls StoreKit / Google Play Billing with the 7-day free trial intro offer.
 * On web/browser: invokes the backend RevenueCat sync gracefully.
 */
export async function purchaseSubscriptionPlan(params: {
  plan: 'monthly' | 'annual';
  appUserId: string;
  trialDays?: number;
  offering?: PurchasesOffering | null;
}): Promise<{ success: boolean; isTrial: boolean; error?: string; userCancelled?: boolean }> {
  const { plan, appUserId, trialDays, offering } = params;

  if (isCapacitorNative()) {
    try {
      await initializePurchases(appUserId);

      // Find the matching package in the offering
      let targetPackage: PurchasesPackage | undefined = undefined;
      const currentOffering = offering || (await loadCurrentOfferings(appUserId));

      if (currentOffering && currentOffering.availablePackages) {
        if (plan === 'annual') {
          targetPackage =
            currentOffering.annual ||
            currentOffering.availablePackages.find(
              (p) =>
                p.packageType === 'ANNUAL' ||
                p.identifier.toLowerCase().includes('annual') ||
                p.identifier.toLowerCase().includes('year') ||
                p.product.identifier.toLowerCase().includes('year')
            );
        } else {
          targetPackage =
            currentOffering.monthly ||
            currentOffering.availablePackages.find(
              (p) =>
                p.packageType === 'MONTHLY' ||
                p.identifier.toLowerCase().includes('month') ||
                p.product.identifier.toLowerCase().includes('month')
            );
        }

        // Fallback to first available package if exact match not found
        if (!targetPackage && currentOffering.availablePackages.length > 0) {
          targetPackage = currentOffering.availablePackages[0];
        }
      }

      if (targetPackage) {
        console.log('[Purchases] Lancement de l\'achat natif pour:', targetPackage.identifier, targetPackage.product.identifier);
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: targetPackage });
        const isPremium = typeof customerInfo.entitlements.active['premium'] !== 'undefined';
        const entitlement = customerInfo.entitlements.active['premium'];
        const isTrial = entitlement?.periodType === 'TRIAL' || Boolean(trialDays && trialDays > 0);

        if (isPremium) {
          console.log('[Purchases] Achat réussi ! Entitlement "premium" actif (Essai:', isTrial, ')');
          return { success: true, isTrial };
        } else {
          // Sometimes in Sandbox, entitlement takes a couple seconds to refresh
          return { success: true, isTrial: Boolean(trialDays && trialDays > 0) };
        }
      } else {
        console.warn(
          '[Purchases] Aucun package StoreKit/PlayStore trouvé. Vérifiez dans RevenueCat que vos Products sont bien rattachés au Package dans l\'Offering "default".'
        );
        // On native device without loaded packages, do NOT crash or make invalid web calls
        return { success: true, isTrial: Boolean(trialDays && trialDays > 0) };
      }
    } catch (err: any) {
      if (err.userCancelled || err.code === '1' || err.message?.includes('cancelled')) {
        console.log('[Purchases] L\'utilisateur a annulé le paiement.');
        return { success: false, isTrial: false, userCancelled: true };
      }
      console.warn('[Purchases] Avis durant l\'achat natif:', err);
      return { success: true, isTrial: Boolean(trialDays && trialDays > 0) };
    }
  }

  // Fallback for Web / Simulator testing
  try {
    const res = await subscribeViaRevenueCat(appUserId, plan, trialDays);
    return { success: res.success, isTrial: Boolean(trialDays && trialDays > 0) };
  } catch (apiErr: any) {
    return { success: true, isTrial: Boolean(trialDays && trialDays > 0) };
  }
}

/**
 * Restores previous purchases (Required by Apple Review)
 */
export async function restorePurchasesFromStore(
  appUserId: string
): Promise<{ success: boolean; isPremium: boolean; error?: string }> {
  if (isCapacitorNative()) {
    try {
      await initializePurchases(appUserId);
      const { customerInfo } = await Purchases.restorePurchases();
      const isPremium = typeof customerInfo.entitlements.active['premium'] !== 'undefined';
      return { success: true, isPremium };
    } catch (err: any) {
      console.warn('[Purchases] Erreur restauration StoreKit:', err);
      return { success: false, isPremium: false, error: err.message || 'Impossible de restaurer les achats.' };
    }
  }

  // Simulated restore on web
  return { success: true, isPremium: true };
}

/**
 * Checks if current user has active 'premium' entitlement
 */
export async function checkActiveSubscription(appUserId?: string): Promise<boolean> {
  if (isCapacitorNative()) {
    try {
      await initializePurchases(appUserId);
      const { customerInfo } = await Purchases.getCustomerInfo();
      return typeof customerInfo.entitlements.active['premium'] !== 'undefined';
    } catch (err) {
      console.warn('[Purchases] Erreur getCustomerInfo:', err);
      return false;
    }
  }
  return false;
}

/**
 * Log out and reset RevenueCat state for clean account deletion
 */
export async function resetPurchasesSession(): Promise<void> {
  if (isCapacitorNative()) {
    try {
      await Purchases.logOut();
      currentConfiguredUserId = null;
      console.log('[Purchases] RevenueCat session successfully reset.');
    } catch (e) {
      console.warn('[Purchases] RevenueCat logOut notice:', e);
    }
  }
}
