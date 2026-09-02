import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import {
  loginWithGoogle,
  loginWithApple,
  createCoupleInFirestore,
  joinCoupleInFirestore,
  ensureGuestUser,
  updateCoupleInFirestore,
} from '../lib/firebase';
import { AppMode, CouplePair, PartnerId } from '../types';
import { compressImageFile } from '../lib/imageCompressor';
import { getFlameTenths, getFlameFillClip } from '../lib/flameIcon';
import {
  Heart,
  Flower2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  User as UserIcon,
  Camera,
  X,
  Shield,
  Cloud,
  MapPin,
  Star,
  Compass,
  Sliders,
  Share2,
  Smartphone,
  Layers,
  Flame,
  Volume2,
  Play,
  Navigation,
  MessageSquare,
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  initialStep?: 1 | 2 | 3 | 4 | 5;
  onClose?: () => void;
  onComplete: (mode: AppMode, couple?: CouplePair, partnerId?: PartnerId) => void;
  onToast: (msg: string) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
];

interface MockSpot {
  id: string;
  name: string;
  category: string;
  emoji: string;
  color: string;
  score: number;
  tags: string[];
  latPercent: number;
  lngPercent: number;
  photoUrl: string;
  city: string;
}

const MOCK_MAP_SPOTS: MockSpot[] = [
  {
    id: 'spot-1',
    name: 'Crique Secrète des Calanques',
    category: 'Plein Air',
    emoji: '🌲',
    color: '#10b981',
    score: 4.3,
    tags: ['Spontané', 'Coucher de soleil'],
    latPercent: 38,
    lngPercent: 28,
    photoUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    city: 'Cassis',
  },
  {
    id: 'spot-2',
    name: 'Rooftop Cosy Clandestin',
    category: 'Romantique',
    emoji: '🍷',
    color: '#f43f5e',
    score: 9.8,
    tags: ['Cocktail', 'Vue Nuit'],
    latPercent: 28,
    lngPercent: 68,
    photoUrl: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=400',
    city: 'Paris 06',
  },
  {
    id: 'spot-3',
    name: 'Cabane Sauvage en Forêt',
    category: 'Insolite',
    emoji: '🛖',
    color: '#8b5cf6',
    score: 7.6,
    tags: ['Feu de bois', 'Frisson'],
    latPercent: 68,
    lngPercent: 52,
    photoUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400',
    city: 'Fontainebleau',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  initialStep = 1,
  onClose,
  onComplete,
  onToast,
}) => {
  // Total of 5 clean steps:
  // 1: Découverte de la Carte Interactive (Fausse carte épurée et interactive)
  // 2: Le Système de Notation 5 Critères & Mémos Vocaux
  // 3: Choix du Mode (Duo synchronisé vs Solo Secret)
  // 4: Configuration du Profil (Nom, Photo, Code Duo)
  // 5: Sauvegarde Cloud & Démarrage
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(initialStep as any);
  const [selectedMode, setSelectedMode] = useState<AppMode>('duo');
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [customAvatarInput, setCustomAvatarInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Mock Map state
  const [selectedSpotIndex, setSelectedSpotIndex] = useState<number>(0);

  // Step 2: Rating demo state
  const [demoPartner, setDemoPartner] = useState<'Camille' | 'Alex'>('Camille');

  // Step 4: Duo Code state
  const [hasDuoCode, setHasDuoCode] = useState<boolean>(false);
  const [coupleCodeInput, setCoupleCodeInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedSpotIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeAvatar = customAvatarInput.trim() || selectedAvatar;
  const currentSpot = MOCK_MAP_SPOTS[selectedSpotIndex] || MOCK_MAP_SPOTS[0];

  const validateProfile = (): boolean => {
    if (!userName.trim()) {
      setError('Veuillez saisir votre prénom.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    setError(null);
    if (step === 4) {
      if (!validateProfile()) return;
    }
    if (step < 5) {
      setStep((prev) => (prev + 1) as any);
    }
  };

  const handlePrev = () => {
    setError(null);
    if (step > 1) {
      setStep((prev) => (prev - 1) as any);
    }
  };

  const handleGoogleLogin = async () => {
    if (!validateProfile()) return;
    setLoading(true);
    setError(null);
    try {
      const u = await loginWithGoogle(userName.trim());
      onToast(`Connecté avec Google (${userName.trim() || u.displayName || 'Google'})`);
      await finalizeOnboarding(u);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Connexion Google annulée par l\'utilisateur.');
      } else {
        setError(err.message || 'Impossible de se connecter avec Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    if (!validateProfile()) return;
    setLoading(true);
    setError(null);
    try {
      const u = await loginWithApple(userName.trim());
      onToast(`Connecté avec Apple (${userName.trim() || u.displayName || 'Apple'})`);
      await finalizeOnboarding(u);
    } catch (err: any) {
      console.error('Apple Login Error Detail:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Connexion Apple annulée par l\'utilisateur.');
      } else {
        const fullErr = `Erreur Apple [${err.code || 'UNKNOWN'}]: ${err.message || JSON.stringify(err)}`;
        setError(fullErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const finalizeOnboarding = async (userParam?: User | null) => {
    setLoading(true);
    setError(null);
    try {
      if (selectedMode === 'duo') {
        const enteringWithCode = hasDuoCode && coupleCodeInput.trim().length > 0;
        const u = userParam || (await ensureGuestUser(userName.trim() || 'Utilisateur'));

        if (enteringWithCode) {
          try {
            const synced = await joinCoupleInFirestore(
              u,
              coupleCodeInput.trim(),
              userName.trim(),
              activeAvatar
            );
            if (synced) {
              onToast(`Rejoint l'espace Duo (${synced.code}) avec succès 💖 !`);
              onComplete('duo', synced, 'partner_b');
              return;
            }
          } catch (joinErr: any) {
            setError(joinErr?.message || 'Code Duo invalide ou couple déjà complet.');
            setLoading(false);
            return;
          }
        }

        const res = await createCoupleInFirestore(u, userName.trim(), activeAvatar);
        if (res.isExisting) {
          onToast(`Compte existant retrouvé ! Espace Duo (${res.couple.code}) restauré 💖`);
        } else {
          onToast(`Espace Duo créé avec succès (${res.couple.code}) !`);
        }
        onComplete('duo', res.couple, 'partner_a');
      } else {
        // Solo mode
        const u = userParam || (await ensureGuestUser(userName.trim() || 'Utilisateur'));
        const cleanName = userName.trim() || u.displayName || 'Utilisateur';
        const res = await createCoupleInFirestore(u, cleanName, activeAvatar);

        const soloCouple: CouplePair = {
          ...res.couple,
          partnerA: {
            ...res.couple.partnerA,
            name: cleanName,
            avatar: activeAvatar || res.couple.partnerA.avatar,
            role: 'Jardinier du Jardin Secret',
          },
        };

        if (soloCouple.code) {
          try {
            await updateCoupleInFirestore(soloCouple.code, soloCouple);
          } catch (e) {
            console.warn('Error updating solo couple in Firestore:', e);
          }
        }

        onToast(`Jardin Secret activé pour ${cleanName} 🌿 !`);
        onComplete('solo', soloCouple, 'partner_a');
      }
    } catch (err: any) {
      console.warn('Network / Cloud sync notice, proceeding with local room:', err);
      // Fallback local couple so user is NEVER blocked from entering the app
      const cleanName = userName.trim() || 'Alex';
      const fallbackCode = 'LM-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const fallbackCouple: CouplePair = {
        code: fallbackCode,
        partnerA: {
          id: 'partner_a',
          name: cleanName,
          avatar: activeAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          role: selectedMode === 'solo' ? 'Jardinier Secret' : 'Créateur du journal',
        },
        partnerB: {
          id: 'partner_b',
          name: 'En attente...',
          avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
          role: 'Partenaire 2',
        },
        anniversaryDate: new Date().toISOString().split('T')[0],
        secretPin: '1234',
        isPinLocked: false,
      };

      onToast(`Bienvenue ${cleanName} ! Votre espace LoveMap est prêt 💖`);
      onComplete(selectedMode, fallbackCouple, 'partner_a');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] transition-all">
        {/* Navigation & Progress Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center font-black text-xs shadow-xs">
              <Heart className="w-3.5 h-3.5 fill-current text-white animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-slate-900 dark:text-white text-xs tracking-tight">
                LoveMap
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 font-extrabold">
                {step}/5
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Step Dots */}
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s < step || (step >= 4 && s <= 4)) {
                      setStep(s as any);
                    }
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s === step
                      ? 'w-5 bg-rose-500 shadow-xs shadow-rose-500/50'
                      : s < step
                      ? 'w-2 bg-rose-300 dark:bg-rose-900'
                      : 'w-1.5 bg-slate-200 dark:bg-slate-700'
                  }`}
                  aria-label={`Étape ${s}`}
                />
              ))}
            </div>

            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep(4)}
                className="ml-2 text-[11px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                Passer
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* ======================================================== */}
            {/* ÉTAPE 1: FAUSSE CARTE ÉPURÉE & INTERACTIVE               */}
            {/* ======================================================== */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="text-center space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-300 text-[10px] font-extrabold uppercase tracking-wide">
                    <Compass className="w-3 h-3" />
                    <span>Explorez votre Carte</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    Vos lieux intimes sur la carte
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Chaque crique, rooftop ou lieu secret est géolocalisé et mémorisé sur votre carte privée.
                  </p>
                </div>

                {/* Simulated Map Canvas */}
                <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-2.5 overflow-hidden shadow-inner space-y-2">
                  {/* Top Map Badges */}
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300 font-bold">
                      <Navigation className="w-2.5 h-2.5 text-rose-400" />
                      <span>Carte Privée</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-amber-400 flex items-center gap-0.5 font-extrabold">
                        <Flame className="w-2.5 h-2.5" /> Chaleur Active
                      </span>
                    </div>
                    <span className="text-slate-400 font-semibold">
                      Touchez un repère :
                    </span>
                  </div>

                  {/* Visual Map Area with Realistic Styled Roads/Rivers & Heatmaps */}
                  <div className="relative w-full h-40 sm:h-44 rounded-xl bg-[#0b132b] border border-slate-800 overflow-hidden select-none">
                    {/* Simulated Map Geometry & Coastline */}
                    <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none" viewBox="0 0 400 200">
                      {/* Water Body */}
                      <path d="M0,130 C120,110 240,160 400,120 L400,200 L0,200 Z" fill="#0369a1" />
                      {/* Roads / Paths */}
                      <path d="M50,0 Q180,90 350,200" stroke="#334155" strokeWidth="6" fill="none" strokeLinecap="round" />
                      <path d="M0,70 Q200,60 400,90" stroke="#334155" strokeWidth="4" fill="none" />
                      <path d="M120,0 L120,200" stroke="#1e293b" strokeWidth="2" strokeDasharray="4 4" fill="none" />
                      <path d="M280,0 L280,200" stroke="#1e293b" strokeWidth="2" strokeDasharray="4 4" fill="none" />
                    </svg>

                    {/* Simulated Heatmap Intensity Zones (Multi-layer thermal glows) */}
                    {/* Heat Zone 1: Around Cassis (Calanques) */}
                    <div
                      className="absolute w-32 h-32 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 blur-xl animate-pulse"
                      style={{
                        left: '28%',
                        top: '38%',
                        background: 'radial-gradient(circle, rgba(244,63,94,0.45) 0%, rgba(245,158,11,0.3) 45%, rgba(16,185,129,0.1) 70%, transparent 100%)',
                      }}
                    />
                    {/* Heat Zone 2: Around Paris (Rooftop) */}
                    <div
                      className="absolute w-36 h-36 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 blur-xl"
                      style={{
                        left: '68%',
                        top: '28%',
                        background: 'radial-gradient(circle, rgba(239,68,68,0.5) 0%, rgba(249,115,22,0.35) 45%, rgba(234,179,8,0.15) 75%, transparent 100%)',
                      }}
                    />
                    {/* Heat Zone 3: Around Forest */}
                    <div
                      className="absolute w-28 h-28 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 blur-lg"
                      style={{
                        left: '52%',
                        top: '68%',
                        background: 'radial-gradient(circle, rgba(168,85,247,0.4) 0%, rgba(236,72,153,0.25) 50%, transparent 100%)',
                      }}
                    />

                    {/* Interactive Animated Map Pins */}
                    {MOCK_MAP_SPOTS.map((spot, idx) => {
                      const isSelected = selectedSpotIndex === idx;
                      const tenths = getFlameTenths(spot.score);
                      const { clipY, clipHeight } = getFlameFillClip(tenths);
                      const strokeColor = isSelected
                        ? '#ffffff'
                        : tenths >= 8
                        ? '#f43f5e'
                        : tenths >= 5
                        ? '#f97316'
                        : '#eab308';

                      return (
                        <div
                          key={spot.id}
                          style={{
                            left: `${spot.lngPercent}%`,
                            top: `${spot.latPercent}%`,
                          }}
                          onClick={() => setSelectedSpotIndex(idx)}
                          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 group"
                        >
                          <div className="relative flex flex-col items-center">
                            {/* Pulse for active pin */}
                            {isSelected && (
                              <span
                                className="absolute w-8 h-8 rounded-full animate-ping opacity-60 pointer-events-none"
                                style={{ backgroundColor: spot.color }}
                              />
                            )}

                            {/* Main Pin with Dynamic 10-Step Score-Filled Flame & Full Crisp Contour */}
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xl border-2 transition-all ${
                                isSelected
                                  ? 'scale-125 ring-3 ring-rose-400/70 z-20 shadow-rose-500/50 border-white bg-slate-900'
                                  : 'opacity-90 hover:scale-110 border-slate-700/80 bg-slate-950'
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="w-5 h-5 overflow-visible select-none shrink-0"
                              >
                                <defs>
                                  {/* Dynamic gradient for the flame body */}
                                  <linearGradient
                                    id={`flame-grad-modal-${spot.id}`}
                                    x1="0%"
                                    y1="100%"
                                    x2="0%"
                                    y2="0%"
                                  >
                                    <stop offset="0%" stopColor="#f59e0b" />
                                    <stop offset="50%" stopColor="#f97316" />
                                    <stop offset="100%" stopColor="#f43f5e" />
                                  </linearGradient>

                                  {/* 10-tier vertical clipping based on tenths */}
                                  <clipPath id={`flame-clip-modal-${spot.id}`}>
                                    <rect
                                      x="0"
                                      y={clipY}
                                      width="24"
                                      height={clipHeight}
                                    />
                                  </clipPath>
                                </defs>

                                {/* 1. Ghost silhouette showing entire flame shape */}
                                <path
                                  d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"
                                  fill="rgba(255, 255, 255, 0.15)"
                                />

                                {/* 2. Stepped filled flame body */}
                                <path
                                  d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"
                                  fill={`url(#flame-grad-modal-${spot.id})`}
                                  clipPath={`url(#flame-clip-modal-${spot.id})`}
                                />

                                {/* 3. Inner spark contour */}
                                <path
                                  d="M12 18a2 2 0 0 0 2-2c0-.8-.4-1.3-.8-1.8-.7-.9-.5-1.8.3-2.7.2 1.1.9 2 1.5 2.5.7.7 1 1.4 1 2a4 4 0 0 1-8 0c0-.5.2-1 .5-1.5a1.5 1.5 0 0 0 1.5 1.5c1 0 2 1 2 2z"
                                  fill="rgba(255, 255, 255, 0.45)"
                                  clipPath={`url(#flame-clip-modal-${spot.id})`}
                                />

                                {/* 4. Crisp full outer contour ALWAYS 100% visible */}
                                <path
                                  d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"
                                  fill="none"
                                  stroke={strokeColor}
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>

                            {/* Tooltip Tag */}
                            <div
                              className={`mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-black whitespace-nowrap shadow-md flex items-center gap-1 transition-all ${
                                isSelected
                                  ? 'bg-white text-slate-900 ring-2 ring-rose-500 scale-105'
                                  : 'bg-slate-900/90 text-white border border-slate-700'
                              }`}
                            >
                              <span>{spot.emoji}</span>
                              <span>{spot.name.split(' ')[0]}</span>
                              <span className="text-amber-500 font-extrabold">★{spot.score}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Spot Preview Card (Directly linked to selection) */}
                  <motion.div
                    key={currentSpot.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-left flex items-center gap-2.5"
                  >
                    <img
                      src={currentSpot.photoUrl}
                      alt={currentSpot.name}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white truncate">
                          {currentSpot.name}
                        </span>
                        <span className="text-[10px] font-black text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded-md border border-amber-800/40">
                          ★ {currentSpot.score}/10
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        <span className="font-semibold text-rose-400">{currentSpot.category}</span>
                        <span>•</span>
                        <span>{currentSpot.city}</span>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Concise Highlights */}
                <div className="grid grid-cols-2 gap-2 text-left">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <div className="font-black text-[11px] text-slate-800 dark:text-white flex items-center gap-1">
                      <Camera className="w-3 h-3 text-rose-500" />
                      <span>Ajout de Photos</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      Ajoutez vos clichés secrets, mémos et bien plus encore.
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <div className="font-black text-[11px] text-slate-800 dark:text-white flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-500" />
                      <span>Zones de Chaleur</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      Visualisez la densité et l'intensité de vos moments complices.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                >
                  <span>Suivant : Système de Notation (2/5)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* ÉTAPE 2: LE SYSTÈME DE NOTATION & SOUVENIRS              */}
            {/* ======================================================== */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="text-center space-y-0.5">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    Une évaluation à deux
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Chacun évalue le spot sur 5 critères clés et laisse ses commentaires et mémos secrets.
                  </p>
                </div>

                {/* Rating Breakdown Card */}
                <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  {/* Top Bar with score */}
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black">
                        <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900 dark:text-white">
                          Rooftop Cosy Clandestin
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Moyenne combinée : <b className="text-rose-500">8.2/10</b>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Partner Switcher */}
                  <div className="flex items-center justify-between text-xs bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setDemoPartner('Camille')}
                      className={`flex-1 py-1 px-2 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer ${
                        demoPartner === 'Camille'
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      💖 Note de Camille (7.2)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoPartner('Alex')}
                      className={`flex-1 py-1 px-2 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer ${
                        demoPartner === 'Alex'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      💙 Note d'Alex (9.2)
                    </button>
                  </div>

                  {/* Progress Bars for Criteria (Monochrome) */}
                  <div className="space-y-1.5 text-xs">
                    {[
                      {
                        label: 'Confort & Intimité',
                        score: demoPartner === 'Camille' ? 6.5 : 9.0,
                        icon: '🛏️',
                      },
                      {
                        label: 'Frisson & Audace',
                        score: demoPartner === 'Camille' ? 8.0 : 9.5,
                        icon: '⚡',
                      },
                      {
                        label: 'Romantisme & Alchimie',
                        score: demoPartner === 'Camille' ? 7.5 : 9.5,
                        icon: '💖',
                      },
                      {
                        label: 'Intensité du Moment',
                        score: demoPartner === 'Camille' ? 6.8 : 8.8,
                        icon: '🔥',
                      },
                      {
                        label: 'Cadre & Atmosphère',
                        score: demoPartner === 'Camille' ? 7.2 : 9.2,
                        icon: '🌅',
                      },
                    ].map((crit, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          <span className="flex items-center gap-1">
                            <span>{crit.icon}</span>
                            <span>{crit.label}</span>
                          </span>
                          <span className="font-mono font-black text-slate-900 dark:text-white">
                            {crit.score.toFixed(1)}/10
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            style={{ width: `${crit.score * 10}%` }}
                            className="h-full rounded-full bg-rose-500 dark:bg-rose-400 transition-all duration-300"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Highlighted Comment Section */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-500 dark:text-rose-400">
                      <MessageSquare className="w-3 h-3" />
                      <span>Commentaire & Souvenir ({demoPartner})</span>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 italic leading-relaxed">
                      {demoPartner === 'Camille'
                        ? '« La vue sur les toits était magique au crépuscule. Un moment hors du temps avec toi, à refaire absolument ! 🍷✨ »'
                        : '« Ambiance incroyable et super discret. Un de nos meilleurs moments complices, la nuit était parfaite ! 🔥🏙️ »'}
                    </p>
                  </div>

                  {/* Audio memo visual feature tag (non-clickable / informative) */}
                  <div className="w-full py-2 px-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <Volume2 className="w-3 h-3" />
                      </div>
                      <div className="text-left">
                        <span className="block text-[11px] font-black text-slate-800 dark:text-emerald-200">
                          Mémos vocaux chiffrés
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                          Enregistrez vos impressions intimes à voix haute
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 shrink-0">
                      Chiffré
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                  >
                    <span>Suivant : Mode Duo / Solo (3/5)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* ÉTAPE 3: SYNCHRONISATION DUO OU JARDIN SECRET SOLO        */}
            {/* ======================================================== */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="text-center space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900/50 text-purple-600 dark:text-purple-300 text-[10px] font-extrabold uppercase tracking-wide">
                    <Share2 className="w-3 h-3" />
                    <span>Synchronisation & Confidentialité</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    Choisissez votre mode
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Partagez votre carte en direct à deux ou gardez un jardin secret 100% personnel.
                  </p>
                </div>

                {/* Mode Selector */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('duo')}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer relative ${
                      selectedMode === 'duo'
                        ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black shadow-xs">
                          <Heart className="w-4 h-4 fill-current" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                              Mode Duo Synchronisé
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200 font-extrabold">
                              Recommandé
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Une seule et même carte connectée en direct à deux.
                          </p>
                        </div>
                      </div>
                      {selectedMode === 'duo' && (
                        <CheckCircle2 className="w-5 h-5 text-rose-500 shrink-0" />
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMode('solo')}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer relative ${
                      selectedMode === 'solo'
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black shadow-xs">
                          <Flower2 className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                            Mode Solo (Jardin Secret)
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            100% personnel sur cet appareil uniquement.
                          </p>
                        </div>
                      </div>
                      {selectedMode === 'solo' && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      )}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                  >
                    <span>Suivant : Votre Profil (4/5)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* ÉTAPE 4: PROFIL & CODE PARTENAIRE                        */}
            {/* ======================================================== */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="text-center space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-300 text-[10px] font-extrabold uppercase tracking-wide">
                    <UserIcon className="w-3 h-3" />
                    <span>Personnalisation</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    Votre Profil
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Indiquez votre prénom pour signer vos notes secrètes.
                  </p>
                </div>

                {error && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    {error}
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-slate-900 dark:text-white uppercase tracking-wider block">
                    Votre Prénom <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => {
                        setUserName(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Ex: Camille, Alex, Léa..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {/* Avatar list with Live Upload Preview */}
                <div className="space-y-2">
                  <label className="text-[11px] font-extrabold text-slate-900 dark:text-white uppercase tracking-wider block">
                    Photo ou Avatar
                  </label>
                  
                  {/* Selected Preview Highlight */}
                  <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-rose-500 shadow-md shrink-0 bg-slate-900">
                      <img
                        src={activeAvatar}
                        alt="Aperçu du profil"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>Aperçu de votre photo</span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {customAvatarInput ? 'Photo personnalisée prête 📸' : 'Avatar sélectionné'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                    <label
                      className={`w-11 h-11 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer shrink-0 transition-all ${
                        customAvatarInput
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-500 ring-2 ring-rose-500/30'
                          : 'border-slate-300 dark:border-slate-600 hover:border-rose-500 bg-slate-50 dark:bg-slate-800 text-slate-500'
                      }`}
                      title="Uploader une photo"
                    >
                      <Camera className="w-5 h-5" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const compressedUrl = await compressImageFile(file, 600, 0.8);
                              setCustomAvatarInput(compressedUrl);
                              setSelectedAvatar(compressedUrl);
                            } catch (err) {
                              console.error('Error compressing avatar:', err);
                            }
                          }
                        }}
                        className="hidden"
                      />
                    </label>

                    {PRESET_AVATARS.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedAvatar(img);
                          setCustomAvatarInput('');
                        }}
                        className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                          activeAvatar === img && !customAvatarInput
                            ? 'border-rose-500 ring-3 ring-rose-500/30 scale-105'
                            : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`Avatar ${idx}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Partner Duo code */}
                {selectedMode === 'duo' && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasDuoCode}
                        onChange={(e) => setHasDuoCode(e.target.checked)}
                        className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                      />
                      <span>J'ai déjà un Code Duo reçu de mon partenaire</span>
                    </label>

                    {hasDuoCode && (
                      <div className="space-y-1 pt-1">
                        <input
                          type="text"
                          value={coupleCodeInput}
                          onChange={(e) => setCoupleCodeInput(e.target.value.toUpperCase())}
                          placeholder="Ex: LM-9A7K-42B1"
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 font-mono text-center text-xs font-black tracking-widest text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    )}

                    {!hasDuoCode && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        ✨ Un nouveau Code Duo privé sera créé pour inviter votre partenaire à tout moment.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                  >
                    <span>Finaliser & Démarrer (5/5)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* ÉTAPE 5: SAUVEGARDE & DÉMARRAGE RAPIDE                   */}
            {/* ======================================================== */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="text-center space-y-0.5">
                  <div className="w-10 h-10 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-500 mb-1 shadow-xs">
                    <Cloud className="w-5 h-5 animate-pulse" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    Sauvegarde & Démarrage
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Connectez votre compte pour synchroniser vos souvenirs ou démarrez immédiatement.
                  </p>
                </div>

                {error && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    {error}
                  </div>
                )}

                {/* Login Buttons */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-300 text-slate-800 dark:text-white font-extrabold text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{loading ? 'Connexion...' : 'Continuer avec Google'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAppleLogin}
                    disabled={loading}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.67-.82 1.13-1.96.99-3.11-1 .04-2.22.67-2.93 1.5-.64.74-1.2 1.93-1.05 3.07 1.12.09 2.27-.56 2.99-1.46z" />
                    </svg>
                    <span>{loading ? 'Connexion...' : 'Continuer avec Apple'}</span>
                  </button>

                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                    </div>
                    <div className="relative flex justify-center text-[9px] font-black text-slate-400 bg-white dark:bg-slate-900 px-2 uppercase tracking-wider">
                      Ou
                    </div>
                  </div>

                  {/* Immediate guest start */}
                  <button
                    type="button"
                    onClick={() => finalizeOnboarding(null)}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 transition-all cursor-pointer text-center flex items-center justify-center gap-2 active:scale-98"
                  >
                    <span>Démarrer immédiatement (Mode Invité)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-medium pt-0.5">
                    <Shield className="w-3 h-3 text-emerald-500" />
                    <span>Données chiffrées & synchronisation confidentielle</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="py-1 px-2 text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    ← Retour
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
