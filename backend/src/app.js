const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const authRoutes = require("./routes/authRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const adminRoutes = require("./routes/adminRoutes");
const errorHandler = require("./middleware/errorHandler");
const connectDatabase = require("./config/database");

const app = express();
app.disable("x-powered-by");
// Vercel forwards the original client IP through one trusted proxy hop.
app.set("trust proxy", 1);
app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500")
  .split(",").map(value => value.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({
  limit: "100kb",
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
}));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
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

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

module.exports = app;
