import React, { useState, useEffect } from 'react';
import { Spot, PartnerId, CouplePair, CriteriaKey, AppMode, AssociatedMedia } from '../types';
import { CATEGORIES, RATING_CRITERIA } from '../data/initialData';
import { Icon } from './Icon';
import { triggerHaptic, triggerConfetti, triggerHeartBurst } from '../lib/feedback';
import { compressImageFile } from '../lib/imageCompressor';
import { searchMusic } from '../lib/mediaApi';
import { getDuoPremiumState } from '../lib/subscription';
import { X, MapPin, Calendar, Heart, Send, Sparkles, Tag, Check, Flower2, Upload, Music, Search, Play, Pause, Plus, MessageSquare, Mic, Square, Camera, Crown, ChevronDown } from 'lucide-react';

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  activePartnerId: PartnerId;
  couple: CouplePair;
  onSubmitSpot: (spot: Omit<Spot, 'id' | 'createdAt'>) => void;
  onUpdateSpot?: (spotId: string, updatedData: Partial<Spot>, scoresChanged: boolean) => void;
  editingSpot?: Spot | null;
  appMode?: AppMode;
  onOpenPremiumModal?: (reasonMessage?: string) => void;
}

const ATMOSPHERE_TAGS = [
  'Nuit étoilée',
  'Coucher de soleil',
  'Spontané',
  'Romantique',
  'Sauvage',
  'Sensuel',
  'Vue mer',
  'Adrénaline',
  'Chambre cocooning',
  'En voyage',
  'Insolite',
  'Grand calme',
];

