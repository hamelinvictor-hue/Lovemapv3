"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeUser = purgeUser;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
// Initialize Firebase Admin SDK if not already initialized
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const FIRESTORE_DATABASE_ID = 'ai-studio-lovemapmomentsli-43d3bd8e-58f2-4435-8c33-1d088f0ab47a';
const db = (0, firestore_1.getFirestore)(FIRESTORE_DATABASE_ID);
/**
 * Purges all user data from Firestore without deleting the Firebase Auth account:
 * 1. Finds user's couples by memberUids, ownerUid, partnerAUid, and partnerBUid.
 * 2. Sets coupleId to null on the partner's user document (users/{partnerUid}) without altering their pseudo.
 * 3. Deletes each couple with recursiveDelete (deletes couple doc + all spots & notifications subcollections).
 * 4. Deletes user's invite codes from inviteCodes collection.
 * 5. Deletes users/{uid} and private/{uid}.
 */
async function purgeUser(uid) {
    if (!uid) {
        logger.warn('[purgeUser] No UID provided, aborting.');
        return;
    }
    logger.info(`[purgeUser] Starting purge for UID: ${uid} on database ${FIRESTORE_DATABASE_ID}`);
    try {
        const couplesCollection = db.collection('couples');
        const coupleDocMap = new Map();
        // 1. Find all couples of the user by memberUids, ownerUid, partnerAUid, partnerBUid
        try {
            const snapMember = await couplesCollection.where('memberUids', 'array-contains', uid).get();
            snapMember.docs.forEach((doc) => coupleDocMap.set(doc.id, doc));
        }
        catch (e) {
            logger.warn(`[purgeUser] Query memberUids notice: ${e?.message || e}`);
        }
        try {
            const snapOwner = await couplesCollection.where('ownerUid', '==', uid).get();
            snapOwner.docs.forEach((doc) => coupleDocMap.set(doc.id, doc));
        }
        catch (e) {
            logger.warn(`[purgeUser] Query ownerUid notice: ${e?.message || e}`);
        }
        try {
            const snapPA = await couplesCollection.where('partnerAUid', '==', uid).get();
            snapPA.docs.forEach((doc) => coupleDocMap.set(doc.id, doc));
        }
        catch (e) {
            logger.warn(`[purgeUser] Query partnerAUid notice: ${e?.message || e}`);
        }
        try {
            const snapPB = await couplesCollection.where('partnerBUid', '==', uid).get();
            snapPB.docs.forEach((doc) => coupleDocMap.set(doc.id, doc));
        }
        catch (e) {
            logger.warn(`[purgeUser] Query partnerBUid notice: ${e?.message || e}`);
        }
        logger.info(`[purgeUser] Found ${coupleDocMap.size} couple document(s) to process for user ${uid}`);
        // 2. Process each couple
        for (const [coupleId, coupleDoc] of coupleDocMap.entries()) {
            const coupleData = coupleDoc.data() || {};
            // Identify partner UIDs
            const partnerUids = new Set();
            const members = Array.isArray(coupleData.memberUids) ? coupleData.memberUids : [];
            members.forEach((mId) => {
                if (mId && mId !== uid)
                    partnerUids.add(mId);
            });
            if (coupleData.partnerAUid && coupleData.partnerAUid !== uid)
                partnerUids.add(coupleData.partnerAUid);
            if (coupleData.partnerBUid && coupleData.partnerBUid !== uid)
                partnerUids.add(coupleData.partnerBUid);
            if (coupleData.ownerUid && coupleData.ownerUid !== uid)
                partnerUids.add(coupleData.ownerUid);
            // Remettre coupleId à null chez le partenaire sans toucher à son pseudo
            for (const partnerUid of partnerUids) {
                try {
                    const partnerDocRef = db.doc(`users/${partnerUid}`);
                    const partnerSnap = await partnerDocRef.get();
                    if (partnerSnap.exists) {
                        await partnerDocRef.update({
                            coupleId: null,
                            updatedAt: new Date().toISOString(),
                        });
                        logger.info(`[purgeUser] Reset coupleId to null on partner doc users/${partnerUid} (pseudo preserved)`);
                    }
                }
                catch (partnerErr) {
                    logger.warn(`[purgeUser] Notice resetting coupleId for partner ${partnerUid}: ${partnerErr?.message || partnerErr}`);
                }
            }
            // Supprimer chaque couple avec recursiveDelete
            try {
                await db.recursiveDelete(coupleDoc.ref);
                logger.info(`[purgeUser] Successfully called recursiveDelete on couples/${coupleId}`);
            }
            catch (delErr) {
                logger.warn(`[purgeUser] recursiveDelete fallback for couple ${coupleId}: ${delErr?.message || delErr}`);
                try {
                    const spotsSnap = await db.collection(`couples/${coupleId}/spots`).get();
                    for (const spotDoc of spotsSnap.docs) {
                        await spotDoc.ref.delete().catch(() => { });
                    }
                    const notifsSnap = await db.collection(`couples/${coupleId}/notifications`).get();
                    for (const notifDoc of notifsSnap.docs) {
                        await notifDoc.ref.delete().catch(() => { });
                    }
                    await coupleDoc.ref.delete().catch(() => { });
                }
                catch (manualDelErr) {
                    logger.warn(`[purgeUser] Manual fallback delete notice for couple ${coupleId}: ${manualDelErr?.message || manualDelErr}`);
                }
            }
        }
        // 3. Supprimer les codes d'invitation de l'utilisateur
        try {
            const inviteSnapOwner = await db.collection('inviteCodes').where('ownerUid', '==', uid).get();
            for (const doc of inviteSnapOwner.docs) {
                await doc.ref.delete().catch(() => { });
            }
            const inviteSnapCreator = await db.collection('inviteCodes').where('creatorUid', '==', uid).get();
            for (const doc of inviteSnapCreator.docs) {
                await doc.ref.delete().catch(() => { });
            }
            logger.info(`[purgeUser] Deleted inviteCodes for user ${uid}`);
        }
        catch (inviteErr) {
            logger.warn(`[purgeUser] Notice deleting inviteCodes: ${inviteErr?.message || inviteErr}`);
        }
        // 4. Supprimer users/{uid}
        try {
            await db.doc(`users/${uid}`).delete();
            logger.info(`[purgeUser] Deleted users/${uid}`);
        }
        catch (userDocErr) {
            logger.warn(`[purgeUser] Notice deleting users/${uid}: ${userDocErr?.message || userDocErr}`);
        }
        // 5. Supprimer private/{uid}
        try {
            await db.doc(`private/${uid}`).delete();
            logger.info(`[purgeUser] Deleted private/${uid}`);
        }
        catch (privDocErr) {
            logger.warn(`[purgeUser] Notice deleting private/${uid}: ${privDocErr?.message || privDocErr}`);
        }
        logger.info(`[purgeUser] Finished complete Firestore purge for user ${uid}`);
    }
    catch (err) {
        logger.error(`[purgeUser] Error during user purge for ${uid}:`, err);
        throw err;
    }
}
//# sourceMappingURL=purgeUser.js.map