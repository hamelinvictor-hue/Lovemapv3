const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const spotRepl = `export function subscribeToSpots(code: string, callback: (spots: Spot[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const spotsRef = collection(db, 'couples', cleanCode, 'spots');

  return onSnapshot(
    spotsRef,
    (snapshot) => {
      const spots = snapshot.docs.map((d) => d.data() as Spot);
      callback(spots);
    },
    (err) => {
      console.warn('[Firebase] Snapshot notice listening to spots:', err);
    }
  );
}`;

const notifRepl = `export function subscribeToNotifications(code: string, callback: (notifs: NotificationItem[]) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const notifsRef = collection(db, 'couples', cleanCode, 'notifications');

  return onSnapshot(
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
}`;

const coupleRepl = `export function subscribeToCouple(code: string, callback: (couple: CouplePair | null) => void) {
  if (!code) return () => {};
  const cleanCode = code.trim().toUpperCase();
  const coupleRef = doc(db, 'couples', cleanCode);

  let isPartnerJoined = false;

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
    }
    callback(data);
  };

  return onSnapshot(
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
}`;

// Use regex to replace everything between export function subscribeToSpots and the next export function
code = code.replace(/export function subscribeToSpots[\s\S]*?(?=export function subscribeToNotifications)/, spotRepl + '\n\n');
code = code.replace(/export function subscribeToNotifications[\s\S]*?(?=export async function deleteUserAccountInFirestore)/, notifRepl + '\n\n');
code = code.replace(/export function subscribeToCouple[\s\S]*?(?=export async function saveSpotToFirestore)/, coupleRepl + '\n\n');

fs.writeFileSync('src/lib/firebase.ts', code);
