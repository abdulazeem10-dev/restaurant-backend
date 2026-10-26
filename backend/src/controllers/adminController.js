const bcrypt = require("bcrypt");
const { z } = require("zod");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Subscription = require("../models/Subscription");
const cuisineSchema = z.enum(["north-indian", "pizza", "chinese", "desserts", "burger", "biryani", "south-indian", "noodles", "rolls", "shawarma", "vada", "dosa", "momo", "salads", "other"]);

const deliveryPartnerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).transform(value => value.replace(/[\s().-]/g, "")).pipe(z.string().max(15).regex(/^\+?[1-9]\d{7,14}$/)),
  password: z.string().min(12).max(128)
}).strict();

async function createDeliveryPartner(req, res) {
  const parsed = deliveryPartnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a name, valid email, phone number, and password of at least 12 characters" });
  const email = parsed.data.email.toLowerCase();
  if (await User.findOne({ email })) return res.status(409).json({ error: "An account already uses this email" });
  const partner = await User.create({
    name: parsed.data.name,
    email,
    phone: parsed.data.phone,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    role: "delivery",
    status: "active"
  });
  return res.status(201).json({ deliveryPartner: { id: partner._id, name: partner.name, email: partner.email, phone: partner.phone } });
}

const profileFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).transform(value => value.replace(/[\s().-]/g, "")).pipe(z.string().max(15).regex(/^$|^\+?[1-9]\d{7,14}$/))
}).strict();

async function listDeliveryPartners(req, res) {
  const deliveryPartners = await User.find({ role: "delivery" })
    .select("name email phone status profileDeactivatedAt createdAt")
    .sort({ createdAt: -1 }).limit(200).lean();
  return res.json({ deliveryPartners });
}

async function updateAccountProfile(user, input) {
  const parsed = profileFieldsSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a name, valid email, and valid phone number" };
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email, _id: { $ne: user._id } })) return { conflict: true };
  user.name = parsed.data.name;
  user.email = email;
  user.phone = parsed.data.phone;
  try {
    await user.save();
    return { user };
  } catch (error) {
    if (error.code === 11000) return { conflict: true };
    throw error;
  }
}

async function updateDeliveryPartner(req, res) {
  const partner = await User.findOne({ _id: req.params.id, role: "delivery" });
  if (!partner) return res.status(404).json({ error: "Delivery account not found" });
  const result = await updateAccountProfile(partner, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: "Another account already uses this email / login" });
  return res.json({ deliveryPartner: { id: partner._id, name: partner.name, email: partner.email, phone: partner.phone } });
}

const profileStatusSchema = z.object({ active: z.boolean() }).strict();

async function setDeliveryPartnerProfileStatus(req, res) {
  const parsed = profileStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose whether to activate or deactivate the account" });
  const partner = await User.findOne({ _id: req.params.id, role: "delivery" });
  if (!partner) return res.status(404).json({ error: "Delivery account not found" });
  if (parsed.data.active) {
    if (!partner.profileDeactivatedAt) return res.status(409).json({ error: "This account is not deactivated" });
    partner.status = partner.statusBeforeProfileDeactivation || "active";
    partner.profileDeactivatedAt = null;
    partner.statusBeforeProfileDeactivation = null;
  } else {
    if (partner.profileDeactivatedAt) return res.status(409).json({ error: "This account is already deactivated" });
    partner.statusBeforeProfileDeactivation = partner.status;
    partner.status = "suspended";
    partner.profileDeactivatedAt = new Date();
  }
  await partner.save();
  return res.json({ deliveryPartner: { id: partner._id, status: partner.status, profileDeactivatedAt: partner.profileDeactivatedAt } });
}

