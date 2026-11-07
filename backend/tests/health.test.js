const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const { PLAN_TIERS, subscriptionPricePaise } = require("../src/utils/subscriptionPlans");

process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5500";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/food-platform-test";
const app = require("../src/app");
// The smoke tests only exercise routing; bypass the database connect middleware
// so they remain deterministic and do not need a local MongoDB instance.
const databaseCache = globalThis.__foodPlatformMongo;
databaseCache.promise = Promise.resolve();
databaseCache.indexPromise = Promise.resolve();

test("health endpoint returns OK", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("unknown endpoint returns 404", async () => {
  const response = await request(app).get("/api/not-a-route");
  assert.equal(response.status, 404);
});

test("API responses include security headers", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("development frontend preview origin passes CORS preflight", async () => {
  const origin = "https://restaurant-frontend-frontend-preview-abdulazeem31975-2509.vercel.app";
  const response = await request(app)
    .options("/api/health")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "GET");
  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], origin);
});

test("cookie-authenticated state changes reject an untrusted origin", async () => {
  const response = await request(app)
    .post("/api/auth/logout")
    .set("Cookie", "foodway_session=placeholder")
    .set("Origin", "https://attacker.example");
  assert.equal(response.status, 403);
  assert.match(response.body.error, /origin/i);
});

test("cookie-authenticated state changes require the CSRF cookie and header", async () => {
  const response = await request(app)
    .post("/api/auth/logout")
    .set("Cookie", "foodway_session=placeholder; foodway_csrf=abc123")
    .set("Origin", "http://127.0.0.1:5500");
  assert.equal(response.status, 403);
  assert.match(response.body.error, /CSRF/i);
});

test("logout clears the HttpOnly session cookie for the configured site", async () => {
  const response = await request(app)
    .post("/api/auth/logout")
    .set("Cookie", "foodway_session=placeholder; foodway_csrf=abc123")
    .set("X-Foodway-CSRF", "abc123")
    .set("Origin", "http://127.0.0.1:5500");
  assert.equal(response.status, 204);
  assert.match(response.headers["set-cookie"][0], /foodway_session=;/);
  assert.match(response.headers["set-cookie"][0], /HttpOnly/i);
});

test("protected account endpoint rejects a missing token", async () => {
  const response = await request(app).get("/api/auth/me");
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Authentication required");
});

test("login rejects malformed credentials before querying the database", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "not-an-email", password: "" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid login details");
});

test("browser login returns an HttpOnly cookie without exposing a bearer token", async () => {
  const originalFindOne = User.findOne;
  const user = {
    _id: "507f1f77bcf86cd799439011",
    name: "Test Customer",
    email: "customer@example.test",
    phone: "+919876543210",
    role: "customer",
    status: "active",
    passwordHash: await bcrypt.hash("correct-test-password", 4)
  };
  User.findOne = () => ({ select: async () => user });
  try {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://restaurant-frontend-frontend.vercel.app")
      .send({ email: user.email, password: "correct-test-password" });
    assert.equal(response.status, 200);
    assert.equal(response.body.accessToken, undefined);
    assert.equal(response.body.user.email, user.email);
    assert.match(response.headers["set-cookie"][0], /(?:__Host-)?foodway_session=/);
    assert.match(response.headers["set-cookie"][0], /HttpOnly/i);
    assert.match(response.headers["set-cookie"][0], /SameSite=Lax/i);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("protected account endpoint accepts the HttpOnly session cookie", async () => {
  const originalFindById = User.findById;
  const user = {
    _id: "507f1f77bcf86cd799439011",
    name: "Cookie Customer",
    email: "cookie@example.test",
    phone: "+919876543210",
    role: "customer",
    status: "active"
  };
  User.findById = async () => user;
  try {
    const token = jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "5m" });
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `foodway_session=${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, user.email);
  } finally {
    User.findById = originalFindById;
  }
});

test("production browser requests cannot authenticate with a bearer token", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Origin", "https://restaurant-frontend-frontend.vercel.app")
      .set("Authorization", "Bearer legacy-browser-token");
    assert.equal(response.status, 401);
    assert.match(response.body.error, /secure browser session/i);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("request bodies cannot contain MongoDB operators", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ name: "Example", email: "example@example.com", password: "a-long-test-password", $where: "true" });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /unsupported field names/i);
});

test("subscription prices and account limits match the published plans", () => {
  assert.deepEqual(
    ["bronze", "silver", "gold"].map(tier => [1, 2, 3].map(years => subscriptionPricePaise(tier, years))),
    [[500000, 600000, 700000], [600000, 700000, 800000], [700000, 800000, 900000]]
  );
  assert.deepEqual(
    [PLAN_TIERS.bronze.maxAccounts, PLAN_TIERS.silver.maxAccounts, PLAN_TIERS.gold.maxAccounts],
    [5, 7, 9]
  );
});
