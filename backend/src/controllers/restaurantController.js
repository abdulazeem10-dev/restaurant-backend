const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const Review = require("../models/Review");
const { z } = require("zod");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Order = require("../models/Order");
const { WEEKDAYS, isRestaurantOpenNow } = require("../utils/openingHours");

const timeSchema = z.string().length(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const cuisineSchema = z.enum(["north-indian", "pizza", "chinese", "desserts", "burger", "biryani", "south-indian", "noodles", "rolls", "shawarma", "vada", "dosa", "momo", "salads", "other"]);
const dailyHoursSchema = z.object({
  closed: z.boolean(),
  opensAt: timeSchema,
  closesAt: timeSchema
}).strict().superRefine((hours, context) => {
  if (!hours.closed && hours.closesAt <= hours.opensAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Closing time must be later than opening time" });
  }
});
const openingHoursInputSchema = z.object(Object.fromEntries(
  WEEKDAYS.map(day => [day, dailyHoursSchema])
)).strict();
const serviceSettingsSchema = z.object({
  openingHours: openingHoursInputSchema.optional(),
  deliveryPincodes: z.array(z.string().length(6).regex(/^\d{6}$/)).max(100).optional(),
  cuisine: cuisineSchema.optional(),
  prepTimeMinutes: z.number().int().min(5).max(180).optional(),
  deliveryTimeMinutes: z.number().int().min(5).max(180).optional()
}).strict().refine(value => value.openingHours !== undefined || value.deliveryPincodes !== undefined || value.cuisine !== undefined || value.prepTimeMinutes !== undefined || value.deliveryTimeMinutes !== undefined);
const restaurantStaffSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(20).optional().default(""),
  password: z.string().min(12).max(128),
  staffRole: z.enum(["secondary_admin", "biller_modifier", "viewer"])
}).strict();

async function listRestaurants(req, res) {
  const query = { status: "approved" };
  if (req.query.pincode !== undefined) {
    if (typeof req.query.pincode !== "string" || req.query.pincode.length !== 6 || !/^\d{6}$/.test(req.query.pincode)) {
      return res.status(400).json({ error: "Enter a valid 6-digit PIN code" });
    }
    query.deliveryPincodes = req.query.pincode;
  }
  const restaurants = await Restaurant.find(query)
    .select("name description address imageUrl foodType cuisine isOpen openingHours deliveryPincodes")
    .sort({ name: 1 }).limit(100).lean();
  const ratingStats = await Review.aggregate([
    { $match: { restaurantId: { $in: restaurants.map(restaurant => restaurant._id) } } },
    { $group: { _id: "$restaurantId", ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
  ]);
  const ratingByRestaurant = new Map(ratingStats.map(stats => [String(stats._id), stats]));

  return res.json({ restaurants: restaurants.map(restaurant => ({
    ...restaurant,
    isOpen: isRestaurantOpenNow(restaurant),
    ratingAverage: ratingByRestaurant.get(String(restaurant._id))?.ratingAverage || 0,
    ratingCount: ratingByRestaurant.get(String(restaurant._id))?.ratingCount || 0
  })) });
}

async function getRestaurant(req, res) {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    status: "approved"
  }).select("name description address imageUrl foodType cuisine isOpen openingHours deliveryPincodes").lean();

  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const [stats] = await Review.aggregate([
    { $match: { restaurantId: restaurant._id } },
    { $group: { _id: null, ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
  ]);
  return res.json({ restaurant: {
    ...restaurant,
    isOpen: isRestaurantOpenNow(restaurant),
    ratingAverage: stats?.ratingAverage || 0,
    ratingCount: stats?.ratingCount || 0
  } });
}

async function getPublicMenu(req, res) {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    status: "approved"
  }).select("_id");

  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const items = await MenuItem.find({
    restaurantId: restaurant._id,
    available: true
  }).select("name description imageUrl pricePaise category foodType available").sort({ category: 1, name: 1 });

  return res.json({ items });
}

async function getOwnedRestaurant(user) {
  if (user.role === "restaurant_staff") return Restaurant.findById(user.restaurantId);
  return Restaurant.findOne({ ownerId: user._id });
}

async function listOwnStaff(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const accounts = await User.find({ restaurantId: restaurant._id, role: "restaurant_staff" })
    .select("name email phone restaurantStaffRole").sort({ restaurantStaffRole: 1 }).lean();
  return res.json({ accounts });
}

