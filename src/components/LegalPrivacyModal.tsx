import React, { useState } from 'react';
import { ShieldCheck, X, FileText, Lock, Trash2, Mail, ExternalLink, CheckCircle2 } from 'lucide-react';

interface LegalPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDeleteAccount?: () => void;
}

export const LegalPrivacyModal: React.FC<LegalPrivacyModalProps> = ({
  isOpen,
  onClose,
  onOpenDeleteAccount,
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'data'>('privacy');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg max-h-[85vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-white">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Mentions Légales & Confidentialité</h2>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Conformité Apple App Store & Google Play Store (RGPD)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-5 pt-3 gap-2 bg-slate-50/30 dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`pb-2.5 px-3 font-bold text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Confidentialité RGPD
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`pb-2.5 px-3 font-bold text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === 'terms'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Conditions d'Utilisation (CGU)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`pb-2.5 px-3 font-bold text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === 'data'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Droits & Suppression
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {activeTab === 'privacy' && (
            <div className="space-y-3.5">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-500" />
                <span>Politique de Protection des Données Personnelles</span>
              </h3>
              <p>
                <strong>1. Collecte des Données :</strong> LoveMap traite uniquement les données strictement nécessaires au fonctionnement du service partagé entre deux partenaires : vos prénoms, avatars, localisations des lieux enregistrés et données de géolocalisation pour le positionnement en direct.
              </p>
              <p>
                <strong>2. Suivi et App Tracking Transparency (ATT) :</strong> Conformément aux règles d'Apple (iOS) et de Google (Android), aucun profilage publicitaire nominatif n'est réalisé. Le consentement demandé lors du premier démarrage sert uniquement à la sécurité de l'application et à l'optimisation des performances.
              </p>
              <p>
                <strong>3. Non-revente des Données :</strong> Vos données ne sont jamais vendues, cédées ou louées à des tiers. La synchronisation est sécurisée par Firebase Firestore avec des règles de sécurité restreignant l'accès exclusivement à votre duo.
              </p>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-3.5">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-rose-500" />
                <span>Conditions Générales d'Utilisation (CGU)</span>
              </h3>
              <p>
                <strong>Éditeur & Application :</strong> LoveMap - Carnet secret & carte interactive pour couples.
              </p>
              <p>
                <strong>Responsabilité :</strong> L'utilisateur est seul responsable du contenu (photos, commentaires, noms de lieux) publié sur la carte de son couple ou dans son espace solo.
              </p>
              <p>
                <strong>Géolocalisation GPS :</strong> La fonctionnalité de géolocalisation en direct requiert l'autorisation explicite de votre appareil. Vous pouvez la désactiver à tout moment dans les réglages de votre système d'exploitation.
              </p>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-3.5">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>Exercice de vos Droits & Droit à l'Oubli (RGPD)</span>
              </h3>
              <p>
                Conformément au RGPD et aux exigences d'Apple (Guideline 5.1.1(v)), vous disposez d'un droit d'accès, de rectification et de suppression totale de vos données.
              </p>
              <div className="bg-rose-50 dark:bg-rose-950/40 p-3.5 rounded-2xl border border-rose-200 dark:border-rose-900/50 space-y-2">
                <div className="font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-rose-600" />
                  <span>Suppression intégrale du compte en 1-clic</span>
                </div>
                <p className="text-[11px] text-rose-800 dark:text-rose-300">
                  Vous pouvez supprimer votre compte et effacer définitivement tous vos lieux, photos et messages directement depuis les paramètres de votre profil.
                </p>
                {onOpenDeleteAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDeleteAccount();
                    }}
                    className="w-full mt-1.5 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Accéder à la suppression de mon compte</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-extrabold text-xs transition-all hover:opacity-90 cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
