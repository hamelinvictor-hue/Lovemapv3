import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as auth from 'firebase-functions/v1/auth';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK using Application Default Credentials (ADC)
if (!admin.apps.length) {
  admin.initializeApp();
}

const FIRESTORE_DATABASE_ID = 'ai-studio-lovemapmomentsli-43d3bd8e-58f2-4435-8c33-1d088f0ab47a';
const db = getFirestore(FIRESTORE_DATABASE_ID);

const CRITERIA_KEYS = ['comfort', 'thrill', 'romance', 'intensity', 'setting'] as const;
type CriteriaKey = typeof CRITERIA_KEYS[number];

/**
 * Sends push notification to all FCM tokens of targetUid using FCM Admin Multicast.
 * Uses Application Default Credentials (ADC) - no hardcoded keys.
 * Automatically removes invalid or unregistered tokens from users/{targetUid}.fcmTokens.
 */
async function sendFcmPush(params: {
  targetUid: string;
  senderUid: string;
  title: string;
  message: string;
  spotId: string;
  coupleId: string;
  type: string;
}): Promise<void> {
  const { targetUid, senderUid, title, message, spotId, coupleId, type } = params;

  if (!targetUid) {
    logger.warn('[FCM Server] Missing targetUid. Notification skipped.');
    return;
  }

  // 1. Fetch user document to read fcmTokens array
  const userDocRef = db.doc(`users/${targetUid}`);
  const userSnap = await userDocRef.get();

  if (!userSnap.exists) {
    logger.info(`[FCM Server] User doc users/${targetUid} not found.`);
    return;
  }

  const userData = userSnap.data() || {};
  const rawTokens: string[] = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
  const fcmTokens = Array.from(new Set(rawTokens.filter((t) => typeof t === 'string' && t.trim().length > 0)));

  if (fcmTokens.length === 0) {
    logger.info(`[FCM Server] No registered FCM tokens for user ${targetUid}.`);
    return;
  }

  logger.info(`[FCM Server] Dispatching push to ${fcmTokens.length} device(s) for user ${targetUid}`);

  const payload: admin.messaging.MulticastMessage = {
    tokens: fcmTokens,
    notification: {
      title,
      body: message,
    },
    data: {
      spotId: spotId || '',
      coupleId: coupleId || '',
      type: type || 'new_spot_proposed',
      senderUid: senderUid || '',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'duo_spots_channel',
        priority: 'max',
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(payload);
    logger.info(`[FCM Server] Multicast result: ${response.successCount} succeeded, ${response.failureCount} failed.`);

    // 2. Token cleanup for invalid or unregistered tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code;
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(fcmTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        logger.info(`[FCM Server] Pruning ${tokensToRemove.length} dead FCM token(s) for user ${targetUid}`);
        await userDocRef.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    logger.error(`[FCM Server] Failed to send multicast push to ${targetUid}:`, err);
  }
}

/**
 * TRIGGER 1: onSpotCreated (v2 Firestore)
 * Pattern: couples/{coupleId}/spots/{spotId}
 */
export const onSpotCreated = onDocumentCreated(
  'couples/{coupleId}/spots/{spotId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      return;
    }

    const spotData = snap.data();
    const { coupleId, spotId } = event.params;

    const creatorId = spotData.creatorId || 'partner_a';
    const spotTitle = spotData.title || 'Nouveau lieu';

    // Read parent couple doc to resolve partner UIDs and names
    const coupleDocRef = db.doc(`couples/${coupleId}`);
    const coupleSnap = await coupleDocRef.get();

    if (!coupleSnap.exists) {
      logger.warn(`Couple document couples/${coupleId} not found.`);
      return;
    }

    const coupleData = coupleSnap.data() || {};
    const partnerA = coupleData.partnerA || {};
    const partnerB = coupleData.partnerB || {};

    let targetUid = '';
    let senderUid = '';
    let senderName = 'Votre moitié';

    if (creatorId === 'partner_a') {
      senderUid = coupleData.partnerAUid || partnerA.uid || '';
      targetUid = coupleData.partnerBUid || partnerB.uid || '';
      senderName = partnerA.name || 'Partenaire 1';
    } else {
      senderUid = coupleData.partnerBUid || partnerB.uid || '';
      targetUid = coupleData.partnerAUid || partnerA.uid || '';
      senderName = partnerB.name || 'Partenaire 2';
    }

    // Fallback if targetUid wasn't in partnerXUid: check memberUids array
    if (!targetUid && Array.isArray(coupleData.memberUids)) {
      const otherUid = coupleData.memberUids.find((u: string) => u !== senderUid);
      if (otherUid) {
        targetUid = otherUid;
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const notificationId = `notif-${Date.now()}`;
    const notificationData = {
      id: notificationId,
      coupleId,
      spotId,
      type: 'new_spot_proposed',
      senderUid,
      targetUid,
      title: "Nouveau spot d'intimité ! 📍",
      message: `${senderName} a placé un nouveau lieu : "${spotTitle}". Validez le spot et répondez au questionnaire !`,
      timestamp: `${dateStr} à ${timeStr}`,
      isRead: false,
      createdAt: now.toISOString(),
    };

    // 1. Create notification document in couples/{coupleId}/notifications/{notificationId}
    const notifDocRef = db.doc(`couples/${coupleId}/notifications/${notificationId}`);
    await notifDocRef.set(notificationData);
    logger.info(`Notification document created: couples/${coupleId}/notifications/${notificationId}`);

    // Update parent couple timestamp
    await coupleDocRef.update({
      updatedAt: now.toISOString(),
      lastNotificationUpdate: Date.now(),
    }).catch((err) => logger.warn('Failed to update couple timestamp:', err));

    // 2. Send FCM push via Firebase Admin Multicast
    await sendFcmPush({
      targetUid,
      senderUid,
      title: notificationData.title,
      message: notificationData.message,
      spotId,
      coupleId,
      type: notificationData.type,
    });
  }
);

/**
 * TRIGGER 2: onSpotUpdated (v2 Firestore)
 * Pattern: couples/{coupleId}/spots/{spotId}
 */
export const onSpotUpdated = onDocumentUpdated(
  'couples/{coupleId}/spots/{spotId}',
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!beforeSnap || !afterSnap) {
      return;
    }

    const afterData = afterSnap.data();
    const { coupleId, spotId } = event.params;

    const ratings = afterData.ratings || {};
    const ratingUids = Object.keys(ratings);

    // Fetch couple document to know memberUids
    const coupleDocRef = db.doc(`couples/${coupleId}`);
    const coupleSnap = await coupleDocRef.get();
    const coupleData = coupleSnap.exists ? (coupleSnap.data() || {}) : {};
    const memberUids: string[] = Array.isArray(coupleData.memberUids) ? coupleData.memberUids : [];

    // Calculate criteria averages
    const avgScores: Record<CriteriaKey, number> = {
      comfort: 0,
      thrill: 0,
      romance: 0,
      intensity: 0,
      setting: 0,
    };

    if (ratingUids.length > 0) {
      CRITERIA_KEYS.forEach((key) => {
        let sumCriteria = 0;
        let countCriteria = 0;
        ratingUids.forEach((uid) => {
          const val = ratings[uid]?.scores?.[key];
          if (typeof val === 'number') {
            sumCriteria += val;
            countCriteria++;
          }
        });
        avgScores[key] = countCriteria > 0 ? Math.round((sumCriteria / countCriteria) * 10) / 10 : 0;
      });
    }

    const sum = CRITERIA_KEYS.reduce((acc, k) => acc + avgScores[k], 0);
    const overallScore = ratingUids.length > 0 ? Math.round((sum / CRITERIA_KEYS.length) * 10) / 10 : 0;

    // Check if both members from memberUids have submitted ratings
    const bothMembersRated =
      memberUids.length >= 2 && memberUids.every((uid) => Boolean(ratings[uid]?.scores));

    // Determine target status: validated if both members rated or if already validated
    let targetStatus = afterData.status || 'pending_validation';
    if (bothMembersRated && targetStatus !== 'validated') {
      targetStatus = 'validated';
      logger.info(`Both members of couple ${coupleId} rated spot ${spotId}. Switching status to 'validated'.`);
    }

    // Check if anything actually changed to prevent infinite loops
    const currentOverall = afterData.overallScore;
    const currentStatus = afterData.status;
    const currentAverages = afterData.averageScores || {};

    const averagesChanged = CRITERIA_KEYS.some((k) => currentAverages[k] !== avgScores[k]);
    const scoreChanged = currentOverall !== overallScore;
    const statusChanged = currentStatus !== targetStatus;

    if (!scoreChanged && !statusChanged && !averagesChanged) {
      logger.info(`Spot ${spotId} scores and status already up to date. No write needed.`);
      return;
    }

    logger.info(`Updating spot ${spotId}: overallScore=${overallScore}, status=${targetStatus}`);
    await afterSnap.ref.update({
      averageScores: avgScores,
      overallScore,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
    });
  }
);

