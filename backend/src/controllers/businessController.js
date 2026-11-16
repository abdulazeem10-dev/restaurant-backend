const { z } = require("zod");
const mongoose = require("mongoose");
const Restaurant = require("../models/Restaurant");
const Supplier = require("../models/Supplier");
const Expense = require("../models/Expense");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");
const User = require("../models/User");

const paymentMethods = ["cash", "upi", "card", "bank_transfer", "credit", "other"];
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date");
const formatRupees = paise => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

async function getRestaurant(user) {
  if (user.role === "restaurant_staff") return Restaurant.findById(user.restaurantId);
  return Restaurant.findOne({ ownerId: user._id });
}

async function getBusinessSettings(req, res) {
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ settings: {
    taxEnabled: restaurant.taxEnabled,
    taxRateBasisPoints: restaurant.taxRateBasisPoints,
    taxInclusive: restaurant.taxInclusive,
    gstin: restaurant.gstin,
    taxLabel: restaurant.taxLabel,
    branchName: restaurant.branchName,
    branchGroup: restaurant.branchGroup
  } });
}

async function updateBusinessSettings(req, res) {
  const schema = z.object({
    taxEnabled: z.boolean(),
    taxRateBasisPoints: z.number().int().min(0).max(2800),
    taxInclusive: z.boolean(),
    gstin: z.string().trim().toUpperCase().max(15).refine(value => !value || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value), "Enter a valid 15-character GSTIN"),
    taxLabel: z.string().trim().min(1).max(40),
    branchName: z.string().trim().max(100),
    branchGroup: z.string().trim().max(100)
  }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid business settings" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (parsed.data.taxEnabled && parsed.data.taxRateBasisPoints === 0) return res.status(400).json({ error: "Enter a tax rate above 0 before enabling tax" });
  Object.assign(restaurant, parsed.data);
  await restaurant.save();
  return res.json({ settings: parsed.data });
}

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().email().max(254).optional().or(z.literal("")).default(""),
  address: z.string().trim().max(500).optional().default(""),
  gstin: z.string().trim().toUpperCase().max(15).refine(value => !value || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value), "Enter a valid 15-character GSTIN").optional().default(""),
  notes: z.string().trim().max(500).optional().default("")
}).strict();

async function listSuppliers(req, res) {
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const items = await Supplier.find({ restaurantId: restaurant._id }).sort({ active: -1, name: 1 }).limit(500).lean();
  return res.json({ items });
}

async function createSupplier(req, res) {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid supplier details" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const item = await Supplier.create({ ...parsed.data, restaurantId: restaurant._id });
  return res.status(201).json({ item });
}

async function updateSupplier(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Supplier not found" });
  const parsed = supplierSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: parsed.error?.issues[0]?.message || "Provide supplier fields to update" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const item = await Supplier.findOneAndUpdate({ _id: req.params.id, restaurantId: restaurant._id }, { $set: parsed.data }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ error: "Supplier not found" });
  return res.json({ item });
}

async function archiveSupplier(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Supplier not found" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const item = await Supplier.findOneAndUpdate({ _id: req.params.id, restaurantId: restaurant._id }, { $set: { active: false } }, { new: true });
  if (!item) return res.status(404).json({ error: "Supplier not found" });
  return res.json({ item });
}

const expenseSchema = z.object({
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  amountPaise: z.number().int().safe().min(1).max(10000000000),
  spentAt: dateString,
  supplierId: z.string().length(24).regex(/^[a-f\d]{24}$/i).nullable().optional().default(null),
  paymentMethod: z.enum(paymentMethods).default("cash"),
  reference: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(500).optional().default("")
}).strict();