async function updateRestaurantProfile(req, res) {
  const parsed = z.object({
    restaurantName: z.string().trim().min(1).max(150),
    address: z.string().trim().min(5).max(500),
    description: z.string().trim().max(2000),
    ownerName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(32).transform(value => value.replace(/[\s().-]/g, "")).pipe(z.string().max(15).regex(/^$|^\+?[1-9]\d{7,14}$/))
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a restaurant name, owner name, valid email, and valid phone number" });
  const restaurant = await Restaurant.findById(req.params.id).populate("ownerId");
  if (!restaurant || !restaurant.ownerId) return res.status(404).json({ error: "Restaurant not found" });
  const owner = restaurant.ownerId;
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email, _id: { $ne: owner._id } })) return res.status(409).json({ error: "Another account already uses this email / login" });
  restaurant.name = parsed.data.restaurantName;
  restaurant.address = parsed.data.address;
  restaurant.description = parsed.data.description;
  owner.name = parsed.data.ownerName;
  owner.email = email;
  owner.phone = parsed.data.phone;
  try {
    await owner.save();
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "Another account already uses this email / login" });
    throw error;
  }
  await restaurant.save();
  return res.json({ restaurant, owner: { id: owner._id, name: owner.name, email: owner.email, phone: owner.phone } });
}

async function setRestaurantProfileStatus(req, res) {
  const parsed = profileStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose whether to activate or deactivate the profile" });
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const owner = await User.findOne({ _id: restaurant.ownerId, role: "restaurant" });
  if (!owner) return res.status(404).json({ error: "Restaurant owner account not found" });
  if (parsed.data.active) {
    if (!restaurant.profileDeactivatedAt || !owner.profileDeactivatedAt) return res.status(409).json({ error: "This profile is not deactivated" });
    restaurant.status = restaurant.statusBeforeProfileDeactivation || "approved";
    restaurant.statusBeforeProfileDeactivation = null;
    restaurant.profileDeactivatedAt = null;
    owner.status = owner.statusBeforeProfileDeactivation || "active";
    owner.statusBeforeProfileDeactivation = null;
    owner.profileDeactivatedAt = null;
    await Promise.all([restaurant.save(), owner.save()]);
  } else {
    if (restaurant.profileDeactivatedAt || owner.profileDeactivatedAt) return res.status(409).json({ error: "This profile is already deactivated" });
    restaurant.statusBeforeProfileDeactivation = restaurant.status;
    restaurant.status = "suspended";
    restaurant.isOpen = false;
    restaurant.profileDeactivatedAt = new Date();
    owner.statusBeforeProfileDeactivation = owner.status;
    owner.status = "suspended";
    owner.profileDeactivatedAt = new Date();
    await Promise.all([restaurant.save(), owner.save()]);
  }
  return res.json({ restaurant: { id: restaurant._id, status: restaurant.status, profileDeactivatedAt: restaurant.profileDeactivatedAt }, owner: { id: owner._id, status: owner.status } });
}