async function createOwnStaff(req, res) {
  const parsed = restaurantStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a name, valid email, password of at least 12 characters, and a valid staff role" });
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const email = parsed.data.email.toLowerCase();
  if (await User.findOne({ email })) return res.status(409).json({ error: "An account already uses this email" });
  if (await User.findOne({ restaurantId: restaurant._id, restaurantStaffRole: parsed.data.staffRole, role: "restaurant_staff" })) {
    return res.status(409).json({ error: "This restaurant already has an account for that role" });
  }
  try {
    const account = await User.create({
      name: parsed.data.name,
      email,
      phone: parsed.data.phone,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: "restaurant_staff",
      restaurantId: restaurant._id,
      restaurantStaffRole: parsed.data.staffRole,
      status: "active"
    });
    return res.status(201).json({ account: { id: account._id, name: account.name, email: account.email, phone: account.phone, staffRole: account.restaurantStaffRole } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That role or email already has an account" });
    throw error;
  }
}

async function removeOwnStaff(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const account = await User.findOneAndDelete({ _id: req.params.staffId, restaurantId: restaurant._id, role: "restaurant_staff" }).select("_id");
  if (!account) return res.status(404).json({ error: "Restaurant staff account not found" });
  return res.status(204).end();
}

async function setOwnOpenStatus(req, res) {
  if (typeof req.body?.isOpen !== "boolean") return res.status(400).json({ error: "isOpen must be true or false" });
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved" && req.body.isOpen) return res.status(403).json({ error: "Restaurant must be approved before opening" });
  restaurant.isOpen = req.body.isOpen;
  await restaurant.save();
  return res.json({ restaurant: { id: restaurant._id, name: restaurant.name, isOpen: restaurant.isOpen, status: restaurant.status } });
}

async function updateOwnServiceSettings(req, res) {
  const parsed = serviceSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter valid opening hours and 6-digit delivery PIN codes" });

  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (parsed.data.openingHours) restaurant.openingHours = parsed.data.openingHours;
  if (parsed.data.deliveryPincodes) restaurant.deliveryPincodes = [...new Set(parsed.data.deliveryPincodes)];
  if (parsed.data.cuisine) restaurant.cuisine = parsed.data.cuisine;
  if (parsed.data.prepTimeMinutes !== undefined) restaurant.prepTimeMinutes = parsed.data.prepTimeMinutes;
  if (parsed.data.deliveryTimeMinutes !== undefined) restaurant.deliveryTimeMinutes = parsed.data.deliveryTimeMinutes;
  await restaurant.save();
  return res.json({
    restaurant: {
      id: restaurant._id,
      openingHours: restaurant.openingHours,
      deliveryPincodes: restaurant.deliveryPincodes,
      cuisine: restaurant.cuisine || "other",
      prepTimeMinutes: restaurant.prepTimeMinutes,
      deliveryTimeMinutes: restaurant.deliveryTimeMinutes
    }
  });
}

async function getOwnReports(req, res) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const fromText = req.query.from;
  const toText = req.query.to;
  if (typeof fromText !== "string" || typeof toText !== "string" || fromText.length !== 10 || toText.length !== 10 || !datePattern.test(fromText) || !datePattern.test(toText)) {
    return res.status(400).json({ error: "Choose a valid report date range" });
  }
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T00:00:00.000Z`);
  const rangeDays = (to - from) / 86_400_000;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.toISOString().slice(0, 10) !== fromText || to.toISOString().slice(0, 10) !== toText || !Number.isFinite(rangeDays) || rangeDays < 0 || rangeDays > 365) return res.status(400).json({ error: "Choose a valid date range of up to 366 days" });
  const end = new Date(to.getTime() + 86_400_000);
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const match = { restaurantId: restaurant._id, createdAt: { $gte: from, $lt: end }, status: { $ne: "awaiting_payment" } };
  const [summaryRows, topItems, daily, statusCounts] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        orders: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
        paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } }
      } }
    ]),
    Order.aggregate([
      { $match: { ...match, status: "delivered", paymentStatus: "paid" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" }, salesPaise: { $sum: { $multiply: ["$items.quantity", "$items.unitPricePaise"] } } } },
      { $sort: { quantity: -1, salesPaise: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, name: "$_id", quantity: 1, salesPaise: 1 } }
    ]),
    Order.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
        orders: { $sum: 1 },
        paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } }
      } },
      { $sort: { _id: 1 } }
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
  ]);
  const summary = summaryRows[0] || { orders: 0, delivered: 0, cancelled: 0, paidSalesPaise: 0 };
  return res.json({ from: fromText, to: toText, summary, topItems, daily, statusCounts });
}

async function getOwnMenu(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const items = await MenuItem.find({ restaurantId: restaurant._id }).sort({ createdAt: -1 });
  return res.json({
    restaurant: {
      id: restaurant._id,
      name: restaurant.name,
      isOpen: restaurant.isOpen,
      isOpenNow: isRestaurantOpenNow(restaurant),
      cuisine: restaurant.cuisine || "other",
      status: restaurant.status,
      openingHours: restaurant.openingHours,
      deliveryPincodes: restaurant.deliveryPincodes,
      prepTimeMinutes: restaurant.prepTimeMinutes,
      deliveryTimeMinutes: restaurant.deliveryTimeMinutes
    },
    items
  });
}

async function createMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved") return res.status(403).json({ error: "Restaurant is not approved" });

  const { name, description = "", imageUrl = "", pricePaise, category, foodType, available = true } = req.body || {};
  let validImageUrl = imageUrl === "";
  if (typeof imageUrl === "string" && imageUrl.length <= 2048 && imageUrl.trim()) {
    try {
      validImageUrl = new URL(imageUrl).protocol === "https:";
    } catch {
      validImageUrl = false;
    }
  }
  if (typeof name !== "string" || !name.trim() || name.length > 150 ||
      typeof category !== "string" || !category.trim() || category.length > 80 ||
      !["veg", "nonVeg"].includes(foodType) ||
      !Number.isSafeInteger(pricePaise) || pricePaise < 1 ||
      typeof description !== "string" || description.length > 1000 ||
      typeof imageUrl !== "string" || !validImageUrl ||
      typeof available !== "boolean") {
    return res.status(400).json({ error: "Invalid menu item details" });
  }

  const item = await MenuItem.create({
    restaurantId: restaurant._id,
    name: name.trim(),
    description: description.trim(),
    imageUrl: imageUrl.trim(),
    pricePaise,
    category: category.trim(),
    foodType,
    available
  });

  return res.status(201).json({ item });
}

async function updateMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const allowed = ["name", "description", "imageUrl", "pricePaise", "category", "foodType", "available"];
  const input = req.body || {};
  if (Object.keys(input).length === 0 || Object.keys(input).some(key => !allowed.includes(key))) {
    return res.status(400).json({ error: "Invalid fields" });
  }
  if (input.pricePaise !== undefined && (!Number.isSafeInteger(input.pricePaise) || input.pricePaise < 1)) {
    return res.status(400).json({ error: "Invalid price" });
  }
  if (input.available !== undefined && typeof input.available !== "boolean") {
    return res.status(400).json({ error: "Invalid availability" });
  }
  if (input.foodType !== undefined && !["veg", "nonVeg"].includes(input.foodType)) {
    return res.status(400).json({ error: "Food type must be Veg or Non-Veg" });
  }
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.length > 150)) {
    return res.status(400).json({ error: "Invalid name" });
  }
  if (input.category !== undefined && (typeof input.category !== "string" || !input.category.trim() || input.category.length > 80)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 1000)) {
    return res.status(400).json({ error: "Invalid description" });
  }
  if (input.imageUrl !== undefined) {
    if (typeof input.imageUrl !== "string" || input.imageUrl.length > 2048) {
      return res.status(400).json({ error: "Invalid dish image URL" });
    }
    if (input.imageUrl.trim()) {
      try {
        if (new URL(input.imageUrl).protocol !== "https:") throw new Error("Invalid protocol");
      } catch {
        return res.status(400).json({ error: "Dish image must use a valid HTTPS URL" });
      }
    }
    input.imageUrl = input.imageUrl.trim();
  }

  const item = await MenuItem.findOneAndUpdate(
    { _id: req.params.id, restaurantId: restaurant._id },
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ error: "Menu item not found" });
  return res.json({ item });
}

async function deleteMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const item = await MenuItem.findOneAndDelete({
    _id: req.params.id,
    restaurantId: restaurant._id
  });

  if (!item) return res.status(404).json({ error: "Menu item not found" });
  return res.status(204).end();
}

module.exports = {
  listRestaurants, getRestaurant, getPublicMenu,
  getOwnMenu, createMenuItem, updateMenuItem, deleteMenuItem, setOwnOpenStatus, updateOwnServiceSettings,
  listOwnStaff, createOwnStaff, removeOwnStaff, getOwnReports
};
