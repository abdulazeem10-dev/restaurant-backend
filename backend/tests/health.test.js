const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { PLAN_TIERS, subscriptionPricePaise } = require("../src/utils/subscriptionPlans");

process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5500";
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

test("configured frontend preview origin passes CORS preflight", async () => {
  const origin = "https://restaurant-frontend-frontend-preview-abdulazeem31975-2509.vercel.app";
  const response = await request(app)
    .options("/api/health")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "GET");
  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], origin);
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