async function listExpenses(req, res) {
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const filter = { restaurantId: restaurant._id };
  const { from, to } = req.query;
  if (from !== undefined || to !== undefined) {
    if (!dateString.safeParse(from).success || !dateString.safeParse(to).success) return res.status(400).json({ error: "Choose a valid expense date range" });
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
    if (end <= start || end - start > 366 * 86_400_000) return res.status(400).json({ error: "Choose a range of up to 366 days" });
    filter.spentAt = { $gte: start, $lt: end };
  }
  const [items, sums] = await Promise.all([
    Expense.find(filter).populate("supplierId", "name").sort({ spentAt: -1, _id: -1 }).limit(1000).lean(),
    Expense.aggregate([{ $match: filter }, { $group: { _id: null, totalPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }])
  ]);
  return res.json({ items, summary: sums[0] || { totalPaise: 0, count: 0 } });
}

async function createExpense(req, res) {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid expense details" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (parsed.data.supplierId) {
    const supplierExists = await Supplier.exists({ _id: parsed.data.supplierId, restaurantId: restaurant._id, active: true });
    if (!supplierExists) return res.status(400).json({ error: "Choose an active supplier from this restaurant" });
  }
  const item = await Expense.create({ ...parsed.data, spentAt: new Date(`${parsed.data.spentAt}T00:00:00.000Z`), restaurantId: restaurant._id });
  return res.status(201).json({ item });
}

async function updateExpense(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Expense not found" });
  const parsed = expenseSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: parsed.error?.issues[0]?.message || "Provide expense fields to update" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (parsed.data.supplierId) {
    const supplierExists = await Supplier.exists({ _id: parsed.data.supplierId, restaurantId: restaurant._id, active: true });
    if (!supplierExists) return res.status(400).json({ error: "Choose an active supplier from this restaurant" });
  }
  if (parsed.data.spentAt) parsed.data.spentAt = new Date(`${parsed.data.spentAt}T00:00:00.000Z`);
  const item = await Expense.findOneAndUpdate({ _id: req.params.id, restaurantId: restaurant._id }, { $set: parsed.data }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ error: "Expense not found" });
  return res.json({ item });
}

async function deleteExpense(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Expense not found" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const item = await Expense.findOneAndDelete({ _id: req.params.id, restaurantId: restaurant._id });
  if (!item) return res.status(404).json({ error: "Expense not found" });
  return res.status(204).end();
}

async function getBranchReport(req, res) {
  if (req.user?.role !== "restaurant") return res.status(403).json({ error: "Only the restaurant owner can view reports across branches" });
  const from = req.query.from;
  const to = req.query.to;
  const group = typeof req.query.group === "string" ? req.query.group.trim().slice(0, 100) : "";
  if (!group || !dateString.safeParse(from).success || !dateString.safeParse(to).success) return res.status(400).json({ error: "Choose a branch group and valid dates" });
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
  if (end <= start || end - start > 366 * 86_400_000) return res.status(400).json({ error: "Choose a range of up to 366 days" });
  const current = await getRestaurant(req.user);
  if (!current) return res.status(404).json({ error: "Restaurant not found" });
  if (current.branchGroup !== group) return res.status(403).json({ error: "You can only report on your assigned branch group" });
  const branches = await Restaurant.find({ ownerId: current.ownerId, branchGroup: group }).select("_id name branchName").lean();
  const ids = branches.map(branch => branch._id);
  const match = { restaurantId: { $in: ids }, createdAt: { $gte: start, $lt: end }, status: { $ne: "awaiting_payment" } };
  const [orders, expenses, branchOrders] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } } } }]),
    Expense.aggregate([{ $match: { restaurantId: { $in: ids }, spentAt: { $gte: start, $lt: end } } }, { $group: { _id: "$restaurantId", totalPaise: { $sum: "$amountPaise" } } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: "$restaurantId", orders: { $sum: 1 }, paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } } } }])
  ]);
  const expenseByBranch = new Map(expenses.map(row => [String(row._id), row.totalPaise]));
  const orderByBranch = new Map(branchOrders.map(row => [String(row._id), row]));
  return res.json({ group, from, to, summary: orders[0] || { orders: 0, paidSalesPaise: 0 }, branches: branches.map(branch => ({ id: branch._id, name: branch.branchName || branch.name, ...(orderByBranch.get(String(branch._id)) || { orders: 0, paidSalesPaise: 0 }), recordedExpensesPaise: expenseByBranch.get(String(branch._id)) || 0 })) });
}

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().safe().min(1).max(10000000),
  maxDiscountPaise: z.number().int().safe().min(0).max(1000000000).default(0),
  minSubtotalPaise: z.number().int().safe().min(0).max(1000000000).default(0),
  startsAt: z.string().datetime().nullable().optional().default(null),
  endsAt: z.string().datetime().nullable().optional().default(null),
  maxUses: z.number().int().safe().min(0).max(10000000).default(0),
  active: z.boolean().default(true)
}).strict().superRefine((value, context) => {
  if (value.discountType === "percent" && value.discountValue > 10000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Percentage discount cannot exceed 100%" });
  if (value.discountType === "fixed" && value.discountValue > 10000000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Fixed discount cannot exceed ₹100,000" });
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Coupon end must be after its start" });
});

async function listCoupons(req, res) {
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const items = await Coupon.find({ restaurantId: restaurant._id }).sort({ createdAt: -1 }).limit(300).lean();
  return res.json({ items });
}

async function createCoupon(req, res) {
  const parsed = couponSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid coupon" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  try {
    const item = await Coupon.create({ ...parsed.data, restaurantId: restaurant._id, startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null, endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null });
    return res.status(201).json({ item });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A coupon with this code already exists" });
    throw error;
  }
}

async function updateCoupon(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Coupon not found" });
  const parsed = couponSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data || {}).length) return res.status(400).json({ error: parsed.error?.issues[0]?.message || "Provide coupon fields to update" });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const values = { ...parsed.data };
  for (const key of ["startsAt", "endsAt"]) if (values[key]) values[key] = new Date(values[key]);
  try {
    const item = await Coupon.findOneAndUpdate({ _id: req.params.id, restaurantId: restaurant._id }, { $set: values }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: "Coupon not found" });
    return res.json({ item });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A coupon with this code already exists" });
    throw error;
  }
}

