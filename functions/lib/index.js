"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuthUserDeleted = exports.onSpotUpdated = exports.onSpotCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const auth = require("firebase-functions/v1/auth");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
// OneSignal configuration strictly read from server environment
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const ONESIGNAL_BASE_URL = 'https://onesignal.com/api/v1';
const CRITERIA_KEYS = ['comfort', 'thrill', 'romance', 'intensity', 'setting'];
/**
 * Helper to send OneSignal push notification via REST API
 * Security requirement: ONESIGNAL_REST_API_KEY is kept strictly server-side.
 */
async function sendOneSignalPush(params) {
    const { targetUid, senderUid, title, message, spotId, coupleId, type } = params;
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        logger.warn('[OneSignal] Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY in server environment.');
        return;
    }
    if (!targetUid) {
        logger.warn('[OneSignal] Cannot send push notification: missing targetUid.');
        return;
    }
    const payload = {
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        include_aliases: { external_id: [targetUid] },
        include_external_user_ids: [targetUid],
        headings: { en: title, fr: title },
        contents: { en: message, fr: message },
        data: {
            coupleId,
            spotId,
            type,
            senderUid,
            targetUid,
        },
        ios_sound: 'beep.wav',
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        content_available: true,
        priority: 10,
    };
    try {
        const res = await fetch(`${ONESIGNAL_BASE_URL}/notifications`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const result = await res.json();
        logger.info(`[OneSignal] Push sent for targetUid=${targetUid}`, { result });
    }
    catch (err) {
        logger.error(`[OneSignal] Failed to send push to targetUid=${targetUid}:`, err);
    }
}
/**
 * TRIGGER 1: onSpotCreated (v2 Firestore)
 * Pattern: couples/{coupleId}/spots/{spotId}
 * Action:
 * 1. Identifies the creator Firebase UID (createdByUid or creatorUid).
 * 2. Retrieves the couple document to locate the partner UID from memberUids.
 * 3. Creates the in-app notification document with targetUid and senderUid.
 * 4. Sends the OneSignal push notification via REST API with the server-side key.
 */
exports.onSpotCreated = (0, firestore_1.onDocumentCreated)('couples/{coupleId}/spots/{spotId}', async (event) => {
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
    // Identify creator UID (migration format)
    const senderUid = spot.createdByUid || spot.creatorUid || spot.creatorId || '';
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
    const memberUids = Array.isArray(coupleData.memberUids) ? coupleData.memberUids : [];
    const members = coupleData.members || {};
    // Target UID is the other member in memberUids
    const targetUid = memberUids.find((uid) => uid !== senderUid);
    if (!targetUid) {
        logger.info(`No partner UID found in couple ${coupleId} (member count: ${memberUids.length}).`);
        return;
    }
    const senderProfile = members[senderUid];
    const senderName = senderProfile?.displayName || 'Votre partenaire';
    const spotTitle = spot.title || 'Nouveau lieu';
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
    // 2. Send OneSignal push via REST API
    await sendOneSignalPush({
        targetUid,
        senderUid,
        title: notificationData.title,
        message: notificationData.message,
        spotId,
        coupleId,
        type: notificationData.type,
    });
});
/**
 * TRIGGER 2: onSpotUpdated (v2 Firestore)
 * Pattern: couples/{coupleId}/spots/{spotId}
 * Action:
 * - Recalculates averageScores and overallScore server-side based on ratings.
 * - Transitions status to 'validated' as soon as both members of memberUids have submitted their ratings.
 * - Prevents infinite recursion by comparing existing score/status with newly computed values.
 */
exports.onSpotUpdated = (0, firestore_1.onDocumentUpdated)('couples/{coupleId}/spots/{spotId}', async (event) => {
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
    const memberUids = Array.isArray(coupleData.memberUids) ? coupleData.memberUids : [];
    // Calculate criteria averages
    const avgScores = {
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
    const bothMembersRated = memberUids.length >= 2 && memberUids.every((uid) => Boolean(ratings[uid]?.scores));
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
});
/**
 * TRIGGER 3: onAuthUserDeleted (Auth Trigger)
 * Pattern: functions.auth.user().onDelete
 * Action:
 * Safety net triggered on any Auth user deletion (including from the Firebase Console).
 * Cleans up residual documents associated with the deleted user that were not processed by client deleteAccount:
 * 1. Finds all couples where memberUids contains the deleted user's UID.
 * 2. Deletes spots and notifications subcollections, then deletes the couple document.
 * 3. Deletes any pending inviteCodes created by this user.
 * 4. Deletes the user profile document in users/{deletedUid}.
 */
exports.onAuthUserDeleted = auth.user().onDelete(async (user) => {
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
        // 2. Clean up inviteCodes created by this user
        const inviteCodesQuery = await db.collection('inviteCodes')
            .where('creatorUid', '==', deletedUid)
            .get();
        if (!inviteCodesQuery.empty) {
            const inviteBatch = db.batch();
            inviteCodesQuery.docs.forEach((doc) => inviteBatch.delete(doc.ref));
            await inviteBatch.commit();
            logger.info(`[onAuthUserDeleted] Deleted ${inviteCodesQuery.size} inviteCodes for creatorUid: ${deletedUid}`);
        }
        // 3. Clean up user profile document in users/{deletedUid}
        const userDocRef = db.doc(`users/${deletedUid}`);
        const userDocSnap = await userDocRef.get();
        if (userDocSnap.exists) {
            await userDocRef.delete();
            logger.info(`[onAuthUserDeleted] Deleted users/${deletedUid}`);
        }
        logger.info(`[onAuthUserDeleted] Successfully finished safety net cleanup for user ${deletedUid}`);
    }
    catch (err) {
        logger.error(`[onAuthUserDeleted] Error cleaning up data for user ${deletedUid}:`, err);
    }
});
//# sourceMappingURL=index.js.map