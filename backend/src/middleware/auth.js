const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Subscription = require("../models/Subscription");

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-foodway_session" : "foodway_session";

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(entry.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");
    const bearerToken = parts.length === 2 && parts[0] === "Bearer" ? parts[1] : "";
    const cookieToken = readCookie(req, SESSION_COOKIE);
    // After migration, web browsers must use the HttpOnly cookie; bearer
    // tokens remain supported for the Android WebView and non-browser clients.
    if (process.env.NODE_ENV === "production" && req.isTrustedBrowserOrigin && bearerToken && !cookieToken) {
      return res.status(401).json({ error: "Please sign in again using the secure browser session" });
    }
    const token = cookieToken || bearerToken;
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    const user = await User.findById(payload.sub);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Account unavailable" });
    }

    const isSubscriptionSelfService = user.role === "restaurant" && req.path.startsWith("/owner/subscription")
      || user.role !== "delivery" && req.path === "/me";
    if ((user.role === "restaurant" || user.role === "restaurant_staff" || user.role === "delivery") && !isSubscriptionSelfService) {
      const restaurant = user.role === "restaurant" || user.role === "restaurant_staff" ? (user.role === "restaurant_staff" ? await Restaurant.findById(user.restaurantId).select("_id") : await Restaurant.findOne({ ownerId: user._id }).select("_id")) : await Restaurant.findById(user.restaurantId).select("_id status");
      const subscription = restaurant ? await Subscription.findOne({ restaurantId: restaurant._id }).sort({ currentPeriodEnd: -1 }).select("status currentPeriodEnd") : null;
      if (user.role === "delivery" && (!restaurant || restaurant.status !== "approved" || !subscription || subscription.status !== "active" || !subscription.currentPeriodEnd || subscription.currentPeriodEnd <= new Date())) return res.status(403).json({ error: "This restaurant delivery account is unavailable because the restaurant is inactive or its subscription has expired.", code: "subscription_expired" });
      if (!subscription || subscription.status !== "active" || !subscription.currentPeriodEnd || subscription.currentPeriodEnd <= new Date()) return res.status(403).json({ error: "Restaurant subscription is inactive or expired. The owner must choose a plan and complete payment to restore access.", code: "subscription_expired" });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authenticate;
