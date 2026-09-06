import { CouplePair, PartnerId, UserSubscription } from '../types';

export const MONTHLY_PRICE = "4,99 €";
export const ANNUAL_PRICE = "34,99 €";
export const FREE_MAX_PHOTOS = 1;
export const PREMIUM_MAX_PHOTOS = 5;

export interface PremiumState {
  isPremium: boolean;
  isSharedViaDuo: boolean;
  bothSubscribed?: boolean;
  subscriberName?: string;
  subscriberPartnerId?: PartnerId;
  plan?: 'monthly' | 'annual';
  expiresAt?: string;
  maxPhotos: number;
  canAddMusic: boolean;
}

export function isSubscriptionActive(sub?: UserSubscription): boolean {
  if (!sub || !sub.active) return false;
  if (!sub.expiresAt) return false;
  return new Date(sub.expiresAt).getTime() > Date.now();
}

export function getDuoPremiumState(couple: CouplePair, activePartnerId: PartnerId): PremiumState {
  const partnerA = couple?.partnerA;
  const partnerB = couple?.partnerB;
  const now = Date.now();

  const subA = partnerA?.subscription;
  const isAActive = Boolean(subA && subA.active && subA.expiresAt && new Date(subA.expiresAt).getTime() > now);

  const subB = partnerB?.subscription;
  const isBActive = Boolean(subB && subB.active && subB.expiresAt && new Date(subB.expiresAt).getTime() > now);

  // Case: BOTH users have their own active subscription
  if (isAActive && isBActive && subA && subB) {
    const activeSub = activePartnerId === 'partner_a' ? subA : subB;
    // Latest expiry date between both partners for maximum protection
    const latestExpiry =
      new Date(subA.expiresAt).getTime() > new Date(subB.expiresAt).getTime()
        ? subA.expiresAt
        : subB.expiresAt;

    return {
      isPremium: true,
      isSharedViaDuo: false,
      bothSubscribed: true,
      subscriberName: 'Vous et votre partenaire',
      subscriberPartnerId: activePartnerId,
      plan: activeSub.plan,
      expiresAt: latestExpiry,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  if (isAActive && subA) {
    const isOwner = activePartnerId === 'partner_a';
    return {
      isPremium: true,
      isSharedViaDuo: !isOwner,
      bothSubscribed: false,
      subscriberName: partnerA?.name || 'Votre partenaire',
      subscriberPartnerId: 'partner_a',
      plan: subA.plan,
      expiresAt: subA.expiresAt,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  if (isBActive && subB) {
    const isOwner = activePartnerId === 'partner_b';
    return {
      isPremium: true,
      isSharedViaDuo: !isOwner,
      bothSubscribed: false,
      subscriberName: partnerB?.name || 'Votre partenaire',
      subscriberPartnerId: 'partner_b',
      plan: subB.plan,
      expiresAt: subB.expiresAt,
      maxPhotos: PREMIUM_MAX_PHOTOS,
      canAddMusic: true,
    };
  }

  return {
    isPremium: false,
    isSharedViaDuo: false,
    bothSubscribed: false,
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
