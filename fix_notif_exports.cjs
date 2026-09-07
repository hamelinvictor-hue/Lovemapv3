const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const missingNotifs = `
export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanedNotif = cleanFirestoreData(notif);
  
  restSetDoc(\`couples/\${cleanCode}/notifications/\${notif.id}\`, cleanedNotif, false).catch(() => {});
  restSetDoc(\`couples/\${cleanCode}\`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {});
  
  try {
    const docRef = doc(db, 'couples', cleanCode, 'notifications', notif.id);
    setDoc(docRef, cleanedNotif, { merge: true }).catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}

export async function deleteNotificationFromFirestore(code: string, notifId: string) {
  if (!code || !notifId) return false;
  const cleanCode = code.trim().toUpperCase();
  
  restDeleteDoc(\`couples/\${cleanCode}/notifications/\${notifId}\`).catch(() => {});
  restSetDoc(\`couples/\${cleanCode}\`, { updatedAt: new Date().toISOString(), lastNotificationUpdate: Date.now() }).catch(() => {});
  
  try {
    deleteDoc(doc(db, 'couples', cleanCode, 'notifications', notifId)).catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}
`;

if (!code.includes('export async function saveNotificationToFirestore')) {
  code = code.replace('export async function deleteUserAccountInFirestore', missingNotifs + '\nexport async function deleteUserAccountInFirestore');
  fs.writeFileSync('src/lib/firebase.ts', code);
  console.log('Restored saveNotificationToFirestore');
}