async function previewCoupon(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Restaurant not found" });
  const parsed = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/), subtotalPaise: z.number().int().safe().min(1).max(1000000000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid coupon code and cart subtotal" });
  const now = new Date();
  const coupon = await Coupon.findOne({ restaurantId: req.params.id, code: parsed.data.code, active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }] }).lean();
  if (!coupon) return res.status(404).json({ error: "This coupon is unavailable or has expired" });
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.status(409).json({ error: "This coupon has reached its use limit" });
  if (parsed.data.subtotalPaise < coupon.minSubtotalPaise) return res.status(400).json({ error: `Add items worth ${formatRupees(coupon.minSubtotalPaise)} to use this coupon` });
  const discountPaise = calculateCouponDiscount(coupon, parsed.data.subtotalPaise);
  return res.json({ coupon: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue }, discountPaise });
}

async function listOptedInCustomers(req, res) {
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const orderStats = await Order.aggregate([
    { $match: { restaurantId: restaurant._id, customerId: { $ne: null }, status: { $ne: "awaiting_payment" } } },
    { $sort: { createdAt: -1 } },
    { $group: {
      _id: "$customerId",
      orderCount: { $sum: 1 },
      paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } },
      lastOrderAt: { $first: "$createdAt" }
    } },
    { $sort: { lastOrderAt: -1 } },
    { $limit: 1000 }
  ]);
  const users = await User.find({ _id: { $in: orderStats.map(row => row._id) }, role: "customer", status: "active", marketingOptIn: true }).select("name phone marketingOptIn").lean();
  const statsById = new Map(orderStats.map(row => [String(row._id), row]));
  return res.json({ customers: users.map(user => {
    const stats = statsById.get(String(user._id));
    const phone = String(user.phone || "").replace(/\D/g, "").slice(-10);
    return { id: user._id, name: user.name, phone, orderCount: stats?.orderCount || 0, paidSalesPaise: stats?.paidSalesPaise || 0, lastOrderAt: stats?.lastOrderAt || null };
  }).filter(customer => /^\d{10}$/.test(customer.phone)) });
}

function calculateCouponDiscount(coupon, subtotalPaise) {
  const raw = coupon.discountType === "percent" ? Math.floor(subtotalPaise * coupon.discountValue / 10000) : coupon.discountValue;
  return Math.max(0, Math.min(subtotalPaise, raw, coupon.maxDiscountPaise > 0 ? coupon.maxDiscountPaise : Number.MAX_SAFE_INTEGER));
}

module.exports = { getBusinessSettings, updateBusinessSettings, listSuppliers, createSupplier, updateSupplier, archiveSupplier, listExpenses, createExpense, updateExpense, deleteExpense, getBranchReport, listCoupons, createCoupon, updateCoupon, previewCoupon, listOptedInCustomers, calculateCouponDiscount };
