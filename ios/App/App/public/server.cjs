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
var import_vite = require("vite");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
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
        console.warn("RevenueCat attribute update warning:", attrErr);
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
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
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
