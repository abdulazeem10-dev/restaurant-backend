const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5500";
const app = require("../src/app");

test("health endpoint returns OK", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("unknown endpoint returns 404", async () => {
  const response = await request(app).get("/api/not-a-route");
  assert.equal(response.status, 404);
});
