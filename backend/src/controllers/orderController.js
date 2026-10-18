const { z } = require("zod");
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const Review = require("../models/Review");
const User = require("../models/User");
const { isWithinOpeningHours } = require("../utils/openingHours");

const createSchema = z.object({
  restaurantId: z.string().regex(/^[a-f\d]{24}$/i),
  deliveryAddress: z.string().trim().min(8).max(500),
  deliveryDetails: z.object({
    recipientType: z.enum(["self", "other"]),
    name: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^\d{10}$/),
    flatBuilding: z.string().trim().min(1).max(120),
    lane: z.string().trim().min(1).max(180),
    landmark: z.string().trim().max(120).optional().default(""),
    pincode: z.string().regex(/^\d{6}$/)
  }).strict(),
  paymentMethod: z.enum(["cash_on_delivery", "online", "upi_qr", "razorpay"]).default("cash_on_delivery"),
  items: z.array(z.object({
    menuItemId: z.string().regex(/^[a-f\d]{24}$/i),
    quantity: z.number().int().min(1).max(20)
  }).strict()).min(1).max(50)
}).strict();

async function createOrder(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid order details" });

  const restaurant = await Restaurant.findOne({ _id: parsed.data.restaurantId, status: "approved" });
  if (!restaurant) return res.status(404).json({ error: "Restaurant is not accepting orders" });
  if (!restaurant.isOpen) return res.status(409).json({ error: "This restaurant is currently closed" });
  if (!isWithinOpeningHours(restaurant.openingHours)) return res.status(409).json({ error: "This restaurant is outside its listed opening hours" });
  if (restaurant.deliveryPincodes?.length && !restaurant.deliveryPincodes.includes(parsed.data.deliveryDetails.pincode)) {
    return res.status(400).json({ error: "This restaurant does not deliver to that PIN code" });
  }

  const ids = [...new Set(parsed.data.items.map(item => item.menuItemId))];
  const menuItems = await MenuItem.find({ _id: { $in: ids }, restaurantId: restaurant._id, available: true });
  if (menuItems.length !== ids.length) return res.status(400).json({ error: "One or more items are unavailable" });

  const byId = new Map(menuItems.map(item => [String(item._id), item]));
  let subtotalPaise = 0;
  const items = parsed.data.items.map(line => {
    const menuItem = byId.get(line.menuItemId);
    subtotalPaise += menuItem.pricePaise * line.quantity;
    return { menuItemId: menuItem._id, name: menuItem.name, unitPricePaise: menuItem.pricePaise, quantity: line.quantity };
  });
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 1) return res.status(400).json({ error: "Invalid order total" });

  const deliveryPartner = await findLeastBusyDeliveryPartner();
  if (!deliveryPartner) return res.status(503).json({ error: "Orders are temporarily unavailable because no delivery person is active. Please try again later." });

  const order = await Order.create({
    customerId: req.user._id,
    restaurantId: restaurant._id,
    deliveryAddress: parsed.data.deliveryAddress,
    deliveryDetails: parsed.data.deliveryDetails,
    deliveryPartnerId: deliveryPartner._id,
    paymentMethod: parsed.data.paymentMethod,
    items,
    subtotalPaise,
    deliveryFeePaise: 0,
    taxPaise: 0,
    totalPaise: subtotalPaise,
    status: "placed",
    statusHistory: [{ status: "placed", at: new Date() }]
  });
  return res.status(201).json({ order, deliveryAssigned: true });
}

async function findLeastBusyDeliveryPartner() {
  const partners = await User.find({ role: "delivery", status: "active" }).select("_id").lean();
  if (!partners.length) return null;
  const activeCounts = await Order.aggregate([
    { $match: { deliveryPartnerId: { $in: partners.map(partner => partner._id) }, status: { $nin: ["delivered", "cancelled", "awaiting_payment"] } } },
    { $group: { _id: "$deliveryPartnerId", count: { $sum: 1 } } }
  ]);
  const countByPartner = new Map(activeCounts.map(row => [String(row._id), row.count]));
  partners.sort((a, b) => (countByPartner.get(String(a._id)) || 0) - (countByPartner.get(String(b._id)) || 0));
  const minimum = countByPartner.get(String(partners[0]._id)) || 0;
  const leastBusy = partners.filter(partner => (countByPartner.get(String(partner._id)) || 0) === minimum);
  return leastBusy[Math.floor(Math.random() * leastBusy.length)];
}

async function listMyOrders(req, res) {
  const orders = await Order.find({ customerId: req.user._id }).populate("restaurantId", "name address").populate("deliveryPartnerId", "name phone").sort({ createdAt: -1 }).limit(100);
  const reviews = await Review.find({ customerId: req.user._id, orderId: { $in: orders.map(order => order._id) } }).select("orderId rating");
  const reviewByOrder = new Map(reviews.map(review => [String(review.orderId), review]));
  return res.json({ orders: orders.map(order => ({ ...order.toObject(), review: reviewByOrder.get(String(order._id)) || null })) });
}

async function listRestaurantOrders(req, res) {
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const orders = await Order.find({ restaurantId: restaurant._id, status: { $ne: "awaiting_payment" } }).populate("customerId", "name email").populate("deliveryPartnerId", "name phone").sort({ createdAt: -1 }).limit(100);
  return res.json({ orders });
}

async function updateRestaurantOrder(req, res) {
  const validStatuses = ["confirmed", "preparing", "ready", "cancelled"];
  if (!validStatuses.includes(req.body?.status)) return res.status(400).json({ error: "Invalid order status" });
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const order = await Order.findOne({ _id: req.params.id, restaurantId: restaurant._id });
  if (!order) return res.status(404).json({ error: "Order not found" });

  const allowed = {
    placed: ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: [], cancelled: []
  };
  if (!allowed[order.status]?.includes(req.body.status)) {
    return res.status(409).json({ error: `Cannot move order from ${order.status} to ${req.body.status}` });
  }
  order.status = req.body.status;
  order.statusHistory.push({ status: req.body.status, at: new Date() });
  await order.save();
  return res.json({ order });
}

async function listDeliveryOrders(req, res) {
  const orders = await Order.find({ deliveryPartnerId: req.user._id, status: { $nin: ["awaiting_payment", "cancelled"] } })
    .populate("customerId", "name email")
    .populate("restaurantId", "name address")
    .sort({ createdAt: -1 }).limit(100);
  return res.json({ orders });
}

async function updateDeliveryOrder(req, res) {
  const { status } = req.body || {};
  if (!['picked_up', 'delivered'].includes(status)) return res.status(400).json({ error: "Choose picked up or delivered" });
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Assigned delivery not found" });
  const order = await Order.findOne({ _id: req.params.id, deliveryPartnerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Assigned delivery not found" });
  const allowed = { ready: "picked_up", picked_up: "delivered" };
  if (allowed[order.status] !== status) return res.status(409).json({ error: status === "picked_up" ? "The restaurant must mark the order ready before pickup" : "Mark the order picked up before delivery" });
  order.status = status;
  order.statusHistory.push({ status, at: new Date() });
  await order.save();
  return res.json({ order });
}

module.exports = { createOrder, listMyOrders, listRestaurantOrders, updateRestaurantOrder, listDeliveryOrders, updateDeliveryOrder };
