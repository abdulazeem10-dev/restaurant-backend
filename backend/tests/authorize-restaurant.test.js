const test = require("node:test");
const assert = require("node:assert/strict");
const authorizeRestaurant = require("../src/middleware/authorizeRestaurant");

function allowedFor(role, permission) {
  let allowed = false;
  let statusCode = 200;
  const response = {
    status(code) { statusCode = code; return this; },
    json() { return this; }
  };
  authorizeRestaurant(permission)({ user: role ? { role: "restaurant_staff", restaurantStaffRole: role } : null }, response, () => { allowed = true; });
  return { allowed, statusCode };
}

test("viewer can read all restaurant data, including inventory, but cannot change it", () => {
  for (const permission of ["read", "inventory_read"]) assert.equal(allowedFor("viewer", permission).allowed, true, permission);
  for (const permission of ["menu", "inventory", "orders", "settings", "accounts"]) {
    assert.equal(allowedFor("viewer", permission).statusCode, 403, permission);
  }
});

test("biller can operate restaurant features but cannot manage staff or delivery accounts", () => {
  for (const permission of ["read", "menu", "inventory_read", "inventory", "orders", "settings"]) {
    assert.equal(allowedFor("biller_modifier", permission).allowed, true, permission);
  }
  assert.equal(allowedFor("biller_modifier", "accounts").statusCode, 403);
});

test("secondary admin can use all restaurant capabilities, including account management", () => {
  for (const permission of ["read", "menu", "inventory_read", "inventory", "orders", "settings", "accounts"]) {
    assert.equal(allowedFor("secondary_admin", permission).allowed, true, permission);
  }
});

test("restaurant owner remains authorized for restaurant capabilities", () => {
  let allowed = false;
  authorizeRestaurant("accounts")({ user: { role: "restaurant" } }, { status() { return this; }, json() { return this; } }, () => { allowed = true; });
  assert.equal(allowed, true);
});
