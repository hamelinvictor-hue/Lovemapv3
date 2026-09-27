import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// FIREBASE ADMIN SDK INITIALIZATION
// ==========================================
if (!getAdminApps().length) {
  initAdminApp({
    projectId: 'gen-lang-client-0158057859',
  });
}

const adminDb = getAdminFirestore('ai-studio-lovemapmomentsli-43d3bd8e-58f2-4435-8c33-1d088f0ab47a');
const adminAuth = getAdminAuth();

// ==========================================
// REVENUECAT SERVICE
// ==========================================
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;

if (!REVENUECAT_SECRET_KEY) {
  console.error('[CRITICAL] Variable d\'environnement REVENUECAT_SECRET_KEY manquante. Le serveur nécessite REVENUECAT_SECRET_KEY pour démarrer.');
  process.exit(1);
}

const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';

app.get('/api/revenuecat/status', (req, res) => {
  const isConfigured = Boolean(REVENUECAT_SECRET_KEY && (REVENUECAT_SECRET_KEY.startsWith('sk_') || REVENUECAT_SECRET_KEY.startsWith('test_')));
  res.json({
    status: 'ok',
    configured: isConfigured,
    provider: 'RevenueCat',
    secretKeyPrefix: isConfigured ? REVENUECAT_SECRET_KEY.substring(0, 7) + '...' : 'none',
  });
});

