import { CouplePair, CoupleSubscription } from '../types';

export const MONTHLY_PRICE = "4,99 €";
export const ANNUAL_PRICE = "34,99 €";
export const FREE_MAX_PHOTOS = 1;
export const PREMIUM_MAX_PHOTOS = 5;

export interface PremiumState {
  isPremium: boolean;
  isSharedViaDuo: boolean;
  bothSubscribed?: boolean;
  subscriberName?: string;
  subscriberUid?: string | null;
  subscriberPartnerId?: string;
  plan?: 'monthly' | 'annual' | null;
  expiresAt?: string | null;
  maxPhotos: number;
  canAddMusic: boolean;
}

export function isSubscriptionActive(sub?: CoupleSubscription | null): boolean {
  if (!sub || !sub.active) return false;
  if (!sub.expiresAt) return false;
  return new Date(sub.expiresAt).getTime() > Date.now();
}

/**
 * Resolves the Premium subscription state for a couple and current user UID.
 * A single active subscription at the couple level unlocks Premium for both members.
 */
export function getDuoPremiumState(couple: CouplePair, currentUid?: string | null): PremiumState {
  // Support both new couple-level subscription and legacy partner sub structures
  const sub = couple?.subscription;
  const legacySubA = couple?.partnerA?.subscription;
  const legacySubB = couple?.partnerB?.subscription;
  const now = Date.now();

  const isLegacyAActive = Boolean(legacySubA?.active && legacySubA.expiresAt && new Date(legacySubA.expiresAt).getTime() > now);
  const isLegacyBActive = Boolean(legacySubB?.active && legacySubB.expiresAt && new Date(legacySubB.expiresAt).getTime() > now);

  if (isLegacyAActive && isLegacyBActive && legacySubA && legacySubB) {
    const isOwnerA = currentUid === 'partner_a';
    const activeSub = isOwnerA ? legacySubA : legacySubB;
    return {
      isPremium: true,
      isSharedViaDuo: false,
      bothSubscribed: true,
      subscriberName: 'Vous et votre partenaire',
      subscriberPartnerId: isOwnerA ? 'partner_a' : 'partner_b',
      plan: activeSub.plan,
      expiresAt: legacySubA.expiresAt,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  if (isLegacyAActive && legacySubA) {
    const isOwner = currentUid === 'partner_a';
    return {
      isPremium: true,
      isSharedViaDuo: !isOwner,
      bothSubscribed: false,
      subscriberName: couple.partnerA?.name || 'Votre partenaire',
      subscriberPartnerId: 'partner_a',
      plan: legacySubA.plan,
      expiresAt: legacySubA.expiresAt,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  if (isLegacyBActive && legacySubB) {
    const isOwner = currentUid === 'partner_b';
    return {
      isPremium: true,
      isSharedViaDuo: !isOwner,
      bothSubscribed: false,
      subscriberName: couple.partnerB?.name || 'Votre partenaire',
      subscriberPartnerId: 'partner_b',
      plan: legacySubB.plan,
      expiresAt: legacySubB.expiresAt,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  const isActive = Boolean(sub && sub.active && sub.expiresAt && new Date(sub.expiresAt).getTime() > now);

  if (isActive && sub) {
    const isOwner = Boolean(currentUid && sub.sourceUid === currentUid);
    const subscriberMember = sub.sourceUid && couple?.members ? couple.members[sub.sourceUid] : null;
    const subscriberName = isOwner
      ? 'Vous'
      : (subscriberMember?.displayName || 'Votre partenaire');

    return {
      isPremium: true,
      isSharedViaDuo: !isOwner,
      bothSubscribed: false,
      subscriberName,
      subscriberUid: sub.sourceUid,
      subscriberPartnerId: isOwner ? 'partner_a' : 'partner_b',
      plan: sub.plan,
      expiresAt: sub.expiresAt,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  return {
    isPremium: false,
    isSharedViaDuo: false,
    bothSubscribed: false,
    subscriberUid: null,
    maxPhotos: FREE_MAX_PHOTOS,
    canAddMusic: false,
  };
}

const TRIAL_OFFER_KEY = 'lovemap_trial_offer_expires_at_v1';
const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000; // 2 days (48h)

export function hasTrialOfferStarted(): boolean {
  try {
    return Boolean(localStorage.getItem(TRIAL_OFFER_KEY));
  } catch {
    return false;
  }
}

export function startTrialOfferCountdown(): number {
  try {
    const stored = localStorage.getItem(TRIAL_OFFER_KEY);
    if (stored) {
      const timestamp = parseInt(stored, 10);
      if (!isNaN(timestamp)) {
        return timestamp;
      }
    }
    // Initialize 48h deadline from now
    const initialDeadline = Date.now() + TRIAL_DURATION_MS;
    localStorage.setItem(TRIAL_OFFER_KEY, initialDeadline.toString());
    return initialDeadline;
  } catch {
    return Date.now() + TRIAL_DURATION_MS;
  }
}

export function getTrialOfferDeadline(): number | null {
  try {
    const stored = localStorage.getItem(TRIAL_OFFER_KEY);
    if (stored) {
      const timestamp = parseInt(stored, 10);
      if (!isNaN(timestamp)) {
        return timestamp;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getTrialOfferRemainingSeconds(): number {
  const deadline = getTrialOfferDeadline();
  if (!deadline) return 0;
  const diffMs = deadline - Date.now();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 1000);
}

export function isTrialOfferActive(): boolean {
  return hasTrialOfferStarted() && getTrialOfferRemainingSeconds() > 0;
}

export function isTrialOfferExpired(): boolean {
  return hasTrialOfferStarted() && getTrialOfferRemainingSeconds() <= 0;
}

export function formatTrialCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (days > 0) {
    return `${days}j ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

export function getSpotPhotos(spot?: { photoUrl?: string; photos?: string[] } | null): string[] {
  if (!spot) return [];
  if (spot.photos && spot.photos.length > 0) {
    return spot.photos;
  }
  if (spot.photoUrl) {
    return [spot.photoUrl];
  }
  return [];
}
