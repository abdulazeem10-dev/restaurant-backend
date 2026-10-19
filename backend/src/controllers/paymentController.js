const crypto = require("crypto");
const { z } = require("zod");
const Order = require("../models/Order");
const Payment = require("../models/Payment");

const PROVIDER = "razorpay";

function recordStatus(order, status) {
  order.statusHistory ||= [];
  if (order.statusHistory.at(-1)?.status !== status) order.statusHistory.push({ status, at: new Date() });
}

function paymentCredentials() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET
  };
}

function constantTimeHexEqual(received, expected) {
  if (typeof received !== "string" || received.length !== expected.length || !/^[a-f\d]+$/i.test(received)) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

async function razorpayRequest(path, { method = "GET", body } = {}) {
  const { keyId, keySecret } = paymentCredentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Razorpay API request failed", response.status, data.error?.code || "unknown");
    throw new Error("Online payment service could not complete the request. Please try again.");
  }
  return data;
}

async function getPaymentConfig(req, res) {
  const { keyId, keySecret } = paymentCredentials();
  return res.json({ enabled: Boolean(keyId && keySecret && process.env.RAZORPAY_WEBHOOK_SECRET), keyId: keyId || null });
}

function validObjectId(id) {
  return typeof id === "string" && id.length === 24 && /^[a-f\d]{24}$/i.test(id);
}

async function createRazorpayOrder(req, res) {
  const { keyId, keySecret } = paymentCredentials();
  if (!keyId || !keySecret) return res.status(503).json({ error: "Online payments are not configured yet" });
  if (!validObjectId(req.params.id)) return res.status(404).json({ error: "Order not found" });

  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.paymentMethod !== PROVIDER || order.status !== "awaiting_payment") {
    return res.status(409).json({ error: "This order is not waiting for an online payment" });
  }

  let payment = await Payment.findOne({ orderId: order._id, provider: PROVIDER });
  if (payment?.status === "paid") return res.status(409).json({ error: "This order has already been paid" });
  if (payment?.status === "pending" && payment.providerReference) {
    return res.json({ keyId, razorpayOrderId: payment.providerReference, amount: payment.amountPaise, currency: "INR" });
  }

  try {
    const razorpayOrder = await razorpayRequest("/orders", {
      method: "POST",
      body: {
        amount: order.totalPaise,
        currency: "INR",
        receipt: String(order._id),
        notes: { foodPlatformOrderId: String(order._id) }
      }
    });
    if (!razorpayOrder.id || razorpayOrder.amount !== order.totalPaise || razorpayOrder.currency !== "INR") {
      return res.status(502).json({ error: "Online payment service returned an invalid order" });
    }

    if (payment) {
      payment.providerReference = razorpayOrder.id;
      payment.providerPaymentId = "";
      payment.amountPaise = order.totalPaise;
      payment.status = "pending";
      await payment.save();
    } else {
      payment = await Payment.create({
        orderId: order._id,
        provider: PROVIDER,
        providerReference: razorpayOrder.id,
        amountPaise: order.totalPaise,
        status: "pending"
      });
    }
    order.paymentStatus = "pending";
    await order.save();
    return res.json({ keyId, razorpayOrderId: razorpayOrder.id, amount: order.totalPaise, currency: "INR" });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Could not start online payment" });
  }
}

async function markPaymentCaptured(payment, order, paymentId) {
  payment.providerPaymentId = paymentId;
  payment.status = "paid";
  await payment.save();
  order.paymentStatus = "paid";
  if (order.status === "awaiting_payment") {
    order.status = "placed";
    recordStatus(order, "placed");
  }
  await order.save();
}

