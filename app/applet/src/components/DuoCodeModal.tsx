import React, { useState } from 'react';
import { X, Copy, Check, Share2, Sparkles, ShieldCheck } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';
import { triggerHaptic } from '../lib/feedback';

interface DuoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  creatorName?: string;
}

export const DuoCodeModal: React.FC<DuoCodeModalProps> = ({
  isOpen,
  onClose,
  code,
  creatorName = 'Vous',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    triggerHaptic('light');
    setCopied(true);
    // Non-blocking fire-and-forget clipboard write with 0ms UI delay
    copyToClipboard(code).catch(() => {});
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    const shareData = {
      title: 'LoveMap - Rejoins mon espace Duo 💖',
      text: `Coucou ! Rejoins notre carte secrète de couple sur LoveMap avec mon code unique : ${code}`,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Fallback to copy if user cancelled share or error
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto animate-scale-up">
        {/* Top Header Card */}
        <div className="relative p-6 bg-gradient-to-br from-rose-500 via-rose-600 to-pink-600 text-white text-center overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-lg">
            <Sparkles className="w-6 h-6 fill-rose-200" />
          </div>

          <h2 className="text-lg font-black tracking-tight">Espace Duo Créé ! 💖</h2>
          <p className="text-xs text-rose-100 font-medium mt-1">
            Voici votre code unique pour connecter le téléphone de votre partenaire
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-center">
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Votre Code de Synchronisation
            </span>
            <div className="relative p-4 rounded-2xl bg-rose-50/80 border-2 border-dashed border-rose-300 flex items-center justify-center">
              <span className="font-mono text-2xl font-black tracking-widest text-rose-600">
                {code}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-left flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Envoyez ce code à votre partenaire. Lors de son premier accès sur son téléphone, il/elle choisira <strong>« Rejoindre un duo »</strong> et saisira ce code !
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              onClick={handleCopy}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Code copié dans le presse-papier !</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copier mon Code Duo</span>
                </>
              )}
            </button>

            <button
              onClick={handleShare}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-slate-600" />
              <span>Partager le lien / code</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors pt-2 block mx-auto"
          >
            Fermer et accéder à la carte
          </button>
        </div>
      </div>
    </div>
  );
};
