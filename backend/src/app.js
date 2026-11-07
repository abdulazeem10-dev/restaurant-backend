const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const authRoutes = require("./routes/authRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const errorHandler = require("./middleware/errorHandler");
const rejectMongoOperators = require("./middleware/rejectMongoOperators");
const connectDatabase = require("./config/database");
const { timingSafeEqual } = require("node:crypto");

const app = express();
app.disable("x-powered-by");
// Vercel forwards the original client IP through one trusted proxy hop.
app.set("trust proxy", 1);
app.use(helmet());

const configuredOrigins = (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500")
  .split(",").map(value => value.trim()).filter(Boolean);
// The Android WebView loads bundled frontend files from this secure local origin.
const allowedOrigins = [...new Set([...configuredOrigins, "https://restaurant-frontend-frontend.vercel.app", "https://appassets.androidplatform.net"])];

app.use(cors({
  origin(origin, callback) {
    const isDevelopmentPreview = process.env.NODE_ENV !== "production" && typeof origin === "string"
      && origin.startsWith("https://restaurant-frontend-frontend-") && origin.endsWith("-abdulazeem31975-2509.vercel.app");
    if (!origin || allowedOrigins.includes(origin) || isDevelopmentPreview) return callback(null, true);
    const error = new Error("Origin not allowed by CORS");
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Foodway-CSRF"]
}));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait before trying again." }
}));

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Keep expensive authentication endpoints below the general API budget.
// These run before the database connection middleware to avoid opening DB
// work for requests already over their limit.
app.post("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." }
}));
app.post("/api/auth/register", rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many account creation attempts. Please try again later." }
}));
app.post("/api/auth/google", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait 15 minutes and try again." }
}));
app.post("/api/auth/phone/otp/request", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code requests. Please wait 15 minutes and try again." }
}));
app.post("/api/auth/phone/otp/verify", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code attempts. Please wait 15 minutes and try again." }
}));
app.post("/api/auth/password-reset/request", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
}));
app.post("/api/auth/password-reset/confirm", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.json({
  limit: "100kb",
  verify(req, res, buffer) {
    // Keep an untouched copy only for the signed provider webhook. Copying
    // every parsed body doubles memory use on all API requests.
    if (req.originalUrl.split("?", 1)[0] === "/api/payments/webhook") {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));
app.use("/api", rejectMongoOperators);

// Cookie sessions are accepted only from configured first-party web origins.
// SameSite=Lax is an additional CSRF barrier; this Origin check protects
// state-changing requests even if a browser sends a cookie unexpectedly.
app.use("/api", (req, res, next) => {
  const requestOrigin = req.get("origin");
  req.isTrustedBrowserOrigin = Boolean(requestOrigin && allowedOrigins.includes(requestOrigin) && requestOrigin !== "https://appassets.androidplatform.net");
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const sessionCookieName = process.env.NODE_ENV === "production" ? "__Host-foodway_session" : "foodway_session";
  const csrfCookieName = process.env.NODE_ENV === "production" ? "__Host-foodway_csrf" : "foodway_csrf";
  const cookies = (req.headers.cookie || "").split(";").map(value => value.trim());
  const hasCookieSession = cookies.some(value => value.startsWith(`${sessionCookieName}=`));
  if (!unsafeMethod || !hasCookieSession) return next();
  const origin = req.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) return res.status(403).json({ error: "Request origin is not allowed" });
  const csrfCookie = cookies.find(value => value.startsWith(`${csrfCookieName}=`))?.slice(csrfCookieName.length + 1) || "";
  const csrfHeader = req.get("X-Foodway-CSRF") || "";
  const cookieBytes = Buffer.from(csrfCookie);
  const headerBytes = Buffer.from(csrfHeader);
  if (!cookieBytes.length || cookieBytes.length !== headerBytes.length || !timingSafeEqual(cookieBytes, headerBytes)) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }
  return next();
});

// Connect inside the request lifecycle as well as local server startup. This
// ensures Vercel requests do not query Mongoose before the database is ready.
app.use("/api", (req, res, next) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return next(new Error("JWT_SECRET must be at least 32 characters"));
  }
  connectDatabase().then(() => next(), next);
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

module.exports = app;
