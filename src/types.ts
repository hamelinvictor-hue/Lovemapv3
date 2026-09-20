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

export interface UserRating {
  uid?: string;
  partnerId?: string;
  scores: Record<CriteriaKey, number>; // Scores de 1 à 10
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
  coupleId?: string;
  title: string;
  lat: number;
  lng: number;
  address: string;
  date: string; // YYYY-MM-DD
  categoryId: string;
  creatorUid?: string; // UID Firebase de l'auteur (schéma officiel)
  createdByUid?: string; // Alias rétrocompatible
  status: SpotStatus;
  isSolo?: boolean; // True si créé en Jardin Secret / Solo
  ratings: Record<string, UserRating>; // Indexé par UID Firebase ou partnerId
  averageScores?: Record<CriteriaKey, number>;
  overallScore?: number; // 1 à 10
  atmosphereTags: string[];
  photoUrl?: string;
  photos?: string[]; // Jusqu'à 5 photos pour les utilisateurs Duo Premium
  notes?: string;
  associatedMedia?: AssociatedMedia[];
  audioMemoUrl?: string; // Memo vocal 15s
  isFavorite?: boolean;
  createdAt: string;
  updatedAt?: string;

  // Shims de compatibilité transitionnelle
  creatorId?: string;
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
  id: string;
  coupleId?: string;
  type: 'new_spot_proposed' | 'spot_validated' | 'questionnaire_completed' | 'spot_declined' | 'duo_connected' | 'premium_offer_urgency' | 'premium_activated';
  spotId?: string;
  senderUid?: string; // UID Firebase de l'expéditeur
  targetUid?: string; // UID Firebase du destinataire
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  createdAt?: string;

  // Shims de compatibilité transitionnelle
  senderId?: string;
  targetPartnerId?: string;
}

export interface CoupleSubscription {
  active: boolean;
  plan: 'monthly' | 'annual' | null;
  sourceUid: string | null; // UID Firebase de l'acheteur
  expiresAt: string | null;
  updatedAt: string;
}

export interface CoupleMemberProfile {
  displayName: string;
  photoURL: string;
  joinedAt: string;
  email?: string | null;
  pushToken?: string | null;
}

export interface UserProfile {
  id?: string;
  name: string;
  avatar: string;
  role?: string;
  email?: string | null;
  pushToken?: string | null;
  fcmTokens?: string[]; // Tableau de tokens FCM pour support multi-appareils
  premiumSelf?: {
    active: boolean;
    plan?: 'monthly' | 'annual' | null;
    expiresAt?: string | null;
    updatedAt?: string;
  };
  premiumTransfers?: {
    count: number;
    windowStartAt: string;
  };
  subscription?: {
    plan?: 'monthly' | 'annual';
    purchasedAt?: string;
    expiresAt?: string;
    purchasedByPartnerId?: string;
    active?: boolean;
  };
}

export type PartnerId = 'partner_a' | 'partner_b' | string;
export type UserSubscription = CoupleSubscription;

export interface CouplePair {
  id?: string; // ID Firestore aléatoire non devinable
  memberUids?: string[]; // [uid1, uid2] ou [uid1]
  members?: Record<string, CoupleMemberProfile>; // Indexé par UID Firebase
  creatorUid?: string; // UID du créateur initial
  anniversaryDate: string;
  secretPin?: string;
  isPinLocked?: boolean;
  status?: 'pending' | 'active' | 'broken';
  brokenByUid?: string;
  brokenBy?: string;
  subscription?: CoupleSubscription;
  createdAt?: string;
  updatedAt?: string;
  spots?: Spot[];
  notifications?: NotificationItem[];

  // Shims de compatibilité transitionnelle
  code?: string;
  isCodeUsed?: boolean;
  partnerA?: UserProfile;
  partnerB?: UserProfile;
  partnerAUid?: string;
  partnerBUid?: string;
  partnerAEmail?: string;
  partnerBEmail?: string;
  ownerUid?: string;
  ownerEmail?: string;
}

export interface InviteCode {
  code: string; // Clé du document dans inviteCodes/{code}
  coupleId: string; // Référence vers couples/{id}
  ownerUid: string; // UID du créateur / propriétaire du code
  creatorUid?: string; // Alias rétrocompatible
  createdAt: string;
  expiresAt: string; // TTL 24h
}

export interface GlobalCriteriaStats {
  key: CriteriaKey;
  label: string;
  averageScore: number;
  count: number;
  icon: string;
}
