const crypto = require("crypto");
const mongoose = require("mongoose");
const { z } = require("zod");
const Restaurant = require("../models/Restaurant");
const Subscription = require("../models/Subscription");
const SubscriptionPayment = require("../models/SubscriptionPayment");

const PRICES = Object.freeze({ 1: 500000, 2: 900000, 3: 1200000 });
const provider = "razorpay";

function credentials() {
  return { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET };
}

function secureHexEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !/^[a-f\d]+$/i.test(a)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

async function razorpayRequest(path, body) {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[subscription payment] provider error", response.status, result.error?.code || "unknown");
    throw new Error("Payment service could not complete the request. Try again.");
  }
  return result;
}

async function createOrder(req, res) {
  const { keyId, keySecret } = credentials();
  if (!keyId || !keySecret) return res.status(503).json({ error: "Subscription payments are not configured yet" });
  const parsed = z.object({ years: z.coerce.number().int().refine(value => Object.hasOwn(PRICES, value)) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a term of 1, 2, or 3 years" });
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id }).select("_id");
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const years = parsed.data.years, amountPaise = PRICES[years];
  const previous = await SubscriptionPayment.findOne({ restaurantId: restaurant._id, termYears: years, status: "pending" }).sort({ createdAt: -1 });
  if (previous) return res.json({ keyId, razorpayOrderId: previous.providerReference, amount: previous.amountPaise, currency: "INR", termYears: years });
  try {
    const order = await razorpayRequest("/orders", {
      amount: amountPaise, currency: "INR", receipt: `sub_${restaurant._id}_${Date.now()}`.slice(0, 40),
      notes: { foodPlatformPurpose: "restaurant_subscription", restaurantId: String(restaurant._id), termYears: String(years) }
    });
    if (!order.id || order.amount !== amountPaise || order.currency !== "INR") return res.status(502).json({ error: "Payment service returned an invalid order" });
    const payment = await SubscriptionPayment.create({ restaurantId: restaurant._id, provider, providerReference: order.id, amountPaise, termYears: years });
    return res.json({ keyId, razorpayOrderId: payment.providerReference, amount: payment.amountPaise, currency: "INR", termYears: years });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Could not start subscription payment" });
  }
}

async function verifyPayment(req, res) {
  const { keySecret } = credentials();
  if (!keySecret) return res.status(503).json({ error: "Subscription payments are not configured yet" });
  const parsed = z.object({
    razorpay_order_id: z.string().min(1).max(100),
    razorpay_payment_id: z.string().min(1).max(100),
    razorpay_signature: z.string().length(64).regex(/^[a-f\d]{64}$/i)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payment confirmation" });
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id }).select("_id");
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const payment = await SubscriptionPayment.findOne({ restaurantId: restaurant._id, provider, providerReference: parsed.data.razorpay_order_id });
  if (!payment) return res.status(404).json({ error: "Subscription payment not found" });
  const expected = crypto.createHmac("sha256", keySecret).update(`${payment.providerReference}|${parsed.data.razorpay_payment_id}`).digest("hex");
  if (!secureHexEqual(parsed.data.razorpay_signature, expected)) return res.status(400).json({ error: "Payment signature could not be verified" });
  if (payment.status === "paid") return res.json({ paid: true, expiresAt: payment.subscriptionEndsAt });
  let providerPayment;
  try { providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(parsed.data.razorpay_payment_id)}`); }
  catch (error) { return res.status(502).json({ error: error.message }); }
  if (providerPayment.order_id !== payment.providerReference || providerPayment.amount !== payment.amountPaise || providerPayment.currency !== "INR") return res.status(400).json({ error: "Payment does not match the subscription amount" });
  if (providerPayment.status !== "captured") return res.status(202).json({ paid: false, processing: providerPayment.status !== "failed", error: providerPayment.status === "failed" ? "Payment failed. You can try again." : "Payment is still being confirmed." });

  const session = await mongoose.startSession();
  let expiresAt;
  try {
    await session.withTransaction(async () => {
      const currentPayment = await SubscriptionPayment.findById(payment._id).session(session);
      if (!currentPayment) throw new Error("Subscription payment not found");
      if (currentPayment.status === "paid") { expiresAt = currentPayment.subscriptionEndsAt; return; }
      const subscription = await Subscription.findOne({ restaurantId: restaurant._id }).sort({ currentPeriodEnd: -1 }).session(session);
      const now = new Date();
      const startsAt = subscription?.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
      const endsAt = new Date(startsAt);
      endsAt.setUTCFullYear(endsAt.getUTCFullYear() + currentPayment.termYears);
      const target = subscription || new Subscription({ restaurantId: restaurant._id });
      Object.assign(target, { planId: `sunrise-${currentPayment.termYears}-year`, termYears: currentPayment.termYears, status: "active", currentPeriodStart: startsAt, currentPeriodEnd: endsAt, cancelAtPeriodEnd: false, renewalRequest: { status: "none", years: null, requestedAt: null } });
      await target.save({ session });
      currentPayment.status = "paid";
      currentPayment.providerPaymentId = parsed.data.razorpay_payment_id;
      currentPayment.subscriptionEndsAt = endsAt;
      await currentPayment.save({ session });
      expiresAt = endsAt;
    });
  } finally { await session.endSession(); }
  return res.json({ paid: true, expiresAt });
}

module.exports = { createOrder, verifyPayment };
