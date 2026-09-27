import React, { useState } from 'react';
import { Spot, PartnerId, CouplePair, AssociatedMedia } from '../types';
import { CATEGORIES, RATING_CRITERIA } from '../data/initialData';
import { Icon } from './Icon';
import { triggerHaptic } from '../lib/feedback';
import {
  X,
  MapPin,
  Calendar,
  Star,
  Trash2,
  Clock,
  Lock,
  Maximize2,
  Camera,
  Pencil,
  Crown,
  Play,
  Pause,
  Music,
  ExternalLink,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { getSpotPhotos, getDuoPremiumState } from '../lib/subscription';
import { showNativeConfirm } from '../lib/nativePermissions';

interface SpotDetailSheetProps {
  spot: Spot | null;
  activePartnerId: PartnerId;
  couple: CouplePair;
  isOpen: boolean;
  onClose: () => void;
  onDeleteSpot: (spotId: string) => void;
  onEditSpot: (spot: Spot) => void;
  onOpenQuestionnaire: (spot: Spot) => void;
  onOpenPremiumModal?: (reason?: string) => void;
}

export const SpotDetailSheet: React.FC<SpotDetailSheetProps> = ({
  spot,
  activePartnerId,
  couple,
  isOpen,
  onClose,
  onDeleteSpot,
  onEditSpot,
  onOpenQuestionnaire,
  onOpenPremiumModal,
}) => {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [playingMediaId, setPlayingMediaId] = useState<string | null>(null);
  const [audioObj, setAudioObj] = useState<HTMLAudioElement | null>(null);
  const [isPlayingMemo, setIsPlayingMemo] = useState(false);
  const [memoAudioObj, setMemoAudioObj] = useState<HTMLAudioElement | null>(null);
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);

  if (!isOpen || !spot) return null;

  // Premium status considers personal subscription and couple subscription
  const premiumState = getDuoPremiumState(couple, activePartnerId);
  const isPremium = premiumState.isPremium;

  const isSoloSpot = Boolean(spot.isSolo);
  const isMeA = activePartnerId === 'partner_a';

  // Normalize partner user objects
  const partnerA = couple?.partnerA || {
    id: 'partner_a',
    name: 'Partenaire 1',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    role: 'Partenaire 1',
  };
  const partnerB = couple?.partnerB || {
    id: 'partner_b',
    name: 'En attente...',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };

  // Check creator identity by matching role ('partner_a' | 'partner_b') or Firestore Auth UIDs
  const isCreator =
    isSoloSpot ||
    spot.creatorId === activePartnerId ||
    (Boolean(couple?.partnerAUid) && isMeA && spot.creatorId === couple.partnerAUid) ||
    (Boolean(couple?.partnerBUid) && !isMeA && spot.creatorId === couple.partnerBUid);

  const isCreatorA =
    spot.creatorId === 'partner_a' ||
    (Boolean(couple?.partnerAUid) && spot.creatorId === couple.partnerAUid);
  const creatorUser = isCreatorA ? partnerA : partnerB;

  const category = CATEGORIES.find((c) => c.id === spot.categoryId) || CATEGORIES[0];

  // Resolve ratings safely by partner role or UID
  const ratingA =
    spot.ratings?.partner_a ||
    (couple?.partnerAUid ? spot.ratings?.[couple.partnerAUid] : undefined);
  const ratingB =
    spot.ratings?.partner_b ||
    (couple?.partnerBUid ? spot.ratings?.[couple.partnerBUid] : undefined);

  const isValidated = spot.status === 'validated';
  const myRating = isMeA ? ratingA : ratingB;
  const needsMyRating = !isSoloSpot && !myRating;

  // Partner can always rate and validate a spot in pending_validation without any premium checks
  const canValidate = !isSoloSpot && spot.status === 'pending_validation' && !isCreator && !myRating;

  const spotPhotos = getSpotPhotos(spot);

  const handleEditClick = () => {
    // Premium check for editing spot content
    if (!isPremium) {
      triggerHaptic('double');
      onOpenPremiumModal?.(
        "👑 Passez au Pass Duo Premium pour modifier vos lieux enregistrés sans limite (changer le titre, l'adresse, la date, les photos, la musique et vos notes) !"
      );
      return;
    }

    // Creator check for shared duo spots
    if (!isSoloSpot && !isCreator) {
      triggerHaptic('double');
      alert(`Seul le créateur de ce lieu (${creatorUser.name}) peut modifier ce spot partagé.`);
      return;
    }

    triggerHaptic('medium');
    onClose();
    onEditSpot(spot);
  };

  const togglePreview = (item: AssociatedMedia) => {
    if (!item.previewUrl) return;
    if (playingMediaId === item.id) {
      audioObj?.pause();
      setPlayingMediaId(null);
    } else {
      audioObj?.pause();
      memoAudioObj?.pause();
      setIsPlayingMemo(false);
      const newAudio = new Audio(item.previewUrl);
      newAudio.play();
      setAudioObj(newAudio);
      setPlayingMediaId(item.id);
      newAudio.onended = () => setPlayingMediaId(null);
    }
  };

  const toggleMemoAudio = () => {
    if (!spot.audioMemoUrl) return;
    if (isPlayingMemo && memoAudioObj) {
      memoAudioObj.pause();
      setIsPlayingMemo(false);
    } else {
      audioObj?.pause();
      memoAudioObj?.pause();
      const audio = new Audio(spot.audioMemoUrl);
      audio.play();
      setMemoAudioObj(audio);
      setIsPlayingMemo(true);
      audio.onended = () => setIsPlayingMemo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col my-auto max-h-[92vh] text-slate-100">
        {/* Header Harmonisé */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-2xl text-white flex items-center justify-center shadow-xs"
              style={{ backgroundColor: category.color }}
            >
              <Icon name={category.icon} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-base leading-tight truncate max-w-[200px] sm:max-w-[260px]">
                {spot.title}
              </h2>
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mt-0.5">
                {category.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto bg-slate-50">
          {/* Photos Showcase */}
          {spotPhotos.length > 0 && (
            <div className="space-y-2">
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-md group bg-slate-950">
                <img
                  src={spotPhotos[activePhotoIndex]}
                  alt={spot.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                  onClick={() => setIsPhotoExpanded(true)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3 pointer-events-none">
                  <span className="text-white text-xs font-semibold drop-shadow-md">
                    Photo {activePhotoIndex + 1} / {spotPhotos.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPhotoExpanded(true);
                    }}
                    className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 pointer-events-auto backdrop-blur-xs transition-colors cursor-pointer"
                    title="Agrandir en plein écran"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Visible expand button for touch users */}
                <button
                  type="button"
                  onClick={() => setIsPhotoExpanded(true)}
                  className="absolute bottom-2.5 right-2.5 p-2 rounded-xl bg-slate-900/80 text-white border border-white/20 backdrop-blur-md shadow-md sm:hidden flex items-center gap-1.5 text-xs font-bold"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Zoom</span>
                </button>
              </div>

              {/* Photo Miniatures Carousel */}
              {spotPhotos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {spotPhotos.map((photo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                        activePhotoIndex === idx
                          ? 'border-rose-500 scale-105 shadow-sm'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Info & Creator Metadata */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="truncate font-medium text-slate-700">{spot.address}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-medium text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{spot.date}</span>
              </div>
            </div>

            {/* Creator badge */}
            {!isSoloSpot && spot.creatorId && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Ajouté par :</span>
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  {creatorUser.name}
                  {isCreator ? ' (Vous)' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Atmosphere Tags */}
          {spot.atmosphereTags && spot.atmosphereTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {spot.atmosphereTags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1"
                >
                  <span>✨</span> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Personal Notes */}
          {spot.notes && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-1.5 shadow-2xs">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Notes & Souvenirs
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal whitespace-pre-line">
                {spot.notes}
              </p>
            </div>
          )}

          {/* Voice Memo Player */}
          {spot.audioMemoUrl && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 border border-rose-200/60 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Note Vocale du Moment</h4>
                  <p className="text-[10px] text-slate-500">Enregistrée lors de votre venue</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMemoAudio}
                className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-transform active:scale-95 cursor-pointer"
              >
                {isPlayingMemo ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlayingMemo ? 'Pause' : 'Écouter'}</span>
              </button>
            </div>
          )}

          {/* Associated Music / Soundtrack */}
          {spot.associatedMedia && spot.associatedMedia.length > 0 && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-2xs">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-rose-500" />
                <span>Bande Son du Lieu</span>
              </h3>
              <div className="space-y-2">
                {spot.associatedMedia.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate">{item.title}</h4>
                        <p className="text-[11px] text-slate-500 truncate">{item.artist}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.previewUrl && (
                        <button
                          type="button"
                          onClick={() => togglePreview(item)}
                          className="p-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
                          title={playingMediaId === item.id ? 'Pause' : 'Écouter un extrait'}
                        >
                          {playingMediaId === item.id ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>
                      )}
                      {item.externalUrl && (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                          title="Ouvrir sur Spotify / Apple Music"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt to evaluate if rating pending */}
          {needsMyRating && (
            <div className="p-4 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white space-y-3 shadow-lg shadow-rose-500/20">
              <div className="flex items-center gap-2 font-black text-xs">
                <Sparkles className="w-4 h-4 text-amber-200 fill-current animate-pulse" />
                <span>Votre évaluation est attendue</span>
              </div>
              <p className="text-[11px] text-rose-100 leading-relaxed font-medium">
                Complétez vos 5 critères pour révéler la note moyenne globale du duo !
              </p>
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  onClose();
                  onOpenQuestionnaire(spot);
                }}
                className="w-full py-2.5 rounded-xl bg-white text-slate-900 font-extrabold text-xs shadow-sm hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-rose-600" />
                <span>Noter ce lieu maintenant</span>
              </button>
            </div>
          )}

          {/* Rating breakdown by criteria */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center justify-between">
              <span>Critères d'évaluation</span>
              {isValidated && spot.overallScore ? (
                <span className="text-rose-600 font-extrabold text-[10px]">
                  Moyenne Duo : {spot.overallScore.toFixed(1)}/10
                </span>
              ) : (
                <span className="text-amber-600 font-extrabold text-[10px] flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-500" /> Note Duo masquée (Anti-Spoil)
                </span>
              )}
            </h3>

            <div className="space-y-3">
              {RATING_CRITERIA.map((crit) => {
                const scoreA = ratingA?.scores?.[crit.key];
                const scoreB = ratingB?.scores?.[crit.key];
                const displayScoreA =
                  isMeA || isValidated
                    ? scoreA !== undefined
                      ? `${scoreA}/10`
                      : '—'
                    : scoreA !== undefined
                    ? '🔒 Note secrète'
                    : '—';
                const displayScoreB =
                  !isMeA || isValidated
                    ? scoreB !== undefined
                      ? `${scoreB}/10`
                      : '—'
                    : scoreB !== undefined
                    ? '🔒 Note secrète'
                    : '—';
                const myScore = isMeA ? scoreA : scoreB;
                const avgScore = isValidated
                  ? (spot.averageScores?.[crit.key] ?? scoreA ?? scoreB ?? 0)
                  : (myScore ?? 0);

                return (
                  <div key={crit.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-800 font-bold">
                        <span className="text-sm">{crit.emoji}</span>
                        <span>{crit.label}</span>
                      </div>
                      <span className="font-mono font-bold text-xs text-slate-900">
                        {isValidated
                          ? `${avgScore.toFixed(1)} / 10`
                          : myScore !== undefined
                          ? `${myScore} / 10 (Ma note)`
                          : '🔒 Secret'}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isValidated ? 'bg-slate-900' : 'bg-rose-500'
                        }`}
                        style={{ width: `${(avgScore / 10) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                      <span>
                        {partnerA.name}: {displayScoreA}
                      </span>
                      <span>
                        {partnerB.name}: {displayScoreB}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {(ratingA?.comment || ratingB?.comment) && (
              <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                {ratingA?.comment &&
                  (isMeA || isValidated ? (
                    <p className="text-slate-700">
                      <strong className="text-slate-900">{partnerA.name}:</strong> "{ratingA.comment}"
                    </p>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-800 text-[11px] font-medium flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Commentaire de <strong>{partnerA.name}</strong> masqué jusqu'à votre évaluation</span>
                    </div>
                  ))}

                {ratingB?.comment &&
                  (!isMeA || isValidated ? (
                    <p className="text-slate-700">
                      <strong className="text-slate-900">{partnerB.name}:</strong> "{ratingB.comment}"
                    </p>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-800 text-[11px] font-medium flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Commentaire de <strong>{partnerB.name}</strong> masqué jusqu'à votre évaluation</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200/60">
            {canValidate ? (
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  onClose();
                  onOpenQuestionnaire(spot);
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 hover:opacity-95 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 transition-all active:scale-98 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 fill-current animate-pulse" />
                <span>Évaluer & Valider ce lieu</span>
              </button>
            ) : (
              <button
                onClick={handleEditClick}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-amber-400" />
                <span>Modifier le lieu</span>
                {!isPremium && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5">
                    <Crown className="w-2.5 h-2.5 fill-current" /> Premium
                  </span>
                )}
              </button>
            )}

            <button
              onClick={async () => {
                const confirmed = await showNativeConfirm(
                  'Supprimer le lieu',
                  'Voulez-vous supprimer ce spot de votre journal ?',
                  'Supprimer',
                  'Annuler'
                );
                if (confirmed) {
                  onDeleteSpot(spot.id);
                  onClose();
                }
              }}
              className="py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900/40 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Supprimer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Fullscreen Photo Lightbox */}
      <PhotoLightboxModal
        isOpen={isPhotoExpanded}
        photoUrl={spotPhotos[activePhotoIndex] || spot.photoUrl}
        photos={spotPhotos}
        initialIndex={activePhotoIndex}
        title={spot.title}
        caption={`${spot.address} • ${spot.date}`}
        onClose={() => setIsPhotoExpanded(false)}
      />
    </div>
  );
};