const restaurantImageUrlSchema = z.string().trim().max(2048).optional().default("").refine(value => {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Image URL must be a valid HTTPS URL");

const createSchema = z.object({
  ownerName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).transform(value => value.replace(/[\s().-]/g, "")).pipe(z.string().max(15).regex(/^\+?[1-9]\d{7,14}$/)),
  password: z.string().min(12).max(128),
  subscriptionYears: z.coerce.number().int().min(1).max(3),
  restaurantName: z.string().trim().min(1).max(150),
  description: z.string().max(2000).optional().default(""),
  address: z.string().trim().min(5).max(500),
  imageUrl: restaurantImageUrlSchema,
  foodType: z.enum(["veg", "nonVeg", "both"]).optional().default("both"),
  cuisine: cuisineSchema.optional().default("other")
}).strict();

async function createRestaurant(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid restaurant or owner details" });
  const email = parsed.data.email.toLowerCase();
  if (await User.findOne({ email })) return res.status(409).json({ error: "An account already uses this email" });

  const owner = await User.create({
    name: parsed.data.ownerName,
    email,
    phone: parsed.data.phone,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    role: "restaurant",
    status: "active"
  });
  let restaurant;
  try {
    restaurant = await Restaurant.create({
      ownerId: owner._id,
      name: parsed.data.restaurantName,
      description: parsed.data.description,
      address: parsed.data.address,
      imageUrl: parsed.data.imageUrl,
      foodType: parsed.data.foodType,
      cuisine: parsed.data.cuisine,
      status: "pending",
      isOpen: false
    });
    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setUTCFullYear(endsAt.getUTCFullYear() + parsed.data.subscriptionYears);
    const subscription = await Subscription.create({ restaurantId: restaurant._id, planId: "sunrise-" + parsed.data.subscriptionYears + "-year", termYears: parsed.data.subscriptionYears, status: "active", currentPeriodStart: startsAt, currentPeriodEnd: endsAt });
    return res.status(201).json({ restaurant, subscription, owner: { id: owner._id, name: owner.name, email: owner.email, phone: owner.phone } });
  } catch (error) {
    if (restaurant) { await Subscription.deleteMany({ restaurantId: restaurant._id }); await Restaurant.deleteOne({ _id: restaurant._id }); }
    await User.deleteOne({ _id: owner._id });
    throw error;
  }
}

async function listRestaurants(req, res) {
  const restaurants = await Restaurant.find().populate("ownerId", "name email phone status").sort({ createdAt: -1 }).limit(200);
  const subscriptions = await Subscription.find({ restaurantId: { $in: restaurants.map(item => item._id) } }).sort({ currentPeriodEnd: -1 }).lean();
  const byRestaurant = new Map();
  for (const subscription of subscriptions) if (!byRestaurant.has(String(subscription.restaurantId))) byRestaurant.set(String(subscription.restaurantId), subscription);
  return res.json({ restaurants: restaurants.map(restaurant => ({ ...restaurant.toObject(), subscription: byRestaurant.get(String(restaurant._id)) || null })) });
}

async function renewRestaurantSubscription(req, res) {
  const parsed = z.object({ years: z.coerce.number().int().min(1).max(3) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a renewal term of 1, 2, or 3 years" });
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  let subscription = await Subscription.findOne({ restaurantId: restaurant._id }).sort({ currentPeriodEnd: -1 });
  if (!subscription) subscription = new Subscription({ restaurantId: restaurant._id, planId: "sunrise-" + parsed.data.years + "-year", termYears: parsed.data.years });
  const now = new Date();
  const startsAt = subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const endsAt = new Date(startsAt);
  endsAt.setUTCFullYear(endsAt.getUTCFullYear() + parsed.data.years);
  Object.assign(subscription, { currentPeriodStart: startsAt, currentPeriodEnd: endsAt, termYears: parsed.data.years, planId: "sunrise-" + parsed.data.years + "-year", status: "active", cancelAtPeriodEnd: false, renewalRequest: { status: "none", years: null, requestedAt: null } });
  await subscription.save();
  return res.json({ subscription });
}

async function setRestaurantStatus(req, res) {
  if (!['approved', 'rejected', 'suspended'].includes(req.body?.status)) {
    return res.status(400).json({ error: "Invalid restaurant status" });
  }
  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { status: req.body.status, ...(req.body.status !== "approved" ? { isOpen: false } : {}) } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

async function setRestaurantImage(req, res) {
  const parsed = z.object({ imageUrl: restaurantImageUrlSchema }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Image URL must be a valid HTTPS URL" });

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { imageUrl: parsed.data.imageUrl } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

async function setRestaurantFoodType(req, res) {
  const parsed = z.object({ foodType: z.enum(["veg", "nonVeg", "both"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose Veg, Non-Veg, or Both" });

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { foodType: parsed.data.foodType } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

async function setRestaurantCuisine(req, res) {
  const parsed = z.object({ cuisine: cuisineSchema }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a cuisine category" });

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { cuisine: parsed.data.cuisine } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

module.exports = { createRestaurant, listRestaurants, renewRestaurantSubscription, setRestaurantStatus, setRestaurantImage, setRestaurantFoodType, setRestaurantCuisine, createDeliveryPartner, listDeliveryPartners, updateDeliveryPartner, updateRestaurantProfile, setDeliveryPartnerProfileStatus, setRestaurantProfileStatus };
