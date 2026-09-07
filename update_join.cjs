const fs = require('fs');
let content = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const regex = /\/\/ 3\. Pairing update via ATOMIC TRANSACTION \(runTransaction\).*?saveNotificationToFirestore\(targetCode, joinNotif\)\.catch\(\(e\) => \{\s*console\.warn\('Notice broadcasting join notification:', e\);\s*\}\);\s*\} catch \(error: any\) \{\s*console\.error\("\[DUO-SYNC-ERROR\] runTransaction failed:", error\?\.code, error\?\.message\);\s*throw new Error\("Erreur lors de la synchronisation de la liaison \(Transaction\) : " \+ \(error\?\.message \|\| "Erreur inconnue"\)\);\s*\}/s;

const repl = `// 3. Pairing update via ATOMIC TRANSACTION with REST Fallback
  let couple: CouplePair;
  const coupleRef = doc(db, 'couples', targetCode);

  const existingMembers = targetData.memberUids || [];
  const updatedMembers = user.uid ? Array.from(new Set([...existingMembers, user.uid])) : existingMembers;
  
  const partnerB = {
    id: 'partner_b',
    name: partnerName.trim() || user.displayName || 'Partenaire 2',
    avatar: avatarUrl || user.photoURL || targetData.partnerB?.avatar || 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };
  
  const updateData = cleanFirestoreData({
    partnerB,
    partnerBUid: user.uid,
    partnerBEmail: user.email || '',
    memberUids: updatedMembers,
    isCodeUsed: true,
    updatedAt: new Date().toISOString(),
  });

  try {
    console.log('[SYNC-DEBUG] Starting atomic transaction to join room:', targetCode);
    couple = await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(coupleRef);
      if (!sfDoc.exists()) {
        throw new Error("Document introuvable pour la transaction.");
      }
      transaction.update(coupleRef, updateData);
      return {
        ...sfDoc.data(),
        ...updateData,
        code: targetCode,
      } as unknown as CouplePair;
    });
    console.log('[SYNC-DEBUG] Successfully paired to room via runTransaction:', targetCode);
  } catch (error: any) {
    console.warn("[DUO-SYNC-ERROR] runTransaction failed, falling back to REST/merge:", error?.code, error?.message);
    // Fallback to REST write if WebSockets are dead on iOS
    await restSetDoc(\`couples/\${targetCode}\`, updateData, true);
    setDoc(coupleRef, updateData, { merge: true }).catch(() => {});
    
    couple = {
      ...targetData,
      ...updateData,
      code: targetCode,
    } as unknown as CouplePair;
  }

  verifiedRoomsCache.add(targetCode);

  // Broadcast Partner Joined event notification to trigger partner's realtime listener
  const joinNotif: NotificationItem = {
    id: \`notif-join-\${Date.now()}\`,
    type: 'spot_validated',
    spotId: 'duo-connected',
    senderId: 'partner_b',
    targetPartnerId: 'partner_a',
    title: '💖 Duo Connecté !',
    message: \`\${partnerName.trim() || 'Votre partenaire'} a rejoint votre espace Duo avec succès !\`,
    timestamp: new Date().toISOString(),
    isRead: false,
  };
  saveNotificationToFirestore(targetCode, joinNotif).catch(() => {});`;

if (content.match(regex)) {
  fs.writeFileSync('src/lib/firebase.ts', content.replace(regex, repl));
  console.log('Updated join logic with fallback');
} else {
  console.log('Regex not found');
}
