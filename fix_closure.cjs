const fs = require('fs');
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const handleUpdateCoupleSubscription = async (')) {
    startIndex = i;
  }
  if (startIndex !== -1 && i > startIndex && lines[i].includes('// Legal, Permission & Store Rating Modals')) {
    endIndex = i - 1;
    break;
  }
}

if (startIndex !== -1 && endIndex !== -1) {
    while (lines[endIndex].trim() === '') {
        endIndex--;
    }
    // Now endIndex should be the `  };` of handleUpdateCoupleSubscription
    console.log("Found boundaries:", startIndex, endIndex);

    const newFunc = `  const handleUpdateCoupleSubscription = async (
    subscriberPartnerId: PartnerId,
    plan: 'monthly' | 'annual',
    active: boolean
  ) => {
    setCouple((prev) => {
      const isSubscriberA = subscriberPartnerId === 'partner_a';
      const expiresAt = new Date();
      if (plan === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      const currentPartnerA = prev?.partnerA || {
        id: 'partner_a',
        name: 'Partenaire 1',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        role: 'Partenaire 1',
      };
      const currentPartnerB = prev?.partnerB || {
        id: 'partner_b',
        name: 'En attente...',
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
        role: 'Partenaire 2',
      };

      const subscriberProfile = isSubscriberA ? currentPartnerA : currentPartnerB;
      const updatedProfile: UserProfile = {
        ...subscriberProfile,
        subscription: active
          ? {
              plan,
              purchasedAt: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
              purchasedByPartnerId: subscriberPartnerId,
              active: true,
            }
          : undefined,
      };

      const updatedCouple: CouplePair = {
        ...prev,
        partnerA: isSubscriberA ? updatedProfile : currentPartnerA,
        partnerB: !isSubscriberA ? updatedProfile : currentPartnerB,
      };

      saveCouple(updatedCouple);

      if (updatedCouple.code) {
        updateCoupleInFirestore(updatedCouple.code, updatedCouple).catch((err) => {
          console.warn('Error updating subscription in Firestore:', err);
        });
      }

      if (active) {
        // Notify the partner that premium subscription has been activated for the duo!
        const partnerIdToNotify: PartnerId = isSubscriberA ? 'partner_b' : 'partner_a';
        const subscriberName = subscriberProfile.name || (isSubscriberA ? 'Votre partenaire 1' : 'Votre partenaire 2');
        const planLabel = plan === 'monthly' ? '1 mois' : '1 an';
        
        const premiumNotif: NotificationItem = {
          id: \`notif-premium-\${Date.now()}\`,
          type: 'premium_activated',
          spotId: '',
          senderId: subscriberPartnerId,
          targetPartnerId: partnerIdToNotify,
          title: '👑 Pass Duo Premium Activé !',
          message: \`\${subscriberName} a souscrit au Pass Duo Premium (\${planLabel}) ! Vous bénéficiez désormais tous les deux de toutes les fonctionnalités illimitées.\`,
          timestamp: 'À l’instant',
          isRead: false,
        };

        const updatedNotifs = [premiumNotif, ...notificationsRef.current];
        setNotifications(updatedNotifs);
        saveNotifications(updatedNotifs);

        if (updatedCouple.code) {
          saveNotificationToFirestore(updatedCouple.code, premiumNotif).catch((e) => {
            console.warn('Error pushing premium activation notification to Firestore:', e);
          });
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: updatedCouple.code,
              senderPartnerId: subscriberPartnerId,
              targetPartnerId: partnerIdToNotify,
              title: premiumNotif.title,
              message: premiumNotif.message,
              spotId: '',
              type: premiumNotif.type,
            });
          });
        }
      }

      return updatedCouple;
    });

    if (active) {
      showToast(plan === 'monthly' ? '👑 Pass Duo Premium (1 mois) activé !' : '👑 Pass Duo Premium (1 an) activé !');
    } else {
      showToast('Pass Duo Premium résilié.');
    }
  };`;

    lines.splice(startIndex, endIndex - startIndex + 1, newFunc);
    fs.writeFileSync('src/App.tsx', lines.join('\n'));
    console.log("Successfully replaced block!");
} else {
  console.log("Could not find boundaries.");
}