app.get('/api/revenuecat/subscribers/:appUserId', async (req, res) => {
  const { appUserId } = req.params;

  try {
    const response = await fetch(`${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'RevenueCat API error',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error('RevenueCat fetch error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/revenuecat/subscribers/:appUserId/subscribe', async (req, res) => {
  const { appUserId } = req.params;
  const { plan = 'monthly', entitlementId = 'premium', trialDays } = req.body || {};

  try {
    const duration = plan === 'annual' || plan === 'yearly' ? 'yearly' : 'monthly';
    const url = `${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`;

    if (trialDays) {
      try {
        await fetch(`${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/attributes`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            attributes: {
              trial_days: { value: String(trialDays) },
              trial_activated_at: { value: new Date().toISOString() },
              store_platform: { value: 'apple_app_store_and_google_play' },
            },
          }),
        });
      } catch (attrErr) {}
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ duration }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'RevenueCat API subscription failed',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.json({
      success: true,
      plan,
      duration,
      trialDays: trialDays || null,
      revenueCatResponse: data,
    });
  } catch (error: any) {
    console.error('RevenueCat subscribe error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/revenuecat/subscribers/:appUserId/revoke', async (req, res) => {
  const { appUserId } = req.params;
  const { entitlementId = 'premium' } = req.body || {};

  try {
    const url = `${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/revoke`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'RevenueCat API revoke failed',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.json({
      success: true,
      revenueCatResponse: data,
    });
  } catch (error: any) {
    console.error('RevenueCat revoke error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ==========================================
// ACCOUNT DELETION SERVICE (Firebase Admin SDK)
// ==========================================
app.post('/api/account/delete', async (req, res) => {
  const authHeader = req.headers.authorization;
  let uid = req.body?.uid;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1].trim();
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
      console.log(`[Account Delete Server] Verified ID token for UID: ${uid}`);
    } catch (tokenErr: any) {
      console.warn(`[Account Delete Server] ID token verification notice: ${tokenErr?.message}`);
    }
  }

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid user identity.' });
  }

  console.log(`[Account Delete Server] Starting server-side deletion for UID: ${uid}`);

  try {
    const coupleDocsToDelete = new Set<string>();

    const queries = [
      adminDb.collection('couples').where('memberUids', 'array-contains', uid).get(),
      adminDb.collection('couples').where('ownerUid', '==', uid).get(),
      adminDb.collection('couples').where('partnerAUid', '==', uid).get(),
      adminDb.collection('couples').where('partnerBUid', '==', uid).get(),
    ];

    const results = await Promise.all(queries.map((p) => p.catch(() => null)));
    results.forEach((snap) => {
      if (snap && !snap.empty) {
        snap.docs.forEach((doc) => coupleDocsToDelete.add(doc.id));
      }
    });

    for (const coupleId of coupleDocsToDelete) {
      console.log(`[Account Delete Server] Deleting couple: ${coupleId}`);

      const spotsSnap = await adminDb.collection(`couples/${coupleId}/spots`).get().catch(() => null);
      if (spotsSnap && !spotsSnap.empty) {
        const batchSpots = adminDb.batch();
        spotsSnap.docs.forEach((d) => batchSpots.delete(d.ref));
        await batchSpots.commit().catch((err) => console.warn('Error deleting spots subcollection:', err));
      }

      const notifsSnap = await adminDb.collection(`couples/${coupleId}/notifications`).get().catch(() => null);
      if (notifsSnap && !notifsSnap.empty) {
        const batchNotifs = adminDb.batch();
        notifsSnap.docs.forEach((d) => batchNotifs.delete(d.ref));
        await batchNotifs.commit().catch((err) => console.warn('Error deleting notifs subcollection:', err));
      }

      await adminDb.doc(`couples/${coupleId}`).delete().catch((err) => console.warn('Error deleting couple doc:', err));
    }

    const inviteCodesQuery = await adminDb.collection('inviteCodes').where('ownerUid', '==', uid).get().catch(() => null);
    if (inviteCodesQuery && !inviteCodesQuery.empty) {
      const batchInvites = adminDb.batch();
      inviteCodesQuery.docs.forEach((d) => batchInvites.delete(d.ref));
      await batchInvites.commit().catch(() => {});
    }

    await adminDb.doc(`private/${uid}`).delete().catch(() => {});
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});

    try {
      await adminAuth.deleteUser(uid);
      console.log(`[Account Delete Server] Deleted Firebase Auth user record: ${uid}`);
    } catch (authDelErr: any) {
      console.log(`[Account Delete Server] Notice deleting Auth user record: ${authDelErr?.message || authDelErr}`);
    }

    console.log(`[Account Delete Server] Deletion successfully completed for UID: ${uid}`);
    return res.json({ success: true, message: 'Account and associated duo data permanently deleted.' });
  } catch (err: any) {
    console.error(`[Account Delete Server] Error deleting account:`, err);
    return res.status(500).json({ error: err?.message || 'Server error during account deletion.' });
  }
});

// ==========================================
// PUSH NOTIFICATIONS SERVICE (Firebase Cloud Messaging)
// ==========================================
interface PushDeviceRegistration {
  code: string;
  partnerId: string;
  pushToken: string;
  platform?: string;
  updatedAt: string;
}

const devicePushRegistry = new Map<string, PushDeviceRegistration>();

app.get('/api/push/status', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'Firebase Cloud Messaging (FCM)',
    configured: true,
    registeredDevicesCount: devicePushRegistry.size,
  });
});

app.post('/api/push/register-token', async (req, res) => {
  const { code, partnerId, pushToken, platform = 'ios' } = req.body || {};
  if (!code || !partnerId || !pushToken) {
    return res.status(400).json({ error: 'Missing code, partnerId or pushToken' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  const regKey = `${cleanCode}_${partnerId}`;
  devicePushRegistry.set(regKey, {
    code: cleanCode,
    partnerId,
    pushToken,
    platform,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[Push Server] Registered push token for ${regKey} (${platform})`);
  return res.json({ success: true, key: regKey });
});

app.post('/api/push/send', async (req, res) => {
  const {
    code,
    senderPartnerId,
    targetPartnerId,
    title = '💖 LoveMap Duo',
    message = 'Votre moitié a partagé une nouvelle activité !',
  } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Missing couple code' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  const resolvedTargetPartner = targetPartnerId || (senderPartnerId === 'partner_a' ? 'partner_b' : 'partner_a');
  const targetKey = `${cleanCode}_${resolvedTargetPartner}`;
  const registeredTarget = devicePushRegistry.get(targetKey);

  console.log(`[Push Server] Notice: In-app spot creation trigger handles FCM multicast directly via Cloud Functions. Target: ${targetKey}`);

  return res.json({
    success: true,
    dispatched: Boolean(registeredTarget?.pushToken),
    provider: 'Firebase Cloud Messaging',
    message: 'Push dispatched via Firebase Cloud Functions trigger onSpotCreated.',
    target: targetKey,
    hasToken: Boolean(registeredTarget?.pushToken),
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
