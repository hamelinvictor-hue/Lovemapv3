import React, { useState } from 'react';
import { Spot, PartnerId, CouplePair } from '../types';
import { CATEGORIES } from '../data/initialData';
import { Icon } from './Icon';
import { triggerHaptic, triggerHeartBurst } from '../lib/feedback';
import { X, CheckCircle2, MapPin, Calendar, UserCheck, AlertCircle, XCircle, Sparkles, Maximize2 } from 'lucide-react';
import { PhotoLightboxModal } from './PhotoLightboxModal';

interface ValidateSpotModalProps {
  spot: Spot | null;
  activePartnerId: PartnerId;
  couple: CouplePair;
  isOpen: boolean;
  onClose: () => void;
  onOpenQuestionnaire: (spot: Spot) => void;
  onDeclineSpot: (spotId: string) => void;
}

export const ValidateSpotModal: React.FC<ValidateSpotModalProps> = ({
  spot,
  activePartnerId,
  couple,
  isOpen,
  onClose,
  onOpenQuestionnaire,
  onDeclineSpot,
}) => {
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);

  if (!isOpen || !spot) return null;

  const creatorUser = spot.creatorId === 'partner_a' ? couple.partnerA : couple.partnerB;
  const category = CATEGORIES.find((c) => c.id === spot.categoryId) || CATEGORIES[0];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col my-auto max-h-[92vh] text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-sm">Nouveau Spot à Valider</h2>
              <p className="text-[11px] text-slate-400 font-medium">Proposé par {creatorUser.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 bg-slate-900">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-slate-200 flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs font-medium leading-relaxed">
              <strong className="text-white">{creatorUser.name}</strong> a épinglé ce lieu secret. Évaluez-le à votre tour pour finaliser la note du duo !
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 shadow-lg space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700 mb-2">
                  <Icon name={category.icon} className="w-3.5 h-3.5 text-rose-400" />
                  {category.name}
                </span>
                <h3 className="text-base font-extrabold text-white">{spot.title}</h3>
                <p className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  {spot.address}
                </p>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {spot.date}
              </div>
            </div>

            {spot.photoUrl && (
              <div
                onClick={() => {
                  triggerHaptic('light');
                  setIsPhotoExpanded(true);
                }}
                className="relative h-36 rounded-xl overflow-hidden cursor-pointer group border border-slate-800 mt-2"
                title="Cliquer pour afficher la photo en grand"
              >
                <img src={spot.photoUrl} alt={spot.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg border border-white/20">
                    <Maximize2 className="w-3.5 h-3.5 text-rose-400" /> Agrandir
                  </span>
                </div>
                <div className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-950/80 text-white backdrop-blur-md border border-white/10 text-[10px] font-bold flex items-center gap-1">
                  <Maximize2 className="w-3 h-3 text-rose-400" />
                  <span>Agrandir</span>
                </div>
              </div>
            )}

            {spot.atmosphereTags && spot.atmosphereTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {spot.atmosphereTags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px] font-medium">
                    ✨ {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-center sm:justify-between gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onDeclineSpot(spot.id);
                onClose();
              }}
              className="w-full sm:w-auto text-center justify-center text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors py-1.5"
            >
              <XCircle className="w-3.5 h-3.5" /> Décliner ce spot
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                triggerHeartBurst(0.5, 0.5);
                onClose();
                onOpenQuestionnaire(spot);
              }}
              className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-600 text-white text-xs font-bold shadow-lg shadow-rose-500/25 flex items-center gap-1.5 transition-all hover:scale-102 active:scale-98 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
              <span>Accepter & Évaluer à deux</span>
            </button>
          </div>
        </div>
      </div>

      <PhotoLightboxModal
        isOpen={isPhotoExpanded}
        photoUrl={spot.photoUrl}
        title={spot.title}
        caption={`${spot.address} • ${spot.date}`}
        onClose={() => setIsPhotoExpanded(false)}
      />
    </div>
  );
};
