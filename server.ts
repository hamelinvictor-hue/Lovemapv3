import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// CORS headers for Capacitor mobile apps and external webviews
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
// COUPLE DUO SYNC & STORAGE SERVICE
// (High-Availability Engine: Memory + Disk + Firestore Mirror)
// ==========================================

interface StoredCoupleRecord {
  code: string;
  partnerA: any;
  partnerB: any;
  anniversaryDate?: string;
  secretPin?: string;
  isPinLocked?: boolean;
  ownerUid?: string;
  ownerEmail?: string;
  partnerAUid?: string;
  partnerAEmail?: string;
  partnerBUid?: string;
  partnerBEmail?: string;
  memberUids?: string[];
  isCodeUsed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  spots?: any[];
  notifications?: any[];
}

const COUPLES_DIR = path.join(process.cwd(), 'data');
const COUPLES_FILE = path.join(COUPLES_DIR, 'couples_store.json');
const couplesStore = new Map<string, StoredCoupleRecord>();

function initCouplesStore() {
  try {
    if (!fs.existsSync(COUPLES_DIR)) {
      fs.mkdirSync(COUPLES_DIR, { recursive: true });
    }
    if (fs.existsSync(COUPLES_FILE)) {
      const raw = fs.readFileSync(COUPLES_FILE, 'utf8');
      const parsed: Record<string, StoredCoupleRecord> = JSON.parse(raw);
      for (const [key, val] of Object.entries(parsed)) {
        couplesStore.set(key.toUpperCase(), val);
      }
      console.log(`[Couples Store] Loaded ${couplesStore.size} couple rooms from disk.`);
    }
  } catch (err) {
    console.warn('[Couples Store] Initialization notice:', err);
  }
}

