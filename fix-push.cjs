const fs = require('fs');
const path = './src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

// For handleValidationConfirm
code = code.replace(
  /saveNotificationToFirestore\(couple\.code, validationNotif\)\.catch\(console\.error\);/g,
  `saveNotificationToFirestore(couple.code, validationNotif).catch(console.error);
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: couple.code,
              senderPartnerId: partnerId,
              targetPartnerId,
              title: validationNotif.title,
              message: validationNotif.message,
              spotId: finalSpot.id,
              type: validationNotif.type,
            });
          });`
);

code = code.replace(
  /saveNotificationToFirestore\(couple\.code, ratingNotif\)\.catch\(console\.error\);/g,
  `saveNotificationToFirestore(couple.code, ratingNotif).catch(console.error);
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: couple.code,
              senderPartnerId: partnerId,
              targetPartnerId,
              title: ratingNotif.title,
              message: ratingNotif.message,
              spotId: finalSpot.id,
              type: ratingNotif.type,
            });
          });`
);

// For Edit Spot
code = code.replace(
  /saveNotificationToFirestore\(couple\.code, newNotif\)\.catch\(console\.error\);/g,
  `saveNotificationToFirestore(couple.code, newNotif).catch(console.error);
          import('./lib/apiConfig').then(({ sendPushNotification }) => {
            sendPushNotification({
              code: couple.code,
              senderPartnerId: activePartnerId,
              targetPartnerId: partnerUser.id,
              title: newNotif.title,
              message: newNotif.message,
              spotId,
              type: newNotif.type,
            });
          });`
);


fs.writeFileSync(path, code);