async function verifyRazorpayPayment(req, res) {
  const { keyId, keySecret } = paymentCredentials();
  if (!keyId || !keySecret) return res.status(503).json({ error: "Online payments are not configured yet" });
  if (!validObjectId(req.params.id)) return res.status(404).json({ error: "Order not found" });

  const parsed = z.object({
    razorpay_order_id: z.string().min(1).max(100),
    razorpay_payment_id: z.string().min(1).max(100),
    razorpay_signature: z.string().length(64).regex(/^[a-f\d]{64}$/i)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payment confirmation" });

  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const payment = await Payment.findOne({ orderId: order._id, provider: PROVIDER });
  if (!payment || payment.providerReference !== parsed.data.razorpay_order_id) {
    return res.status(400).json({ error: "Payment does not match this order" });
  }

  const expectedSignature = crypto.createHmac("sha256", keySecret)
    .update(`${payment.providerReference}|${parsed.data.razorpay_payment_id}`)
    .digest("hex");
  if (!constantTimeHexEqual(parsed.data.razorpay_signature, expectedSignature)) {
    return res.status(400).json({ error: "Payment signature could not be verified" });
  }

  if (payment.status === "paid" && payment.providerPaymentId === parsed.data.razorpay_payment_id) {
    if (order.paymentStatus !== "paid" || order.status === "awaiting_payment") {
      order.paymentStatus = "paid";
      if (order.status === "awaiting_payment") {
        order.status = "placed";
        recordStatus(order, "placed");
      }
      await order.save();
    }
    return res.json({ paid: true, orderId: order._id });
  }

  let providerPayment;
  try {
    providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(parsed.data.razorpay_payment_id)}`);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
  if (providerPayment.order_id !== payment.providerReference ||
      providerPayment.amount !== order.totalPaise || providerPayment.currency !== "INR") {
    return res.status(400).json({ error: "Payment details do not match the order total" });
  }
  if (providerPayment.status !== "captured") {
    if (providerPayment.status === "failed") {
      payment.status = "failed";
      order.paymentStatus = "failed";
      await Promise.all([payment.save(), order.save()]);
    }
    return res.status(202).json({ paid: false, processing: providerPayment.status !== "failed", error: providerPayment.status === "failed" ? "Payment failed. You can try again or choose cash on delivery." : "Payment is still being confirmed. Please wait a moment." });
  }

  await markPaymentCaptured(payment, order, parsed.data.razorpay_payment_id);
  return res.json({ paid: true, orderId: order._id });
}

async function getPaymentStatus(req, res) {
  if (!validObjectId(req.params.id)) return res.status(404).json({ error: "Order not found" });
  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id }).select("status paymentStatus");
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ status: order.status, paymentStatus: order.paymentStatus });
}

async function cancelPendingPayment(req, res) {
  if (!validObjectId(req.params.id)) return res.status(404).json({ error: "Order not found" });
  const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.paymentStatus === "paid") return res.status(409).json({ error: "This payment has already completed. Check My orders before choosing cash on delivery." });
  if (order.status === "awaiting_payment") {
    order.status = "cancelled";
    order.paymentStatus = "failed";
    recordStatus(order, "cancelled");
    await order.save();
    await Payment.updateOne({ orderId: order._id, provider: PROVIDER, status: "pending" }, { $set: { status: "failed" } });
  }
  return res.json({ cancelled: order.status === "cancelled" });
}

async function handleWebhook(req, res) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(503).json({ error: "Payment webhook is not configured" });
  if (!Buffer.isBuffer(req.rawBody)) return res.status(400).json({ error: "Missing webhook body" });
  const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(req.rawBody).digest("hex");
  if (!constantTimeHexEqual(req.get("x-razorpay-signature"), expectedSignature)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const eventId = req.get("x-razorpay-event-id");
  const event = req.body?.event;
  const entity = req.body?.payload?.payment?.entity;
  if (!entity?.order_id || !["payment.captured", "payment.failed"].includes(event)) return res.json({ received: true });

  const payment = await Payment.findOne({ provider: PROVIDER, providerReference: entity.order_id });
  if (!payment) return res.json({ received: true });
  if (eventId && payment.processedEventIds.includes(eventId)) return res.json({ received: true });
  const order = await Order.findById(payment.orderId);
  if (!order || entity.amount !== order.totalPaise || entity.currency !== "INR") return res.json({ received: true });

  if (event === "payment.captured" && entity.status === "captured") {
    await markPaymentCaptured(payment, order, entity.id);
  } else if (event === "payment.failed" && payment.status !== "paid") {
    payment.status = "failed";
    payment.providerPaymentId = entity.id || "";
    order.paymentStatus = "failed";
    await Promise.all([payment.save(), order.save()]);
  }
  if (eventId) {
    payment.processedEventIds.addToSet(eventId);
    await payment.save();
  }
  return res.json({ received: true });
}

module.exports = {
  getPaymentConfig,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentStatus,
  cancelPendingPayment,
  handleWebhook
};
