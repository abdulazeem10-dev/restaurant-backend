const { z } = require("zod");
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");

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
  paymentMethod: z.enum(["cash_on_delivery"]).default("cash_on_delivery"),
  items: z.array(z.object({
    menuItemId: z.string().regex(/^[a-f\d]{24}$/i),
    quantity: z.number().int().min(1).max(20)
  }).strict()).min(1).max(50)
}).strict();

async function createOrder(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid order details" });

  const restaurant = await Restaurant.findOne({ _id: parsed.data.restaurantId, status: "approved", isOpen: true });
  if (!restaurant) return res.status(404).json({ error: "Restaurant is not accepting orders" });

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

  const order = await Order.create({
    customerId: req.user._id,
    restaurantId: restaurant._id,
    deliveryAddress: parsed.data.deliveryAddress,
    deliveryDetails: parsed.data.deliveryDetails,
    paymentMethod: parsed.data.paymentMethod,
    items,
    subtotalPaise,
    deliveryFeePaise: 0,
    taxPaise: 0,
    totalPaise: subtotalPaise,
    status: "placed"
  });
  return res.status(201).json({ order });
}

async function listMyOrders(req, res) {
  const orders = await Order.find({ customerId: req.user._id }).populate("restaurantId", "name address").sort({ createdAt: -1 }).limit(100);
  return res.json({ orders });
}

async function listRestaurantOrders(req, res) {
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const orders = await Order.find({ restaurantId: restaurant._id }).populate("customerId", "name email").sort({ createdAt: -1 }).limit(100);
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
  await order.save();
  return res.json({ order });
}

module.exports = { createOrder, listMyOrders, listRestaurantOrders, updateRestaurantOrder };
