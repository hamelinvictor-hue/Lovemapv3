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

  const premiumState = getDuoPremiumState(couple, activePartnerId);
  const isPremium = premiumState.isPremium;
  const isSoloSpot = spot.isSolo;
  const isCreator = isSoloSpot || spot.creatorId === activePartnerId;
  const creatorUser = spot.creatorId === 'partner_a' ? couple.partnerA : couple.partnerB;

  const category = CATEGORIES.find((c) => c.id === spot.categoryId) || CATEGORIES[0];
  const ratingA = spot.ratings?.partner_a;
  const ratingB = spot.ratings?.partner_b;
  const isValidated = spot.status === 'validated';
  const myRating = activePartnerId === 'partner_a' ? ratingA : ratingB;
  const needsMyRating = !isSoloSpot && !myRating;

  const spotPhotos = getSpotPhotos(spot);

  const handleEditClick = () => {
    if (!isPremium) {
      triggerHaptic('double');
      onOpenPremiumModal?.(
        "👑 Passez au Pass Duo Premium pour modifier vos lieux enregistrés sans limite (changer le titre, l'adresse, la date, les photos, la musique et vos notes) !"
      );
      return;
    }

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
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Banner image or category background */}
        <div className="relative h-44 sm:h-52 bg-slate-900 overflow-hidden group">
          {spotPhotos.length > 0 ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                triggerHaptic('light');
                setIsPhotoExpanded(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsPhotoExpanded(true);
                }
              }}
              className="w-full h-full cursor-pointer relative block"
              title="Cliquer pour afficher les photos en grand"
            >
              <img
                src={spotPhotos[activePhotoIndex] || spotPhotos[0]}
                alt={spot.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="px-3 py-1.5 rounded-full bg-slate-950/80 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg border border-white/20">
                  <Maximize2 className="w-3.5 h-3.5 text-rose-400" /> Galerie photos ({spotPhotos.length})
                </span>
              </div>
              {/* Visible zoom icon badge for mobile touch users */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  setIsPhotoExpanded(true);
                }}
                className="absolute top-3 left-3 z-10 p-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-white backdrop-blur-md border border-white/20 shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
              >
                <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
                <span>{spotPhotos.length > 1 ? `Galerie (${spotPhotos.length})` : 'Agrandir'}</span>
              </button>
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-rose-600 via-pink-500 to-amber-500" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent pointer-events-none" />

          {/* Top Controls */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            <button
              onClick={handleEditClick}
              className="p-2 rounded-full bg-white/90 text-slate-800 border border-white/40 hover:bg-white backdrop-blur-md shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              title="Modifier ce lieu"
            >
              <Pencil className="w-4 h-4 text-slate-700" />
              {!isPremium && <Crown className="w-3 h-3 text-amber-500 fill-amber-500" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/80 text-slate-800 border border-white/40 hover:bg-white backdrop-blur-md shadow-xs cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Category Pill & Score */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/90 text-slate-900 shadow-md backdrop-blur-md">
                <Icon name={category.icon} className="w-3.5 h-3.5 text-rose-500" />
                {category.name}
              </span>
              {spot.isSolo && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-md backdrop-blur-md">
                  🌿 Jardin Secret
                </span>
              )}
            </div>

            {isValidated && spot.overallScore ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 text-slate-900 shadow-lg backdrop-blur-md">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="font-extrabold text-sm">{spot.overallScore.toFixed(1)}</span>
                <span className="text-[10px] text-slate-400 font-bold">/ 10</span>
              </div>
            ) : (
              <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center gap-1 shadow-md">
                <Clock className="w-3.5 h-3.5" /> En attente de note
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{spot.title}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium mt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                {spot.address}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {spot.date}
              </span>
            </div>
            {!isSoloSpot && spot.creatorId && (
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Créé par <strong className="text-slate-600">{creatorUser.name}</strong>
                {spot.creatorId === activePartnerId ? ' (Vous)' : ''}
              </p>
            )}
          </div>

          {/* Atmosphere tags */}
          {spot.atmosphereTags && spot.atmosphereTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {spot.atmosphereTags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full bg-slate-200/70 text-slate-700 text-[11px] font-semibold">
                  ✨ {tag}
                </span>
              ))}
            </div>
          )}

          {/* Multi-photo gallery thumbnails bar */}
          {spotPhotos.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5 text-rose-500" /> Galerie photos ({spotPhotos.length})
                </span>
                <span className="text-[10px] text-slate-400">Cliquez pour agrandir</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {spotPhotos.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setActivePhotoIndex(idx);
                      setIsPhotoExpanded(true);
                    }}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                      activePhotoIndex === idx
                        ? 'border-rose-500 ring-2 ring-rose-200 scale-105 shadow-md'
                        : 'border-slate-200 hover:border-slate-400 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0.5 right-0.5 px-1 bg-black/60 text-[9px] font-mono text-white rounded">
                      #{idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {spot.notes && (
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 text-slate-700 italic text-xs shadow-2xs">
              "{spot.notes}"
            </div>
          )}

          {/* Voice Memo Audio Player */}
          {spot.audioMemoUrl && (
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white border border-slate-800 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                  🎙️
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Mémo vocal enregistré</h4>
                  <p className="text-[10px] text-slate-400">Souvenir audio de 15s</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMemoAudio}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isPlayingMemo ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlayingMemo ? 'Pause' : 'Écouter'}</span>
              </button>
            </div>
          )}

          {/* Associated Music Card */}
          {spot.associatedMedia && spot.associatedMedia.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-rose-500" />
                <span>Musique souvenir</span>
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {spot.associatedMedia.map((media) => (
                  <div key={media.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      {media.coverUrl ? (
                        <img src={media.coverUrl} alt={media.title} className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-200/60 shadow-xs" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                          <Music className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-900 text-xs truncate">{media.title}</div>
                        {media.artistOrDirector && (
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{media.artistOrDirector}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {media.previewUrl && (
                        <button
                          onClick={() => togglePreview(media)}
                          className={`p-2 rounded-full transition-all cursor-pointer ${
                            playingMediaId === media.id
                              ? 'bg-rose-500 text-white shadow-md animate-pulse'
                              : 'bg-white text-rose-600 hover:bg-rose-50 border border-slate-200'
                          }`}
                          title="Écouter un extrait de 30s"
                        >
                          {playingMediaId === media.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                      )}
                      {media.externalUrl && (
                        <a
                          href={media.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full bg-white text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-colors"
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
            <div className="p-4 rounded-2xl bg-rose-500 text-white space-y-3 shadow-lg">
              <div className="flex items-center gap-2 font-bold text-xs">
                <Sparkles className="w-4 h-4 text-rose-200" />
                <span>Votre évaluation est attendue</span>
              </div>
              <p className="text-[11px] text-rose-100 leading-relaxed font-medium">
                Complétez vos 5 critères pour révéler la note moyenne globale du duo !
              </p>
              <button
                onClick={() => {
                  onClose();
                  onOpenQuestionnaire(spot);
                }}
                className="w-full py-2.5 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-sm hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                <span className="text-rose-600 font-extrabold text-[10px]">Moyenne Duo : {spot.overallScore.toFixed(1)}/10</span>
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
                const isMeA = activePartnerId === 'partner_a';

                const displayScoreA = isMeA || isValidated ? (scoreA !== undefined ? `${scoreA}/10` : '—') : (scoreA !== undefined ? '🔒 Note secrète' : '—');
                const displayScoreB = !isMeA || isValidated ? (scoreB !== undefined ? `${scoreB}/10` : '—') : (scoreB !== undefined ? '🔒 Note secrète' : '—');

                const myScore = isMeA ? scoreA : scoreB;
                const avgScore = isValidated ? (spot.averageScores?.[crit.key] ?? scoreA ?? scoreB ?? 0) : (myScore ?? 0);

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
                        className={`h-full rounded-full transition-all duration-500 ${isValidated ? 'bg-slate-900' : 'bg-rose-500'}`}
                        style={{ width: `${(avgScore / 10) * 100}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                      <span>{couple.partnerA.name}: {displayScoreA}</span>
                      <span>{couple.partnerB.name}: {displayScoreB}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {(ratingA?.comment || ratingB?.comment) && (
              <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                {ratingA?.comment && (
                  activePartnerId === 'partner_a' || isValidated ? (
                    <p className="text-slate-700">
                      <strong className="text-slate-900">{couple.partnerA.name}:</strong> "{ratingA.comment}"
                    </p>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-800 text-[11px] font-medium flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Commentaire de <strong>{couple.partnerA.name}</strong> masqué jusqu'à votre évaluation</span>
                    </div>
                  )
                )}

                {ratingB?.comment && (
                  activePartnerId === 'partner_b' || isValidated ? (
                    <p className="text-slate-700">
                      <strong className="text-slate-900">{couple.partnerB.name}:</strong> "{ratingB.comment}"
                    </p>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-800 text-[11px] font-medium flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Commentaire de <strong>{couple.partnerB.name}</strong> masqué jusqu'à votre évaluation</span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200/60">
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

            <button
              onClick={() => {
                if (confirm('Voulez-vous supprimer ce spot de votre journal ?')) {
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
