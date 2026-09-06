var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_cors = __toESM(require("cors"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use((0, import_cors.default)());
app.use(import_express.default.json());
var REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY || "sk_sAuopEcrYtQsWZWKjiSLEGzgNWlXy";
var REVENUECAT_BASE_URL = "https://api.revenuecat.com/v1";
app.get("/api/revenuecat/status", (req, res) => {
  const isConfigured = Boolean(REVENUECAT_SECRET_KEY && REVENUECAT_SECRET_KEY.startsWith("sk_"));
  res.json({
    status: "ok",
    configured: isConfigured,
    provider: "RevenueCat",
    secretKeyPrefix: isConfigured ? REVENUECAT_SECRET_KEY.substring(0, 7) + "..." : "none"
  });
});
app.get("/api/revenuecat/subscribers/:appUserId", async (req, res) => {
  const { appUserId } = req.params;
  try {
    const response = await fetch(`${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${REVENUECAT_SECRET_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "RevenueCat API error",
        details: errorText
      });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("RevenueCat fetch error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});
app.post("/api/revenuecat/subscribers/:appUserId/subscribe", async (req, res) => {
  const { appUserId } = req.params;
  const { plan = "monthly", entitlementId = "premium", trialDays } = req.body || {};
  try {
    const duration = plan === "annual" || plan === "yearly" ? "yearly" : "monthly";
    const url = `${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`;
    if (trialDays) {
      try {
        await fetch(`${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/attributes`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${REVENUECAT_SECRET_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            attributes: {
              trial_days: { value: String(trialDays) },
              trial_activated_at: { value: (/* @__PURE__ */ new Date()).toISOString() },
              store_platform: { value: "apple_app_store_and_google_play" }
            }
          })
        });
      } catch (attrErr) {
      }
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REVENUECAT_SECRET_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ duration })
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "RevenueCat API subscription failed",
        details: errorText
      });
    }
    const data = await response.json();
    return res.json({
      success: true,
      plan,
      duration,
      trialDays: trialDays || null,
      revenueCatResponse: data
    });
  } catch (error) {
    console.error("RevenueCat subscribe error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});
app.post("/api/revenuecat/subscribers/:appUserId/revoke", async (req, res) => {
  const { appUserId } = req.params;
  const { entitlementId = "premium" } = req.body || {};
  try {
    const url = `${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/revoke`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REVENUECAT_SECRET_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "RevenueCat API revoke failed",
        details: errorText
      });
    }
    const data = await response.json();
    return res.json({
      success: true,
      revenueCatResponse: data
    });
  } catch (error) {
    console.error("RevenueCat revoke error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});
var ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "6bbd3278-e98f-4ddc-bfe5-a417960d8aac";
var ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || "";
var ONESIGNAL_BASE_URL = "https://onesignal.com/api/v1";
var devicePushRegistry = /* @__PURE__ */ new Map();
app.get("/api/push/status", (req, res) => {
  const isOneSignalConfigured = Boolean(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
  res.json({
    status: "ok",
    provider: isOneSignalConfigured ? "OneSignal" : "None (Mock / Local)",
    configured: isOneSignalConfigured,
    registeredDevicesCount: devicePushRegistry.size
  });
});
app.post("/api/push/register-token", async (req, res) => {
  const { code, partnerId, pushToken, platform = "ios" } = req.body || {};
  if (!code || !partnerId || !pushToken) {
    return res.status(400).json({ error: "Missing code, partnerId or pushToken" });
  }
  const cleanCode = String(code).trim().toUpperCase();
  const regKey = `${cleanCode}_${partnerId}`;
  devicePushRegistry.set(regKey, {
    code: cleanCode,
    partnerId,
    pushToken,
    platform,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  console.log(`[Push Server] Registered push token for ${regKey} (${platform})`);
  if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
    try {
      const isIos = platform === "ios";
      const osResp = await fetch(`${ONESIGNAL_BASE_URL}/players`, {
        method: "POST",
        headers: {
          "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          device_type: isIos ? 0 : 1,
          // 0 = iOS, 1 = Android
          identifier: pushToken,
          external_user_id: regKey,
          language: "fr"
        })
      });
      const osData = await osResp.json();
      console.log(`[Push Server] OneSignal player sync result for ${regKey}:`, osData?.id || osData);
    } catch (osErr) {
      console.warn("[Push Server] OneSignal player registration notice:", osErr);
    }
  }
  return res.json({ success: true, key: regKey });
});
app.post("/api/push/send", async (req, res) => {
  const {
    code,
    senderPartnerId,
    targetPartnerId,
    title = "\u{1F496} LoveMap Duo",
    message = "Votre moiti\xE9 a partag\xE9 une nouvelle activit\xE9 !",
    spotId,
    type = "general"
  } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: "Missing couple code" });
  }
  const cleanCode = String(code).trim().toUpperCase();
  const resolvedTargetPartner = targetPartnerId || (senderPartnerId === "partner_a" ? "partner_b" : "partner_a");
  const targetKey = `${cleanCode}_${resolvedTargetPartner}`;
  const unhyphenatedKey = `${cleanCode.replace(/[^A-Z0-9]/g, "")}_${resolvedTargetPartner}`;
  const possibleTargetKeys = [targetKey, unhyphenatedKey];
  const registeredTarget = devicePushRegistry.get(targetKey);
  console.log(`[Push Server] Preparing push for ${targetKey}. Title: "${title}"`);
  if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
    try {
      const payload = {
        app_id: ONESIGNAL_APP_ID,
        target_channel: "push",
        include_aliases: { external_id: possibleTargetKeys },
        include_external_user_ids: possibleTargetKeys,
        headings: { en: title, fr: title },
        contents: { en: message, fr: message },
        data: { code: cleanCode, spotId, type, senderPartnerId },
        ios_sound: "beep.wav",
        ios_badgeType: "Increase",
        ios_badgeCount: 1,
        content_available: true,
        priority: 10
      };
      const osResp = await fetch(`${ONESIGNAL_BASE_URL}/notifications`, {
        method: "POST",
        headers: {
          "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const osResult = await osResp.json();
      const hasErrors = Array.isArray(osResult?.errors) && osResult.errors.length > 0;
      return res.json({
        success: true,
        dispatched: !hasErrors,
        provider: "OneSignal",
        result: osResult
      });
    } catch (osErr) {
      console.warn("[Push Server] OneSignal push dispatch notice:", osErr?.message || osErr);
      return res.status(200).json({ success: false, error: osErr.message || "OneSignal dispatch notice" });
    }
  }
  return res.json({
    success: true,
    dispatched: false,
    provider: "local_fallback",
    message: "Notification recorded. Real-time in-app stream active.",
    target: targetKey,
    hasToken: Boolean(registeredTarget?.pushToken)
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
