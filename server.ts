import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY || 'sk_sAuopEcrYtQsWZWKjiSLEGzgNWlXy';
const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';

// RevenueCat API status endpoint
app.get('/api/revenuecat/status', (req, res) => {
  const isConfigured = Boolean(REVENUECAT_SECRET_KEY && REVENUECAT_SECRET_KEY.startsWith('sk_'));
  res.json({
    status: 'ok',
    configured: isConfigured,
    provider: 'RevenueCat',
    secretKeyPrefix: isConfigured ? REVENUECAT_SECRET_KEY.substring(0, 7) + '...' : 'none',
  });
});

// GET subscriber details from RevenueCat
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

// POST grant promotional subscription / entitlement via RevenueCat REST API
app.post('/api/revenuecat/subscribers/:appUserId/subscribe', async (req, res) => {
  const { appUserId } = req.params;
  const { plan = 'monthly', entitlementId = 'premium', trialDays } = req.body || {};

  try {
    const duration = plan === 'annual' || plan === 'yearly' ? 'yearly' : 'monthly';
    const url = `${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`;

    // Optionally set subscriber attributes for store & trial tracking
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
      } catch (attrErr) {
        console.warn('RevenueCat attribute update warning:', attrErr);
      }
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
      // Even if RevenueCat returns error for unconfigured entitlement on RevenueCat dashboard, return details
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

// POST revoke entitlement via RevenueCat REST API
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
// PUSH NOTIFICATIONS SERVICE (OneSignal / APNs)
// ==========================================

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const ONESIGNAL_BASE_URL = 'https://onesignal.com/api/v1';

// In-memory token store for couple partners (synced with Firestore)
interface PushDeviceRegistration {
  code: string;
  partnerId: string;
  pushToken: string;
  platform?: string;
  updatedAt: string;
}
const devicePushRegistry = new Map<string, PushDeviceRegistration>();

// GET /api/push/status
app.get('/api/push/status', (req, res) => {
  const isOneSignalConfigured = Boolean(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
  res.json({
    status: 'ok',
    provider: isOneSignalConfigured ? 'OneSignal' : 'None (Mock / Local)',
    configured: isOneSignalConfigured,
    registeredDevicesCount: devicePushRegistry.size,
    instructions: isOneSignalConfigured
      ? 'OneSignal est configuré. Les notifications push hors-application sont actives.'
      : 'Pour recevoir les notifications push même quand l\'application est fermée sur iPhone, créez un compte gratuit sur OneSignal (jusqu\'à 10 000 utilisateurs gratuits), renseignez ONESIGNAL_APP_ID et ONESIGNAL_REST_API_KEY dans les variables d\'environnement, et téléversez votre clé APNs Apple (.p8).',
  });
});

// POST /api/push/register-token
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

  // If OneSignal is configured, sync device player registration with OneSignal REST API
  if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
    try {
      const isIos = platform === 'ios';
      const osResp = await fetch(`${ONESIGNAL_BASE_URL}/players`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          device_type: isIos ? 0 : 1, // 0 = iOS, 1 = Android
          identifier: pushToken,
          external_user_id: regKey,
          language: 'fr',
        }),
      });
      const osData = await osResp.json();
      console.log(`[Push Server] OneSignal player sync result for ${regKey}:`, osData?.id || osData);
    } catch (osErr) {
      console.warn('[Push Server] OneSignal player registration warning:', osErr);
    }
  }

  return res.json({ success: true, key: regKey });
});

// POST /api/push/send
app.post('/api/push/send', async (req, res) => {
  const {
    code,
    senderPartnerId,
    targetPartnerId,
    title = '💖 LoveMap Duo',
    message = 'Votre moitié a partagé une nouvelle activité !',
    spotId,
    type = 'general',
  } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Missing couple code' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  // Target partner is the other partner by default
  const resolvedTargetPartner = targetPartnerId || (senderPartnerId === 'partner_a' ? 'partner_b' : 'partner_a');
  const targetKey = `${cleanCode}_${resolvedTargetPartner}`;
  const registeredTarget = devicePushRegistry.get(targetKey);

  console.log(`[Push Server] Preparing push for ${targetKey}. Title: "${title}", Msg: "${message}"`);

  // 1. OneSignal Dispatch (Sends real push to Apple APNs even if app is completely closed)
  if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
    try {
      const payload: any = {
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        include_aliases: {
          external_id: [targetKey],
        },
        headings: { en: title, fr: title },
        contents: { en: message, fr: message },
        data: {
          code: cleanCode,
          spotId,
          type,
          senderPartnerId,
        },
        ios_sound: 'beep.wav',
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
      };

      const osResp = await fetch(`${ONESIGNAL_BASE_URL}/notifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const osResult = await osResp.json();
      console.log(`[Push Server] OneSignal push sent for ${targetKey}:`, osResult);

      return res.json({
        success: true,
        dispatched: true,
        provider: 'OneSignal',
        result: osResult,
      });
    } catch (osErr: any) {
      console.error('[Push Server] OneSignal push error:', osErr);
      return res.status(500).json({ error: osErr.message || 'OneSignal dispatch error' });
    }
  }

  // 2. Diagnostic fallback when keys not yet provided
  console.log(
    `[Push Server] Notice: ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not configured. Notification recorded. Target device registered: ${Boolean(registeredTarget)}`
  );

  return res.json({
    success: true,
    dispatched: false,
    provider: 'local_fallback',
    message: 'Notification queued. Configure OneSignal in environment variables to deliver lock-screen pushes when the app is closed.',
    target: targetKey,
    hasToken: Boolean(registeredTarget?.pushToken),
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
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
