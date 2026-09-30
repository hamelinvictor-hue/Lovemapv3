import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as auth from 'firebase-functions/v1/auth';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin SDK using Application Default Credentials (ADC)
if (!getApps().length) {
  initializeApp();
}

const db = admin.firestore();

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
  const tokens: string[] = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];

  if (tokens.length === 0) {
    logger.info(`[FCM Server] No FCM tokens registered for targetUid=${targetUid}.`);
    return;
  }

  logger.info(`[FCM Server] Sending push to ${tokens.length} tokens for targetUid=${targetUid}`);

  const multicastMessage: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title,
      body: message,
    },
    data: {
      coupleId: String(coupleId || ''),
      spotId: String(spotId || ''),
      type: String(type || ''),
      senderUid: String(senderUid || ''),
      targetUid: String(targetUid || ''),
    },
    apns: {
      payload: {
        aps: {
          sound: 'beep.wav',
          badge: 1,
          contentAvailable: true,
        },
      },
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'lovemap_duo',
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(multicastMessage);
    logger.info(`[FCM Server] Multicast results: ${response.successCount} success, ${response.failureCount} failures.`);

    // 2. Automatically remove invalid / unregistered tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          logger.warn(`[FCM Server] Token index ${idx} failed with code: ${errorCode}`, resp.error);
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-argument'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        logger.info(`[FCM Server] Cleaning up ${tokensToRemove.length} stale tokens for targetUid=${targetUid}`);
        await userDocRef.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    logger.error(`[FCM Server] Multicast send error for targetUid=${targetUid}:`, err);
  }
}

/**
 * TRIGGER 1: onSpotCreated (v2 Firestore)
 * Pattern: couples/{coupleId}/spots/{spotId}
 * Action:
 * 1. Identifies the creator Firebase UID (creatorUid or createdByUid).
 * 2. Retrieves the couple document to locate the partner UID from memberUids.
 * 3. Creates the in-app notification document with targetUid and senderUid.
 * 4. Dispatches FCM push notification via admin.messaging().sendEachForMulticast().
 */
export const onSpotCreated = onDocumentCreated(
  'couples/{coupleId}/spots/{spotId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.info('No data associated with the event');
      return;
    }

    const spot = snap.data();
    const { coupleId, spotId } = event.params;

    // Solo spots (Jardin Secret) do not notify the partner
    if (spot.isSolo) {
      logger.info(`Spot ${spotId} is solo. Skipping partner notification.`);
      return;
    }

    // Identify creator UID (creatorUid per schema, with fallback)
    const senderUid: string = spot.creatorUid || spot.createdByUid || spot.creatorId || '';
    if (!senderUid) {
      logger.warn(`Spot ${spotId} has no creator UID. Skipping notification.`);
      return;
    }

    // Load couple document to determine partner UID from memberUids
    const coupleDocRef = db.doc(`couples/${coupleId}`);
    const coupleSnap = await coupleDocRef.get();

    if (!coupleSnap.exists) {
      logger.warn(`Couple document couples/${coupleId} not found.`);
      return;
    }

    const coupleData = coupleSnap.data() || {};
    const memberUids: string[] = Array.isArray(coupleData.memberUids) ? coupleData.memberUids : [];
    const members: Record<string, any> = coupleData.members || {};

    // Target UID is the other member in memberUids
    const targetUid = memberUids.find((uid) => uid !== senderUid);
    if (!targetUid) {
      logger.info(`No partner UID found in couple ${coupleId} (member count: ${memberUids.length}).`);
      return;
    }

    const senderProfile = members[senderUid];
    const senderName: string = senderProfile?.displayName || 'Votre partenaire';
    const spotTitle: string = spot.title || 'Nouveau lieu';

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
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
 * Action:
 * - Recalculates averageScores and overallScore server-side based on ratings.
 * - Transitions status to 'validated' as soon as both members of memberUids have submitted their ratings.
 * - Prevents infinite recursion by comparing existing score/status with newly computed values.
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
 * TRIGGER 3: onAuthUserDeleted (Auth Trigger)
 * Pattern: functions.auth.user().onDelete
 * Action:
 * Safety net triggered on any Auth user deletion (including from the Firebase Console).
 * Cleans up residual documents associated with the deleted user that were not processed by client deleteAccount:
 * 1. Finds all couples where memberUids contains the deleted user's UID.
 * 2. Deletes spots and notifications subcollections, then deletes the couple document.
 * 3. Deletes any pending inviteCodes owned or created by this user.
 * 4. Cleans up private/{deletedUid} (sensitive server secrets).
 * 5. Deletes the user profile document in users/{deletedUid}.
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

      // Delete spots subcollection
      const spotsSnap = await db.collection(`couples/${coupleId}/spots`).get();
      const batch1 = db.batch();
      spotsSnap.docs.forEach((doc) => batch1.delete(doc.ref));
      await batch1.commit();

      // Delete notifications subcollection
      const notifsSnap = await db.collection(`couples/${coupleId}/notifications`).get();
      const batch2 = db.batch();
      notifsSnap.docs.forEach((doc) => batch2.delete(doc.ref));
      await batch2.commit();

      // Delete couple document itself
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

    // Also clean up by legacy creatorUid field if exists
    const legacyInviteCodesQuery = await db.collection('inviteCodes')
      .where('creatorUid', '==', deletedUid)
      .get();

    if (!legacyInviteCodesQuery.empty) {
      const legacyBatch = db.batch();
      legacyInviteCodesQuery.docs.forEach((doc) => legacyBatch.delete(doc.ref));
      await legacyBatch.commit();
    }

    // 3. Clean up private/{deletedUid} (sensitive server secrets like Apple refresh tokens)
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

/**
 * Callable Function: deleteAccount
 * Region: europe-west1
 * Allows authenticated user to delete their account and associated duo data.
 */
export const deleteAccount = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Utilisateur non authentifié.');
  }
  logger.info(`[deleteAccount] Starting account deletion for UID: ${uid}`);

  try {
    // 1. Delete all couples where memberUids contains uid
    const couplesSnap = await db.collection('couples').where('memberUids', 'array-contains', uid).get();
    for (const coupleDoc of couplesSnap.docs) {
      const coupleId = coupleDoc.id;
      const spots = await db.collection(`couples/${coupleId}/spots`).get();
      const batch1 = db.batch();
      spots.docs.forEach((d) => batch1.delete(d.ref));
      await batch1.commit();

      const notifs = await db.collection(`couples/${coupleId}/notifications`).get();
      const batch2 = db.batch();
      notifs.docs.forEach((d) => batch2.delete(d.ref));
      await batch2.commit();

      await coupleDoc.ref.delete();
      logger.info(`[deleteAccount] Purged couple ${coupleId}`);
    }

    // 2. Delete user doc & private
    await db.doc(`users/${uid}`).delete().catch(() => {});
    await db.doc(`private/${uid}`).delete().catch(() => {});

    // 3. Delete from Firebase Auth
    await admin.auth().deleteUser(uid);
    logger.info(`[deleteAccount] Successfully deleted user ${uid}`);
    return { success: true };
  } catch (err: any) {
    logger.error(`[deleteAccount] Error deleting user ${uid}:`, err);
    throw new HttpsError('internal', err?.message || 'Erreur lors de la suppression');
  }
});
