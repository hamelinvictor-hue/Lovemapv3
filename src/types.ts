export type PartnerId = 'partner_a' | 'partner_b';

export type SpotStatus = 'pending_validation' | 'validated' | 'declined';

export type CriteriaKey = 'comfort' | 'thrill' | 'romance' | 'intensity' | 'setting';

export interface RatingCriteria {
  key: CriteriaKey;
  label: string;
  subtitle: string;
  icon: string;
  emoji: string;
  color: string;
}

export interface PartnerRating {
  partnerId: PartnerId;
  scores: Record<CriteriaKey, number>; // Scores from 1 to 10
  comment?: string;
  submittedAt: string;
}

export type AppMode = 'duo' | 'solo';

export interface AssociatedMedia {
  id: string;
  type: 'music' | 'movie';
  title: string;
  artistOrDirector?: string;
  coverUrl?: string;
  previewUrl?: string;
  externalUrl?: string;
}

export interface Spot {
  id: string;
  title: string;
  lat: number;
  lng: number;
  address: string;
  date: string; // YYYY-MM-DD
  categoryId: string;
  creatorId: PartnerId;
  status: SpotStatus;
  isSolo?: boolean; // True if created in Jardin Secret / Solo mode
  ratings: {
    partner_a?: PartnerRating;
    partner_b?: PartnerRating;
  };
  averageScores?: Record<CriteriaKey, number>;
  overallScore?: number; // 1 to 10
  atmosphereTags: string[];
  photoUrl?: string;
  photos?: string[]; // Up to 5 photos for Duo Premium users
  notes?: string;
  associatedMedia?: AssociatedMedia[];
  audioMemoUrl?: string; // 15s voice memo audio data URL
  isFavorite?: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgClass: string;
  badgeClass: string;
}

export interface NotificationItem {
  createdAt?: string;
  id: string;
  type: 'new_spot_proposed' | 'spot_validated' | 'questionnaire_completed' | 'spot_declined' | 'premium_offer_urgency' | 'premium_activated';
  spotId: string;
  senderId: PartnerId;
  targetPartnerId?: PartnerId;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface UserSubscription {
  plan: 'monthly' | 'annual';
  subscribedAt?: string;
  purchasedAt?: string;
  expiresAt: string;
  purchasedByPartnerId?: PartnerId;
  active: boolean;
}

export interface UserProfile {
  id: PartnerId;
  name: string;
  avatar: string;
  role: string;
  subscription?: UserSubscription;
  pushToken?: string;
}

export interface CouplePair {
  code: string;
  partnerA: UserProfile;
  partnerB: UserProfile;
  anniversaryDate: string;
  secretPin?: string;
  isPinLocked?: boolean;
  status?: 'active' | 'broken';
  brokenBy?: string;
  isCodeUsed?: boolean;
  spots?: Spot[];
  notifications?: NotificationItem[];
}

export interface GlobalCriteriaStats {
  key: CriteriaKey;
  label: string;
  averageScore: number;
  count: number;
  icon: string;
}
