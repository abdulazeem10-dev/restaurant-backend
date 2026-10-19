const { z } = require("zod");
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const Review = require("../models/Review");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { isWithinOpeningHours } = require("../utils/openingHours");
const { sendOrderAlerts } = require("../utils/orderAlerts");

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

  const placedAt = new Date();

  const order = await Order.create({
    customerId: req.user._id,
    restaurantId: restaurant._id,
    deliveryAddress: parsed.data.deliveryAddress,
    deliveryDetails: parsed.data.deliveryDetails,
    deliveryPartnerId: deliveryPartner._id,
    deliveryAssignmentStatus: "offered",
    estimatedDeliveryAt: new Date(placedAt.getTime() + ((restaurant.prepTimeMinutes || 30) + (restaurant.deliveryTimeMinutes || 30)) * 60_000),
    paymentMethod: parsed.data.paymentMethod,
    items,
    subtotalPaise,
    deliveryFeePaise: 0,
    taxPaise: 0,
    totalPaise: subtotalPaise,
    status: "placed",
    statusHistory: [{ status: "placed", at: placedAt }]
  });
  return res.status(201).json({ order, deliveryAssigned: true });
}

async function findLeastBusyDeliveryPartner(excludedIds = []) {
  const partners = await User.find({ role: "delivery", status: "active", _id: { $nin: excludedIds } }).select("_id").lean();
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
  const restaurant = req.user.role === "restaurant_staff"
    ? await Restaurant.findById(req.user.restaurantId)
    : await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const orders = await Order.find({ restaurantId: restaurant._id, status: { $ne: "awaiting_payment" } }).select("-deliveryLocation -customerLocation").populate("customerId", "name email").populate("deliveryPartnerId", "name phone").sort({ createdAt: -1 }).limit(100);
  return res.json({ orders });
}

