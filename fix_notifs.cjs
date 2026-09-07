const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const missingNotifs = `
export async function saveNotificationToFirestore(code: string, notif: NotificationItem) {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  const cleanedNotif = cleanFirestoreData(notif);
  try {
    const docRef = doc(db, 'couples', cleanCode, 'notifications', notif.id);
    await setDoc(docRef, cleanedNotif, { merge: true });
    return true;
  } catch (err) {
    return false;
  }
}

export async function deleteNotificationFromFirestore(code: string, notifId: string) {
  if (!code || !notifId) return false;
  const cleanCode = code.trim().toUpperCase();
  try {
    await deleteDoc(doc(db, 'couples', cleanCode, 'notifications', notifId));
    return true;
  } catch (err) {
    return false;
  }
}
`;

code = code.replace('export async function deleteUserAccountInFirestore', missingNotifs + '\nexport async function deleteUserAccountInFirestore');
fs.writeFileSync('src/lib/firebase.ts', code);
