const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Inject import
if (!code.includes("import { App as CapacitorApp } from '@capacitor/app';")) {
  code = code.replace(
    "import React, { useState, useEffect, useRef } from 'react';",
    "import React, { useState, useEffect, useRef } from 'react';\nimport { App as CapacitorApp } from '@capacitor/app';"
  );
}

// 2. Inject refs
const refStr = `
  // Capacitor Lifecycle Firestore Listener Refs
  const unsubCoupleRef = useRef<(() => void) | null>(null);
  const unsubSpotsRef = useRef<(() => void) | null>(null);
  const unsubNotifsRef = useRef<(() => void) | null>(null);
`;

if (!code.includes('unsubCoupleRef')) {
  code = code.replace(
    "const firstSpotPaywallTimerRef = useRef<NodeJS.Timeout | null>(null);",
    "const firstSpotPaywallTimerRef = useRef<NodeJS.Timeout | null>(null);" + refStr
  );
}

// 3. Replace the useEffect block for real-time listeners.
// The effect block spans from `// Real-time Firestore Sync listeners for active Couple Code`
// to the end of its block `  }, [couple.code]);` where the next block is `// Handle background notification clicks`.

const oldEffectRegex = /\/\/ Real-time Firestore Sync listeners for active Couple Code[\s\S]*?\}, \[couple\.code\]\);/m;

const newEffectStr = `// Real-time Firestore Sync listeners for active Couple Code (with Capacitor AppState)
  useEffect(() => {
    if (!couple.code) return;

    const startListeners = () => {
      // Security against memory leaks/double-listeners
      stopListeners();

      // Listen to couple profile updates
      unsubCoupleRef.current = subscribeToCouple(couple.code, (remoteCouple) => {
        if (remoteCouple) {
          if (remoteCouple.status === 'broken' && remoteCouple.brokenBy) {
            setBrokenDuoNotice(remoteCouple.brokenBy);
            setSpots([]);
            setNotifications([]);
            saveSpots([]);
            saveNotifications([]);

            const freshCode = generateCoupleCode();
            const freshCouple: CouplePair = {
              code: freshCode,
              anniversaryDate: new Date().toISOString().split('T')[0],
              secretPin: '1234',
              isPinLocked: false,
              partnerA: {
                id: 'partner_a',
                name: couple?.partnerB?.name || 'Moi',
                avatar: couple?.partnerB?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                role: 'Partenaire 1',
              },
              partnerB: {
                id: 'partner_b',
                name: 'En attente...',
                avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
                role: 'Partenaire 2',
              },
            };
            setCouple(freshCouple);
            saveCouple(freshCouple);
            return;
          }

          setCouple((prev) => {
            const wasWaiting = !prev.isCodeUsed || !prev.partnerB || prev.partnerB.name === 'En attente...';
            const nowJoined = Boolean(
              remoteCouple.isCodeUsed ||
              (remoteCouple.partnerB && remoteCouple.partnerB.name && remoteCouple.partnerB.name !== 'En attente...')
            );
            if (wasWaiting && nowJoined) {
              triggerHaptic('success');
              const partnerName = remoteCouple.partnerB?.name || 'Votre partenaire';
              showToast(\`💖 \${partnerName} a rejoint l'espace Duo !\`);
              setShowDuoCodeModal(null);
            } else if (nowJoined) {
              setShowDuoCodeModal(null);
            }
            const merged = { ...prev, ...remoteCouple };
            saveCouple(merged);
            return merged;
          });
        }
      });

      // Listen to spots real-time updates
      unsubSpotsRef.current = subscribeToSpots(couple.code, (remoteSpots) => {
        if (remoteSpots) {
          setSpots(remoteSpots.map(computeSpotScores));
        }
      });

      // Listen to notifications real-time updates
      unsubNotifsRef.current = subscribeToNotifications(couple.code, (remoteNotifs) => {
        if (remoteNotifs) {
          // Detect newly arrived notifications sent by partner (only after initial load)
          if (!isInitialNotifSyncRef.current) {
            const newPartnerNotifs = remoteNotifs.filter(
              (rn) =>
                !rn.isRead &&
                rn.senderId !== activePartnerIdRef.current &&
                !notificationsRef.current.some((prev) => prev.id === rn.id)
            );
            newPartnerNotifs.forEach((notif) => {
              triggerHaptic('success');
              dispatchExternalSystemNotification({
                id: notif.id,
                title: notif.title || '💖 LoveMap Duo',
                message: notif.message || 'Votre moitié a partagé un lieu ou une note !',
                spotId: notif.spotId,
                type: notif.type,
              });
              showToast(\`🔔 \${notif.title} : \${notif.message}\`);
            });
          }
          isInitialNotifSyncRef.current = false;
          setNotifications(remoteNotifs);
        }
      });
    };

    const stopListeners = () => {
      if (unsubCoupleRef.current) {
        unsubCoupleRef.current();
        unsubCoupleRef.current = null;
      }
      if (unsubSpotsRef.current) {
        unsubSpotsRef.current();
        unsubSpotsRef.current = null;
      }
      if (unsubNotifsRef.current) {
        unsubNotifsRef.current();
        unsubNotifsRef.current = null;
      }
    };

    // 1. Démarrer les listeners au montage (premier plan)
    startListeners();

    // 2. Gestion du cycle de vie Capacitor (détecter passage en arrière-plan)
    const appStateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[App.tsx] Application en premier plan -> Relance de onSnapshot');
        startListeners();
        // Also fire the resume fetch for completeness
        restGetDoc(\`couples/\${couple.code}\`).then((remote) => {
          if (remote) {
            setCouple((prev) => {
              const wasWaiting = !prev.isCodeUsed || !prev.partnerB || prev.partnerB.name === 'En attente...';
              const nowJoined = Boolean(
                remote.isCodeUsed ||
                (remote.partnerB && remote.partnerB.name && remote.partnerB.name !== 'En attente...')
              );
              if (wasWaiting && nowJoined) {
                triggerHaptic('success');
                const partnerName = remote.partnerB?.name || 'Votre partenaire';
                showToast(\`💖 \${partnerName} a rejoint l'espace Duo !\`);
                setShowDuoCodeModal(null);
              } else if (nowJoined) {
                setShowDuoCodeModal(null);
              }
              const merged = { ...prev, ...remote };
              saveCouple(merged);
              return merged;
            });
          }
        }).catch(() => {});
      } else {
        console.log('[App.tsx] Application en arrière-plan -> Coupure de onSnapshot');
        stopListeners();
      }
    });

    return () => {
      stopListeners();
      appStateListener.then(listener => listener.remove()).catch(() => {});
    };
  }, [couple.code]);`;

if (oldEffectRegex.test(code)) {
  code = code.replace(oldEffectRegex, newEffectStr);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Successfully replaced effect block.');
} else {
  console.log('Could not find old effect block.');
}
