const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const spotRepl = `export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const spotsRef = collection(db, 'couples', cleanCode, 'spots');

  // 1. Real-time onSnapshot listener
  const unsubSnapshot = onSnapshot(
    spotsRef,
    (snapshot) => {
      const spots = snapshot.docs.map((d) => d.data() as Spot);
      callback(spots);
    },
    (err) => {
      console.warn('[Firebase] Snapshot notice listening to spots:', err);
    }
  );

  let lastKnownSpotUpdate = -2;

  // 2. Direct fetch helper
  const fetchSpotsDirect = async () => {
    try {
      const coupleDoc = await restGetDoc(\`couples/\${cleanCode}\`);
      if (coupleDoc && coupleDoc.lastSpotUpdate) {
        lastKnownSpotUpdate = Number(coupleDoc.lastSpotUpdate);
      } else {
        lastKnownSpotUpdate = -1;
      }
      const restSpots = await restListDocs(\`couples/\${cleanCode}/spots\`);
      if (restSpots !== null) {
        callback(restSpots as Spot[]);
        return;
      }
      const snap = await withTimeout(getDocs(spotsRef), 3000, null);
      if (snap) {
        const list = snap.docs.map((d) => d.data() as Spot);
        callback(list);
      }
    } catch (e) {}
  };

  fetchSpotsDirect();

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchSpotsDirect();
    }
  };
  const onFocus = () => { fetchSpotsDirect(); };
  const onNativeResume = () => { fetchSpotsDirect(); };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('native-app-resume', onNativeResume);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // 3. Ultra-low cost Liveness Poller
  const livenessPoller = setInterval(async () => {
    try {
      const coupleDoc = await restGetDoc(\`couples/\${cleanCode}\`);
      if (coupleDoc && coupleDoc.lastSpotUpdate) {
        const remoteUpdate = Number(coupleDoc.lastSpotUpdate);
        if (lastKnownSpotUpdate === -2) {
          lastKnownSpotUpdate = remoteUpdate;
        } else if (remoteUpdate > lastKnownSpotUpdate) {
          console.log('[Firebase] Liveness poller detected spot change, fetching...');
          lastKnownSpotUpdate = remoteUpdate;
          fetchSpotsDirect();
        }
      }
    } catch (e) {}
  }, 10000);

  return () => {
    unsubSnapshot();
    clearInterval(livenessPoller);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('native-app-resume', onNativeResume);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}`;

const notifRepl = `export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const notifsRef = collection(db, 'couples', cleanCode, 'notifications');

  // 1. Real-time onSnapshot listener
  const unsubSnapshot = onSnapshot(
    notifsRef,
    (snapshot) => {
      const notifs = snapshot.docs.map((d) => d.data() as NotificationItem);
      notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
      callback(notifs);
    },
    (err) => {
      console.warn('[Firebase] Snapshot notice listening to notifications:', err);
    }
  );

  let lastKnownNotifUpdate = -2;

  // 2. Direct fetch helper
  const fetchNotifsDirect = async () => {
    try {
      const coupleDoc = await restGetDoc(\`couples/\${cleanCode}\`);
      if (coupleDoc && coupleDoc.lastNotificationUpdate) {
        lastKnownNotifUpdate = Number(coupleDoc.lastNotificationUpdate);
      } else {
        lastKnownNotifUpdate = -1;
      }
      const restNotifs = await restListDocs(\`couples/\${cleanCode}/notifications\`);
      if (restNotifs !== null) {
        const notifs = restNotifs as NotificationItem[];
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
        return;
      }
      const snap = await withTimeout(getDocs(notifsRef), 3000, null);
      if (snap) {
        const notifs = snap.docs.map((d) => d.data() as NotificationItem);
        notifs.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        callback(notifs);
      }
    } catch (e) {}
  };

  fetchNotifsDirect();

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchNotifsDirect();
    }
  };
  const onFocus = () => { fetchNotifsDirect(); };
  const onNativeResume = () => { fetchNotifsDirect(); };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('native-app-resume', onNativeResume);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // 3. Ultra-low cost Liveness Poller
  const livenessPoller = setInterval(async () => {
    try {
      const coupleDoc = await restGetDoc(\`couples/\${cleanCode}\`);
      if (coupleDoc && coupleDoc.lastNotificationUpdate) {
        const remoteUpdate = Number(coupleDoc.lastNotificationUpdate);
        if (lastKnownNotifUpdate === -2) {
          lastKnownNotifUpdate = remoteUpdate;
        } else if (remoteUpdate > lastKnownNotifUpdate) {
          console.log('[Firebase] Liveness poller detected notif change, fetching...');
          lastKnownNotifUpdate = remoteUpdate;
          fetchNotifsDirect();
        }
      }
    } catch (e) {}
  }, 12000);

  return () => {
    unsubSnapshot();
    clearInterval(livenessPoller);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('native-app-resume', onNativeResume);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}`;

const coupleRepl = `export function subscribeToCouple(code: string, callback: (couple: CouplePair | null) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const coupleRef = doc(db, 'couples', cleanCode);

  let isPartnerJoined = false;
  let pollInterval: any = null;

  const handleUpdate = (data: CouplePair | null) => {
    if (!data) {
      callback(null);
      return;
    }
    const joined = Boolean(
      data.isCodeUsed ||
      (data.partnerB && data.partnerB.name && data.partnerB.name !== 'En attente...')
    );
    if (joined && !isPartnerJoined) {
      isPartnerJoined = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
    callback(data);
  };

  // 1. Standard Firestore onSnapshot listener
  const unsubSnapshot = onSnapshot(
    coupleRef,
    (docSnap) => {
      if (docSnap.exists()) {
        handleUpdate(docSnap.data() as CouplePair);
      } else {
        handleUpdate(null);
      }
    },
    (err) => {
      console.warn('[Firebase] Error listening to couple:', err);
    }
  );

  // 2. Direct fetch helper on mobile resume / window focus
  const fetchCoupleDirect = async () => {
    try {
      const restDoc = await restGetDoc(\`couples/\${cleanCode}\`);
      if (restDoc !== null) {
        handleUpdate(restDoc as CouplePair);
        return;
      }
      const snap = await withTimeout(getDoc(coupleRef), 3000, null);
      if (snap && snap.exists()) {
        handleUpdate(snap.data() as CouplePair);
      } else if (snap && !snap.exists()) {
        handleUpdate(null);
      }
    } catch (e) {}
  };

  fetchCoupleDirect();

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchCoupleDirect();
    }
  };
  const onFocus = () => { fetchCoupleDirect(); };
  const onNativeResume = () => { fetchCoupleDirect(); };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('native-app-resume', onNativeResume);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // 3. Fallback polling for initial partner join (every 3s)
  pollInterval = setInterval(() => {
    if (!isPartnerJoined) {
      fetchCoupleDirect();
    }
  }, 3000);

  return () => {
    unsubSnapshot();
    if (pollInterval) clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('native-app-resume', onNativeResume);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}`;

// Replace
code = code.replace(/export function subscribeToSpots[\s\S]*?(?=export function subscribeToNotifications)/, spotRepl + '\n\n');
code = code.replace(/export function subscribeToNotifications[\s\S]*?(?=export async function deleteUserAccountInFirestore)/, notifRepl + '\n\n');
code = code.replace(/export function subscribeToCouple[\s\S]*?(?=export async function saveSpotToFirestore)/, coupleRepl + '\n\n');

fs.writeFileSync('src/lib/firebase.ts', code);
console.log('Restored subscriptions.');
