import { Category, RatingCriteria, Spot, CouplePair, NotificationItem } from '../types';

export const CATEGORIES: Category[] = [
  {
    id: 'outdoor',
    name: 'Plein air & Nature',
    icon: 'Trees',
    color: '#10b981',
    bgClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    badgeClass: 'bg-emerald-500 text-white',
  },
  {
    id: 'hotel',
    name: 'Chambre & Hôtel',
    icon: 'BedDouble',
    color: '#ec4899',
    bgClass: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
    badgeClass: 'bg-pink-500 text-white',
  },
  {
    id: 'insolite',
    name: 'Insolite & Aventurier',
    icon: 'Flame',
    color: '#f97316',
    bgClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    badgeClass: 'bg-orange-500 text-white',
  },
  {
    id: 'car',
    name: 'Voiture & Roadtrip',
    icon: 'Car',
    color: '#3b82f6',
    bgClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    badgeClass: 'bg-blue-500 text-white',
  },
  {
    id: 'beach',
    name: 'Plage & Crique',
    icon: 'Waves',
    color: '#06b6d4',
    bgClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    badgeClass: 'bg-cyan-500 text-white',
  },
  {
    id: 'spa',
    name: 'Spa & Jacuzzi',
    icon: 'Sparkles',
    color: '#a855f7',
    bgClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    badgeClass: 'bg-purple-500 text-white',
  },
  {
    id: 'secret',
    name: 'Endroit Secret',
    icon: 'Lock',
    color: '#eab308',
    bgClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    badgeClass: 'bg-amber-500 text-white',
  },
];

export const RATING_CRITERIA: RatingCriteria[] = [
  {
    key: 'comfort',
    label: 'Confort & Intimité',
    subtitle: 'Sérénité, confort physique et discrétion du lieu',
    icon: 'ShieldCheck',
    emoji: '🛏️',
    color: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10',
  },
  {
    key: 'thrill',
    label: 'Frisson & Audace',
    subtitle: 'Côté aventureux, adrénaline ou originalité',
    icon: 'Flame',
    emoji: '⚡',
    color: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  },
  {
    key: 'romance',
    label: 'Romantisme & Alchimie',
    subtitle: 'Magie du moment, éclairage et feeling romantique',
    icon: 'HeartHandshake',
    emoji: '💖',
    color: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
  },
  {
    key: 'intensity',
    label: 'Intensité du Moment',
    subtitle: 'Ressenti émotionnel et connexion physique globale',
    icon: 'Zap',
    emoji: '🔥',
    color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  },
  {
    key: 'setting',
    label: 'Cadre & Atmosphère',
    subtitle: 'Beauté du paysage, vue panoramique ou charme du décor',
    icon: 'Eye',
    emoji: '🌅',
    color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
];

export const INITIAL_COUPLE: CouplePair = {
  id: '',
  code: 'LOVE-NEW',
  partnerA: {
    id: 'partner_a',
    name: 'Partenaire 1',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    role: 'Partenaire 1',
  },
  partnerB: {
    id: 'partner_b',
    name: 'En attente...',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  },
  memberUids: [],
  members: {},
  creatorUid: '',
  anniversaryDate: new Date().toISOString().split('T')[0],
  secretPin: '1234',
  isPinLocked: false,
  status: 'pending',
  subscription: {
    active: false,
    plan: null,
    sourceUid: null,
    expiresAt: null,
    updatedAt: new Date().toISOString(),
  },
};

export const INITIAL_SPOTS: Spot[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