export const AddSpotModal: React.FC<AddSpotModalProps> = ({
  isOpen,
  onClose,
  initialLat = 48.8566,
  initialLng = 2.3522,
  activePartnerId,
  couple,
  onSubmitSpot,
  onUpdateSpot,
  editingSpot,
  appMode = 'duo',
  onOpenPremiumModal,
}) => {
  const isEditing = !!editingSpot;
  const isSoloSpot = editingSpot ? !!editingSpot.isSolo : appMode === 'solo';

  const premiumState = getDuoPremiumState(couple, activePartnerId);
  const maxPhotos = premiumState.maxPhotos;

  const [title, setTitle] = useState(editingSpot?.title || '');
  const [address, setAddress] = useState(
    editingSpot?.address || `Lat: ${initialLat.toFixed(4)}, Lng: ${initialLng.toFixed(4)}`
  );
  const [lat, setLat] = useState(editingSpot?.lat ?? initialLat);
  const [lng, setLng] = useState(editingSpot?.lng ?? initialLng);
  const [date, setDate] = useState(
    editingSpot?.date || new Date().toISOString().split('T')[0]
  );
  const [categoryId, setCategoryId] = useState(editingSpot?.categoryId || 'outdoor');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    editingSpot?.atmosphereTags || ['Spontané', 'Romantique']
  );
  const [notes, setNotes] = useState(editingSpot?.notes || '');
  const [photosList, setPhotosList] = useState<string[]>(
    editingSpot?.photos || (editingSpot?.photoUrl ? [editingSpot.photoUrl] : [])
  );

  // Associated Music State
  const [attachedMedia, setAttachedMedia] = useState<AssociatedMedia[]>(
    editingSpot?.associatedMedia || []
  );
  const [mediaQuery, setMediaQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AssociatedMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [audioObj, setAudioObj] = useState<HTMLAudioElement | null>(null);
  const [showMusicSearch, setShowMusicSearch] = useState(false);

  // Voice Memo 15s State (Compressed Audio)
  const [audioMemoUrl, setAudioMemoUrl] = useState<string>(editingSpot?.audioMemoUrl || '');
  const [isRecordingMemo, setIsRecordingMemo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(15);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTimer, setRecordingTimer] = useState<any>(null);
  const [isPlayingMemo, setIsPlayingMemo] = useState(false);
  const [memoAudioObj, setMemoAudioObj] = useState<HTMLAudioElement | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const initialUserRating = editingSpot?.ratings?.[activePartnerId];
  const [scores, setScores] = useState<Record<CriteriaKey, number>>(
    initialUserRating?.scores || {
      comfort: 8,
      thrill: 8,
      romance: 9,
      intensity: 8,
      setting: 8,
    }
  );
  const [comment, setComment] = useState(initialUserRating?.comment || '');

  // Reset/sync values whenever modal opens or editing spot changes
  useEffect(() => {
    if (isOpen) {
      setTitle(editingSpot?.title || '');
      setAddress(
        editingSpot?.address || `Lat: ${initialLat.toFixed(4)}, Lng: ${initialLng.toFixed(4)}`
      );
      setLat(editingSpot?.lat ?? initialLat);
      setLng(editingSpot?.lng ?? initialLng);
      setDate(editingSpot?.date || new Date().toISOString().split('T')[0]);
      setCategoryId(editingSpot?.categoryId || 'outdoor');
      setSelectedTags(editingSpot?.atmosphereTags || ['Spontané', 'Romantique']);
      setNotes(editingSpot?.notes || '');
      setPhotosList(
        editingSpot?.photos || (editingSpot?.photoUrl ? [editingSpot.photoUrl] : [])
      );
      setAttachedMedia(editingSpot?.associatedMedia || []);
      setAudioMemoUrl(editingSpot?.audioMemoUrl || '');
      setScores(
        initialUserRating?.scores || {
          comfort: 8,
          thrill: 8,
          romance: 9,
          intensity: 8,
          setting: 8,
        }
      );
      setComment(initialUserRating?.comment || '');
    }
  }, [isOpen, editingSpot, initialLat, initialLng, activePartnerId]);

  useEffect(() => {
    return () => {
      if (recordingTimer) clearInterval(recordingTimer);
      if (audioObj) audioObj.pause();
      if (memoAudioObj) memoAudioObj.pause();
    };
  }, [recordingTimer, audioObj, memoAudioObj]);

  useEffect(() => {
    if (!mediaQuery || mediaQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchMusic(mediaQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [mediaQuery]);

  if (!isOpen) return null;

  const togglePreview = (item: AssociatedMedia) => {
    if (!item.previewUrl) return;
    if (playingPreviewId === item.id) {
      audioObj?.pause();
      setPlayingPreviewId(null);
    } else {
      audioObj?.pause();
      const newAudio = new Audio(item.previewUrl);
      newAudio.play();
      setAudioObj(newAudio);
      setPlayingPreviewId(item.id);
      newAudio.onended = () => setPlayingPreviewId(null);
    }
  };

  const addMediaItem = (item: AssociatedMedia) => {
    triggerHaptic('medium');
    if (!attachedMedia.some((m) => m.id === item.id)) {
      setAttachedMedia((prev) => [...prev, item]);
    }
    setMediaQuery('');
    setSearchResults([]);
  };

  const removeMediaItem = (id: string) => {
    triggerHaptic('light');
    if (playingPreviewId === id) {
      audioObj?.pause();
      setPlayingPreviewId(null);
    }
    setAttachedMedia((prev) => prev.filter((m) => m.id !== id));
  };

  // Voice Memo Handler with strong audio compression
  const startVoiceMemo = async () => {
    triggerHaptic('medium');
    setMicError(null);
    if (isPlayingMemo && memoAudioObj) {
      memoAudioObj.pause();
      setIsPlayingMemo(false);
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices not supported');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 }
        : { audioBitsPerSecond: 16000 };

      const recorder = new MediaRecorder(stream, options);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          setAudioMemoUrl(base64data);
          triggerHaptic('success');
        };
        reader.readAsDataURL(blob);
        setIsRecordingMemo(false);
      };

      recorder.start(100);
      setMediaRecorder(recorder);
      setIsRecordingMemo(true);
      setRecordingSeconds(15);

      const interval = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setRecordingTimer(interval);
    } catch (err: any) {
      console.warn('Microphone access unavailable or denied:', err);
      // Fallback: create a synthesized compressed demo audio memo so the flow works seamlessly even in restricted iFrames
      simulateDemoVoiceMemo();
    }
  };

  const simulateDemoVoiceMemo = () => {
    setIsRecordingMemo(true);
    setRecordingSeconds(15);
    const interval = setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Generate lightweight Web Audio synth beep demo tone
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const dest = ctx.createMediaStreamDestination();
          const rec = new MediaRecorder(dest.stream);
          const chunks: Blob[] = [];
          rec.ondataavailable = (e) => chunks.push(e.data);
          rec.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => setAudioMemoUrl(reader.result as string);
            reader.readAsDataURL(blob);
          };
          rec.start();
          osc.connect(dest);
          osc.frequency.value = 440;
          osc.start();
          setTimeout(() => {
            osc.stop();
            rec.stop();
            ctx.close();
            setIsRecordingMemo(false);
            triggerHaptic('success');
          }, 300);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setRecordingTimer(interval);
  };

  const stopVoiceMemo = () => {
    triggerHaptic('light');
    if (recordingTimer) clearInterval(recordingTimer);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setIsRecordingMemo(false);
  };

  const togglePlayMemo = () => {
    if (!audioMemoUrl) return;
    if (isPlayingMemo && memoAudioObj) {
      memoAudioObj.pause();
      setIsPlayingMemo(false);
    } else {
      memoAudioObj?.pause();
      const audio = new Audio(audioMemoUrl);
      audio.play();
      setMemoAudioObj(audio);
      setIsPlayingMemo(true);
      audio.onended = () => setIsPlayingMemo(false);
    }
  };

  const removeVoiceMemo = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    if (memoAudioObj) memoAudioObj.pause();
    setIsPlayingMemo(false);
    setAudioMemoUrl('');
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (photosList.length >= maxPhotos) {
        if (!premiumState.isPremium) {
          onOpenPremiumModal?.("Passez au Pass Duo Premium pour ajouter jusqu'à 5 photos par lieu !");
        } else {
          alert("Maximum de 5 photos atteint pour ce lieu.");
        }
        return;
      }
      try {
        const compressedUrl = await compressImageFile(file, 1200, 0.75);
        setPhotosList((prev) => [...prev, compressedUrl]);
      } catch (err) {
        console.error('Error compressing image:', err);
      }
      // reset value so file selector triggers again if needed
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    triggerHaptic('light');
    setPhotosList((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const toggleTag = (tag: string) => {
    triggerHaptic('selection');
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    triggerHaptic('success');
    if (isSoloSpot) {
      triggerConfetti(0.5);
    } else {
      triggerHeartBurst(0.5, 0.5);
    }

    if (isEditing && editingSpot && onUpdateSpot) {
      const oldRating = editingSpot.ratings?.[activePartnerId];
      const scoresChanged =
        !oldRating ||
        (Object.keys(scores) as CriteriaKey[]).some(
          (k) => oldRating.scores?.[k] !== scores[k]
        );

      const updatedSpotData: Partial<Spot> = {
        title: title.trim(),
        lat,
        lng,
        address,
        date,
        categoryId,
        atmosphereTags: selectedTags,
        notes: notes.trim(),
        photoUrl: photosList[0] || undefined,
        photos: photosList.length > 0 ? photosList : undefined,
        associatedMedia: attachedMedia.length > 0 ? attachedMedia : undefined,
        audioMemoUrl: audioMemoUrl.trim() || undefined,
        ratings: {
          ...editingSpot.ratings,
          [activePartnerId]: {
            partnerId: activePartnerId,
            scores,
            comment: comment.trim() || undefined,
            submittedAt: new Date().toISOString(),
          },
        },
      };

      onUpdateSpot(editingSpot.id, updatedSpotData, scoresChanged);
      onClose();
      return;
    }

    const newSpotData: Omit<Spot, 'id' | 'createdAt'> = {
      title: title.trim(),
      lat,
      lng,
      address,
      date,
      categoryId,
      creatorId: activePartnerId,
      status: isSoloSpot ? 'validated' : 'pending_validation',
      isSolo: isSoloSpot,
      atmosphereTags: selectedTags,
      notes: notes.trim(),
      photoUrl: photosList[0] || undefined,
      photos: photosList.length > 0 ? photosList : undefined,
      associatedMedia: attachedMedia.length > 0 ? attachedMedia : undefined,
      audioMemoUrl: audioMemoUrl.trim() || undefined,
      ratings: {
        [activePartnerId]: {
          partnerId: activePartnerId,
          scores,
          comment: comment.trim() || undefined,
          submittedAt: new Date().toISOString(),
        },
      },
    };

    onSubmitSpot(newSpotData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col my-auto max-h-[92vh] text-slate-100">
        {/* Header Harmonisé */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-2xl text-white flex items-center justify-center shadow-xs ${
                isSoloSpot ? 'bg-emerald-600' : 'bg-gradient-to-tr from-rose-500 to-pink-500'
              }`}
            >
              {isSoloSpot ? <Flower2 className="w-4 h-4 text-emerald-100" /> : <Heart className="w-4 h-4 fill-current text-white" />}
            </div>
            <div>
              <h2 className="font-extrabold text-white text-sm tracking-tight">
                {isEditing
                  ? (isSoloSpot ? "Modifier le lieu (Jardin Secret)" : "Modifier le spot d'intimité")
                  : (isSoloSpot ? "Nouveau lieu (Jardin Secret)" : "Nouveau spot d'intimité")}
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {isEditing
                  ? (isSoloSpot ? "Mettez à jour vos repères et photos" : "Modifiez les infos ou notes de ce lieu partagé")
                  : (isSoloSpot ? "Votre repère privé personnel" : "Partagé avec votre moitié")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 bg-slate-900">
          {/* Main Title Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Titre du spot</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Crique secrète, Balcon sunset..."
              className="w-full px-4 py-3 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-white text-sm font-semibold placeholder:text-slate-500 focus:outline-none focus:bg-slate-800 focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>

          {/* Category & Responsive Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Catégorie</label>
              <div className="relative">
                <select
                  value={categoryId}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    setCategoryId(e.target.value);
                  }}
                  className="w-full h-11 min-w-0 box-border appearance-none pl-3.5 pr-9 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-xs font-semibold focus:outline-none focus:bg-slate-800 focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-slate-800 text-white">
                      {cat.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date du souvenir</label>
              <div className="relative flex items-center">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 min-w-0 box-border px-3.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-xs font-semibold focus:outline-none focus:bg-slate-800 focus:ring-2 focus:ring-rose-500 [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* Unified Monochromatic Media Card */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-white shadow-lg space-y-2.5">
            <div className="text-center">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                Médias & Souvenirs
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Photo, musique et mémo vocal 15s
              </p>
            </div>

            {/* 3 Centered Monochrome Circles & Photo Thumbnails */}
            <div className="flex flex-col items-center gap-3 py-0.5">
              <div className="flex items-center justify-center gap-4 sm:gap-6">
                {/* Circle 1: Photo Uploader */}
                <div className="flex flex-col items-center gap-1.5 group">
                  <div className="relative">
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                      <div className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border-2 border-slate-700 hover:border-slate-500 flex items-center justify-center text-lg shadow-sm transition-all group-hover:scale-105">
                        <span>📷</span>
                      </div>
                    </label>
                  </div>
                  <span className="text-[10px] font-bold text-slate-300">
                    {photosList.length > 0 ? `Photos (${photosList.length}/${maxPhotos})` : 'Photo'}
                  </span>
                </div>

              {/* Circle 2: Musique (Premium Feature) */}
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!premiumState.isPremium) {
                        triggerHaptic('light');
                        onOpenPremiumModal?.(
                          "Passez au Pass Duo Premium pour associer une musique souvenir Spotify / Apple Music à vos lieux intimes ! 🎵👑"
                        );
                        return;
                      }
                      setShowMusicSearch((prev) => !prev);
                    }}
                    className={`cursor-pointer block focus:outline-none transition-all ${
                      !premiumState.isPremium ? 'opacity-80 hover:opacity-100' : ''
                    }`}
                    title={!premiumState.isPremium ? "Fonctionnalité Duo Premium : Musique souvenir" : "Ajouter une musique souvenir"}
                  >
                    {attachedMedia.length > 0 ? (
                      <div className="w-12 h-12 rounded-full border-2 border-slate-300 p-0.5 overflow-hidden shadow-md relative bg-slate-800 transition-transform group-hover:scale-105">
                        {attachedMedia[0].coverUrl ? (
                          <img src={attachedMedia[0].coverUrl} alt={attachedMedia[0].title} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <div className="w-full h-full rounded-full bg-slate-800 text-slate-200 flex items-center justify-center text-base">
                            <span>🎵</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-sm transition-all group-hover:scale-105 ${
                          !premiumState.isPremium
                            ? 'bg-slate-800/90 text-slate-400 border-2 border-dashed border-amber-500/60 hover:border-amber-400 hover:text-amber-300'
                            : `bg-slate-800 hover:bg-slate-700 text-slate-200 border-2 ${
                                showMusicSearch ? 'border-slate-400 bg-slate-700' : 'border-slate-700 hover:border-slate-500'
                              }`
                        }`}
                      >
                        <span>🎵</span>
                      </div>
                    )}
                  </button>

                  {/* Crown badge for non-premium users */}
                  {!premiumState.isPremium && (
                    <div
                      onClick={() =>
                        onOpenPremiumModal?.(
                          "Passez au Pass Duo Premium pour associer une musique souvenir Spotify / Apple Music à vos lieux intimes ! 🎵👑"
                        )
                      }
                      className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-gradient-to-tr from-amber-500 to-amber-400 text-white rounded-full flex items-center justify-center shadow-md border border-slate-900 cursor-pointer animate-pulse"
                      title="Fonctionnalité Premium"
                    >
                      <Crown className="w-2.5 h-2.5 fill-white text-white" />
                    </div>
                  )}

                  {attachedMedia.length > 0 && premiumState.isPremium && (
                    <button
                      type="button"
                      onClick={() => removeMediaItem(attachedMedia[0].id)}
                      className="absolute -top-1 -right-1 p-0.5 bg-slate-950 text-slate-300 hover:text-white hover:bg-rose-600 rounded-full border border-slate-700 transition-colors cursor-pointer"
                      title="Retirer la musique"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-300 max-w-[70px] truncate text-center">
                    {attachedMedia.length > 0 ? attachedMedia[0].title : 'Musique'}
                  </span>
                  {!premiumState.isPremium && (
                    <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />
                  )}
                </div>
              </div>

              {/* Circle 3: Mémo Vocal (15s) */}
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="relative">
                  {isRecordingMemo ? (
                    <button
                      type="button"
                      onClick={stopVoiceMemo}
                      className="w-12 h-12 rounded-full bg-rose-950 border-2 border-rose-500 text-rose-400 flex flex-col items-center justify-center shadow-md animate-pulse transition-all cursor-pointer"
                      title="Arrêter l'enregistrement"
                    >
                      <Square className="w-3.5 h-3.5 fill-current text-rose-500" />
                      <span className="text-[9px] font-extrabold font-mono">{recordingSeconds}s</span>
                    </button>
                  ) : audioMemoUrl ? (
                    <button
                      type="button"
                      onClick={togglePlayMemo}
                      className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-emerald-400 border-2 border-emerald-500 flex items-center justify-center shadow-md transition-transform group-hover:scale-105 cursor-pointer"
                      title={isPlayingMemo ? "Mettre en pause" : "Écouter le mémo vocal"}
                    >
                      {isPlayingMemo ? <Pause className="w-4 h-4 fill-current text-emerald-400" /> : <Play className="w-4 h-4 fill-current text-emerald-400 ml-0.5" />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startVoiceMemo}
                      className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border-2 border-slate-700 hover:border-slate-500 flex items-center justify-center text-lg shadow-sm transition-all group-hover:scale-105 cursor-pointer"
                      title="Enregistrer un mémo vocal de 15s"
                    >
                      <span>🎙️</span>
                    </button>
                  )}

                  {audioMemoUrl && !isRecordingMemo && (
                    <button
                      type="button"
                      onClick={removeVoiceMemo}
                      className="absolute -top-1 -right-1 p-0.5 bg-slate-950 text-slate-300 hover:text-white hover:bg-rose-600 rounded-full border border-slate-700 transition-colors cursor-pointer"
                      title="Effacer le mémo vocal"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-300">
                  {isRecordingMemo ? `${recordingSeconds}s...` : audioMemoUrl ? 'Vocal ✓' : 'Vocal 15s'}
                </span>
              </div>
            </div>
          </div>

            {/* Photos List Thumbnails & Duo Premium Badge */}
            {photosList.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span>Photos ajoutées ({photosList.length}/{maxPhotos})</span>
                  {premiumState.isPremium ? (
                    <span className="text-amber-400 font-extrabold flex items-center gap-1">
                      <Crown className="w-3 h-3 fill-amber-400" /> Pass Duo Premium Active
                    </span>
                  ) : (
                    <span className="text-slate-400">Gratuit (1/1 photo)</span>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {photosList.map((url, idx) => (
                    <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-700 bg-slate-800 shrink-0 group">
                      <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 p-0.5 bg-slate-950/80 text-rose-400 hover:text-white hover:bg-rose-600 rounded-full transition-colors cursor-pointer"
                        title="Supprimer cette photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 px-1 bg-black/60 text-[9px] font-mono text-white rounded">
                        #{idx + 1}
                      </span>
                    </div>
                  ))}

                  {photosList.length < maxPhotos && (
                    <label className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-700 hover:border-slate-500 bg-slate-800/60 hover:bg-slate-800 flex flex-col items-center justify-center text-slate-300 cursor-pointer shrink-0 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                      <Plus className="w-4 h-4 text-slate-300" />
                      <span className="text-[8px] font-bold mt-0.5">Ajouter</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {!premiumState.isPremium && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-medium">
                  Besoin de plus de photos ? (Jusqu'à 5 photos par lieu)
                </span>
                <button
                  type="button"
                  onClick={() => onOpenPremiumModal?.("Débloquez jusqu'à 5 photos par lieu avec le Pass Duo Premium 👑")}
                  className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-[10px] font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <Crown className="w-3 h-3 fill-white" />
                  <span>Pass Duo Premium 👑</span>
                </button>
              </div>
            )}

            {/* Inline Music Search UI */}
            {(showMusicSearch || attachedMedia.length > 0) && (
              <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                {attachedMedia.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {attachedMedia[0].coverUrl && (
                        <img src={attachedMedia[0].coverUrl} alt={attachedMedia[0].title} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-100 truncate">{attachedMedia[0].title}</div>
                        <p className="text-[10px] text-slate-400 truncate">{attachedMedia[0].artistOrDirector}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {attachedMedia[0].previewUrl && (
                        <button
                          type="button"
                          onClick={() => togglePreview(attachedMedia[0])}
                          className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                            playingPreviewId === attachedMedia[0].id ? 'bg-slate-100 text-slate-900 animate-pulse' : 'bg-slate-700 text-slate-300 hover:text-white'
                          }`}
                        >
                          {playingPreviewId === attachedMedia[0].id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMediaItem(attachedMedia[0].id)}
                        className="p-1 rounded-full text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={mediaQuery}
                    onChange={(e) => setMediaQuery(e.target.value)}
                    placeholder="Rechercher un titre, artiste (Spotify)..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-2 text-[10px] text-slate-400 animate-pulse">
                      ...
                    </div>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-800 border border-slate-700 rounded-xl p-1.5 shadow-lg">
                    {searchResults.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 hover:bg-slate-700/80 rounded-lg text-xs transition-colors cursor-pointer"
                        onClick={() => {
                          addMediaItem(item);
                          setShowMusicSearch(false);
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.coverUrl ? (
                            <img src={item.coverUrl} alt={item.title} className="w-7 h-7 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-slate-700 text-slate-300 flex items-center justify-center shrink-0">
                              <Music className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 truncate text-[11px]">{item.title}</div>
                            <div className="text-[9px] text-slate-400 truncate">{item.artistOrDirector}</div>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-300 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Atmosphere Tags */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ambiance & Souvenir</label>
            <div className="flex flex-wrap gap-1.5">
              {ATMOSPHERE_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-xs shadow-rose-500/20'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rating Sliders */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
              Notes & Commentaires
            </h3>

            <div className="space-y-2.5">
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

            <div className="pt-2 border-t border-slate-800 space-y-1">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                Souvenir / Ressenti personnel
              </label>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Racontez votre ressenti..."
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all hover:scale-102 active:scale-98 cursor-pointer ${
                isSoloSpot
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/20'
                  : 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-600 shadow-rose-500/25'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-white" />
              <span>
                {isEditing
                  ? "Enregistrer les modifications"
                  : isSoloSpot
                  ? "Enregistrer mon spot"
                  : "Soumettre au partenaire"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