async function updateRestaurantOrder(req, res) {
  const validStatuses = ["confirmed", "preparing", "ready", "out_for_delivery", "cancelled"];
  if (!validStatuses.includes(req.body?.status)) return res.status(400).json({ error: "Invalid order status" });
  const restaurant = req.user.role === "restaurant_staff"
    ? await Restaurant.findById(req.user.restaurantId)
    : await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const order = await Order.findOne({ _id: req.params.id, restaurantId: restaurant._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (req.body.status === "cancelled" && order.paymentStatus === "paid") return res.status(409).json({ error: "This order is paid; handle cancellation and any refund through the payment provider first" });
  if (req.body.status === "out_for_delivery" && order.deliveryAssignmentStatus && order.deliveryAssignmentStatus !== "accepted") {
    return res.status(409).json({ error: "Wait for the assigned delivery person to accept this order first" });
  }

  const allowed = {
    placed: ["preparing", "confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["out_for_delivery", "cancelled"],
    out_for_delivery: [], cancelled: []
  };
  if (!allowed[order.status]?.includes(req.body.status)) {
    return res.status(409).json({ error: `Cannot move order from ${order.status} to ${req.body.status}` });
  }
  order.status = req.body.status;
  order.statusHistory.push({ status: req.body.status, at: new Date() });
  if (req.body.status === "ready") order.estimatedDeliveryAt = new Date(Date.now() + (restaurant.deliveryTimeMinutes || 30) * 60_000);
  if (req.body.status === "cancelled") order.estimatedDeliveryAt = null;
  await order.save();
  const statusLabels = { confirmed: "confirmed", preparing: "being prepared", ready: "ready for pickup", out_for_delivery: "out for delivery", cancelled: "cancelled" };
  await notifyOrderParticipants(order, {
    type: "order_status_updated",
    title: req.body.status === "cancelled" ? "Order cancelled" : "Order status updated",
    customerMessage: `Order #${String(order._id).slice(-6)} from ${restaurant.name} is ${statusLabels[order.status]}.`,
    audiences: ["customer"]
  });
  return res.json({ order });
}

async function listDeliveryOrders(req, res) {
  const orders = await Order.find({ deliveryPartnerId: req.user._id, status: { $nin: ["awaiting_payment", "cancelled"] } })
    .populate("customerId", "name email")
    .populate("restaurantId", "name address")
    .sort({ createdAt: -1 }).limit(100);
  return res.json({ orders });
}

async function respondToDeliveryAssignment(req, res) {
  const parsed = z.object({ action: z.enum(["accept", "decline"]) }).strict().safeParse(req.body);
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Choose accept or decline" });
  const order = await Order.findOne({ _id: req.params.id, deliveryPartnerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Delivery assignment not found" });
  if (order.deliveryAssignmentStatus !== "offered") return res.status(409).json({ error: "This assignment is no longer waiting for a response" });
  if (["out_for_delivery", "picked_up", "delivered", "cancelled", "awaiting_payment"].includes(order.status)) {
    return res.status(409).json({ error: "This order can no longer be accepted or declined" });
  }

  if (parsed.data.action === "accept") {
    order.deliveryAssignmentStatus = "accepted";
    await order.save();
    return res.json({ order, message: "Delivery accepted. You will pick it up when the restaurant marks it ready." });
  }

  const declinedIds = [...new Set([...(order.declinedDeliveryPartnerIds || []).map(String), String(req.user._id)])];
  const nextPartner = await findLeastBusyDeliveryPartner(declinedIds);
  order.declinedDeliveryPartnerIds = declinedIds;
  order.deliveryPartnerId = nextPartner?._id || null;
  order.deliveryAssignmentStatus = nextPartner ? "offered" : "unassigned";
  await order.save();
  return res.json({
    order,
    reassigned: Boolean(nextPartner),
    message: nextPartner ? "Assignment declined and offered to another delivery person." : "Assignment declined. No other delivery person is available; the restaurant can retry later."
  });
}

async function reassignDeliveryOrder(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Order not found" });
  const restaurant = req.user.role === "restaurant_staff"
    ? await Restaurant.findById(req.user.restaurantId)
    : await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const order = await Order.findOne({ _id: req.params.id, restaurantId: restaurant._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.deliveryAssignmentStatus !== "unassigned" || order.deliveryPartnerId) return res.status(409).json({ error: "This order already has a delivery assignment" });
  if (["out_for_delivery", "picked_up", "delivered", "cancelled", "awaiting_payment"].includes(order.status)) return res.status(409).json({ error: "This order can no longer be assigned" });
  const partner = await findLeastBusyDeliveryPartner(order.declinedDeliveryPartnerIds || []);
  if (!partner) return res.status(409).json({ error: "No other active delivery person is available" });
  order.deliveryPartnerId = partner._id;
  order.deliveryAssignmentStatus = "offered";
  await order.save();
  return res.json({ order, message: "Delivery assignment sent." });
}

async function updateDeliveryOrder(req, res) {
  const parsed = z.object({
    status: z.enum(["delivered"]).optional(),
    cashCollected: z.boolean().optional()
  }).strict().refine(value => value.status !== undefined || value.cashCollected === true).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a delivery update" });
  const { status, cashCollected } = parsed.data;
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Assigned delivery not found" });
  const order = await Order.findOne({ _id: req.params.id, deliveryPartnerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Assigned delivery not found" });
  const wasAlreadyDelivered = order.status === "delivered";
  if (status && !["out_for_delivery", "picked_up", "delivered"].includes(order.status)) return res.status(409).json({ error: "The restaurant must mark the order out for delivery before you can mark it delivered" });
  if (cashCollected) {
    if (order.paymentMethod !== "cash_on_delivery") return res.status(400).json({ error: "Cash collection only applies to cash-on-delivery orders" });
    if (status !== "delivered" && order.status !== "delivered") return res.status(409).json({ error: "Confirm cash after the order is delivered" });
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.paymentCollectedAt = new Date();
    }
  }
  if (status && order.status !== status) {
    order.status = status;
    order.statusHistory.push({ status, at: new Date() });
    if (status === "delivered") {
      order.estimatedDeliveryAt = null;
      order.deliveryLocation = undefined;
      order.customerLocation = undefined;
    }
  }
  await order.save();
  if (order.status === "delivered" && !wasAlreadyDelivered) await notifyOrderDelivered(order);
  return res.json({ order });
}

async function updateDeliveryLocation(req, res) {
  const parsed = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Send valid GPS coordinates" });
  const activeOrders = await Order.find({ deliveryPartnerId: req.user._id, status: { $in: ["out_for_delivery", "picked_up"] } }).select("_id").lean();
  if (!activeOrders.length) return res.status(409).json({ error: "You have no active deliveries to share location for" });
  const updatedAt = new Date();
  await Order.updateMany(
    { _id: { $in: activeOrders.map(order => order._id) }, deliveryPartnerId: req.user._id, status: { $in: ["out_for_delivery", "picked_up"] } },
    { $set: { deliveryLocation: { ...parsed.data, updatedAt } } }
  );
  return res.json({ updatedAt, activeOrderCount: activeOrders.length });
}

async function clearDeliveryLocation(req, res) {
  await Order.updateMany(
    { deliveryPartnerId: req.user._id, status: { $in: ["out_for_delivery", "picked_up"] } },
    { $unset: { deliveryLocation: 1 } }
  );
  return res.json({ cleared: true });
}

async function updateCustomerLocation(req, res) {
  const parsed = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }).strict().safeParse(req.body);
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Send a valid location" });
  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!["out_for_delivery", "picked_up"].includes(order.status) || !order.deliveryPartnerId || (order.deliveryAssignmentStatus && order.deliveryAssignmentStatus !== "accepted")) {
    return res.status(409).json({ error: "Customer location sharing is available after the delivery person accepts and starts the delivery" });
  }
  const updatedAt = new Date();
  order.customerLocation = { ...parsed.data, updatedAt };
  await order.save();
  return res.json({ updatedAt });
}

async function clearCustomerLocation(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Order not found" });
  const result = await Order.updateOne(
    { _id: req.params.id, customerId: req.user._id },
    { $unset: { customerLocation: 1 } }
  );
  if (!result.matchedCount) return res.status(404).json({ error: "Order not found" });
  return res.json({ cleared: true });
}

async function notifyOrderDelivered(order) {
  return notifyOrderParticipants(order, {
    type: "order_delivered",
    title: "Order delivered",
    customerMessage: "Your order has been delivered.",
    restaurantMessage: `Order #${String(order._id).slice(-6)} has been delivered to the customer.`,
    audiences: ["customer", "restaurant"]
  });
}

async function notifyOrderParticipants(order, event) {
  try {
    const restaurant = await Restaurant.findById(order.restaurantId).select("ownerId name").lean();
    if (!restaurant) return;
    const recipients = [];
    let restaurantStaff = [];
    let customer = null;
    if (event.audiences.includes("customer")) customer = await User.findById(order.customerId).select("name email phone").lean();
    if (event.audiences.includes("customer")) recipients.push({ userId: order.customerId, audience: "customer", title: event.customerTitle || event.title, message: event.customerMessage });
    if (event.audiences.includes("restaurant")) {
      restaurantStaff = await User.find({
        status: "active",
        $or: [
          { _id: restaurant.ownerId, role: "restaurant" },
          { restaurantId: restaurant._id, role: "restaurant_staff" }
        ]
      }).select("_id email").lean();
      recipients.push(...restaurantStaff.map(member => ({ userId: member._id, audience: "restaurant", title: event.restaurantTitle || event.title, message: event.restaurantMessage })));
    }
    if (!recipients.length) return;
    await Notification.bulkWrite(recipients.map(recipient => ({
      updateOne: {
        filter: { userId: recipient.userId, orderId: order._id, audience: recipient.audience },
        // Keep the most recent update per order and audience; unread activity is surfaced again.
        update: { $set: { ...recipient, title: recipient.title.slice(0, 120), message: recipient.message.slice(0, 300), orderId: order._id, restaurantId: restaurant._id, type: event.type, readAt: null } },
        upsert: true
      }
    })), { ordered: false });
    await sendOrderAlerts({ order, event, customer, restaurantStaff });
  } catch (error) {
    console.error("Could not save order activity notification:", error.message);
  }
}

async function confirmOrderReceived(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Order not found" });
  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "delivered") return res.status(409).json({ error: "You can confirm receipt after the delivery person marks it delivered" });
  if (!order.customerReceivedAt) {
    order.customerReceivedAt = new Date();
    await order.save();
  }
  return res.json({ order });
}

async function requestOrderCancellation(req, res) {
  const parsed = z.object({
    reason: z.string().trim().min(1).max(80),
    details: z.string().trim().max(500).optional().default("")
  }).strict().safeParse(req.body);
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Enter a cancellation reason" });
  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (["delivered", "cancelled", "awaiting_payment", "out_for_delivery", "picked_up"].includes(order.status)) return res.status(409).json({ error: "This order can no longer be cancelled. Contact support if you need help." });
  if (order.paymentStatus === "paid") return res.status(409).json({ error: "This order is already paid. Contact support to discuss a refund; cancellation cannot automatically refund a payment." });
  if (order.cancellationRequest?.status === "pending") return res.status(409).json({ error: "A cancellation request is already waiting for the restaurant" });
  order.cancellationRequest = { status: "pending", reason: parsed.data.reason, details: parsed.data.details, requestedAt: new Date(), reviewedAt: null, reviewedBy: null, response: "" };
  await order.save();
  await notifyOrderParticipants(order, {
    type: "cancellation_requested", title: "Cancellation request received",
    restaurantTitle: "Customer requested cancellation",
    restaurantMessage: `Order #${String(order._id).slice(-6)}: ${parsed.data.reason}`,
    audiences: ["restaurant"]
  });
  return res.json({ order });
}

async function createOrderHelpRequest(req, res) {
  const parsed = z.object({
    category: z.enum(["missing_item", "food_quality", "delivery", "payment", "other"]),
    message: z.string().trim().min(5).max(1000)
  }).strict().safeParse(req.body);
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Choose a topic and describe the issue (at least 5 characters)" });
  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order || order.status === "awaiting_payment") return res.status(404).json({ error: "Order not found" });
  order.supportRequests.push({ ...parsed.data, status: "open", createdAt: new Date() });
  await order.save();
  await notifyOrderParticipants(order, {
    type: "order_help_requested", title: "New order help request",
    restaurantMessage: `Order #${String(order._id).slice(-6)}: ${parsed.data.category.replaceAll("_", " ")} issue`,
    audiences: ["restaurant"]
  });
  return res.status(201).json({ order, request: order.supportRequests.at(-1) });
}

async function reviewCancellationRequest(req, res) {
  const parsed = z.object({ decision: z.enum(["approved", "declined"]), response: z.string().trim().max(500).optional().default("") }).strict().safeParse(req.body);
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Choose approve or decline" });
  const restaurant = req.user.role === "restaurant_staff" ? await Restaurant.findById(req.user.restaurantId) : await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const order = await Order.findOne({ _id: req.params.id, restaurantId: restaurant._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.cancellationRequest?.status !== "pending") return res.status(409).json({ error: "There is no pending cancellation request" });
  if (parsed.data.decision === "approved") {
    if (["delivered", "cancelled", "out_for_delivery", "picked_up"].includes(order.status) || order.paymentStatus === "paid") return res.status(409).json({ error: "This order can no longer be cancelled here" });
    order.status = "cancelled";
    order.statusHistory.push({ status: "cancelled", at: new Date() });
  }
  order.cancellationRequest.status = parsed.data.decision;
  order.cancellationRequest.reviewedAt = new Date();
  order.cancellationRequest.reviewedBy = req.user._id;
  order.cancellationRequest.response = parsed.data.response;
  await order.save();
  await notifyOrderParticipants(order, {
    type: "cancellation_reviewed",
    customerTitle: parsed.data.decision === "approved" ? "Cancellation approved" : "Cancellation declined",
    customerMessage: parsed.data.response || (parsed.data.decision === "approved" ? "The restaurant approved your cancellation request." : "The restaurant declined your cancellation request."),
    audiences: ["customer"]
  });
  return res.json({ order });
}

async function resolveOrderHelpRequest(req, res) {
  const parsed = z.object({ response: z.string().trim().min(1).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(req.params.id) || !/^[a-f\d]{24}$/i.test(req.params.requestId)) return res.status(400).json({ error: "Enter a response to resolve this request" });
  const restaurant = req.user.role === "restaurant_staff" ? await Restaurant.findById(req.user.restaurantId) : await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const order = await Order.findOne({ _id: req.params.id, restaurantId: restaurant._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const support = order.supportRequests.id(req.params.requestId);
  if (!support || support.status !== "open") return res.status(404).json({ error: "Open help request not found" });
  support.status = "resolved";
  support.response = parsed.data.response;
  support.resolvedAt = new Date();
  support.resolvedBy = req.user._id;
  await order.save();
  await notifyOrderParticipants(order, {
    type: "order_help_resolved", title: "Restaurant replied to your order help request",
    customerMessage: parsed.data.response,
    audiences: ["customer"]
  });
  return res.json({ order, request: support });
}

module.exports = { createOrder, listMyOrders, listRestaurantOrders, updateRestaurantOrder, listDeliveryOrders, respondToDeliveryAssignment, reassignDeliveryOrder, updateDeliveryOrder, updateDeliveryLocation, clearDeliveryLocation, updateCustomerLocation, clearCustomerLocation, confirmOrderReceived, requestOrderCancellation, createOrderHelpRequest, reviewCancellationRequest, resolveOrderHelpRequest };
