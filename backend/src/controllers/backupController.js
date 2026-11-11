const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const MenuItem = require("../models/MenuItem");
const GroceryStock = require("../models/GroceryStock");
const Order = require("../models/Order");
const Review = require("../models/Review");
const AggregatorSale = require("../models/AggregatorSale");
const Subscription = require("../models/Subscription");
const SubscriptionPayment = require("../models/SubscriptionPayment");
const Delivery = require("../models/Delivery");
const Notification = require("../models/Notification");
const Payment = require("../models/Payment");
const CustomerCart = require("../models/CustomerCart");

function paymentSummary(rows, key) {
  return rows.map(row => ({
    [key]: row[key], provider: row.provider, amountPaise: row.amountPaise,
    status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt
  }));
}

function sendBackup(res, scope, data) {
  const date = new Date().toISOString().slice(0, 10);
  res.set({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="almadina-${scope}-backup-${date}.json"`,
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff"
  });
  return res.json({ formatVersion: 1, scope, generatedAt: new Date().toISOString(), sensitiveDataNotice: "Contains business records and may include customer contact or delivery information. Store securely.", data });
}

async function downloadPlatformBackup(_req, res) {
  const [restaurants, users, menuItems, groceryStock, orders, reviews, aggregatorSales, subscriptions, subscriptionPayments, deliveries, notifications, payments, carts] = await Promise.all([
    Restaurant.find().lean(),
    User.find().select("-passwordHash -googleSub -passwordResetTokenHash -passwordResetExpires").lean(),
    MenuItem.find().lean(), GroceryStock.find().lean(), Order.find().lean(), Review.find().lean(), AggregatorSale.find().lean(),
    Subscription.find().select("restaurantId planId planTier seatRevision termYears status currentPeriodStart currentPeriodEnd renewalRequest cancelAtPeriodEnd createdAt updatedAt").lean(),
    SubscriptionPayment.find().select("restaurantId planTier amountPaise termYears status subscriptionEndsAt createdAt updatedAt").lean(),
    Delivery.find().lean(), Notification.find().lean(), Payment.find().select("orderId provider amountPaise status createdAt updatedAt").lean(), CustomerCart.find().lean()
  ]);
  return sendBackup(res, "platform", {
    restaurants, users, menuItems, groceryStock, orders, reviews, aggregatorSales, subscriptions, subscriptionPayments,
    deliveries, notifications, payments, customerCarts: carts
  });
}

async function downloadRestaurantBackup(req, res) {
  const restaurantId = req.user.role === "restaurant_staff" ? req.user.restaurantId : (await Restaurant.findOne({ ownerId: req.user._id }).select("_id").lean())?._id;
  if (!restaurantId) return res.status(404).json({ error: "Restaurant account not found" });
  const [restaurant, menuItems, groceryStock, orders, reviews, aggregatorSales, subscriptions, subscriptionPayments, notifications, carts] = await Promise.all([
    Restaurant.findById(restaurantId).select("ownerId name description address imageUrl foodType cuisine openingHours deliveryPincodes deliveryAreas prepTimeMinutes deliveryTimeMinutes dineInTableCount isOpen status createdAt updatedAt").lean(),
    MenuItem.find({ restaurantId }).lean(), GroceryStock.find({ restaurantId }).lean(), Order.find({ restaurantId }).lean(),
    Review.find({ restaurantId }).lean(), AggregatorSale.find({ restaurantId }).lean(),
    Subscription.find({ restaurantId }).select("restaurantId planId planTier seatRevision termYears status currentPeriodStart currentPeriodEnd renewalRequest cancelAtPeriodEnd createdAt updatedAt").lean(),
    SubscriptionPayment.find({ restaurantId }).select("restaurantId planTier amountPaise termYears status subscriptionEndsAt createdAt updatedAt").lean(),
    Notification.find({ restaurantId }).lean(), CustomerCart.find({ restaurantId }).lean()
  ]);
  if (!restaurant) return res.status(404).json({ error: "Restaurant account not found" });
  const orderIds = orders.map(order => order._id);
  const [deliveries, payments, accounts] = await Promise.all([
    Delivery.find({ orderId: { $in: orderIds } }).lean(),
    Payment.find({ orderId: { $in: orderIds } }).select("orderId provider amountPaise status createdAt updatedAt").lean(),
    User.find({ $or: [{ _id: restaurant.ownerId }, { restaurantId, role: { $in: ["restaurant_staff", "delivery"] } }] })
      .select("name email phone role restaurantId restaurantStaffRole status createdAt updatedAt")
      .lean()
  ]);
  return sendBackup(res, "restaurant", {
    restaurant, accounts, menuItems, groceryStock, orders, reviews, aggregatorSales, subscriptions, subscriptionPayments,
    deliveries, notifications, customerCarts: carts, payments: paymentSummary(payments, "orderId")
  });
}

module.exports = { downloadPlatformBackup, downloadRestaurantBackup };
