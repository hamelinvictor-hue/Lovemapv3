import React, { useState } from 'react';
import { Star, Heart, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { saveHasRatedApp } from '../lib/storage';

interface StoreRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  triggerSource?: 'first_spot' | 'app_launch' | 'manual';
}

export const StoreRatingModal: React.FC<StoreRatingModalProps> = ({
  isOpen,
  onClose,
  onToast,
  triggerSource = 'app_launch',
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleRate = () => {
    saveHasRatedApp(true);
    setSubmitted(true);
    onToast('⭐ Merci infiniment pour votre soutien 5 étoiles !');

    // Simulate opening store review page after brief thank you
    setTimeout(() => {
      onClose();
      setSubmitted(false);
    }, 1800);
  };

  const handleNeverAsk = () => {
    saveHasRatedApp(true);
    onClose();
  };

  const getSubTitle = () => {
    if (triggerSource === 'first_spot') {
      return 'Félicitations pour la création de votre premier lieu secret ! Vous aimez LoveMap ?';
    }
    return 'Votre avis compte énormément pour nous aider à faire grandir l\'application LoveMap !';
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 overflow-hidden text-slate-900 dark:text-white space-y-5">
        
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="py-8 text-center space-y-3 animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-500 mx-auto flex items-center justify-center">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Merci pour votre avis !</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Redirection vers l'App Store / Play Store...
            </p>
          </div>
        ) : (
          <>
            {/* Header Icon */}
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center text-amber-500 shadow-inner">
                <Heart className="w-8 h-8 fill-amber-400 text-amber-500" />
              </div>
            </div>

            {/* Title & Description */}
            <div className="text-center space-y-1.5">
              <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                Avis App Store & Google Play
              </span>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Donnez votre avis sur LoveMap !
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed px-2">
                {getSubTitle()}
              </p>
            </div>

            {/* Star Rating Interactive Bar */}
            <div className="flex justify-center items-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= (hoverRating || rating);
                return (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform transform active:scale-125 focus:outline-none cursor-pointer"
                  >
                    <Star
                      className={`w-9 h-9 transition-colors ${
                        active
                          ? 'fill-amber-400 text-amber-400 drop-shadow-md'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleRate}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-extrabold text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
              >
                <Star className="w-4.5 h-4.5 fill-white" />
                <span>Noter {rating} sur l'App Store / Play Store</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer text-center"
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  onClick={handleNeverAsk}
                  className="flex-1 py-2.5 px-3 rounded-2xl bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 font-medium text-xs transition-all cursor-pointer text-center"
                >
                  Ne plus demander
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
};
