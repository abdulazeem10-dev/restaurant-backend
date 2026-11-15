const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const Restaurant = require("../src/models/Restaurant");
const MenuItem = require("../src/models/MenuItem");
const CustomerCart = require("../src/models/CustomerCart");
const Order = require("../src/models/Order");

process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5500";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/food-platform-test";

const databaseCache = globalThis.__foodPlatformMongo || (globalThis.__foodPlatformMongo = { promise: null, indexPromise: null });
databaseCache.promise = Promise.resolve();
databaseCache.indexPromise = Promise.resolve();
const app = require("../src/app");

const customerId = "507f1f77bcf86cd799439011";
const restaurantId = "607f1f77bcf86cd799439012";
const menuItemId = "707f1f77bcf86cd799439013";
const deliveryPartnerId = "807f1f77bcf86cd799439014";
const csrfToken = "test-csrf-token";
const kitchenNote = "Extra spicy; no green chilli";

const originals = {
  userFindById: User.findById,
  userFind: User.find,
  restaurantFindById: Restaurant.findById,
  restaurantFindOne: Restaurant.findOne,
  menuItemFind: MenuItem.find,
  customerCartFindOneAndUpdate: CustomerCart.findOneAndUpdate,
  customerCartDeleteOne: CustomerCart.deleteOne,
  orderFindOne: Order.findOne,
  orderAggregate: Order.aggregate,
  orderCreate: Order.create
};

function withSession(method, path) {
  const token = jwt.sign({ sub: customerId }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m"
  });
  return request(app)[method](path)
    .set("Origin", process.env.FRONTEND_ORIGIN)
    .set("Cookie", `foodway_session=${token}; foodway_csrf=${csrfToken}`)
    .set("X-Foodway-CSRF", csrfToken);
}

function mockActiveCustomer() {
  User.findById = async () => ({
    _id: customerId,
    role: "customer",
    status: "active",
    tokenVersion: 0
  });
}

function restoreModels() {
  User.findById = originals.userFindById;
  User.find = originals.userFind;
  Restaurant.findById = originals.restaurantFindById;
  Restaurant.findOne = originals.restaurantFindOne;
  MenuItem.find = originals.menuItemFind;
  CustomerCart.findOneAndUpdate = originals.customerCartFindOneAndUpdate;
  CustomerCart.deleteOne = originals.customerCartDeleteOne;
  Order.findOne = originals.orderFindOne;
  Order.aggregate = originals.orderAggregate;
  Order.create = originals.orderCreate;
}

test("customer cart saves a trimmed kitchen note and rejects notes over 300 characters", async () => {
  mockActiveCustomer();
  Restaurant.findById = () => ({
    select() { return this; },
    lean: async () => ({ _id: restaurantId, status: "approved" })
  });
  MenuItem.find = () => ({
    select() { return this; },
    lean: async () => [{ _id: menuItemId, name: "Chicken Fried Rice", pricePaise: 18000 }]
  });
  let storedCart;
  CustomerCart.findOneAndUpdate = (_query, update) => ({
    lean: async () => (storedCart = {
      restaurantId,
      items: update.$set.items
    })
  });

  try {
    const response = await withSession("put", "/api/customer/cart").send({
      restaurantId,
      items: [{ menuItemId, quantity: 1, note: `  ${kitchenNote}  ` }]
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.cart.items[0].note, kitchenNote);
    assert.equal(storedCart.items[0].note, kitchenNote);

    const tooLong = await withSession("put", "/api/customer/cart").send({
      restaurantId,
      items: [{ menuItemId, quantity: 1, note: "x".repeat(301) }]
    });
    assert.equal(tooLong.status, 400);
  } finally {
    restoreModels();
  }
});

test("placing an order carries the kitchen note from checkout into the order item", async () => {
  mockActiveCustomer();
  const restaurant = {
    _id: restaurantId,
    name: "Al-Madina",
    status: "approved",
    isOpen: true,
    deliveryPincodes: [],
    deliveryAreas: [],
    prepTimeMinutes: 30,
    deliveryTimeMinutes: 30
  };
  const menuItem = {
    _id: menuItemId,
    restaurantId,
    name: "Chicken Fried Rice",
    pricePaise: 18000,
    available: true,
    stockTracked: false
  };
  Restaurant.findOne = async () => restaurant;
  MenuItem.find = query => {
    if (query.available) return Promise.resolve([menuItem]);
    return {
      select() { return this; },
      lean: async () => [menuItem]
    };
  };
  User.find = () => ({
    select() { return this; },
    lean: async () => [{ _id: deliveryPartnerId }]
  });
  Order.findOne = () => ({ select: async () => null });
  Order.aggregate = async () => [];
  CustomerCart.deleteOne = async () => ({ deletedCount: 1 });
  let createdOrder;
  Order.create = async data => (createdOrder = { _id: "907f1f77bcf86cd799439015", ...data });

  try {
    const response = await withSession("post", "/api/orders")
      .set("Idempotency-Key", "c4b3ce40-39da-4eaa-9bd0-fd0d7466c1fa")
      .send({
        restaurantId,
        deliveryAddress: "Flat 1, Cheeta Camp, Mumbai 400088",
        deliveryDetails: {
          recipientType: "self",
          name: "Test Customer",
          phone: "9876543210",
          flatBuilding: "Flat 1",
          lane: "Cheeta Camp",
          landmark: "",
          pincode: "400088"
        },
        paymentMethod: "cash_on_delivery",
        items: [{ menuItemId, quantity: 1, note: kitchenNote }]
      });

    assert.equal(response.status, 201);
    assert.equal(createdOrder.items[0].note, kitchenNote);
    assert.equal(response.body.order.items[0].note, kitchenNote);
  } finally {
    restoreModels();
  }
});