/**
 * CALLABLE FUNCTION: deleteAccount (v2 HTTPS Callable)
 * Region: europe-west1
 * Securely deletes:
 * 1. Couple documents and their subcollections (spots, notifications) for this user
 * 2. inviteCodes created or owned by this user
 * 3. private/{uid} secrets
 * 4. users/{uid} profile
 * 5. Firebase Auth user account
 */
export const deleteAccount = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const authCtx = request.auth;
    if (!authCtx || !authCtx.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise pour supprimer le compte.');
    }

    const uid = authCtx.uid;
    logger.info(`[deleteAccount] Callable triggered for UID: ${uid}`);

    try {
      // 1. Find all couples where this user is involved
      const couplesRef = db.collection('couples');
      const [membersSnap, ownerSnap, partnerASnap, partnerBSnap] = await Promise.all([
        couplesRef.where('memberUids', 'array-contains', uid).get(),
        couplesRef.where('ownerUid', '==', uid).get(),
        couplesRef.where('partnerAUid', '==', uid).get(),
        couplesRef.where('partnerBUid', '==', uid).get(),
      ]);

      const coupleDocsMap = new Map<string, admin.firestore.QueryDocumentSnapshot>();
      [membersSnap, ownerSnap, partnerASnap, partnerBSnap].forEach((snap) => {
        snap.docs.forEach((doc) => coupleDocsMap.set(doc.id, doc));
      });

      for (const [coupleId, coupleDoc] of coupleDocsMap.entries()) {
        logger.info(`[deleteAccount] Deleting couple ${coupleId} and subcollections for UID ${uid}`);

        // Delete spots subcollection
        const spotsSnap = await db.collection(`couples/${coupleId}/spots`).get();
        if (!spotsSnap.empty) {
          const spotsBatch = db.batch();
          spotsSnap.docs.forEach((d) => spotsBatch.delete(d.ref));
          await spotsBatch.commit();
        }

        // Delete notifications subcollection
        const notifsSnap = await db.collection(`couples/${coupleId}/notifications`).get();
        if (!notifsSnap.empty) {
          const notifsBatch = db.batch();
          notifsSnap.docs.forEach((d) => notifsBatch.delete(d.ref));
          await notifsBatch.commit();
        }

        // Delete parent couple document
        await coupleDoc.ref.delete();
        logger.info(`[deleteAccount] Deleted couple doc: ${coupleId}`);
      }

      // 2. Clean up inviteCodes created or owned by this user
      const inviteCodesRef = db.collection('inviteCodes');
      const [inviteOwnerSnap, inviteCreatorSnap] = await Promise.all([
        inviteCodesRef.where('ownerUid', '==', uid).get(),
        inviteCodesRef.where('creatorUid', '==', uid).get(),
      ]);

      const inviteDocsMap = new Map<string, admin.firestore.QueryDocumentSnapshot>();
      [inviteOwnerSnap, inviteCreatorSnap].forEach((snap) => {
        snap.docs.forEach((d) => inviteDocsMap.set(d.id, d));
      });

      if (inviteDocsMap.size > 0) {
        const inviteBatch = db.batch();
        inviteDocsMap.forEach((d) => inviteBatch.delete(d.ref));
        await inviteBatch.commit();
        logger.info(`[deleteAccount] Deleted ${inviteDocsMap.size} inviteCodes for ownerUid: ${uid}`);
      }

      // 3. Clean up private/{uid}
      const privateDocRef = db.doc(`private/${uid}`);
      const privateSnap = await privateDocRef.get();
      if (privateSnap.exists) {
        await privateDocRef.delete();
        logger.info(`[deleteAccount] Deleted private/${uid}`);
      }

      // 4. Clean up user profile document in users/{uid}
      const userDocRef = db.doc(`users/${uid}`);
      const userSnap = await userDocRef.get();
      if (userSnap.exists) {
        await userDocRef.delete();
        logger.info(`[deleteAccount] Deleted users/${uid}`);
      }

      // 5. Delete Firebase Auth record
      try {
        await admin.auth().deleteUser(uid);
        logger.info(`[deleteAccount] Auth record deleted for UID: ${uid}`);
      } catch (authErr: any) {
        logger.warn(`[deleteAccount] Notice deleting Auth user ${uid}:`, authErr?.message || authErr);
      }

      return { success: true, message: 'Compte définitivement supprimé.' };
    } catch (err: any) {
      logger.error(`[deleteAccount] Error deleting account for UID ${uid}:`, err);
      throw new HttpsError('internal', err?.message || 'Erreur lors de la suppression du compte.');
    }
  }
);

