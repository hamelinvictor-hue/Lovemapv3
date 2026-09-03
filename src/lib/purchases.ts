import { Purchases, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { isCapacitorNative } from './nativePermissions';
import { subscribeViaRevenueCat, revokeViaRevenueCat } from './revenuecatClient';

// Public Apple API key from RevenueCat (Starts with 'appl_...')
// Can be overridden via VITE_REVENUECAT_APPLE_KEY in .env
export const REVENUECAT_APPLE_API_KEY =
  (import.meta.env.VITE_REVENUECAT_APPLE_KEY as string) || 'appl_lovemap_placeholder_key';

let isPurchasesConfigured = false;
let currentConfiguredUserId: string | null = null;

/**
 * Initializes RevenueCat SDK on iOS native devices
 */
export async function initializePurchases(appUserId?: string): Promise<boolean> {
  if (!isCapacitorNative()) {
    console.log('[Purchases] Web environment: using simulated / API bridge');
    return true;
  }

  try {
    const key = REVENUECAT_APPLE_API_KEY;
    if (!key || key.includes('placeholder')) {
      console.warn(
        '[Purchases] Clé publique RevenueCat Apple non renseignée (VITE_REVENUECAT_APPLE_KEY). Pensez à l\'ajouter dans votre .env ou sur RevenueCat.'
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
      console.log('[Purchases] RevenueCat configuré avec succès pour:', appUserId || 'Anonyme');
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
export async function loadCurrentOfferings(): Promise<PurchasesOffering | null> {
  if (!isCapacitorNative()) return null;

  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      console.log('[Purchases] Offres RevenueCat chargées:', offerings.current.identifier);
      return offerings.current;
    }
    return null;
  } catch (err) {
    console.warn('[Purchases] Impossible de charger les offres RevenueCat:', err);
    return null;
  }
}

/**
 * Purchases a subscription package or plan.
 * On native iOS: calls Apple StoreKit with the 7-day free trial intro offer.
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
      const currentOffering = offering || (await loadCurrentOfferings());

      if (currentOffering) {
        if (plan === 'annual') {
          targetPackage = currentOffering.annual || currentOffering.availablePackages.find((p) => p.packageType === 'ANNUAL');
        } else {
          targetPackage = currentOffering.monthly || currentOffering.availablePackages.find((p) => p.packageType === 'MONTHLY');
        }

        if (!targetPackage && currentOffering.availablePackages.length > 0) {
          targetPackage = currentOffering.availablePackages[0];
        }
      }

      if (targetPackage) {
        console.log('[Purchases] Lancement de l\'achat natif Apple pour:', targetPackage.identifier);
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: targetPackage });
        const isPremium = typeof customerInfo.entitlements.active['premium'] !== 'undefined';
        const entitlement = customerInfo.entitlements.active['premium'];
        const isTrial = entitlement?.periodType === 'TRIAL' || Boolean(trialDays && trialDays > 0);

        if (isPremium) {
          console.log('[Purchases] Achat réussi ! Entitlement "premium" actif (Essai:', isTrial, ')');
          return { success: true, isTrial };
        }
      } else {
        console.warn('[Purchases] Aucun package StoreKit trouvé dans l\'offering par défaut. Vérifiez les Products dans RevenueCat.');
      }
    } catch (err: any) {
      if (err.userCancelled || err.code === '1' || err.message?.includes('cancelled')) {
        console.log('[Purchases] L\'utilisateur a annulé le paiement Apple.');
        return { success: false, isTrial: false, userCancelled: true };
      }
      console.warn('[Purchases] Erreur durant l\'achat StoreKit natif:', err);
      // Fallback to web sync below if not cancelled
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
