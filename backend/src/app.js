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
const connectDatabase = require("./config/database");

const app = express();
app.disable("x-powered-by");
// Vercel forwards the original client IP through one trusted proxy hop.
app.set("trust proxy", 1);
app.use(helmet());

const configuredOrigins = (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500")
  .split(",").map(value => value.trim()).filter(Boolean);
// The Android WebView loads bundled frontend files from this secure local origin.
const allowedOrigins = [...new Set([...configuredOrigins, "https://appassets.androidplatform.net"])];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait before trying again." }
}));

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
