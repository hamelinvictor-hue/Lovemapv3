import React, { useState, useEffect } from 'react';
import { X, Maximize2, MapPin, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface PhotoLightboxModalProps {
  isOpen: boolean;
  photoUrl?: string | null;
  photos?: string[];
  initialIndex?: number;
  title?: string;
  caption?: string;
  onClose: () => void;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  isOpen,
  photoUrl,
  photos,
  initialIndex = 0,
  title,
  caption,
  onClose,
}) => {
  const photoList = photos && photos.length > 0 ? photos : photoUrl ? [photoUrl] : [];
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photoList.length - 1));
      }
      if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev < photoList.length - 1 ? prev + 1 : 0));
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, photoList.length, onClose]);

  if (!isOpen || photoList.length === 0) return null;

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic('selection');
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photoList.length - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic('selection');
    setCurrentIndex((prev) => (prev < photoList.length - 1 ? prev + 1 : 0));
  };

  const currentPhoto = photoList[currentIndex] || photoList[0];

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-between p-4 sm:p-6 bg-slate-950/90 backdrop-blur-xl animate-fade-in text-white select-none overflow-hidden"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full max-w-4xl flex items-center justify-between z-10 py-2 px-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0 pr-4">
          <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm sm:text-base text-white truncate">
              {title || 'Photo du spot'}
            </h3>
            {caption && (
              <p className="text-xs text-slate-400 font-medium truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                <span>{caption}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {photoList.length > 1 && (
            <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-extrabold text-amber-300">
              {currentIndex + 1} / {photoList.length}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0"
            title="Fermer (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Container with Navigation Arrows */}
      <div
        className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-auto p-2 group"
        onClick={(e) => e.stopPropagation()}
      >
        {photoList.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:left-4 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white border border-slate-700 hover:border-rose-500 shadow-xl transition-all cursor-pointer hover:scale-110 active:scale-95"
            title="Photo précédente"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img
          key={currentIndex}
          src={currentPhoto}
          alt={title || `Photo ${currentIndex + 1}`}
          className="max-w-full max-h-[75vh] sm:max-h-[82vh] w-auto h-auto object-contain rounded-2xl sm:rounded-3xl shadow-2xl border border-white/10 transition-all transform animate-scale-up"
        />

        {photoList.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:right-4 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white border border-slate-700 hover:border-rose-500 shadow-xl transition-all cursor-pointer hover:scale-110 active:scale-95"
            title="Photo suivante"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Pagination dots if multiple photos */}
      {photoList.length > 1 && (
        <div className="flex items-center gap-2 mb-2 z-10" onClick={(e) => e.stopPropagation()}>
          {photoList.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                idx === currentIndex ? 'w-6 bg-rose-500' : 'w-2 bg-slate-600 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}

      {/* Bottom Footer Info */}
      <div
        className="w-full max-w-md text-center text-xs text-slate-400 font-medium py-1 z-10 flex items-center justify-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
        <span>Cliquez à côté pour fermer • Navigation flèches ← →</span>
      </div>
    </div>
  );
};
