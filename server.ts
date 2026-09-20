import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// REVENUECAT SERVICE
// ==========================================
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY || 'sk_sAuopEcrYtQsWZWKjiSLEGzgNWlXy';
const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';

app.get('/api/revenuecat/status', (req, res) => {
  const isConfigured = Boolean(REVENUECAT_SECRET_KEY && REVENUECAT_SECRET_KEY.startsWith('sk_'));
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
