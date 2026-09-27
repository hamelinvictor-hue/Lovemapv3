import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { watchDocument, watchCollection } from '../data/firestoreAdapter';
import type { CouplePair, Spot, NotificationItem } from '../types';

export interface UseCoupleRealtimeOptions {
  coupleCode?: string | null;
  onCoupleUpdate: (couple: CouplePair | null) => void;
  onSpotsUpdate: (spots: Spot[]) => void;
  onNotificationsUpdate: (notifications: NotificationItem[]) => void;
}

/**
 * Hook unique gérant les 3 écoutes Firestore temps réel du couple sur iOS natif :
 * - Document profil couple (`couples/{code}`)
 * - Sous-collection spots (`couples/{code}/spots`)
 * - Sous-collection notifications (`couples/{code}/notifications`)
 *
 * Protégé contre les conditions de course de retour en avant-plan par compteur de génération.
 */
export function useCoupleRealtime({
  coupleCode,
  onCoupleUpdate,
  onSpotsUpdate,
  onNotificationsUpdate,
}: UseCoupleRealtimeOptions): void {
  // Handlers continuellement à jour pour éviter tout état React périmé
  const handlersRef = useRef({
    onCoupleUpdate,
    onSpotsUpdate,
    onNotificationsUpdate,
  });

  handlersRef.current = {
    onCoupleUpdate,
    onSpotsUpdate,
    onNotificationsUpdate,
  };

  useEffect(() => {
    // S'active uniquement sur plateforme native Capacitor avec un code de couple valide
    if (!coupleCode || !coupleCode.trim()) return;
    if (!Capacitor.isNativePlatform()) return;

    const cleanCode = coupleCode.trim().toUpperCase();
    let currentGeneration = 0;
    let isMounted = true;
    let activeUnsubscribes: Array<() => void> = [];

    const stopActive = () => {
      activeUnsubscribes.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {
          console.warn('[RT] Notice on unregistering listener:', e);
        }
      });
      activeUnsubscribes = [];
    };

    const start = () => {
      if (!isMounted) return;
      currentGeneration++;
      const gen = currentGeneration;

      // 1. Désinscrire d'abord les écoutes de la génération précédente
      stopActive();

      const unsubs: Array<() => void> = [];

      // 2. Écoute du document couple
      try {
        const unsubCouple = watchDocument<CouplePair>(
          `couples/${cleanCode}`,
          (snapshot) => {
            if (!isMounted || gen !== currentGeneration) return;
            if (snapshot.exists && snapshot.val) {
              handlersRef.current.onCoupleUpdate(snapshot.data());
            } else {
              handlersRef.current.onCoupleUpdate(null);
            }
          },
          (err) => {
            console.warn(`[RT] Notice listening to couple (gen ${gen}):`, err?.message);
          }
        );
        unsubs.push(unsubCouple);
      } catch (e) {
        console.warn('[RT] Error creating couple listener:', e);
      }

      // 3. Écoute de la sous-collection spots
      try {
        const unsubSpots = watchCollection<Spot>(
          `couples/${cleanCode}/spots`,
          (snapshots) => {
            if (!isMounted || gen !== currentGeneration) return;
            const spots = snapshots
              .filter((s) => s.exists && s.val)
              .map((s) => s.data() as Spot);
            console.log(`[RT] spots reçus: ${spots.length}`);
            handlersRef.current.onSpotsUpdate(spots);
          },
          (err) => {
            console.warn(`[RT] Notice listening to spots (gen ${gen}):`, err?.message);
          }
        );
        unsubs.push(unsubSpots);
      } catch (e) {
        console.warn('[RT] Error creating spots listener:', e);
      }

      // 4. Écoute de la sous-collection notifications
      try {
        const unsubNotifs = watchCollection<NotificationItem>(
          `couples/${cleanCode}/notifications`,
          (snapshots) => {
            if (!isMounted || gen !== currentGeneration) return;
            const notifs = snapshots
              .filter((s) => s.exists && s.val)
              .map((s) => s.data() as NotificationItem);
            notifs.sort(
              (a, b) =>
                new Date((b as any).createdAt || 0).getTime() -
                new Date((a as any).createdAt || 0).getTime()
            );
            handlersRef.current.onNotificationsUpdate(notifs);
          },
          (err) => {
            console.warn(`[RT] Notice listening to notifications (gen ${gen}):`, err?.message);
          }
        );
        unsubs.push(unsubNotifs);
      } catch (e) {
        console.warn('[RT] Error creating notifications listener:', e);
      }

      // 5. Si la génération a changé pendant l'inscription, désinscrire immédiatement
      if (!isMounted || gen !== currentGeneration) {
        unsubs.forEach((u) => {
          try {
            u();
          } catch {}
        });
        return;
      }

      activeUnsubscribes = unsubs;
      console.log(`[RT] écoutes actives, génération ${gen}`);
    };

    // Démarrage initial
    start();

    // Gestion cycle de vie Capacitor :
    // On ne coupe rien lors du passage en arrière-plan.
    // Lors du retour au premier plan (isActive === true), start() est appelé une seule fois.
    let appListenerHandle: any = null;
    if (typeof Capacitor !== 'undefined' && Capacitor.isPluginAvailable('App')) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('[RT] Retour au premier plan -> relance contrôlée génération');
          start();
        }
      })
        .then((handle) => {
          if (!isMounted) {
            handle.remove();
          } else {
            appListenerHandle = handle;
          }
        })
        .catch((err) => {
          console.warn('[RT] Notice adding appStateChange listener:', err);
        });
    }

    return () => {
      isMounted = false;
      currentGeneration++;
      if (appListenerHandle) {
        try {
          appListenerHandle.remove();
        } catch {}
        appListenerHandle = null;
      }
      stopActive();
    };
  }, [coupleCode]);
}
