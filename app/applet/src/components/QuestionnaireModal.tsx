import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Spot, PartnerId, CouplePair, CriteriaKey } from '../types';
import { RATING_CRITERIA } from '../data/initialData';
import { Icon } from './Icon';
import { triggerHaptic } from '../lib/feedback';
import { X, CheckCircle2, Heart, Sparkles, MessageSquare, Star } from 'lucide-react';

interface QuestionnaireModalProps {
  spot: Spot;
  activePartnerId: PartnerId;
  couple: CouplePair;
  isOpen: boolean;
  onClose: () => void;
  onSubmitRating: (spotId: string, partnerId: PartnerId, scores: Record<CriteriaKey, number>, comment?: string) => void;
}

export const QuestionnaireModal: React.FC<QuestionnaireModalProps> = ({
  spot,
  activePartnerId,
  couple,
  isOpen,
  onClose,
  onSubmitRating,
}) => {
  const [scores, setScores] = useState<Record<CriteriaKey, number>>({
    comfort: 8,
    thrill: 8,
    romance: 9,
    intensity: 9,
    setting: 8,
  });
  const [comment, setComment] = useState('');

  if (!isOpen || !spot) return null;

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

  const partnerRole = activePartnerId === 'partner_a' ? 'partner_b' : 'partner_a';
  const partnerUid = activePartnerId === 'partner_a' ? couple?.partnerBUid : couple?.partnerAUid;
  const existingPartnerRating =
    spot.ratings?.[partnerRole] || (partnerUid ? spot.ratings?.[partnerUid] : undefined);

  const keys: CriteriaKey[] = ['comfort', 'thrill', 'romance', 'intensity', 'setting'];
  const mySum = keys.reduce((acc, k) => acc + (scores[k] || 0), 0);
  const myAvgScore = Math.round((mySum / keys.length) * 10) / 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    triggerHaptic('success');
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#e11d48', '#f43f5e', '#fbbf24'],
    });

    onSubmitRating(spot.id, activePartnerId, scores, comment.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col my-auto max-h-[92vh] text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-sm">Évaluation du Spot</h2>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[220px]">{spot.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 bg-slate-900">
          {/* Preview score banner */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-white flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[11px] text-slate-400 font-semibold block uppercase tracking-wider">
                Vos Notes Personnelles
              </span>
              <p className="text-xs text-rose-300 font-medium mt-0.5">
                La moyenne combinée du duo sera calculée après validation !
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="font-mono text-base font-extrabold text-white">{myAvgScore.toFixed(1)}</span>
              <span className="text-[10px] text-slate-400 font-bold">/ 10</span>
            </div>
          </div>

          {/* Criteria Sliders */}
          <div className="space-y-4 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
            {RATING_CRITERIA.map((crit) => (
              <div key={crit.key} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-2">
                    <span className="text-sm">{crit.emoji}</span>
                    <span>{crit.label}</span>
                  </span>
                  <span className="font-mono font-bold text-rose-400">{scores[crit.key]} / 10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={scores[crit.key]}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    setScores({ ...scores, [crit.key]: parseInt(e.target.value, 10) });
                  }}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>
            ))}
          </div>

          {/* Optional comment */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Note personnelle / Commentaire (optionnel)
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Un mot tendre ou un souvenir marquant..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer text-center"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-600 text-white text-xs font-bold shadow-lg shadow-rose-500/25 flex items-center gap-1.5 transition-all hover:scale-102 active:scale-98 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
              <span>Valider mes notes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
