import React from 'react';
import { NotificationItem, Spot, PartnerId, CouplePair } from '../types';
import { Bell, Check, Clock, Crown, Heart, MapPin, Sparkles, UserCheck } from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface NotificationsViewProps {
  notifications: NotificationItem[];
  spots: Spot[];
  activePartnerId: PartnerId;
  couple: CouplePair;
  onSelectSpot: (spot: Spot) => void;
  onOpenValidation: (spot: Spot) => void;
  onOpenPremium?: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  spots,
  activePartnerId,
  couple,
  onSelectSpot,
  onOpenValidation,
  onOpenPremium,
  onMarkAllRead,
  onMarkRead,
}) => {
  const activeUser = activePartnerId === 'partner_a' ? couple.partnerA : couple.partnerB;
  const partnerUser = activePartnerId === 'partner_a' ? couple.partnerB : couple.partnerA;

  // Sort so newest/most recent notification is at the TOP
  const sortedNotifications = [...notifications].sort((a, b) => {
    const numA = parseInt(a.id.replace('notif-', '')) || 0;
    const numB = parseInt(b.id.replace('notif-', '')) || 0;
    return numB - numA;
  });

  const handleNotifClick = (notif: NotificationItem) => {
    triggerHaptic('light');
    onMarkRead(notif.id);

    if (notif.type === 'premium_offer_urgency') {
      if (onOpenPremium) {
        onOpenPremium();
      }
      return;
    }

    const spot = spots.find((s) => s.id === notif.spotId);
    if (!spot) return;

    if (spot.status === 'pending_validation' && spot.creatorId !== activePartnerId) {
      onOpenValidation(spot);
    } else {
      onSelectSpot(spot);
    }
  };

  return (
    <div className="w-full flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 pb-48 sm:pb-56 text-slate-900 dark:text-slate-100 max-w-2xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-rose-500" />
            <span>Activité Duo & Notifications</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Historique partagé entre {activeUser.name} et {partnerUser.name}
          </p>
        </div>

        {notifications.some((n) => !n.isRead) && (
          <button
            onClick={() => {
              triggerHaptic('medium');
              onMarkAllRead();
            }}
            className="flex items-center gap-1 text-xs text-slate-900 dark:text-white font-bold hover:bg-slate-200 dark:hover:bg-slate-800 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 text-rose-500" />
            <span>Tout marquer lu</span>
          </button>
        )}
      </div>

      {/* Notifications list */}
      {sortedNotifications.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-xs font-medium">
          Aucune notification répertoriée.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedNotifications.map((notif) => {
            const spot = spots.find((s) => s.id === notif.spotId);
            const isUrgency = notif.type === 'premium_offer_urgency';
            const isPremiumActivated = notif.type === 'premium_activated';

            return (
              <div
                key={notif.id}
                onClick={() => handleNotifClick(notif)}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 sm:gap-3.5 ${
                  isPremiumActivated
                    ? 'bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-amber-400/90 dark:border-amber-500/80 shadow-md ring-1 ring-amber-400/50'
                    : isUrgency
                    ? 'bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-rose-500/5 border-rose-400/80 dark:border-rose-500/60 shadow-lg'
                    : !notif.isRead
                    ? 'bg-white dark:bg-slate-900 border-2 border-white dark:border-white ring-2 ring-rose-400/80 dark:ring-white/80 shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-pulse'
                    : 'bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                <div className="p-2 sm:p-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shrink-0 mt-0.5 shadow-2xs border border-slate-800 dark:border-slate-700">
                  {isPremiumActivated ? (
                    <Crown className="w-4 h-4 text-amber-400 animate-bounce" />
                  ) : isUrgency ? (
                    <Clock className="w-4 h-4 text-rose-400 animate-pulse" />
                  ) : notif.type === 'new_spot_proposed' ? (
                    <MapPin className="w-4 h-4 text-rose-400" />
                  ) : notif.type === 'spot_validated' ? (
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Heart className="w-4 h-4 text-rose-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate tracking-tight">{notif.title}</h4>
                    <span className="text-[10px] text-slate-400 dark:text-slate-300 font-bold shrink-0">{notif.timestamp}</span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-100 mt-1 leading-relaxed font-medium break-words">{notif.message}</p>

                  {isUrgency && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-white font-extrabold bg-gradient-to-r from-rose-600 to-amber-600 px-3 py-1 rounded-xl shadow-md">
                      <Sparkles className="w-3.5 h-3.5" /> Activer mes 7 jours gratuits (0 €)
                    </div>
                  )}

                  {spot && spot.status === 'pending_validation' && spot.creatorId !== activePartnerId && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-300 font-extrabold bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900/60 px-3 py-1 rounded-xl shadow-2xs">
                      <Sparkles className="w-3.5 h-3.5" /> Évaluer et valider le spot
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dedicated bottom spacing so floating navbar never covers content */}
      <div className="h-20 sm:h-24 shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
};