function persistCouplesStore() {
  try {
    if (!fs.existsSync(COUPLES_DIR)) {
      fs.mkdirSync(COUPLES_DIR, { recursive: true });
    }
    const obj: Record<string, StoredCoupleRecord> = {};
    for (const [k, v] of couplesStore.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(COUPLES_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Couples Store] Persistence error:', err);
  }
}

initCouplesStore();

// Normalize a couple code for fuzzy matching
function normalizeCode(code: string): string {
  return String(code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function decodeFirestoreRestDocFields(docData: any): any {
  if (!docData || !docData.fields) return null;
  const decodeVal = (v: any): any => {
    if (!v) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
    if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.nullValue !== undefined) return null;
    if (v.mapValue !== undefined) {
      const res: Record<string, any> = {};
      for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
        res[k] = decodeVal(val);
      }
      return res;
    }
    if (v.arrayValue !== undefined) {
      return (v.arrayValue.values || []).map(decodeVal);
    }
    return null;
  };

  const res: Record<string, any> = {
    id: (docData.name || '').split('/').pop(),
  };
  for (const [k, val] of Object.entries(docData.fields || {})) {
    res[k] = decodeVal(val);
  }
  return res;
}

function findCoupleByCode(code: string): StoredCoupleRecord | null {
  if (!code) return null;
  const cleanUpper = code.trim().toUpperCase();
  if (couplesStore.has(cleanUpper)) {
    return couplesStore.get(cleanUpper)!;
  }
  const normInput = normalizeCode(cleanUpper);
  const inputCore = normInput.startsWith('LM') ? normInput.substring(2) : normInput;

  for (const [key, couple] of couplesStore.entries()) {
    const normKey = normalizeCode(key);
    const normDataCode = normalizeCode(couple.code || '');
    const keyCore = normKey.startsWith('LM') ? normKey.substring(2) : normKey;
    const dataCore = normDataCode.startsWith('LM') ? normDataCode.substring(2) : normDataCode;

    if (
      normKey === normInput ||
      normDataCode === normInput ||
      (inputCore.length >= 6 && (keyCore === inputCore || dataCore === inputCore))
    ) {
      return couple;
    }
  }
  return null;
}

// Resilient couple lookup: in-memory first, then Firestore REST fallback
async function getOrFetchCouple(code: string): Promise<StoredCoupleRecord | null> {
  const local = findCoupleByCode(code);
  if (local) return local;

  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const dbId = cfg.firestoreDatabaseId || '(default)';

    const candidates = new Set<string>();
    const clean = code.trim().toUpperCase();
    candidates.add(clean);
    const norm = normalizeCode(clean);
    const core = norm.startsWith('LM') ? norm.substring(2) : norm;
    if (core.length === 8) {
      candidates.add(`LM-${core.substring(0, 4)}-${core.substring(4, 8)}`);
      candidates.add(`${core.substring(0, 4)}-${core.substring(4, 8)}`);
    }

    for (const cand of candidates) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents/couples/${encodeURIComponent(cand)}?key=${cfg.apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const docData = await res.json();
          const decoded = decodeFirestoreRestDocFields(docData);
          if (decoded && decoded.code && decoded.code !== 'LOVE-NEW') {
            couplesStore.set(decoded.code.toUpperCase(), decoded as StoredCoupleRecord);
            persistCouplesStore();
            return decoded as StoredCoupleRecord;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[Couples Store] Firestore fetch error for code:', code, err);
  }

  return null;
}

// Background Firestore Mirror (writes work with 200 OK even when reads are quota-limited)
async function mirrorToFirestore(pathDoc: string, data: Record<string, any>) {
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const dbId = cfg.firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents/${pathDoc}?key=${cfg.apiKey}`;

    const encodeVal = (val: any): any => {
      if (val === null || val === undefined) return { nullValue: null };
      if (typeof val === 'boolean') return { booleanValue: val };
      if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
      if (typeof val === 'string') return { stringValue: val };
      if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeVal) } };
      if (typeof val === 'object') {
        const fields: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          if (v !== undefined) fields[k] = encodeVal(v);
        }
        return { mapValue: { fields } };
      }
      return { stringValue: String(val) };
    };

    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) fields[k] = encodeVal(v);
    }

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }).catch(() => {});
  } catch {
    // Non-blocking mirror
  }
}

// GET /api/couples/:code
app.get('/api/couples/:code', async (req, res) => {
  const { code } = req.params;
  const couple = await getOrFetchCouple(code);
  if (!couple) {
    return res.status(404).json({ error: 'Couple room not found' });
  }
  return res.json({ success: true, couple });
});

// POST /api/couples/:code (Create or save couple)
app.post('/api/couples/:code', async (req, res) => {
  const { code } = req.params;
  const body = req.body || {};
  const cleanCode = String(body.code || code).trim().toUpperCase();

  const existing = (await getOrFetchCouple(cleanCode)) || {} as any;
  const record: StoredCoupleRecord = {
    ...existing,
    ...body,
    code: cleanCode,
    updatedAt: new Date().toISOString(),
  };

  couplesStore.set(cleanCode, record);
  persistCouplesStore();
  mirrorToFirestore(`couples/${cleanCode}`, record);

  return res.json({ success: true, couple: record });
});

// POST /api/couples/:code/join (Partner B joining with code)
app.post('/api/couples/:code/join', async (req, res) => {
  const { code } = req.params;
  const { partnerName = 'Partenaire 2', avatarUrl, userUid, userEmail } = req.body || {};

  console.log(`[Couples Store] Join requested for code: "${code}" by "${partnerName}" (${userUid})`);

  let couple = await getOrFetchCouple(code);
  if (!couple) {
    // Check if maybe there's a couple stored in another casing or format
    console.warn(`[Couples Store] Code not found in memory store or Firestore REST. Registered codes:`, Array.from(couplesStore.keys()));
    return res.status(404).json({
      error: `Code de couple "${code}" introuvable. Vérifiez que votre partenaire a bien partagé ce code.`
    });
  }

  const existingMembers = couple.memberUids || [];
  const updatedMembers = userUid ? Array.from(new Set([...existingMembers, userUid])) : existingMembers;

  const partnerB = {
    id: 'partner_b',
    name: partnerName.trim() || 'Partenaire 2',
    avatar: avatarUrl || 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    role: 'Partenaire 2',
  };

  couple.partnerB = partnerB;
  couple.partnerBUid = userUid || couple.partnerBUid || '';
  couple.partnerBEmail = userEmail || couple.partnerBEmail || '';
  couple.memberUids = updatedMembers;
  couple.isCodeUsed = true;
  couple.updatedAt = new Date().toISOString();

  couplesStore.set(couple.code.toUpperCase(), couple);
  persistCouplesStore();

  mirrorToFirestore(`couples/${couple.code.toUpperCase()}`, {
    partnerB,
    partnerBUid: couple.partnerBUid,
    partnerBEmail: couple.partnerBEmail,
    memberUids: updatedMembers,
    isCodeUsed: true,
    updatedAt: couple.updatedAt,
  });

  console.log(`[Couples Store] Successfully joined couple: ${couple.code} as Partner B!`);
  return res.json({ success: true, couple });
});

// GET /api/couples/:code/spots
app.get('/api/couples/:code/spots', async (req, res) => {
  const { code } = req.params;
  const couple = await getOrFetchCouple(code);
  return res.json({ success: true, spots: couple?.spots || [] });
});

// POST /api/couples/:code/spots (Add or update spot)
app.post('/api/couples/:code/spots', async (req, res) => {
  const { code } = req.params;
  const spot = req.body || {};
  if (!spot.id) return res.status(400).json({ error: 'Missing spot id' });

  const couple = await getOrFetchCouple(code);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  couple.spots = couple.spots || [];
  const idx = couple.spots.findIndex((s: any) => s.id === spot.id);
  if (idx >= 0) {
    couple.spots[idx] = { ...couple.spots[idx], ...spot, updatedAt: new Date().toISOString() };
  } else {
    couple.spots.push({ ...spot, updatedAt: new Date().toISOString() });
  }

  couplesStore.set(couple.code.toUpperCase(), couple);
  persistCouplesStore();
  mirrorToFirestore(`couples/${couple.code.toUpperCase()}/spots/${spot.id}`, spot);

  return res.json({ success: true, spots: couple.spots });
});

// DELETE /api/couples/:code/spots/:spotId
app.delete('/api/couples/:code/spots/:spotId', async (req, res) => {
  const { code, spotId } = req.params;
  const couple = await getOrFetchCouple(code);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  couple.spots = (couple.spots || []).filter((s: any) => s.id !== spotId);
  couplesStore.set(couple.code.toUpperCase(), couple);
  persistCouplesStore();

  return res.json({ success: true, spots: couple.spots });
});

// GET /api/couples/:code/notifications
app.get('/api/couples/:code/notifications', async (req, res) => {
  const { code } = req.params;
  const couple = await getOrFetchCouple(code);
  return res.json({ success: true, notifications: couple?.notifications || [] });
});

// POST /api/couples/:code/notifications
app.post('/api/couples/:code/notifications', async (req, res) => {
  const { code } = req.params;
  const notif = req.body || {};
  if (!notif.id) return res.status(400).json({ error: 'Missing notification id' });

  const couple = await getOrFetchCouple(code);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  couple.notifications = couple.notifications || [];
  couple.notifications.unshift({ ...notif, createdAt: new Date().toISOString() });
  if (couple.notifications.length > 50) {
    couple.notifications = couple.notifications.slice(0, 50);
  }

  couplesStore.set(couple.code.toUpperCase(), couple);
  persistCouplesStore();

  return res.json({ success: true, notifications: couple.notifications });
});

// GET /api/couples/find-user/:uid
app.get('/api/couples/find-user/:uid', (req, res) => {
  const { uid } = req.params;
  const { email } = req.query as { email?: string };

  for (const couple of couplesStore.values()) {
    const isMember = couple.memberUids?.includes(uid);
    const isOwner = couple.ownerUid === uid || (email && couple.ownerEmail === email);
    const isPartnerA = couple.partnerAUid === uid || (email && couple.partnerAEmail === email);
    const isPartnerB = couple.partnerBUid === uid || (email && couple.partnerBEmail === email);

    if (isMember || isOwner || isPartnerA || isPartnerB) {
      const partnerId = isPartnerB ? 'partner_b' : 'partner_a';
      return res.json({ success: true, couple, partnerId });
    }
  }
  return res.status(404).json({ error: 'No couple found for user' });
});

// ==========================================
// PUSH NOTIFICATIONS SERVICE (OneSignal / APNs)
// ==========================================

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '6bbd3278-e98f-4ddc-bfe5-a417960d8aac';
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
        include_external_user_ids: [targetKey],
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
        content_available: true,
        priority: 10,
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
