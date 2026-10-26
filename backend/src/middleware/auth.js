const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Subscription = require("../models/Subscription");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const payload = jwt.verify(parts[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    const user = await User.findById(payload.sub);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Account unavailable" });
    }

    const isSubscriptionSelfService = req.path.startsWith("/owner/subscription") || req.path === "/me";
    if ((user.role === "restaurant" || user.role === "restaurant_staff") && !isSubscriptionSelfService) {
      const restaurant = user.role === "restaurant_staff" ? await Restaurant.findById(user.restaurantId).select("_id") : await Restaurant.findOne({ ownerId: user._id }).select("_id");
      const subscription = restaurant ? await Subscription.findOne({ restaurantId: restaurant._id }).sort({ currentPeriodEnd: -1 }).select("status currentPeriodEnd") : null;
      if (subscription && (subscription.status !== "active" || !subscription.currentPeriodEnd || subscription.currentPeriodEnd <= new Date())) return res.status(403).json({ error: "Restaurant subscription expired. Contact the platform administrator to renew access.", code: "subscription_expired" });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authenticate;