/**
 * TRIGGER 3: onAuthUserDeleted (Auth Trigger)
 * Safety net triggered on any Auth user deletion
 */
export const onAuthUserDeleted = auth.user().onDelete(async (user: auth.UserRecord) => {
  const deletedUid = user.uid;
  logger.info(`[onAuthUserDeleted] Safety net triggered for deleted UID: ${deletedUid}`);
  if (!deletedUid) {
    return;
  }

  try {
    // 1. Clean up couples containing this memberUid
    const couplesQuery = await db.collection('couples')
      .where('memberUids', 'array-contains', deletedUid)
      .get();

    for (const coupleDoc of couplesQuery.docs) {
      const coupleId = coupleDoc.id;
      logger.info(`[onAuthUserDeleted] Cleaning up couple: ${coupleId}`);

      const spotsSnap = await db.collection(`couples/${coupleId}/spots`).get();
      const batch1 = db.batch();
      spotsSnap.docs.forEach((doc) => batch1.delete(doc.ref));
      await batch1.commit();

      const notifsSnap = await db.collection(`couples/${coupleId}/notifications`).get();
      const batch2 = db.batch();
      notifsSnap.docs.forEach((doc) => batch2.delete(doc.ref));
      await batch2.commit();

      await coupleDoc.ref.delete();
      logger.info(`[onAuthUserDeleted] Deleted couple doc: ${coupleId}`);
    }

    // 2. Clean up inviteCodes created/owned by this user
    const inviteCodesQuery = await db.collection('inviteCodes')
      .where('ownerUid', '==', deletedUid)
      .get();

    if (!inviteCodesQuery.empty) {
      const inviteBatch = db.batch();
      inviteCodesQuery.docs.forEach((doc) => inviteBatch.delete(doc.ref));
      await inviteBatch.commit();
      logger.info(`[onAuthUserDeleted] Deleted ${inviteCodesQuery.size} inviteCodes for ownerUid: ${deletedUid}`);
    }

    const legacyInviteCodesQuery = await db.collection('inviteCodes')
      .where('creatorUid', '==', deletedUid)
      .get();

    if (!legacyInviteCodesQuery.empty) {
      const legacyBatch = db.batch();
      legacyInviteCodesQuery.docs.forEach((doc) => legacyBatch.delete(doc.ref));
      await legacyBatch.commit();
    }

    // 3. Clean up private/{deletedUid}
    const privateDocRef = db.doc(`private/${deletedUid}`);
    const privateDocSnap = await privateDocRef.get();
    if (privateDocSnap.exists) {
      await privateDocRef.delete();
      logger.info(`[onAuthUserDeleted] Deleted private/${deletedUid}`);
    }

    // 4. Clean up user profile document in users/{deletedUid}
    const userDocRef = db.doc(`users/${deletedUid}`);
    const userDocSnap = await userDocRef.get();
    if (userDocSnap.exists) {
      await userDocRef.delete();
      logger.info(`[onAuthUserDeleted] Deleted users/${deletedUid}`);
    }

    logger.info(`[onAuthUserDeleted] Successfully finished safety net cleanup for user ${deletedUid}`);
  } catch (err: any) {
    logger.error(`[onAuthUserDeleted] Error cleaning up data for user ${deletedUid}:`, err);
  }
});
