const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5500";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/food-platform-test";
const app = require("../src/app");
// The smoke tests only exercise routing; bypass the database connect middleware
// so they remain deterministic and do not need a local MongoDB instance.
require("mongoose").connection.readyState = 1;

test("health endpoint returns OK", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("unknown endpoint returns 404", async () => {
  const response = await request(app).get("/api/not-a-route");
  assert.equal(response.status, 404);
});
